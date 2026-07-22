import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sourceDir = resolve(root, "../work/flm-import");

const files = {
  posts: "wp_posts.csv",
  matches: "wp_flm_utakmice.csv",
  players: "wp_flm_igraci.csv",
  leagueTeams: "wp_flm_liga_timovi.csv",
  lineups: "wp_flm_utakmica_sastav.csv",
  events: "wp_flm_dogadjaji_utakmice.csv",
  standings: "wp_flm_tabela.csv",
  matchStats: "wp_flm_statistika_igraca.csv",
  seasonStats: "wp_flm_sezonska_statistika_igraca.csv"
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL nije pronadjen.");
  process.exit(1);
}

if (!existsSync(sourceDir)) {
  console.error(`FLM import folder nije pronadjen: ${sourceDir}`);
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
const counters = {
  competitions: 0,
  teams: 0,
  players: 0,
  matches: 0,
  lineups: 0,
  events: 0,
  standings: 0,
  matchStats: 0,
  seasonStats: 0,
  media: 0,
  skippedEvents: 0,
  skippedRows: 0
};

try {
  const data = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, readCsv(file)]));
  const postsById = new Map(data.posts.map((post) => [post.ID, post]));
  const matchByOldId = new Map(data.matches.map((match) => [match.id, match]));
  const playerByOldId = new Map(data.players.map((player) => [player.id, player]));
  const leagueIds = new Set([
    ...data.posts.filter((post) => post.post_type === "flm_liga").map((post) => post.ID),
    ...data.matches.map((match) => match.liga_id),
    ...data.leagueTeams.map((row) => row.liga_id),
    ...data.standings.map((row) => row.liga_id),
    ...data.seasonStats.map((row) => row.liga_id)
  ].filter(Boolean));

  const teamLinks = new Set(data.leagueTeams.map((row) => `${row.liga_id}:${row.tim_id}`));
  for (const match of data.matches) {
    if (match.liga_id && match.domacin_tim_id) teamLinks.add(`${match.liga_id}:${match.domacin_tim_id}`);
    if (match.liga_id && match.gost_tim_id) teamLinks.add(`${match.liga_id}:${match.gost_tim_id}`);
  }

  await client.connect();
  await client.query("begin");

  const cityId = await upsertCity();
  const competitionIds = new Map();
  for (const oldLeagueId of leagueIds) {
    const post = postsById.get(oldLeagueId);
    const title = clean(post?.post_title || `Liga ${oldLeagueId}`);
    const parsed = splitCompetitionTitle(title);
    const result = await client.query(
      `insert into public.competitions (city_id, name, season_name, kind, status, legacy_source, legacy_id)
       values ($1, $2, $3, $4, 'finished', 'wp_flm_liga', $5)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set name = excluded.name, season_name = excluded.season_name, kind = excluded.kind, updated_at = now()
       returning id`,
      [cityId, parsed.name, parsed.seasonName, parsed.kind, oldLeagueId]
    );
    competitionIds.set(oldLeagueId, result.rows[0].id);
    counters.competitions += 1;
  }

  const teamIds = new Map();
  for (const key of teamLinks) {
    const [oldLeagueId, oldTeamId] = key.split(":");
    const competitionId = competitionIds.get(oldLeagueId);
    if (!competitionId) {
      counters.skippedRows += 1;
      continue;
    }
    const teamPost = postsById.get(oldTeamId);
    const name = clean(teamPost?.post_title || `Ekipa ${oldTeamId}`);
    const result = await client.query(
      `insert into public.teams (competition_id, name, short_name, is_active, legacy_source, legacy_id)
       values ($1, $2, $3, true, 'wp_flm_tim', $4)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set competition_id = excluded.competition_id, name = excluded.name, short_name = excluded.short_name, updated_at = now()
       returning id`,
      [competitionId, name, initials(name), key]
    );
    teamIds.set(key, result.rows[0].id);
    counters.teams += 1;
  }

  const teamLeagues = new Map();
  for (const key of teamLinks) {
    const [leagueId, teamId] = key.split(":");
    if (!teamLeagues.has(teamId)) teamLeagues.set(teamId, new Set());
    teamLeagues.get(teamId).add(leagueId);
  }

  const playerAssignments = new Set();
  for (const oldPlayer of data.players) {
    for (const oldLeagueId of teamLeagues.get(oldPlayer.tim_id) || []) {
      playerAssignments.add(`${oldLeagueId}:${oldPlayer.tim_id}:${oldPlayer.id}`);
    }
  }
  for (const row of data.lineups) {
    const oldMatch = matchByOldId.get(row.utakmica_id);
    if (oldMatch && playerByOldId.has(row.igrac_id)) playerAssignments.add(`${oldMatch.liga_id}:${row.tim_id}:${row.igrac_id}`);
  }
  for (const row of data.matchStats) {
    const oldMatch = matchByOldId.get(row.utakmica_id);
    if (oldMatch && playerByOldId.has(row.igrac_id)) playerAssignments.add(`${oldMatch.liga_id}:${row.tim_id}:${row.igrac_id}`);
  }
  for (const row of data.seasonStats) {
    if (playerByOldId.has(row.igrac_id)) playerAssignments.add(`${row.liga_id}:${row.tim_id}:${row.igrac_id}`);
  }

  const playerIds = new Map();
  for (const assignment of playerAssignments) {
      const [oldLeagueId, oldTeamId, oldPlayerId] = assignment.split(":");
      const oldPlayer = playerByOldId.get(oldPlayerId);
      if (!oldPlayer) continue;
      const teamId = teamIds.get(`${oldLeagueId}:${oldTeamId}`);
      if (!teamId) continue;
      const displayName = [oldPlayer.ime, oldPlayer.prezime].map(clean).filter(Boolean).join(" ") || `Igrac ${oldPlayer.id}`;
      const result = await client.query(
        `insert into public.players (team_id, display_name, position, shirt_number, avatar_url, is_active, legacy_source, legacy_id)
         values ($1, $2, $3, $4, $5, $6, 'wp_flm_igraci', $7)
         on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
         do update set team_id = excluded.team_id, display_name = excluded.display_name, position = excluded.position,
                       shirt_number = excluded.shirt_number, avatar_url = excluded.avatar_url, is_active = excluded.is_active,
                       updated_at = now()
         returning id`,
        [
          teamId,
          displayName,
          oldPlayer.pozicija || "",
          oldPlayer.broj_dresa ? number(oldPlayer.broj_dresa) : null,
          oldPlayer.fotografija_url || "",
          oldPlayer.je_aktivan !== "false",
          `${oldLeagueId}:${oldPlayer.id}`
        ]
      );
      playerIds.set(`${oldLeagueId}:${oldPlayer.id}`, result.rows[0].id);
      counters.players += 1;
  }

  const matchIds = new Map();
  for (const oldMatch of data.matches) {
    const competitionId = competitionIds.get(oldMatch.liga_id);
    const homeTeamId = teamIds.get(`${oldMatch.liga_id}:${oldMatch.domacin_tim_id}`);
    const awayTeamId = teamIds.get(`${oldMatch.liga_id}:${oldMatch.gost_tim_id}`);
    if (!competitionId || !homeTeamId || !awayTeamId) {
      counters.skippedRows += 1;
      continue;
    }
    const result = await client.query(
      `insert into public.matches
         (competition_id, home_team_id, away_team_id, phase, group_name, round, scheduled_at, venue, status,
          home_score, away_score, home_formation, away_formation, legacy_source, legacy_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'wp_flm_utakmice',$14)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set competition_id = excluded.competition_id, home_team_id = excluded.home_team_id,
                     away_team_id = excluded.away_team_id, phase = excluded.phase, group_name = excluded.group_name,
                     round = excluded.round, scheduled_at = excluded.scheduled_at, venue = excluded.venue,
                     status = excluded.status, home_score = excluded.home_score, away_score = excluded.away_score,
                     home_formation = excluded.home_formation, away_formation = excluded.away_formation,
                     updated_at = now()
       returning id`,
      [
        competitionId,
        homeTeamId,
        awayTeamId,
        phase(oldMatch.faza),
        oldMatch.grupa || "",
        oldMatch.kolo ? number(oldMatch.kolo) : null,
        timestamp(oldMatch.datum_vreme || oldMatch.created_at),
        oldMatch.lokacija || "",
        oldMatch.status === "zavrsena" ? "finished" : "scheduled",
        number(oldMatch.domacin_golovi),
        number(oldMatch.gost_golovi),
        oldMatch.lineup_formacija || "",
        oldMatch.lineup_formacija_gost || "",
        oldMatch.id
      ]
    );
    matchIds.set(oldMatch.id, result.rows[0].id);
    counters.matches += 1;

    const youtubeUrl = String(oldMatch.youtube_url || "").trim();
    if (youtubeUrl) {
      await client.query("delete from public.media_links where match_id = $1 and kind = 'youtube' and url = $2", [result.rows[0].id, youtubeUrl]);
      await client.query("insert into public.media_links (match_id, kind, label, url) values ($1, 'youtube', 'Snimak utakmice', $2)", [result.rows[0].id, youtubeUrl]);
      counters.media += 1;
    }
  }

  await importStandings(data.standings, competitionIds, teamIds);
  await importLineups(data.lineups, matchByOldId, matchIds, teamIds, playerIds);
  await importMatchStats(data.matchStats, matchByOldId, matchIds, teamIds, playerIds);
  await importSeasonStats(data.seasonStats, competitionIds, teamIds, playerIds);
  await importEvents(data.events, matchByOldId, matchIds, teamIds, playerIds);

  await client.query("commit");
  for (const [key, value] of Object.entries(counters)) console.log(`${key.toUpperCase()}=${value}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function importStandings(rows, competitionIds, teamIds) {
  for (const row of rows) {
    const competitionId = competitionIds.get(row.liga_id);
    const teamId = teamIds.get(`${row.liga_id}:${row.tim_id}`);
    if (!competitionId || !teamId) {
      counters.skippedRows += 1;
      continue;
    }
    await client.query(
      `insert into public.team_standings
         (competition_id, team_id, group_name, played, wins, draws, losses, goals_for, goals_against,
          goal_difference, points, form, position, legacy_source, legacy_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'wp_flm_tabela',$14)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set group_name = excluded.group_name, played = excluded.played, wins = excluded.wins,
                     draws = excluded.draws, losses = excluded.losses, goals_for = excluded.goals_for,
                     goals_against = excluded.goals_against, goal_difference = excluded.goal_difference,
                     points = excluded.points, form = excluded.form, position = excluded.position,
                     updated_at = now()`,
      [
        competitionId,
        teamId,
        row.grupa || "",
        number(row.odigrano),
        number(row.pobede),
        number(row.nereseno),
        number(row.porazi),
        number(row.golovi_dati),
        number(row.golovi_primljeni),
        number(row.gol_razlika),
        number(row.bodovi),
        row.forma || "",
        row.pozicija ? number(row.pozicija) : null,
        row.id
      ]
    );
    counters.standings += 1;
  }
}

async function importLineups(rows, matchByOldId, matchIds, teamIds, playerIds) {
  for (const row of rows) {
    const oldMatch = matchByOldId.get(row.utakmica_id);
    const matchId = matchIds.get(row.utakmica_id);
    if (!oldMatch || !matchId) {
      counters.skippedRows += 1;
      continue;
    }
    const teamId = teamIds.get(`${oldMatch.liga_id}:${row.tim_id}`);
    const playerId = playerIds.get(`${oldMatch.liga_id}:${row.igrac_id}`);
    if (!teamId || !playerId) {
      counters.skippedRows += 1;
      continue;
    }
    await client.query(
      `insert into public.match_lineups
         (match_id, team_id, player_id, is_starter, is_goalkeeper, shirt_number, legacy_source, legacy_id)
       values ($1,$2,$3,$4,false,$5,'wp_flm_utakmica_sastav',$6)
       on conflict (match_id, player_id) do update set team_id = excluded.team_id,
         is_starter = excluded.is_starter, shirt_number = excluded.shirt_number,
         legacy_source = excluded.legacy_source, legacy_id = excluded.legacy_id, updated_at = now()`,
      [matchId, teamId, playerId, row.status === "teren", row.position_slot ? number(row.position_slot) : null, row.id]
    );
    counters.lineups += 1;
  }
}

async function importMatchStats(rows, matchByOldId, matchIds, teamIds, playerIds) {
  for (const row of rows) {
    const oldMatch = matchByOldId.get(row.utakmica_id);
    const matchId = matchIds.get(row.utakmica_id);
    if (!oldMatch || !matchId) {
      counters.skippedRows += 1;
      continue;
    }
    const teamId = teamIds.get(`${oldMatch.liga_id}:${row.tim_id}`);
    const playerId = playerIds.get(`${oldMatch.liga_id}:${row.igrac_id}`);
    if (!teamId || !playerId) {
      counters.skippedRows += 1;
      continue;
    }
    await client.query(
      `insert into public.player_match_stats
         (match_id, team_id, player_id, goals, assists, shots, shots_on_target, shots_off_target, saves,
          goals_conceded, yellow_cards, red_cards, fouls, corners_won, two_minutes, fantasy_points,
          own_goals, penalties, penalty_goals, penalty_saves, penalty_misses, legacy_source, legacy_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'wp_flm_statistika_igraca',$22)
       on conflict (match_id, player_id) do update set
         team_id = excluded.team_id, goals = excluded.goals, assists = excluded.assists, shots = excluded.shots,
         shots_on_target = excluded.shots_on_target, shots_off_target = excluded.shots_off_target,
         saves = excluded.saves, goals_conceded = excluded.goals_conceded, yellow_cards = excluded.yellow_cards,
         red_cards = excluded.red_cards, fouls = excluded.fouls, corners_won = excluded.corners_won,
         two_minutes = excluded.two_minutes, fantasy_points = excluded.fantasy_points, own_goals = excluded.own_goals,
         penalties = excluded.penalties, penalty_goals = excluded.penalty_goals, penalty_saves = excluded.penalty_saves,
         penalty_misses = excluded.penalty_misses, legacy_source = excluded.legacy_source, legacy_id = excluded.legacy_id,
         updated_at = now()`,
      [
        matchId, teamId, playerId, number(row.golovi), number(row.asistencije), number(row.sutevi),
        number(row.sutevi_u_okvir), number(row.sutevi_van_okvira), number(row.odbrane),
        number(row.primljeni_golovi), number(row.zuti_kartoni), number(row.crveni_kartoni),
        number(row.faulovi), number(row.korneri), number(row.dva_minuta), number(row.poeni),
        number(row.autogolovi), number(row.penali), number(row.penal_golovi), number(row.penal_odbrane),
        number(row.penal_promasaji), row.id
      ]
    );
    counters.matchStats += 1;
  }
}

async function importSeasonStats(rows, competitionIds, teamIds, playerIds) {
  for (const row of rows) {
    const competitionId = competitionIds.get(row.liga_id);
    const teamId = teamIds.get(`${row.liga_id}:${row.tim_id}`);
    const playerId = playerIds.get(`${row.liga_id}:${row.igrac_id}`);
    if (!competitionId || !teamId || !playerId) {
      counters.skippedRows += 1;
      continue;
    }
    await client.query(
      `insert into public.player_season_stats
         (competition_id, team_id, player_id, appearances, minutes_played, goals, assists, shots,
          shots_on_target, saves, goals_conceded, yellow_cards, red_cards, fouls, two_minutes,
          fantasy_points, own_goals, penalties, penalty_goals, penalty_saves, penalty_misses, legacy_source, legacy_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'wp_flm_sezonska_statistika_igraca',$22)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set appearances = excluded.appearances, minutes_played = excluded.minutes_played,
         goals = excluded.goals, assists = excluded.assists, shots = excluded.shots,
         shots_on_target = excluded.shots_on_target, saves = excluded.saves,
         goals_conceded = excluded.goals_conceded, yellow_cards = excluded.yellow_cards,
         red_cards = excluded.red_cards, fouls = excluded.fouls, two_minutes = excluded.two_minutes,
         fantasy_points = excluded.fantasy_points, own_goals = excluded.own_goals,
         penalties = excluded.penalties, penalty_goals = excluded.penalty_goals,
         penalty_saves = excluded.penalty_saves, penalty_misses = excluded.penalty_misses,
         updated_at = now()`,
      [
        competitionId, teamId, playerId, number(row.utakmice), number(row.minute_odigrane), number(row.golovi),
        number(row.asistencije), number(row.sutevi), number(row.sutevi_u_okvir), number(row.odbrane),
        number(row.primljeni_golovi), number(row.zuti_kartoni), number(row.crveni_kartoni),
        number(row.faulovi), number(row.dva_minuta), number(row.poeni), number(row.autogolovi),
        number(row.penali), number(row.penal_golovi), number(row.penal_odbrane), number(row.penal_promasaji), row.id
      ]
    );
    counters.seasonStats += 1;
  }
}

async function importEvents(rows, matchByOldId, matchIds, teamIds, playerIds) {
  for (const row of rows) {
    const mappedType = eventType(row.tip_dogadjaja);
    if (!mappedType) {
      counters.skippedEvents += 1;
      continue;
    }
    const oldMatch = matchByOldId.get(row.utakmica_id);
    const matchId = matchIds.get(row.utakmica_id);
    if (!oldMatch || !matchId) {
      counters.skippedRows += 1;
      continue;
    }
    const teamId = row.tim_id ? teamIds.get(`${oldMatch.liga_id}:${row.tim_id}`) : null;
    const playerId = row.igrac_id ? playerIds.get(`${oldMatch.liga_id}:${row.igrac_id}`) : null;
    const secondaryPlayerId = row.sekundarni_igrac_id ? playerIds.get(`${oldMatch.liga_id}:${row.sekundarni_igrac_id}`) : null;
    await client.query(
      `insert into public.match_events
         (match_id, minute, type, team_id, player_id, related_player_id, score_home, score_away, text, fantasy_points_delta, legacy_source, legacy_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'wp_flm_dogadjaji_utakmice',$10)
       on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null
       do update set minute = excluded.minute, type = excluded.type, team_id = excluded.team_id,
         player_id = excluded.player_id, related_player_id = excluded.related_player_id,
         score_home = excluded.score_home, score_away = excluded.score_away, text = excluded.text,
         updated_at = now()`,
      [
        matchId, number(row.minut), mappedType, teamId || null, playerId || null, secondaryPlayerId || null,
        row.domacin_rezultat === "" ? null : number(row.domacin_rezultat),
        row.gost_rezultat === "" ? null : number(row.gost_rezultat),
        row.opis || "",
        row.id
      ]
    );
    counters.events += 1;
  }
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

function readCsv(file) {
  const text = readFileSync(resolve(sourceDir, file), "utf8");
  return parseCsv(text);
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
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift().map((item) => item.replace(/^\uFEFF/, ""));
  return rows.filter((item) => item.some(Boolean)).map((item) => Object.fromEntries(header.map((key, index) => [key, item[index] || ""])));
}

function splitCompetitionTitle(title) {
  const parts = title.split(" - ").map((part) => part.trim()).filter(Boolean);
  return {
    name: parts[0] || title,
    seasonName: parts.slice(1).join(" - ") || (title.includes("2026") ? "2026" : "Sezona"),
    kind: /taš|tas|turnir|tournament|test/i.test(title) ? "tournament" : "league"
  };
}

function phase(value) {
  return {
    grupa: "group",
    liga: "group",
    osmina: "round_of_16",
    cetvrtfinale: "quarter_final",
    polufinale: "semi_final",
    trece_mesto: "third_place",
    finale: "final"
  }[value] || value || "group";
}

function eventType(value) {
  return {
    pocetak_utakmice: "kickoff",
    pocetak_drugog_poluvremena: "second_half",
    kraj_utakmice: "fulltime",
    gol: "goal",
    sut_u_okvir: "shot_on_target",
    sut_van_okvira: "shot_off_target",
    odbrana: "goalkeeper_save",
    faul: "foul",
    korner: "corner",
    crveni_karton: "red_card",
    zuti_karton: "yellow_card",
    dva_minuta: "two_minutes",
    penal: "penalty",
    izmena: "substitution"
  }[value] || "";
}

function timestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  return raw.includes("T") ? raw : `${raw.replace(" ", "T")}+01:00`;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").trim();
}

function initials(name) {
  return clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "UF";
}
