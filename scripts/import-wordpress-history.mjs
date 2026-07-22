import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL nije pronadjen.");
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

const paths = {
  matches: resolve(root, "apps/admin/public/data/wp_flm_utakmice.csv"),
  posts: resolve(root, "apps/admin/public/data/wp_posts.csv")
};

try {
  const [matchesCsv, postsCsv] = await Promise.all([readFile(paths.matches, "utf8"), readFile(paths.posts, "utf8")]);
  const matches = parseCsv(matchesCsv);
  const posts = parseCsv(postsCsv);
  const postsById = new Map(posts.map((post) => [post.ID, post]));
  const leagues = posts.filter((post) => post.post_type === "flm_liga");
  const teams = posts.filter((post) => post.post_type === "flm_tim");
  const teamById = new Map(teams.map((team) => [team.ID, team]));
  const leagueIdsInMatches = new Set(matches.map((match) => match.liga_id).filter(Boolean));
  const teamKeysInMatches = new Set();
  for (const match of matches) {
    if (match.domacin_tim_id) teamKeysInMatches.add(`${match.liga_id}:${match.domacin_tim_id}`);
    if (match.gost_tim_id) teamKeysInMatches.add(`${match.liga_id}:${match.gost_tim_id}`);
  }

  await client.connect();
  await client.query("begin");

  const cityId = await upsertCity();
  const competitionIds = new Map();
  for (const leagueId of leagueIdsInMatches) {
    const post = postsById.get(leagueId);
    const title = cleanText(post?.post_title || `Liga ${leagueId}`);
    const { name, seasonName, kind } = splitCompetitionTitle(title);
    const result = await client.query(
      `insert into public.competitions (city_id, name, season_name, kind, status, legacy_source, legacy_id)
       values ($1, $2, $3, $4, 'finished', 'wp_flm_liga', $5)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set name = excluded.name, season_name = excluded.season_name, kind = excluded.kind, updated_at = now()
       returning id`,
      [cityId, name, seasonName, kind, leagueId]
    );
    competitionIds.set(leagueId, result.rows[0].id);
  }

  const teamIds = new Map();
  for (const key of teamKeysInMatches) {
    const [leagueId, oldTeamId] = key.split(":");
    const competitionId = competitionIds.get(leagueId);
    if (!competitionId) continue;
    const post = teamById.get(oldTeamId);
    const name = cleanText(post?.post_title || `Ekipa ${oldTeamId}`);
    const result = await client.query(
      `insert into public.teams (competition_id, name, short_name, is_active, legacy_source, legacy_id)
       values ($1, $2, $3, true, 'wp_flm_tim', $4)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set competition_id = excluded.competition_id, name = excluded.name, short_name = excluded.short_name, updated_at = now()
       returning id`,
      [competitionId, name, initials(name), key]
    );
    teamIds.set(key, result.rows[0].id);
  }

  let importedMatches = 0;
  let importedMedia = 0;
  for (const match of matches) {
    const competitionId = competitionIds.get(match.liga_id);
    const homeTeamId = teamIds.get(`${match.liga_id}:${match.domacin_tim_id}`);
    const awayTeamId = teamIds.get(`${match.liga_id}:${match.gost_tim_id}`);
    if (!competitionId || !homeTeamId || !awayTeamId) continue;

    const result = await client.query(
      `insert into public.matches
         (competition_id, home_team_id, away_team_id, phase, group_name, round, scheduled_at, venue,
          status, home_score, away_score, home_formation, away_formation, legacy_source, legacy_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'wp_flm_utakmice', $14)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set
         competition_id = excluded.competition_id,
         home_team_id = excluded.home_team_id,
         away_team_id = excluded.away_team_id,
         phase = excluded.phase,
         group_name = excluded.group_name,
         round = excluded.round,
         scheduled_at = excluded.scheduled_at,
         venue = excluded.venue,
         status = excluded.status,
         home_score = excluded.home_score,
         away_score = excluded.away_score,
         home_formation = excluded.home_formation,
         away_formation = excluded.away_formation,
         updated_at = now()
       returning id`,
      [
        competitionId,
        homeTeamId,
        awayTeamId,
        phase(match.faza),
        match.grupa || "",
        match.kolo ? Number(match.kolo) : null,
        toTimestamp(match.datum_vreme || match.created_at),
        match.lokacija || "",
        status(match.status),
        number(match.domacin_golovi),
        number(match.gost_golovi),
        match.lineup_formacija || "",
        match.lineup_formacija_gost || "",
        match.id
      ]
    );
    importedMatches += 1;

    const youtubeUrl = String(match.youtube_url || "").trim();
    if (youtubeUrl) {
      await client.query("delete from public.media_links where match_id = $1 and kind = 'youtube' and url = $2", [result.rows[0].id, youtubeUrl]);
      await client.query(
        `insert into public.media_links (match_id, kind, label, url)
         values ($1, 'youtube', 'Snimak utakmice', $2)`,
        [result.rows[0].id, youtubeUrl]
      );
      importedMedia += 1;
    }
  }

  let importedNews = 0;
  for (const post of posts.filter((item) => item.post_type === "post" && item.post_status === "publish")) {
    const title = cleanText(post.post_title || "");
    if (!title) continue;
    const body = stripWordPress(post.post_content || "");
    await client.query(
      `insert into public.news_posts (title, body, is_published, published_at, media_type)
       select $1, $2, true, $3, 'link'
       where not exists (
         select 1 from public.news_posts where title = $1 and published_at = $3
       )`,
      [title, body, toTimestamp(post.post_date)]
    );
    importedNews += 1;
  }

  await client.query("commit");
  console.log(`IMPORT_OK=true`);
  console.log(`COMPETITIONS=${competitionIds.size}`);
  console.log(`TEAMS=${teamIds.size}`);
  console.log(`MATCHES=${importedMatches}`);
  console.log(`MEDIA_LINKS=${importedMedia}`);
  console.log(`NEWS_ATTEMPTED=${importedNews}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function upsertCity() {
  const result = await client.query(
    `insert into public.cities (name, slug, is_active)
     values ('Novi Sad', 'novi-sad', true)
     on conflict (slug) do update set name = excluded.name, is_active = true, updated_at = now()
     returning id`
  );
  return result.rows[0].id;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((item) => item.some(Boolean)).map((item) => Object.fromEntries(header.map((key, index) => [key, item[index] || ""])));
}

function splitCompetitionTitle(title) {
  const parts = title.split(" - ").map((part) => part.trim()).filter(Boolean);
  const name = parts[0] || title;
  const seasonName = parts.slice(1).join(" - ") || (title.includes("2026") ? "2026" : "Sezona");
  const kind = /taš|tas|turnir|test/i.test(title) ? "tournament" : "league";
  return { name, seasonName, kind };
}

function phase(value) {
  const map = {
    grupa: "group",
    liga: "group",
    osmina: "round_of_16",
    cetvrtfinale: "quarter_final",
    polufinale: "semi_final",
    trece_mesto: "third_place",
    finale: "final"
  };
  return map[value] || value || "group";
}

function status(value) {
  return value === "zavrsena" ? "finished" : "scheduled";
}

function toTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  return raw.includes("T") ? raw : `${raw.replace(" ", "T")}+01:00`;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initials(name) {
  return cleanText(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "UF";
}

function cleanText(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").trim();
}

function stripWordPress(value) {
  return cleanText(value)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
