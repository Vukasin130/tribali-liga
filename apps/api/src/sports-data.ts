import { query, transaction } from "./db.ts";
import { syncFantasyPlayerPool } from "./season-hub.ts";
import { recalculateCompetitionStandings } from "./matches-db.ts";
import { httpError } from "./errors.ts";
import { optionalUuid, requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const LEADER_FIELDS: Record<string, { column: string; label: string }> = {
  goals: { column: "goals", label: "golovi" },
  assists: { column: "assists", label: "asistencije" },
  saves: { column: "saves", label: "odbrane" },
  mvp: { column: "fantasy_points", label: "fantasy poeni" }
};

export async function listCities() {
  const result = await query(
    `select id, created_at, updated_at, name, slug, is_active
     from public.cities
     where is_active = true
     order by name`
  );
  return result.rows.map(normalizeCity);
}

export async function createCity(payload: { name?: string }, actor: Actor) {
  const name = requiredText(payload.name, "Naziv grada je obavezan.");
  const slug = slugify(name);
  try {
    const result = await query(
      `insert into public.cities (name, slug, is_active) values ($1, $2, true) returning *`,
      [name, slug]
    );
    await audit(actor, "city.create", "city", result.rows[0].id, { name });
    return normalizeCity(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw httpError(409, "Grad sa tim nazivom vec postoji.");
    throw error;
  }
}

function slugify(value: unknown): string {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listCompetitions(filters: { cityId?: string; status?: string } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];

  if (filters.cityId) {
    params.push(filters.cityId);
    where.push(`c.city_id = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    where.push(`c.status = $${params.length}`);
  }

  const result = await query(
    `select c.*, city.name as city_name, city.slug as city_slug,
            count(distinct t.id)::int as teams_count,
            count(distinct m.id)::int as matches_count
     from public.competitions c
     left join public.cities city on city.id = c.city_id
     left join public.teams t on t.competition_id = c.id
     left join public.matches m on m.competition_id = c.id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     group by c.id, city.name, city.slug
     order by coalesce(c.starts_at, c.created_at) desc, c.name`,
    params
  );
  return result.rows.map(normalizeCompetition);
}

export async function getCompetition(id: string) {
  const result = await query(
    `select c.*, city.name as city_name, city.slug as city_slug,
            count(distinct t.id)::int as teams_count,
            count(distinct m.id)::int as matches_count
     from public.competitions c
     left join public.cities city on city.id = c.city_id
     left join public.teams t on t.competition_id = c.id
     left join public.matches m on m.competition_id = c.id
     where c.id = $1
     group by c.id, city.name, city.slug
     limit 1`,
    [id]
  );
  if (!result.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  return normalizeCompetition(result.rows[0]);
}

export async function listCompetitionTeams(competitionId?: string) {
  const params: unknown[] = [];
  const where = ["t.is_active = true"];
  if (competitionId) {
    params.push(competitionId);
    where.push(`t.competition_id = $${params.length}`);
  }
  const result = await query(
    `select t.*, s.played, s.wins, s.draws, s.losses, s.goals_for, s.goals_against,
            s.goal_difference, s.points, s.position, s.form,
            count(p.id)::int as players_count
     from public.teams t
     left join public.team_standings s on s.team_id = t.id and s.competition_id = t.competition_id
     left join public.team_rosters tr on tr.team_id = t.id and tr.is_active = true
     left join public.players p on p.id = tr.player_id and p.is_active = true
     where ${where.join(" and ")}
     group by t.id, s.played, s.wins, s.draws, s.losses, s.goals_for, s.goals_against,
              s.goal_difference, s.points, s.position, s.form
     order by coalesce(t.group_name, ''), coalesce(s.position, 999), t.name`,
    params
  );
  return result.rows.map(normalizeTeam);
}

export async function getTeamProfile(id: string) {
  const base = await query(
    `select t.*, c.name as competition_name, c.season_name, c.kind, c.status as competition_status,
            city.name as city_name, city.slug as city_slug
     from public.teams t
     left join public.competitions c on c.id = t.competition_id
     left join public.cities city on city.id = c.city_id
     where t.id = $1
     limit 1`,
    [id]
  );
  if (!base.rows[0]) throw httpError(404, "Ekipa nije pronadjena.");
  const clubId = base.rows[0].club_id;

  const [players, standings, matches, stats, playerStats, nextMatch, siblingTeams] = await Promise.all([
    query(
      `select p.id, p.created_at, p.updated_at, p.club_id, p.display_name, p.position, p.shirt_number, p.avatar_url, p.is_active
       from public.players p
       join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
       where tr.team_id = $1 and p.is_active = true
       order by coalesce(p.shirt_number, 999), p.display_name`,
      [id]
    ),
    query(
      `select s.*, c.name as competition_name, c.season_name
       from public.team_standings s
       left join public.competitions c on c.id = s.competition_id
       where s.team_id = $1
       order by group_name nulls last, position nulls last`,
      [id]
    ),
    query(
      `select m.*, ht.name as home_team_name, at.name as away_team_name
       from public.matches m
       left join public.teams ht on ht.id = m.home_team_id
       left join public.teams at on at.id = m.away_team_id
       where m.home_team_id = $1 or m.away_team_id = $1
       order by m.scheduled_at desc`,
      [id]
    ),
    query(
      `select coalesce(sum(goals), 0)::int as goals,
              coalesce(sum(assists), 0)::int as assists,
              coalesce(sum(saves), 0)::int as saves,
              coalesce(sum(fantasy_points), 0)::int as fantasy_points
       from public.player_season_stats
       where team_id = $1`,
      [id]
    ),
    query(
      `select player_id,
              coalesce(sum(appearances), 0)::int as appearances,
              coalesce(sum(goals), 0)::int as goals,
              coalesce(sum(assists), 0)::int as assists,
              coalesce(sum(saves), 0)::int as saves,
              coalesce(sum(fantasy_points), 0)::int as fantasy_points
       from public.player_season_stats
       where team_id = $1
       group by player_id`,
      [id]
    ),
    query(
      `select m.scheduled_at, m.venue, m.round, m.phase,
              ht.name as home_team_name, at.name as away_team_name
       from public.matches m
       left join public.teams ht on ht.id = m.home_team_id
       left join public.teams at on at.id = m.away_team_id
       where (m.home_team_id = $1 or m.away_team_id = $1) and m.status = 'scheduled'
       order by m.scheduled_at asc
       limit 1`,
      [id]
    ),
    // Same real club's OTHER competition instances, past and present (see
    // clubs/team_rosters) - the global "Ekipe" list shows one row per club, so its
    // profile needs to surface every season that club ever played, not just
    // whichever ones happen to still be flagged active.
    clubId
      ? query(
          `select t.id as team_id, t.name as team_name, t.short_name as team_short_name,
                  t.competition_id, c.name as competition_name, c.season_name, t.is_active as team_active
           from public.teams t
           left join public.competitions c on c.id = t.competition_id
           where t.club_id = $1
           order by coalesce(c.starts_at, c.created_at) desc`,
          [clubId]
        )
      : Promise.resolve({ rows: [] as any[] })
  ]);

  const statsByPlayer = new Map(playerStats.rows.map((row) => [row.player_id, row]));
  const roster = players.rows
    .map((row) => {
      const stat = statsByPlayer.get(row.id);
      return {
        ...normalizePlayer(row),
        appearances: Number(stat?.appearances || 0),
        goals: Number(stat?.goals || 0),
        assists: Number(stat?.assists || 0),
        saves: Number(stat?.saves || 0),
        fantasyPoints: Number(stat?.fantasy_points || 0)
      };
    })
    .sort((a, b) => b.fantasyPoints - a.fantasyPoints);

  const team = normalizeTeam(base.rows[0]);
  return {
    ...team,
    competition: {
      id: base.rows[0].competition_id,
      name: base.rows[0].competition_name || "",
      seasonName: base.rows[0].season_name || "",
      kind: base.rows[0].kind || "",
      status: base.rows[0].competition_status || ""
    },
    city: { name: base.rows[0].city_name || "", slug: base.rows[0].city_slug || "" },
    achievement: team.placement || bestStandingLabel(standings.rows),
    players: roster,
    standings: standings.rows.map(normalizeStanding),
    matches: matches.rows.map(normalizeMatchSummary),
    totals: stats.rows[0] || { goals: 0, assists: 0, saves: 0, fantasy_points: 0 },
    nextMatch: nextMatch.rows[0] ? normalizeNextMatch(nextMatch.rows[0]) : null,
    teams: siblingTeams.rows.map((row) => ({
      teamId: row.team_id,
      teamName: row.team_name || "",
      teamShortName: row.team_short_name || "",
      competitionId: row.competition_id || "",
      competitionName: row.competition_name || "",
      seasonName: row.season_name || "",
      isActive: Boolean(row.team_active)
    }))
  };
}

export async function listPlayers(filters: { teamId?: string; competitionId?: string } = {}) {
  const params: unknown[] = [];
  const where = ["p.is_active = true"];

  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`exists (select 1 from public.team_rosters tr where tr.player_id = p.id and tr.is_active = true and tr.team_id = $${params.length})`);
  }

  if (filters.competitionId) {
    params.push(filters.competitionId);
    where.push(
      `exists (select 1 from public.team_rosters tr join public.teams t on t.id = tr.team_id where tr.player_id = p.id and tr.is_active = true and t.competition_id = $${params.length})`
    );
  }

  const result = await query(
    `select p.* from public.players p where ${where.join(" and ")} order by p.display_name`,
    params
  );
  return attachTeams(result.rows.map(normalizePlayer));
}

export async function searchPlayers(searchQuery: string) {
  const q = String(searchQuery || "").trim();
  if (!q) return [];
  const result = await query(
    `select p.* from public.players p
     where p.is_active = true and lower(p.display_name) like $1
     order by p.display_name
     limit 20`,
    [`%${q.toLowerCase()}%`]
  );
  return attachTeams(result.rows.map(normalizePlayer));
}

// Fetches every active team_rosters membership for the given players in one
// query and attaches it as a `teams` array - a player can be rostered on
// several teams at once, so this can never be collapsed into a single flat
// join without duplicating the player row (the exact bug this replaces).
async function attachTeams<T extends { id: string }>(players: T[]) {
  if (players.length === 0) return players as (T & { teams: any[] })[];
  const ids = players.map((p) => p.id);
  // Every season this player was ever rostered on, not just the currently-active
  // one(s) - dropping a player from an old team (tr.is_active = false, see
  // removePlayerFromTeam) must never make that season's history unreachable from
  // their own profile. isActive is still exposed so the UI can tell current from past.
  const result = await query(
    `select tr.player_id, tr.is_active as roster_active, t.id as team_id, t.name as team_name, t.short_name as team_short_name,
            c.id as competition_id, c.name as competition_name, c.season_name
     from public.team_rosters tr
     join public.teams t on t.id = tr.team_id
     left join public.competitions c on c.id = t.competition_id
     where tr.player_id = any($1::uuid[])
     order by coalesce(c.starts_at, c.created_at) desc`,
    [ids]
  );
  const teamsByPlayer = new Map<string, any[]>();
  for (const row of result.rows) {
    if (!teamsByPlayer.has(row.player_id)) teamsByPlayer.set(row.player_id, []);
    teamsByPlayer.get(row.player_id)!.push({
      teamId: row.team_id,
      teamName: row.team_name || "",
      teamShortName: row.team_short_name || "",
      competitionId: row.competition_id || "",
      competitionName: row.competition_name || "",
      seasonName: row.season_name || "",
      isActive: Boolean(row.roster_active)
    });
  }
  return players.map((player) => ({ ...player, teams: teamsByPlayer.get(player.id) || [] }));
}

export async function getPlayerProfile(id: string) {
  const base = await query("select * from public.players p where p.id = $1 limit 1", [id]);
  if (!base.rows[0]) throw httpError(404, "Igrac nije pronadjen.");

  const teamIds = await query(
    "select team_id from public.team_rosters where player_id = $1 and is_active = true",
    [id]
  );
  const activeTeamIds = teamIds.rows.map((row) => row.team_id);

  const [teams, seasonStats, matchStats, upcomingMatches, fantasyPrice] = await Promise.all([
    attachTeams([normalizePlayer(base.rows[0])]),
    query(
      `select s.*, c.name as competition_name, c.season_name, t.name as team_name
       from public.player_season_stats s
       left join public.competitions c on c.id = s.competition_id
       left join public.teams t on t.id = s.team_id
       where s.player_id = $1
       order by coalesce(c.starts_at, c.created_at) desc`,
      [id]
    ),
    query(
      `select s.*, m.scheduled_at, m.phase, m.home_score, m.away_score,
              ht.name as home_team_name, at.name as away_team_name
       from public.player_match_stats s
       left join public.matches m on m.id = s.match_id
       left join public.teams ht on ht.id = m.home_team_id
       left join public.teams at on at.id = m.away_team_id
       where s.player_id = $1
       order by m.scheduled_at desc`,
      [id]
    ),
    activeTeamIds.length
      ? query(
          `select m.scheduled_at, m.venue, ht.name as home_team_name, at.name as away_team_name,
                  c.name as competition_name
           from public.matches m
           left join public.teams ht on ht.id = m.home_team_id
           left join public.teams at on at.id = m.away_team_id
           left join public.competitions c on c.id = m.competition_id
           where (m.home_team_id = any($1::uuid[]) or m.away_team_id = any($1::uuid[])) and m.status = 'scheduled'
           order by m.scheduled_at asc
           limit 3`,
          [activeTeamIds]
        )
      : Promise.resolve({ rows: [] as any[] }),
    // Only from an actually-active fantasy season's pool - a still-draft season's pool
    // (or one this player was never synced into) shouldn't surface a price at all, so
    // the profile can cleanly show "-" instead of a number that doesn't mean anything
    // yet.
    query(
      `select fpp.current_price
       from public.fantasy_player_pool fpp
       join public.fantasy_season_competitions fsc on fsc.competition_id = fpp.competition_id
       join public.fantasy_seasons fs on fs.id = fsc.fantasy_season_id
       where fpp.player_id = $1 and fs.status = 'active'
       order by fs.updated_at desc
       limit 1`,
      [id]
    )
  ]);

  const normalizedUpcoming = upcomingMatches.rows.map(normalizeNextMatch);

  return {
    ...teams[0],
    seasonStats: seasonStats.rows.map(normalizePlayerSeasonStat),
    matchStats: matchStats.rows.map(normalizePlayerMatchStat),
    // nextMatch is the older singular field (still used by the full profile's "Profil"
    // tab); upcomingMatches is the same query widened to 3 rows for the compact
    // verified-player card's "Naredne utakmice" list - kept as two fields instead of
    // migrating every caller to the array.
    nextMatch: normalizedUpcoming[0] ?? null,
    upcomingMatches: normalizedUpcoming,
    fantasyPrice: fantasyPrice.rows[0] ? Number(fantasyPrice.rows[0].current_price) : null
  };
}

function normalizeNextMatch(row: any) {
  return {
    scheduledAt: row.scheduled_at,
    venue: row.venue || "",
    round: row.round !== undefined && row.round !== null ? Number(row.round) : null,
    homeTeamName: row.home_team_name || "",
    awayTeamName: row.away_team_name || "",
    competitionName: row.competition_name || ""
  };
}

export async function getCompetitionStandings(competitionId: string) {
  const result = await query(
    `select s.*, t.name as team_name, t.short_name as team_short_name, t.logo_url
     from public.team_standings s
     left join public.teams t on t.id = s.team_id
     where s.competition_id = $1
     order by coalesce(s.group_name, ''), coalesce(s.position, 999), s.points desc, s.goal_difference desc`,
    [competitionId]
  );
  return groupBy(result.rows.map(normalizeStanding), "groupName");
}

export async function getCompetitionLeaders(competitionId: string, category = "goals") {
  const field = LEADER_FIELDS[category] || LEADER_FIELDS.goals;
  const result = await query(
    `select s.player_id, s.team_id, s.${field.column} as value, s.appearances,
            p.display_name as player_name, p.position, p.avatar_url,
            t.name as team_name, t.short_name as team_short_name
     from public.player_season_stats s
     left join public.players p on p.id = s.player_id
     left join public.teams t on t.id = s.team_id
     where s.competition_id = $1
     order by s.${field.column} desc, s.appearances asc, p.display_name
     limit 50`,
    [competitionId]
  );
  return {
    category,
    label: field.label,
    leaders: result.rows.map((row, index) => ({
      rank: index + 1,
      playerId: row.player_id,
      playerName: row.player_name || "",
      teamId: row.team_id,
      teamName: row.team_name || "",
      teamShortName: row.team_short_name || "",
      position: row.position || "",
      avatarUrl: row.avatar_url || "",
      value: Number(row.value || 0),
      appearances: Number(row.appearances || 0)
    }))
  };
}

interface CompetitionPayload {
  cityId?: string;
  name?: string;
  seasonName?: string;
  season?: string;
  kind?: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
}

export async function createCompetition(payload: CompetitionPayload, actor: Actor) {
  const result = await query(
    `insert into public.competitions (city_id, name, season_name, kind, status, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      optionalUuid(payload.cityId),
      requiredText(payload.name, "Naziv takmicenja je obavezan."),
      requiredText(payload.seasonName || payload.season, "Naziv sezone je obavezan."),
      String(payload.kind || "league").trim(),
      String(payload.status || "draft").trim(),
      payload.startsAt || null,
      payload.endsAt || null
    ]
  );
  await audit(actor, "competition.create", "competition", result.rows[0].id, { name: result.rows[0].name });
  return normalizeCompetition(result.rows[0]);
}

export async function updateCompetition(id: string, payload: CompetitionPayload, actor: Actor) {
  const current = await query("select * from public.competitions where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  const row = current.rows[0];
  const result = await query(
    `update public.competitions set
       city_id = $2, name = $3, season_name = $4, kind = $5, status = $6,
       starts_at = $7, ends_at = $8, updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      payload.cityId !== undefined ? optionalUuid(payload.cityId) : row.city_id,
      payload.name !== undefined ? requiredText(payload.name, "Naziv takmicenja je obavezan.") : row.name,
      payload.seasonName !== undefined || payload.season !== undefined
        ? requiredText(payload.seasonName || payload.season, "Naziv sezone je obavezan.")
        : row.season_name,
      payload.kind !== undefined ? String(payload.kind || "league").trim() : row.kind,
      payload.status !== undefined ? String(payload.status || "draft").trim() : row.status,
      payload.startsAt !== undefined ? payload.startsAt || null : row.starts_at,
      payload.endsAt !== undefined ? payload.endsAt || null : row.ends_at
    ]
  );
  await audit(actor, "competition.update", "competition", id, { name: result.rows[0].name });
  return normalizeCompetition(result.rows[0]);
}

export async function deleteCompetition(id: string, actor: Actor) {
  const current = await query("select id, name from public.competitions where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  await query("delete from public.competitions where id = $1", [id]);
  await audit(actor, "competition.delete", "competition", id, { name: current.rows[0].name });
  return { id, deleted: true };
}

interface TeamPayload {
  competitionId?: string;
  name?: string;
  shortName?: string;
  logoUrl?: string;
  groupName?: string;
  placement?: string;
  isActive?: boolean;
}

export async function createTeam(payload: TeamPayload, actor: Actor) {
  const competitionId = optionalUuid(payload.competitionId);
  const name = requiredText(payload.name, "Naziv ekipe je obavezan.");
  const shortName = String(payload.shortName || "").trim();
  const logoUrl = String(payload.logoUrl || "").trim();

  let cityId = null;
  if (competitionId) {
    const competition = await query("select city_id from public.competitions where id = $1", [competitionId]);
    cityId = competition.rows[0]?.city_id || null;
  }
  const club = await findOrCreateClub({ name, shortName, logoUrl, cityId });

  const result = await query(
    `insert into public.teams (competition_id, club_id, name, short_name, logo_url, group_name, placement, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      competitionId,
      club.id,
      name,
      shortName,
      logoUrl,
      String(payload.groupName || "").trim(),
      String(payload.placement || "").trim(),
      payload.isActive !== false
    ]
  );
  await audit(actor, "team.create", "team", result.rows[0].id, { name: result.rows[0].name });
  await syncFantasyPoolForTeam(result.rows[0].id, actor);
  if (result.rows[0].competition_id) {
    await recalculateCompetitionStandings({ query } as any, result.rows[0].competition_id);
  }
  return normalizeTeam(result.rows[0]);
}

export async function updateTeam(id: string, payload: TeamPayload, actor: Actor) {
  const current = await query("select * from public.teams where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Ekipa nije pronadjena.");
  const row = current.rows[0];
  const result = await query(
    `update public.teams set
       competition_id = $2, name = $3, short_name = $4, logo_url = $5,
       group_name = $6, placement = $7, is_active = $8, updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      payload.competitionId !== undefined ? optionalUuid(payload.competitionId) : row.competition_id,
      payload.name !== undefined ? requiredText(payload.name, "Naziv ekipe je obavezan.") : row.name,
      payload.shortName !== undefined ? String(payload.shortName || "").trim() : row.short_name,
      payload.logoUrl !== undefined ? String(payload.logoUrl || "").trim() : row.logo_url,
      payload.groupName !== undefined ? String(payload.groupName || "").trim() : row.group_name,
      payload.placement !== undefined ? String(payload.placement || "").trim() : row.placement,
      payload.isActive !== undefined ? Boolean(payload.isActive) : row.is_active
    ]
  );
  await audit(actor, "team.update", "team", id, { name: result.rows[0].name });
  if (payload.logoUrl !== undefined && result.rows[0].club_id) {
    const trimmedLogo = String(payload.logoUrl || "").trim();
    if (trimmedLogo) {
      await query("update public.clubs set logo_url = $2, updated_at = now() where id = $1", [result.rows[0].club_id, trimmedLogo]);
    }
  }
  await syncFantasyPoolForTeam(result.rows[0].id, actor);
  if (result.rows[0].competition_id) {
    await recalculateCompetitionStandings({ query } as any, result.rows[0].competition_id);
  }
  return normalizeTeam(result.rows[0]);
}

interface PlayerPayload {
  teamId?: string;
  displayName?: string;
  name?: string;
  position?: string;
  shirtNumber?: number;
  avatarUrl?: string;
  isActive?: boolean;
}

export async function createPlayer(payload: PlayerPayload, actor: Actor) {
  const teamId = optionalUuid(payload.teamId);
  const result = await transaction(async (client) => {
    let clubId = null;
    if (teamId) {
      const team = await client.query("select club_id from public.teams where id = $1", [teamId]);
      clubId = team.rows[0]?.club_id || null;
    }
    const created = await client.query(
      `insert into public.players (club_id, display_name, position, shirt_number, avatar_url, is_active)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [
        clubId,
        requiredText(payload.displayName || payload.name, "Ime igraca je obavezno."),
        String(payload.position || "").trim(),
        integerOrNull(payload.shirtNumber),
        String(payload.avatarUrl || "").trim(),
        payload.isActive !== false
      ]
    );
    if (teamId) {
      await client.query(
        "insert into public.team_rosters (player_id, team_id) values ($1, $2) on conflict do nothing",
        [created.rows[0].id, teamId]
      );
    }
    return created.rows[0];
  });
  await audit(actor, "player.create", "player", result.id, { displayName: result.display_name });
  if (teamId) await syncFantasyPoolForTeam(teamId, actor);
  return normalizePlayer(result);
}

export async function updatePlayer(id: string, payload: PlayerPayload, actor: Actor) {
  const current = await query("select * from public.players where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Igrac nije pronadjen.");
  const row = current.rows[0];
  const result = await query(
    `update public.players set
       display_name = $2, position = $3, shirt_number = $4,
       avatar_url = $5, is_active = $6, updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      payload.displayName !== undefined || payload.name !== undefined
        ? requiredText(payload.displayName || payload.name, "Ime igraca je obavezno.")
        : row.display_name,
      payload.position !== undefined ? String(payload.position || "").trim() : row.position,
      payload.shirtNumber !== undefined ? integerOrNull(payload.shirtNumber) : row.shirt_number,
      payload.avatarUrl !== undefined ? String(payload.avatarUrl || "").trim() : row.avatar_url,
      payload.isActive !== undefined ? Boolean(payload.isActive) : row.is_active
    ]
  );
  await audit(actor, "player.update", "player", id, { displayName: result.rows[0].display_name });
  return normalizePlayer(result.rows[0]);
}

// Attaches an EXISTING player identity to another team's roster (a real
// transfer, or the same club fielding this person in a second competition) -
// never creates a new players row, which is exactly what used to happen here.
export async function addPlayerToTeam(teamId: string, playerId: string, actor: Actor) {
  const player = await query("select id, display_name from public.players where id = $1 and is_active = true", [playerId]);
  if (!player.rows[0]) throw httpError(404, "Igrac nije pronadjen.");
  const team = await query("select id from public.teams where id = $1", [teamId]);
  if (!team.rows[0]) throw httpError(404, "Ekipa nije pronadjena.");

  await query(
    `insert into public.team_rosters (player_id, team_id, is_active) values ($1, $2, true)
     on conflict (player_id, team_id) do update set is_active = true`,
    [playerId, teamId]
  );
  await audit(actor, "player.roster.add", "team", teamId, { playerId, displayName: player.rows[0].display_name });
  await syncFantasyPoolForTeam(teamId, actor);
  return getTeamProfile(teamId);
}

export async function removePlayerFromTeam(teamId: string, playerId: string, actor: Actor) {
  const result = await query(
    "update public.team_rosters set is_active = false where team_id = $1 and player_id = $2 returning id",
    [teamId, playerId]
  );
  if (!result.rows[0]) throw httpError(404, "Igrac nije na rosteru ove ekipe.");
  await audit(actor, "player.roster.remove", "team", teamId, { playerId });
  await syncFantasyPoolForTeam(teamId, actor);
  return getTeamProfile(teamId);
}

export async function listClubs(filters: { search?: string } = {}) {
  const params: unknown[] = [];
  const where = ["c.is_active = true"];
  const search = String(filters.search || "").trim();
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`lower(c.name) like $${params.length}`);
  }
  const result = await query(
    `select c.*,
            count(distinct t.id)::int as teams_count,
            count(distinct t.competition_id)::int as competitions_count,
            count(distinct p.id) filter (where p.is_active)::int as active_players_count
     from public.clubs c
     left join public.teams t on t.club_id = c.id and t.is_active = true
     left join public.team_rosters tr on tr.team_id = t.id and tr.is_active = true
     left join public.players p on p.id = tr.player_id and p.is_active = true
     where ${where.join(" and ")}
     group by c.id
     order by c.name
     limit 100`,
    params
  );
  const clubs = result.rows.map(normalizeClub);
  if (clubs.length === 0) return clubs;

  const teamsResult = await query(
    `select t.club_id, t.id as team_id, t.name as team_name, t.short_name as team_short_name,
            t.competition_id, c.name as competition_name, c.season_name
     from public.teams t
     left join public.competitions c on c.id = t.competition_id
     where t.club_id = any($1::uuid[]) and t.is_active = true
     order by coalesce(c.starts_at, c.created_at) desc`,
    [clubs.map((club) => club.id)]
  );
  const teamsByClub = new Map<string, any[]>();
  for (const row of teamsResult.rows) {
    if (!teamsByClub.has(row.club_id)) teamsByClub.set(row.club_id, []);
    teamsByClub.get(row.club_id)!.push({
      teamId: row.team_id,
      teamName: row.team_name || "",
      teamShortName: row.team_short_name || "",
      competitionId: row.competition_id || "",
      competitionName: row.competition_name || "",
      seasonName: row.season_name || ""
    });
  }
  return clubs.map((club) => ({ ...club, teams: teamsByClub.get(club.id) || [] }));
}

async function findOrCreateClub({ name, shortName, logoUrl, cityId }: { name: string; shortName?: string; logoUrl?: string; cityId?: string | null }) {
  const normalized = requiredText(name, "Naziv kluba je obavezan.");
  const existing = await query("select * from public.clubs where lower(trim(name)) = lower(trim($1)) limit 1", [normalized]);
  if (existing.rows[0]) return existing.rows[0];
  const created = await query(
    `insert into public.clubs (name, short_name, logo_url, city_id)
     values ($1, $2, $3, $4)
     on conflict (lower(trim(name))) do update set
       logo_url = case when excluded.logo_url != '' then excluded.logo_url else public.clubs.logo_url end,
       updated_at = now()
     returning *`,
    [normalized, String(shortName || "").trim(), String(logoUrl || "").trim(), cityId || null]
  );
  return created.rows[0];
}

async function syncFantasyPoolForTeam(teamId: string, actor: Actor | null) {
  if (!teamId) return null;
  const result = await query("select competition_id from public.teams where id = $1 and competition_id is not null", [teamId]);
  const competitionId = result.rows[0]?.competition_id;
  if (!competitionId) return null;
  return syncFantasyPlayerPool(competitionId, actor);
}

function normalizeCity(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active
  };
}

function normalizeCompetition(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cityId: row.city_id || "",
    cityName: row.city_name || "",
    citySlug: row.city_slug || "",
    name: row.name,
    seasonName: row.season_name,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    teamsCount: Number(row.teams_count || 0),
    matchesCount: Number(row.matches_count || 0),
    legacySource: row.legacy_source || "",
    legacyId: row.legacy_id || ""
  };
}

function normalizeTeam(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    competitionId: row.competition_id || "",
    clubId: row.club_id || "",
    name: row.name,
    shortName: row.short_name || "",
    logoUrl: row.logo_url || "",
    groupName: row.group_name || "",
    placement: row.placement || "",
    isActive: row.is_active,
    playersCount: Number(row.players_count || 0),
    standing: row.played !== undefined ? {
      played: Number(row.played || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
      goalsFor: Number(row.goals_for || 0),
      goalsAgainst: Number(row.goals_against || 0),
      goalDifference: Number(row.goal_difference || 0),
      points: Number(row.points || 0),
      position: row.position ? Number(row.position) : null,
      form: row.form || ""
    } : null
  };
}

function normalizeClub(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    shortName: row.short_name || "",
    logoUrl: row.logo_url || "",
    cityId: row.city_id || "",
    isActive: row.is_active,
    teamsCount: Number(row.teams_count || 0),
    competitionsCount: Number(row.competitions_count || 0),
    activePlayersCount: Number(row.active_players_count || 0)
  };
}

// Identity-only - a player can be rostered on several teams at once (see
// team_rosters), so team membership is never part of this shape. Callers that
// need it attach a `teams: [...]` array separately (see listPlayers/getPlayerProfile).
function normalizePlayer(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clubId: row.club_id || "",
    displayName: row.display_name,
    position: row.position || "",
    shirtNumber: row.shirt_number,
    avatarUrl: row.avatar_url || "",
    isActive: row.is_active
  };
}

function normalizeStanding(row: any) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    competitionName: row.competition_name || "",
    seasonName: row.season_name || "",
    teamId: row.team_id,
    teamName: row.team_name || "",
    teamShortName: row.team_short_name || "",
    logoUrl: row.logo_url || "",
    groupName: row.group_name || "",
    played: Number(row.played || 0),
    wins: Number(row.wins || 0),
    draws: Number(row.draws || 0),
    losses: Number(row.losses || 0),
    goalsFor: Number(row.goals_for || 0),
    goalsAgainst: Number(row.goals_against || 0),
    goalDifference: Number(row.goal_difference || 0),
    points: Number(row.points || 0),
    form: row.form || "",
    position: row.position ? Number(row.position) : null
  };
}

function normalizeMatchSummary(row: any) {
  return {
    id: row.id,
    competitionId: row.competition_id || "",
    scheduledAt: row.scheduled_at,
    phase: row.phase,
    groupName: row.group_name || "",
    status: row.status,
    homeTeamId: row.home_team_id || "",
    awayTeamId: row.away_team_id || "",
    homeTeamName: row.home_team_name || "",
    awayTeamName: row.away_team_name || "",
    homeScore: Number(row.home_score || 0),
    awayScore: Number(row.away_score || 0),
    venue: row.venue || "",
    period: row.period || "",
    periodStartedAt: row.period_started_at || "",
    halfLengthMinutes: Number(row.half_length_minutes || 20)
  };
}

function normalizePlayerSeasonStat(row: any) {
  return {
    competitionId: row.competition_id,
    competitionName: row.competition_name || "",
    seasonName: row.season_name || "",
    teamId: row.team_id,
    teamName: row.team_name || "",
    appearances: Number(row.appearances || 0),
    goals: Number(row.goals || 0),
    assists: Number(row.assists || 0),
    saves: Number(row.saves || 0),
    yellowCards: Number(row.yellow_cards || 0),
    redCards: Number(row.red_cards || 0),
    fantasyPoints: Number(row.fantasy_points || 0)
  };
}

function normalizePlayerMatchStat(row: any) {
  return {
    matchId: row.match_id,
    scheduledAt: row.scheduled_at,
    phase: row.phase || "",
    homeTeamName: row.home_team_name || "",
    awayTeamName: row.away_team_name || "",
    score: `${Number(row.home_score || 0)}:${Number(row.away_score || 0)}`,
    goals: Number(row.goals || 0),
    assists: Number(row.assists || 0),
    saves: Number(row.saves || 0),
    fantasyPoints: Number(row.fantasy_points || 0)
  };
}

function groupBy(items: any[], key: string) {
  const groups = new Map<string, any[]>();
  for (const item of items) {
    const name = item[key] || "Tabela";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()].map(([name, rows]) => ({ name, rows }));
}

function bestStandingLabel(rows: any[]): string {
  if (!rows.length) return "";
  const best = [...rows].sort((a, b) => Number(a.position || 999) - Number(b.position || 999))[0];
  if (!best?.position) return "";
  if (best.position === 1) return "1. mesto u grupi";
  return `${best.position}. mesto u grupi`;
}

async function audit(actor: Actor | null, action: string, entityType: string, entityId: string, metadata: unknown) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function integerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
