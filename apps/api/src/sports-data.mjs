import { query } from "./db.mjs";
import { syncFantasyPlayerPool } from "./season-hub.mjs";
import { recalculateCompetitionStandings } from "./matches-db.mjs";

const LEADER_FIELDS = {
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

export async function createCity(payload, actor) {
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
    if (error.code === "23505") throw httpError(409, "Grad sa tim nazivom vec postoji.");
    throw error;
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listCompetitions(filters = {}) {
  const params = [];
  const where = [];

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

export async function getCompetition(id) {
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

export async function listCompetitionTeams(competitionId) {
  const params = [];
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
     left join public.players p on p.team_id = t.id and p.is_active = true
     where ${where.join(" and ")}
     group by t.id, s.played, s.wins, s.draws, s.losses, s.goals_for, s.goals_against,
              s.goal_difference, s.points, s.position, s.form
     order by coalesce(t.group_name, ''), coalesce(s.position, 999), t.name`,
    params
  );
  return result.rows.map(normalizeTeam);
}

export async function getTeamProfile(id) {
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

  const [players, standings, matches, stats, playerStats, nextMatch] = await Promise.all([
    query(
      `select id, created_at, updated_at, team_id, display_name, position, shirt_number, avatar_url, is_active
       from public.players
       where team_id = $1 and is_active = true
       order by coalesce(shirt_number, 999), display_name`,
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
    )
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
    nextMatch: nextMatch.rows[0] ? normalizeNextMatch(nextMatch.rows[0]) : null
  };
}

export async function listPlayers(filters = {}) {
  const params = [];
  const where = ["p.is_active = true"];

  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`p.team_id = $${params.length}`);
  }

  if (filters.competitionId) {
    params.push(filters.competitionId);
    where.push(`t.competition_id = $${params.length}`);
  }

  const result = await query(
    `select p.*, t.name as team_name, t.short_name as team_short_name, t.competition_id
     from public.players p
     left join public.teams t on t.id = p.team_id
     where ${where.join(" and ")}
     order by p.display_name`,
    params
  );
  return result.rows.map(normalizePlayer);
}

export async function getPlayerProfile(id) {
  const base = await query(
    `select p.*, t.name as team_name, t.short_name as team_short_name, t.competition_id,
            c.name as competition_name, c.season_name
     from public.players p
     left join public.teams t on t.id = p.team_id
     left join public.competitions c on c.id = t.competition_id
     where p.id = $1
     limit 1`,
    [id]
  );
  if (!base.rows[0]) throw httpError(404, "Igrac nije pronadjen.");

  const [seasonStats, matchStats, nextMatch] = await Promise.all([
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
    base.rows[0].team_id
      ? query(
          `select m.scheduled_at, m.venue, ht.name as home_team_name, at.name as away_team_name,
                  c.name as competition_name
           from public.matches m
           left join public.teams ht on ht.id = m.home_team_id
           left join public.teams at on at.id = m.away_team_id
           left join public.competitions c on c.id = m.competition_id
           where (m.home_team_id = $1 or m.away_team_id = $1) and m.status = 'scheduled'
           order by m.scheduled_at asc
           limit 1`,
          [base.rows[0].team_id]
        )
      : Promise.resolve({ rows: [] })
  ]);

  return {
    ...normalizePlayer(base.rows[0]),
    competition: {
      id: base.rows[0].competition_id || "",
      name: base.rows[0].competition_name || "",
      seasonName: base.rows[0].season_name || ""
    },
    seasonStats: seasonStats.rows.map(normalizePlayerSeasonStat),
    matchStats: matchStats.rows.map(normalizePlayerMatchStat),
    nextMatch: nextMatch.rows[0] ? normalizeNextMatch(nextMatch.rows[0]) : null
  };
}

function normalizeNextMatch(row) {
  return {
    scheduledAt: row.scheduled_at,
    venue: row.venue || "",
    round: row.round !== undefined && row.round !== null ? Number(row.round) : null,
    homeTeamName: row.home_team_name || "",
    awayTeamName: row.away_team_name || "",
    competitionName: row.competition_name || ""
  };
}

export async function getCompetitionStandings(competitionId) {
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

export async function getCompetitionLeaders(competitionId, category = "goals") {
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

export async function createCompetition(payload, actor) {
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

export async function updateCompetition(id, payload, actor) {
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

export async function deleteCompetition(id, actor) {
  const current = await query("select id, name from public.competitions where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  await query("delete from public.competitions where id = $1", [id]);
  await audit(actor, "competition.delete", "competition", id, { name: current.rows[0].name });
  return { id, deleted: true };
}

export async function createTeam(payload, actor) {
  const result = await query(
    `insert into public.teams (competition_id, name, short_name, logo_url, group_name, placement, is_active)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      optionalUuid(payload.competitionId),
      requiredText(payload.name, "Naziv ekipe je obavezan."),
      String(payload.shortName || "").trim(),
      String(payload.logoUrl || "").trim(),
      String(payload.groupName || "").trim(),
      String(payload.placement || "").trim(),
      payload.isActive !== false
    ]
  );
  await audit(actor, "team.create", "team", result.rows[0].id, { name: result.rows[0].name });
  await syncFantasyPoolForTeam(result.rows[0].id, actor);
  if (result.rows[0].competition_id) {
    await recalculateCompetitionStandings({ query }, result.rows[0].competition_id);
  }
  return normalizeTeam(result.rows[0]);
}

export async function updateTeam(id, payload, actor) {
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
  await syncFantasyPoolForTeam(result.rows[0].id, actor);
  if (result.rows[0].competition_id) {
    await recalculateCompetitionStandings({ query }, result.rows[0].competition_id);
  }
  return normalizeTeam(result.rows[0]);
}

export async function createPlayer(payload, actor) {
  const result = await query(
    `insert into public.players (team_id, display_name, position, shirt_number, avatar_url, is_active)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [
      optionalUuid(payload.teamId),
      requiredText(payload.displayName || payload.name, "Ime igraca je obavezno."),
      String(payload.position || "").trim(),
      integerOrNull(payload.shirtNumber),
      String(payload.avatarUrl || "").trim(),
      payload.isActive !== false
    ]
  );
  await audit(actor, "player.create", "player", result.rows[0].id, { displayName: result.rows[0].display_name });
  await syncFantasyPoolForTeam(result.rows[0].team_id, actor);
  return normalizePlayer(result.rows[0]);
}

export async function updatePlayer(id, payload, actor) {
  const current = await query("select * from public.players where id = $1", [id]);
  if (!current.rows[0]) throw httpError(404, "Igrac nije pronadjen.");
  const row = current.rows[0];
  const result = await query(
    `update public.players set
       team_id = $2, display_name = $3, position = $4, shirt_number = $5,
       avatar_url = $6, is_active = $7, updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      payload.teamId !== undefined ? optionalUuid(payload.teamId) : row.team_id,
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
  await syncFantasyPoolForTeam(result.rows[0].team_id, actor);
  if (row.team_id && row.team_id !== result.rows[0].team_id) await syncFantasyPoolForTeam(row.team_id, actor);
  return normalizePlayer(result.rows[0]);
}

async function syncFantasyPoolForTeam(teamId, actor) {
  if (!teamId) return null;
  const result = await query("select competition_id from public.teams where id = $1 and competition_id is not null", [teamId]);
  const competitionId = result.rows[0]?.competition_id;
  if (!competitionId) return null;
  return syncFantasyPlayerPool(competitionId, actor);
}

function normalizeCity(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active
  };
}

function normalizeCompetition(row) {
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

function normalizeTeam(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    competitionId: row.competition_id || "",
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

function normalizePlayer(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    teamShortName: row.team_short_name || "",
    competitionId: row.competition_id || "",
    displayName: row.display_name,
    position: row.position || "",
    shirtNumber: row.shirt_number,
    avatarUrl: row.avatar_url || "",
    isActive: row.is_active
  };
}

function normalizeStanding(row) {
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

function normalizeMatchSummary(row) {
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
    venue: row.venue || ""
  };
}

function normalizePlayerSeasonStat(row) {
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

function normalizePlayerMatchStat(row) {
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

function groupBy(items, key) {
  const groups = new Map();
  for (const item of items) {
    const name = item[key] || "Tabela";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  return [...groups.entries()].map(([name, rows]) => ({ name, rows }));
}

function bestStandingLabel(rows) {
  if (!rows.length) return "";
  const best = [...rows].sort((a, b) => Number(a.position || 999) - Number(b.position || 999))[0];
  if (!best?.position) return "";
  if (best.position === 1) return "1. mesto u grupi";
  return `${best.position}. mesto u grupi`;
}

async function audit(actor, action, entityType, entityId, metadata) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function optionalUuid(value) {
  const text = String(value || "").trim();
  return text || null;
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
