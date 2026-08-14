import type { PoolClient } from "pg";
import { query, transaction } from "./db.ts";
import { recalculateCompetitionStandings } from "./matches-db.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const LEADER_CATEGORIES = ["goals", "assists", "saves", "mvp"];
const LEADER_COLUMNS: Record<string, string> = {
  goals: "goals",
  assists: "assists",
  saves: "saves",
  mvp: "fantasy_points"
};

const DAY_MS = 24 * 60 * 60 * 1000;

function weekStart(value: string): Date {
  const date = new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return weekStart(new Date().toISOString());
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekEnd(monday: Date): Date {
  const date = new Date(monday);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function gameweekName(row: any): string {
  const phaseName = String(row.phase_name || "").trim();
  if (phaseName && !/^regular/i.test(phaseName)) return phaseName;
  const phase = String(row.phase || "").trim().toLowerCase();
  if (phase && phase !== "league" && phase !== "regular") return phaseName || phase;
  return `Kolo ${row.round}`;
}

export async function syncFantasyPlayerPool(competitionId: string, actor: Actor | null) {
  const result = await transaction(async (client) => {
    await ensureCompetition(client, competitionId);

    const inserted = await client.query(
      `insert into public.fantasy_player_pool
         (competition_id, player_id, team_id, base_price, current_price, is_available)
       select distinct on (roster.player_id)
              roster.competition_id, roster.player_id, roster.team_id, roster.price, roster.price, true
       from (
         select t.competition_id, p.id as player_id, t.id as team_id, tr.created_at as roster_created_at,
                calculate_base_price(coalesce(ps.fantasy_points, 0), coalesce(ps.goals, 0), coalesce(ps.assists, 0), coalesce(ps.saves, 0)) as price
         from public.players p
         join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
         join public.teams t on t.id = tr.team_id
         left join public.player_season_stats ps on ps.player_id = p.id and ps.competition_id = t.competition_id
         where t.competition_id = $1 and t.is_active = true and p.is_active = true
       ) roster
       order by roster.player_id, roster.roster_created_at asc
       on conflict (competition_id, player_id) where fantasy_season_id is null do update set
         team_id = excluded.team_id,
         base_price = excluded.base_price,
         current_price = case
           when public.fantasy_player_pool.current_price = 5.00 then excluded.current_price
           else public.fantasy_player_pool.current_price
         end,
         is_available = true,
         availability_note = null,
         updated_at = now()
       returning id`,
      [competitionId]
    );

    const disabled = await client.query(
      `update public.fantasy_player_pool fpp set
         is_available = false,
         availability_note = 'Igrac vise nije u aktivnom rosteru ove lige.',
         updated_at = now()
       where fpp.competition_id = $1
         and not exists (
           select 1
           from public.players p
           join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
           join public.teams t on t.id = tr.team_id
           where p.id = fpp.player_id
             and t.id = fpp.team_id
             and t.competition_id = fpp.competition_id
             and p.is_active = true
             and t.is_active = true
         )`,
      [competitionId]
    );

    await auditWithClient(client, actor, "fantasy.pool.sync", "competition", competitionId, {
      available: inserted.rowCount,
      unavailable: disabled.rowCount
    });

    return { available: inserted.rowCount, unavailable: disabled.rowCount };
  });

  return { competitionId, ...result };
}

interface PoolFilters {
  availableOnly?: boolean;
  teamId?: string;
  search?: string;
}

export async function listFantasyPlayerPool(competitionId: string, filters: PoolFilters = {}) {
  const params: unknown[] = [requiredText(competitionId, "Takmicenje je obavezno.")];
  const where = ["fpp.competition_id = $1"];

  if (filters.availableOnly !== false) where.push("fpp.is_available = true");
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`fpp.team_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(`(p.display_name ilike $${params.length} or t.name ilike $${params.length})`);
  }

  const result = await query(
    `select fpp.*, p.display_name, p.position, p.shirt_number, p.avatar_url,
            t.name as team_name, t.short_name as team_short_name, t.logo_url as team_logo_url,
            coalesce(ps.appearances, 0) as appearances,
            coalesce(ps.goals, 0) as goals,
            coalesce(ps.assists, 0) as assists,
            coalesce(ps.saves, 0) as saves,
            coalesce(ps.fantasy_points, 0) as fantasy_points
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     left join public.player_season_stats ps on ps.competition_id = fpp.competition_id and ps.player_id = fpp.player_id
     where ${where.join(" and ")}
     order by fpp.is_available desc, fpp.current_price desc, p.display_name
     limit 300`,
    params
  );
  return result.rows.map(normalizeFantasyPoolPlayer);
}

interface ActivateSeasonPayload {
  startsAt?: string;
  endsAt?: string;
  status?: string;
}

export async function activateCompetitionSeason(competitionId: string, payload: ActivateSeasonPayload = {}, actor: Actor | null) {
  const result = await transaction(async (client) => {
    const competition = await ensureCompetition(client, competitionId);
    const seasonStartsAt = payload.startsAt || competition.starts_at || new Date().toISOString();
    const seasonEndsAt = payload.endsAt || competition.ends_at || null;
    const firstMonday = weekStart(seasonStartsAt);
    const seasonEndDate = seasonEndsAt ? new Date(seasonEndsAt) : null;

    await client.query(
      `update public.competitions
       set status = $2,
           starts_at = coalesce($3::timestamptz, starts_at),
           ends_at = coalesce($4::timestamptz, ends_at),
           updated_at = now()
       where id = $1`,
      [competitionId, payload.status || "active", seasonStartsAt, seasonEndsAt]
    );

    const rounds = await client.query(
      `select round,
              min(scheduled_at) as starts_at,
              max(scheduled_at) as ends_at,
              min(phase) as phase,
              min(nullif(cp.name, '')) as phase_name,
              count(*)::int as matches_count
       from public.matches m
       left join public.competition_phases cp on cp.id = m.phase_id
       where m.competition_id = $1 and m.round is not null
       group by m.round
       order by m.round`,
      [competitionId]
    );

    const gameweeks = [];
    for (const [index, row] of rounds.rows.entries()) {
      const name = gameweekName(row);
      const startsAtDate = new Date(firstMonday.getTime() + index * 7 * DAY_MS);
      const endsAtDate = weekEnd(startsAtDate);
      if (seasonEndDate && Number.isFinite(seasonEndDate.getTime()) && endsAtDate > seasonEndDate) {
        endsAtDate.setTime(seasonEndDate.getTime());
      }
      const startsAt = startsAtDate.toISOString();
      const endsAt = endsAtDate.toISOString();
      const locksAt = startsAt;
      const saved = await client.query(
        `insert into public.gameweeks (competition_id, name, starts_at, locks_at, ends_at, status)
         values ($1, $2, $3, $4, $5, 'open')
         on conflict (competition_id, name) do update set
           starts_at = excluded.starts_at,
           locks_at = excluded.locks_at,
           ends_at = excluded.ends_at,
           status = case when public.gameweeks.status = 'finished' then public.gameweeks.status else excluded.status end,
           updated_at = now()
         returning *`,
        [competitionId, name, startsAt, locksAt, endsAt]
      );
      await client.query(
        `update public.matches
         set gameweek_id = $1,
             scheduled_at = case
               when scheduled_at is null then $4::timestamptz
               else scheduled_at
             end,
             updated_at = now()
         where competition_id = $2 and round = $3 and gameweek_id is null`,
        [saved.rows[0].id, competitionId, row.round, startsAt]
      );
      gameweeks.push(saved.rows[0]);
    }

    await client.query(
      `insert into public.fantasy_player_pool
         (competition_id, player_id, team_id, base_price, current_price, is_available)
       select distinct on (roster.player_id)
              roster.competition_id, roster.player_id, roster.team_id, roster.price, roster.price, true
       from (
         select t.competition_id, p.id as player_id, t.id as team_id, tr.created_at as roster_created_at,
                calculate_base_price(coalesce(ps.fantasy_points, 0), coalesce(ps.goals, 0), coalesce(ps.assists, 0), coalesce(ps.saves, 0)) as price
         from public.players p
         join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
         join public.teams t on t.id = tr.team_id
         left join public.player_season_stats ps on ps.player_id = p.id and ps.competition_id = t.competition_id
         where t.competition_id = $1 and t.is_active = true and p.is_active = true
       ) roster
       order by roster.player_id, roster.roster_created_at asc
       on conflict (competition_id, player_id) where fantasy_season_id is null do update set
         team_id = excluded.team_id,
         is_available = true,
         availability_note = null,
         updated_at = now()`,
      [competitionId]
    );

    await recalculateCompetitionStandings(client, competitionId);

    await auditWithClient(client, actor, "competition.activate", "competition", competitionId, {
      gameweeks: gameweeks.length
    });

    return { gameweeks };
  });

  return {
    competitionId,
    gameweeks: result.gameweeks.map(normalizeGameweek)
  };
}

export async function getSeasonHub(competitionId = "") {
  const competition = competitionId
    ? await getCompetitionById(competitionId)
    : await getDefaultCompetition();
  if (!competition) return { competitions: [], activeCompetition: null, gameweeks: [], matches: [], standings: [], leaders: {}, fantasyPlayers: [] };

  const [competitions, gameweeks, matches, standings, fantasyPlayers] = await Promise.all([
    listSeasonCompetitions(),
    query(
      `select g.*, count(m.id)::int as matches_count
       from public.gameweeks g
       left join public.matches m on m.gameweek_id = g.id
       where g.competition_id = $1
       group by g.id
       order by g.starts_at, g.name`,
      [competition.id]
    ),
    query(
      `select m.*, ht.name as home_team_name, ht.short_name as home_team_short_name, ht.logo_url as home_team_logo_url,
              at.name as away_team_name, at.short_name as away_team_short_name, at.logo_url as away_team_logo_url,
              g.name as gameweek_name, cp.name as phase_name, cp.code as phase_code
       from public.matches m
       left join public.teams ht on ht.id = m.home_team_id
       left join public.teams at on at.id = m.away_team_id
       left join public.gameweeks g on g.id = m.gameweek_id
       left join public.competition_phases cp on cp.id = m.phase_id
       where m.competition_id = $1
       order by m.scheduled_at, m.round nulls last`,
      [competition.id]
    ),
    query(
      `select s.*, t.name as team_name, t.short_name as team_short_name, t.logo_url
       from public.team_standings s
       left join public.teams t on t.id = s.team_id
       where s.competition_id = $1
       order by coalesce(s.group_name, ''), coalesce(s.position, 999), s.points desc, s.goal_difference desc`,
      [competition.id]
    ),
    listFantasyPlayerPool(competition.id, { availableOnly: true })
  ]);

  const leaders: Record<string, any> = {};
  for (const category of LEADER_CATEGORIES) {
    leaders[category] = await getLeaders(competition.id, category);
  }

  return {
    competitions,
    activeCompetition: normalizeCompetition(competition),
    gameweeks: gameweeks.rows.map(normalizeGameweek),
    matches: matches.rows.map(normalizeMatch),
    standings: groupBy(standings.rows.map(normalizeStanding), "groupName"),
    leaders,
    fantasyPlayers
  };
}

async function getCompetitionById(id: string) {
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
  return result.rows[0] || null;
}

async function getDefaultCompetition() {
  const result = await query(
    `select c.*, city.name as city_name, city.slug as city_slug,
            count(distinct t.id)::int as teams_count,
            count(distinct m.id)::int as matches_count
     from public.competitions c
     left join public.cities city on city.id = c.city_id
     left join public.teams t on t.competition_id = c.id
     left join public.matches m on m.competition_id = c.id
     where c.status = 'active'
     group by c.id, city.name, city.slug
     order by count(distinct m.id) desc,
              coalesce(c.starts_at, c.created_at) desc
     limit 1`
  );
  return result.rows[0] || null;
}

async function listSeasonCompetitions() {
  const result = await query(
    `select c.*, city.name as city_name, city.slug as city_slug,
            count(distinct t.id)::int as teams_count,
            count(distinct m.id)::int as matches_count
     from public.competitions c
     left join public.cities city on city.id = c.city_id
     left join public.teams t on t.competition_id = c.id
     left join public.matches m on m.competition_id = c.id
     where c.status = 'active'
     group by c.id, city.name, city.slug
     order by coalesce(c.starts_at, c.created_at) desc`
  );
  return result.rows.map(normalizeCompetition);
}

async function getLeaders(competitionId: string, category: string) {
  const column = LEADER_COLUMNS[category] || LEADER_COLUMNS.goals;
  const result = await query(
    `select s.player_id, s.team_id, s.${column} as value, s.appearances,
            p.display_name as player_name, p.position, p.avatar_url,
            t.name as team_name
     from public.player_season_stats s
     left join public.players p on p.id = s.player_id
     left join public.teams t on t.id = s.team_id
     where s.competition_id = $1
     order by s.${column} desc, s.appearances asc, p.display_name
     limit 10`,
    [competitionId]
  );
  return result.rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.player_id,
    playerName: row.player_name || "",
    teamId: row.team_id,
    teamName: row.team_name || "",
    position: row.position || "",
    avatarUrl: row.avatar_url || "",
    value: Number(row.value || 0),
    appearances: Number(row.appearances || 0)
  }));
}

async function ensureCompetition(client: PoolClient, competitionId: string) {
  const result = await client.query("select * from public.competitions where id = $1", [competitionId]);
  if (!result.rows[0]) throw httpError(404, "Takmicenje nije pronadjeno.");
  return result.rows[0];
}

async function auditWithClient(client: PoolClient, actor: Actor | null, action: string, entityType: string, entityId: string, metadata: unknown) {
  await client.query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizeCompetition(row: any) {
  return {
    id: row.id,
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
    formatSummary: row.format_summary || ""
  };
}

function normalizeGameweek(row: any) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    name: row.name,
    startsAt: row.starts_at,
    locksAt: row.locks_at,
    endsAt: row.ends_at || "",
    status: row.status,
    matchesCount: Number(row.matches_count || 0)
  };
}

function normalizeMatch(row: any) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    gameweekId: row.gameweek_id || "",
    gameweekName: row.gameweek_name || "",
    phaseId: row.phase_id || "",
    phaseCode: row.phase_code || "",
    phaseName: row.phase_name || "",
    phase: row.phase,
    groupName: row.group_name || "",
    round: row.round,
    scheduledAt: row.scheduled_at,
    venue: row.venue || "",
    status: row.status,
    homeTeamId: row.home_team_id || "",
    homeTeamName: row.home_team_name || "",
    homeTeamShortName: row.home_team_short_name || "",
    homeTeamLogoUrl: row.home_team_logo_url || "",
    awayTeamId: row.away_team_id || "",
    awayTeamName: row.away_team_name || "",
    awayTeamShortName: row.away_team_short_name || "",
    awayTeamLogoUrl: row.away_team_logo_url || "",
    homeScore: Number(row.home_score || 0),
    awayScore: Number(row.away_score || 0),
    period: row.period || "",
    periodStartedAt: row.period_started_at || "",
    halfLengthMinutes: Number(row.half_length_minutes || 20)
  };
}

function normalizeStanding(row: any) {
  return {
    id: row.id,
    groupName: row.group_name || "",
    teamId: row.team_id,
    teamName: row.team_name || "",
    teamShortName: row.team_short_name || "",
    logoUrl: row.logo_url || "",
    played: Number(row.played || 0),
    wins: Number(row.wins || 0),
    draws: Number(row.draws || 0),
    losses: Number(row.losses || 0),
    goalsFor: Number(row.goals_for || 0),
    goalsAgainst: Number(row.goals_against || 0),
    goalDifference: Number(row.goal_difference || 0),
    points: Number(row.points || 0),
    position: row.position ? Number(row.position) : null
  };
}

function normalizeFantasyPoolPlayer(row: any) {
  return {
    id: row.id,
    competitionId: row.competition_id,
    playerId: row.player_id,
    teamId: row.team_id,
    teamName: row.team_name || "",
    teamShortName: row.team_short_name || "",
    teamLogoUrl: row.team_logo_url || "",
    displayName: row.display_name,
    position: row.position || "",
    shirtNumber: row.shirt_number,
    avatarUrl: row.avatar_url || "",
    basePrice: Number(row.base_price || 0),
    currentPrice: Number(row.current_price || 0),
    isAvailable: row.is_available,
    availabilityNote: row.availability_note || "",
    appearances: Number(row.appearances || 0),
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
