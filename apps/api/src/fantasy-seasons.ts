import type { PoolClient } from "pg";
import { query, transaction } from "./db.ts";
import { sendAutomaticNotification } from "./push.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const MAX_PICKS = 10;
const VALID_SEASON_STATUSES = new Set(["draft", "active", "finished"]);
const MIN_PRICE = 4;
const MAX_PRICE = 13;
const PRICE_STEP = 0.1;
// Starting XI is position-locked: 1 GK + 2 DEF + 2 ATT. The 5-player bench (B1-B5) has no
// position restriction - any player can fill any bench slot. B1 (the 6th player overall)
// scores at full weight; B2-B5 score at half weight.
const SLOT_POSITION_GROUPS: Record<string, string | null> = {
  GK: "golman",
  DEF1: "odbrana",
  DEF2: "odbrana",
  ATT1: "napad",
  ATT2: "napad",
  B1: null,
  B2: null,
  B3: null,
  B4: null,
  B5: null
};
const POSITION_GROUP_LABELS: Record<string, string> = { golman: "golmana", odbrana: "odbranu", napad: "napad" };
// Transfer window: unlimited before round 1 and immediately after rounds 5 and 10 (i.e. while
// building the round 1/6/11 squad); every other round allows at most 4 transfers versus the
// immediately preceding round's squad.
const UNLIMITED_TRANSFER_ROUNDS = new Set([1, 6, 11]);
const TRANSFERS_PER_ROUND = 4;

// Accepts either the top-level query() or a transaction client's bound query() - both
// are callable as (text, params) => Promise<{rows}>, which is all these helpers need.
type Exec = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

async function fetchRankedGameweeks(exec: Exec, seasonId: string) {
  const result = await exec(
    `select id, row_number() over (order by starts_at) as round_number
     from public.fantasy_gameweeks
     where fantasy_season_id = $1`,
    [seasonId]
  );
  return result.rows.map((row) => ({ id: row.id, roundNumber: Number(row.round_number) }));
}

// A player counts as "already played" for repositioning purposes the instant their real match
// kicks off (not full-time) - matches EuroLeague Fantasy's own "only if they have not played yet".
async function hasPlayerPlayedInWindow(exec: Exec, playerId: string, startsAt: string, endsAt: string): Promise<boolean> {
  const result = await exec(
    `select exists (
       select 1
       from public.matches m
       join public.team_rosters tr on tr.player_id = $1 and tr.is_active = true
       where (m.home_team_id = tr.team_id or m.away_team_id = tr.team_id)
         and m.scheduled_at >= $2 and m.scheduled_at <= $3
         and (m.scheduled_at <= now() or m.status in ('live', 'finished'))
     ) as played`,
    [playerId, startsAt, endsAt]
  );
  return Boolean(result.rows[0]?.played);
}

// open: full editing (transfers + repositioning). reposition: past the deadline but the round's
// matches are still being played - only reordering your existing 10 players is allowed, and only
// for players who haven't kicked off yet. locked: round fully closed.
function computeGameweekPhase(gameweek: any): "open" | "reposition" | "locked" {
  const now = Date.now();
  const locksAtMs = new Date(gameweek.locks_at).getTime();
  if (now < locksAtMs) return "open";
  const endsAtMs = gameweek.ends_at ? new Date(gameweek.ends_at).getTime() : locksAtMs;
  if (gameweek.ends_at && now < endsAtMs) return "reposition";
  return "locked";
}

async function getPreviousGameweekPlayerIds(exec: Exec, teamId: string, ranked: { id: string; roundNumber: number }[], roundNumber: number) {
  if (roundNumber <= 1) return null;
  const previous = ranked.find((row) => row.roundNumber === roundNumber - 1);
  if (!previous) return null;
  const result = await exec(
    `select player_id from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2`,
    [teamId, previous.id]
  );
  if (!result.rows.length) return null;
  return new Set(result.rows.map((row) => row.player_id));
}

function normalizePosition(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export async function listFantasySeasons() {
  const result = await query(
    `select fs.*, count(distinct fsc.competition_id)::int as competitions_count
     from public.fantasy_seasons fs
     left join public.fantasy_season_competitions fsc on fsc.fantasy_season_id = fs.id
     group by fs.id
     order by fs.created_at desc`
  );
  return result.rows.map(normalizeSeason);
}

export async function getFantasySeason(seasonId: string) {
  const season = await getSeasonRow(seasonId);
  const [competitions, gameweeks] = await Promise.all([
    listSeasonCompetitionRows(seasonId),
    listFantasyGameweeks(seasonId)
  ]);
  return { ...normalizeSeason(season), competitions, gameweeks };
}

interface CreateSeasonPayload {
  competitionIds?: unknown;
  name?: string;
  status?: string;
  gameweekLengthDays?: number;
  startsAt?: string;
  endsAt?: string;
}

export async function createFantasySeason(payload: CreateSeasonPayload, actor: Actor) {
  const competitionIds = uniqueIds(payload.competitionIds);
  if (!competitionIds.length) throw httpError(400, "Izaberi bar jednu ligu za fantasy sezonu.");

  const seasonId = await transaction(async (client) => {
    const result = await client.query(
      `insert into public.fantasy_seasons (name, status, gameweek_length_days, starts_at, ends_at)
       values ($1,$2,$3,$4,$5)
       returning id`,
      [
        requiredText(payload.name, "Naziv sezone je obavezan."),
        validSeasonStatus(payload.status || "draft"),
        Number(payload.gameweekLengthDays) > 0 ? Number(payload.gameweekLengthDays) : 7,
        payload.startsAt || null,
        payload.endsAt || null
      ]
    );
    const id = result.rows[0].id;
    await replaceSeasonCompetitionsTx(client, id, competitionIds);
    await auditWithClient(client, actor, "fantasy.season.create", "fantasySeason", id, { competitionIds });
    return id;
  });

  // Auto-pull every team/player from the linked leagues right away - the
  // owner's own words for this feature: "kad ubacim sve lige, automatski
  // povlace sve ekipe i automatski igraci iz tih ekipa". Never block season
  // creation on this - admin can always re-sync by hand from the admin tab.
  await syncFantasySeasonPool(seasonId, actor).catch(() => undefined);

  return getFantasySeason(seasonId);
}

// Mirrors the admin screen's own readiness checklist (leagues linked, at least one
// available player) - enforced here too, not just in the UI, so activating an unready
// season is never just one API call away regardless of what admin screen (or bug in
// one) is making that call. Deliberately does NOT require gameweeks to already exist:
// since the gameweek sweep only ever generates rounds for an already-active season
// (see runFantasyGameweekSweep), requiring them here first would make activation
// permanently impossible - rounds are a consequence of activating, not a precondition.
async function assertSeasonReadyToActivate(seasonId: string): Promise<void> {
  const competitions = await query(
    "select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1",
    [seasonId]
  );
  const competitionIds = competitions.rows.map((row) => row.competition_id);
  if (!competitionIds.length) throw httpError(400, "Sezona nema povezanu nijednu ligu - to mora biti reseno pre pokretanja.");

  const pool = await query(
    "select count(*)::int as n from public.fantasy_player_pool where competition_id = any($1::uuid[]) and is_available = true",
    [competitionIds]
  );
  if (!pool.rows[0]?.n) throw httpError(400, "Nijedan igrac nije prihvacen u fantasy bazi - sinhronizuj i prihvati igrace pre pokretanja.");
}

export async function updateFantasySeason(seasonId: string, payload: CreateSeasonPayload & { competitionIds?: unknown }, actor: Actor) {
  await getSeasonRow(seasonId);
  if (payload.status === "active") await assertSeasonReadyToActivate(seasonId);
  let competitionsChanged = false;
  await transaction(async (client) => {
    const allowed: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      allowed.push(sql.replace("?", `$${params.length}`));
    };
    if (payload.name !== undefined) push("name = ?", requiredText(payload.name, "Naziv sezone je obavezan."));
    if (payload.status !== undefined) push("status = ?", validSeasonStatus(payload.status));
    if (payload.gameweekLengthDays !== undefined) push("gameweek_length_days = ?", Number(payload.gameweekLengthDays) > 0 ? Number(payload.gameweekLengthDays) : 7);
    if (payload.startsAt !== undefined) push("starts_at = ?", payload.startsAt || null);
    if (payload.endsAt !== undefined) push("ends_at = ?", payload.endsAt || null);
    if (allowed.length) {
      params.push(seasonId);
      await client.query(`update public.fantasy_seasons set ${allowed.join(", ")}, updated_at = now() where id = $${params.length}`, params);
    }
    if (payload.competitionIds !== undefined) {
      const competitionIds = uniqueIds(payload.competitionIds);
      if (!competitionIds.length) throw httpError(400, "Sezona mora imati bar jednu ligu.");
      await replaceSeasonCompetitionsTx(client, seasonId, competitionIds);
      competitionsChanged = true;
    }
    await auditWithClient(client, actor, "fantasy.season.update", "fantasySeason", seasonId, payload);
  });
  if (competitionsChanged) await syncFantasySeasonPool(seasonId, actor).catch(() => undefined);
  return getFantasySeason(seasonId);
}

export async function syncFantasySeasonPool(seasonId: string, actor: Actor | null) {
  const result = await transaction(async (client) => {
    await ensureSeasonTx(client, seasonId);
    const competitions = await client.query(
      "select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1",
      [seasonId]
    );
    if (!competitions.rows.length) throw httpError(400, "Sezona nema dodeljenu nijednu ligu.");

    let available = 0;
    let unavailable = 0;
    for (const row of competitions.rows) {
      const competitionId = row.competition_id;
      // Preseason price: a player with no player_season_stats row yet for THIS
      // competition (hasn't had a finished match this season) starts priced at
      // whatever they last ended a previous season with (matched by player_id,
      // or the club-clone link on either side), falling back to the flat
      // formula only if no prior season price exists either. Once this
      // competition has any player_season_stats for them, the live formula
      // takes over automatically (ps.player_id is no longer null).
      // is_price_locked rows are admin-set manually and are never touched here
      // beyond keeping them linked to the right season/team.
      const inserted = await client.query(
        `insert into public.fantasy_player_pool
           (fantasy_season_id, competition_id, player_id, team_id, base_price, current_price, is_available)
         select distinct on (roster.player_id)
           $2::uuid, roster.competition_id, roster.player_id, roster.team_id, roster.price, roster.price, true
         from (
           select t.competition_id, p.id as player_id, t.id as team_id, tr.created_at as roster_created_at,
             case when ps.player_id is null
               then coalesce(prev.current_price, calculate_base_price(0, 0, 0, 0))
               else calculate_base_price(coalesce(ps.fantasy_points,0), coalesce(ps.goals,0), coalesce(ps.assists,0), coalesce(ps.saves,0))
             end as price
           from public.players p
           join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
           join public.teams t on t.id = tr.team_id
           left join public.player_season_stats ps on ps.player_id = p.id and ps.competition_id = t.competition_id
           left join lateral (
             select fpp2.current_price
             from public.fantasy_player_pool fpp2
             left join public.fantasy_gameweeks fg on fg.fantasy_season_id = fpp2.fantasy_season_id
             where fpp2.fantasy_season_id <> $2 and fpp2.player_id = p.id
             order by fg.ends_at desc nulls last, fpp2.updated_at desc
             limit 1
           ) prev on true
           where t.competition_id = $1 and t.is_active = true and p.is_active = true
         ) roster
         order by roster.player_id, roster.roster_created_at asc
         on conflict (fantasy_season_id, player_id) where fantasy_season_id is not null do update set
           competition_id = excluded.competition_id,
           team_id = excluded.team_id,
           is_available = true,
           availability_note = null,
           updated_at = now()
         returning id`,
        [competitionId, seasonId]
      );
      available += inserted.rowCount ?? 0;

      const disabled = await client.query(
        `update public.fantasy_player_pool fpp set
           is_available = false,
           availability_note = 'Igrac vise nije u aktivnom rosteru ove lige.',
           updated_at = now()
         where fpp.competition_id = $1 and fpp.fantasy_season_id = $2
           and not exists (
             select 1 from public.players p
             join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
             join public.teams t on t.id = tr.team_id
             where p.id = fpp.player_id and t.id = fpp.team_id and t.competition_id = fpp.competition_id
               and p.is_active = true and t.is_active = true
           )`,
        [competitionId, seasonId]
      );
      unavailable += disabled.rowCount ?? 0;
    }

    await auditWithClient(client, actor, "fantasy.season.pool.sync", "fantasySeason", seasonId, { available, unavailable });
    return { available, unavailable };
  });

  return { seasonId, ...result };
}

// Lets an admin hand-set a player's preseason price (e.g. before any match has
// been played, when the formula would otherwise flatten everyone to the same
// default). Locking protects it from being overwritten the next time
// syncFantasySeasonPool runs (which now happens automatically after every
// finished match). Pass isPriceLocked: false to release it back to automatic.
export async function setFantasyPoolPlayerPrice(seasonId: string, playerId: string, payload: { price?: number; isPriceLocked?: boolean }, actor: Actor) {
  await ensureSeasonTx({ query } as unknown as PoolClient, seasonId);
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price < 4 || price > 13) {
    throw httpError(400, "Cena mora biti broj izmedju 4 i 13.");
  }
  const lock = payload.isPriceLocked !== false;
  const result = await query(
    `update public.fantasy_player_pool set
       base_price = $3,
       current_price = $3,
       is_price_locked = $4,
       updated_at = now()
     where fantasy_season_id = $1 and player_id = $2
     returning id`,
    [seasonId, playerId, price, lock]
  );
  if (!result.rows[0]) throw httpError(404, "Igrac nije pronadjen u fantazi pulu ove sezone.");
  await audit(actor, "fantasy.season.pool.price", "fantasyPlayerPool", result.rows[0].id, { playerId, price, lock });
  return getPoolPlayerRow(seasonId, playerId);
}

// Admin accept/reject for the pool - syncFantasySeasonPool re-marks a player
// available automatically once their team_rosters membership is valid again,
// so this is only meant for a deliberate exclusion (e.g. player left the
// league) rather than a permanent flag; re-syncing can undo a manual reject.
export async function setFantasyPoolPlayerAvailability(seasonId: string, playerId: string, payload: { isAvailable?: boolean }, actor: Actor) {
  const isAvailable = Boolean(payload.isAvailable);
  const result = await query(
    `update public.fantasy_player_pool set
       is_available = $3,
       availability_note = $4,
       updated_at = now()
     where fantasy_season_id = $1 and player_id = $2
     returning id`,
    [seasonId, playerId, isAvailable, isAvailable ? null : "Iskljucen od strane admina."]
  );
  if (!result.rows[0]) throw httpError(404, "Igrac nije pronadjen u fantazi pulu ove sezone.");
  await audit(actor, "fantasy.season.pool.availability", "fantasyPlayerPool", result.rows[0].id, { playerId, isAvailable });
  return getPoolPlayerRow(seasonId, playerId);
}

// Both mutation endpoints above only ever change fantasy_player_pool's own columns,
// so re-running the same join listFantasySeasonPlayerPool uses (rather than
// duplicating it) is what keeps the response carrying the player/team/league display
// fields the UI renders - a bare `returning *` only has the pool row's own columns.
async function getPoolPlayerRow(seasonId: string, playerId: string) {
  const result = await query(
    `select fpp.*, p.display_name, p.position, p.shirt_number, p.avatar_url,
            t.name as team_name, t.short_name as team_short_name, t.logo_url as team_logo_url,
            c.name as competition_name, c.season_name as competition_season_name,
            coalesce(avail.status, 'unknown') as availability_status
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     left join public.competitions c on c.id = fpp.competition_id
     left join lateral (
       select pma.status
       from public.matches m
       left join public.player_match_availability pma on pma.match_id = m.id and pma.player_id = fpp.player_id
       where (m.home_team_id = fpp.team_id or m.away_team_id = fpp.team_id) and m.status = 'scheduled'
       order by m.scheduled_at asc
       limit 1
     ) avail on true
     where fpp.fantasy_season_id = $1 and fpp.player_id = $2`,
    [seasonId, playerId]
  );
  if (!result.rows[0]) throw httpError(404, "Igrac nije pronadjen u fantazi pulu ove sezone.");
  return normalizeFantasyPoolPlayer(result.rows[0]);
}

interface PoolFilters {
  availableOnly?: boolean;
  teamId?: string;
  search?: string;
}

export async function listFantasySeasonPlayerPool(seasonId: string, filters: PoolFilters = {}) {
  const params: unknown[] = [requiredText(seasonId, "Sezona je obavezna.")];
  const where = ["fpp.fantasy_season_id = $1"];

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
            c.name as competition_name, c.season_name as competition_season_name,
            coalesce(avail.status, 'unknown') as availability_status
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     left join public.competitions c on c.id = fpp.competition_id
     left join lateral (
       select pma.status
       from public.matches m
       left join public.player_match_availability pma on pma.match_id = m.id and pma.player_id = fpp.player_id
       where (m.home_team_id = fpp.team_id or m.away_team_id = fpp.team_id) and m.status = 'scheduled'
       order by m.scheduled_at asc
       limit 1
     ) avail on true
     where ${where.join(" and ")}
     order by fpp.is_available desc, fpp.current_price desc, p.display_name
     limit 600`,
    params
  );
  return result.rows.map(normalizeFantasyPoolPlayer);
}

export async function listFantasyGameweeks(seasonId: string) {
  const result = await query(
    `select * from public.fantasy_gameweeks where fantasy_season_id = $1 order by starts_at`,
    [seasonId]
  );
  return result.rows.map(normalizeGameweek);
}


const FANTASY_TZ = "Europe/Belgrade";

// Converts a Belgrade-local (Europe/Belgrade) wall-clock date/time into the UTC instant
// it represents - needed because "Monday 00:00" means the local Monday regardless of
// which timezone the Node process itself happens to run in, and Belgrade's CET/CEST
// offset changes with DST. Standard "local wall-clock -> UTC instant" trick: format an
// initial guess back through the target zone and correct by the difference.
function belgradeLocalToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FANTASY_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
    .formatToParts(new Date(guessUtcMs))
    .reduce((acc: Record<string, string>, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const readBackAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(guessUtcMs + (guessUtcMs - readBackAsUtcMs));
}

const BELGRADE_WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Resolves the Monday-Sunday week (Belgrade local time) a given instant falls in. Each
// boundary is computed independently via belgradeLocalToUtc rather than by adding
// 7*24h, so a week spanning a DST transition still starts/ends at the correct local
// midnight instead of drifting by an hour.
function belgradeWeekBounds(instant: Date): { weekStart: Date; weekEnd: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FANTASY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  })
    .formatToParts(instant)
    .reduce((acc: Record<string, string>, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const daysSinceMonday = BELGRADE_WEEKDAY_INDEX[parts.weekday] ?? 0;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day) - daysSinceMonday;
  return { weekStart: belgradeLocalToUtc(year, month, day), weekEnd: belgradeLocalToUtc(year, month, day + 7) };
}

// The only writer of fantasy_gameweeks.status from here on - rounds are pure calendar
// weeks (Monday-Sunday, Europe/Belgrade), derived from whatever matches exist in a
// season's linked leagues, with no admin action to create, open, lock, or score them.
// Meant to be called on an interval (see server.ts); safe to re-run since a round
// already "locked"/"finished" keeps its recorded dates untouched, and re-running never
// creates duplicate rows (upserts by week-index name).
export async function runFantasyGameweekSweep(): Promise<void> {
  // Only a season an admin has actually activated should accrue rounds - a season
  // still sitting in "draft" can already have a linked competition with weeks of
  // scheduled matches, and "!= 'finished'" used to let those get swept into real
  // Kolo N rounds (opened, and eventually locked/scored) before the season - or its
  // player pool - was ever actually ready, which is exactly backwards.
  const seasons = await query("select id from public.fantasy_seasons where status = 'active'");
  for (const seasonRow of seasons.rows) {
    try {
      await sweepFantasySeasonGameweeks(seasonRow.id);
    } catch (error) {
      console.error(`Fantasy gameweek sweep failed for season ${seasonRow.id}:`, error);
    }
  }
}

async function sweepFantasySeasonGameweeks(seasonId: string): Promise<void> {
  const competitions = await query(
    "select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1",
    [seasonId]
  );
  if (!competitions.rows.length) return;
  const competitionIds = competitions.rows.map((row) => row.competition_id);

  const matches = await query(
    `select scheduled_at from public.matches where competition_id = any($1::uuid[]) order by scheduled_at`,
    [competitionIds]
  );
  if (!matches.rows.length) return;

  const weeks = new Map<number, { weekStart: Date; weekEnd: Date; times: number[] }>();
  for (const row of matches.rows) {
    const scheduledAt = new Date(row.scheduled_at);
    const { weekStart, weekEnd } = belgradeWeekBounds(scheduledAt);
    const key = weekStart.getTime();
    if (!weeks.has(key)) weeks.set(key, { weekStart, weekEnd, times: [] });
    weeks.get(key)!.times.push(scheduledAt.getTime());
  }
  const orderedWeeks = [...weeks.values()].sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

  let index = 0;
  for (const week of orderedWeeks) {
    index += 1;
    const result = await query(
      `insert into public.fantasy_gameweeks (fantasy_season_id, name, starts_at, locks_at, ends_at, status)
       values ($1, $2, $3, $4, $5, 'open')
       on conflict (fantasy_season_id, name) do update set
         starts_at = excluded.starts_at,
         locks_at = excluded.locks_at,
         ends_at = excluded.ends_at,
         updated_at = now()
       where public.fantasy_gameweeks.status = 'open'
       returning id, (xmax = 0) as inserted`,
      [seasonId, `Kolo ${index}`, week.weekStart.toISOString(), new Date(Math.min(...week.times)).toISOString(), week.weekEnd.toISOString()]
    );
    // A fresh round is the one moment worth notifying fans about - matches the old
    // manual "opening a round" notification, just fired automatically instead.
    if (result.rows[0]?.inserted) {
      sendAutomaticNotification(
        "Novo fantazi kolo je otvoreno!",
        `Kolo ${index} je otvoreno - sastavi ili izmeni svoj tim na vreme.`,
        { kind: "gameweek_open", gameweekId: result.rows[0].id }
      );
    }
  }

  const rounds = await query(
    `select id, locks_at, ends_at, status from public.fantasy_gameweeks
     where fantasy_season_id = $1 and status != 'finished'`,
    [seasonId]
  );
  const now = Date.now();
  for (const round of rounds.rows) {
    const locksAtMs = new Date(round.locks_at).getTime();
    const endsAtMs = new Date(round.ends_at).getTime();
    if (now < locksAtMs) {
      if (round.status !== "open") {
        await query("update public.fantasy_gameweeks set status = 'open', updated_at = now() where id = $1", [round.id]);
      }
      continue;
    }
    if (now < endsAtMs) {
      if (round.status !== "locked") {
        await query("update public.fantasy_gameweeks set status = 'locked', updated_at = now() where id = $1", [round.id]);
      }
      continue;
    }
    // The week is over - score it automatically. scoreFantasySeasonGameweek's own
    // readiness guard throws if no match has actually finished yet; when that happens,
    // just leave the round "locked" and let the next sweep pass retry.
    try {
      await scoreFantasySeasonGameweek(round.id, null);
    } catch {
      if (round.status !== "locked") {
        await query("update public.fantasy_gameweeks set status = 'locked', updated_at = now() where id = $1", [round.id]);
      }
    }
  }
}

export async function getFantasySeasonTeam(user: Actor | null, seasonId: string, fantasyGameweekId?: string) {
  requireUser(user);
  const team = await ensureFantasySeasonTeam(user as Actor, seasonId);
  return withSeasonTeamDetails(team.id, fantasyGameweekId);
}

// Public (any logged-in user) read of any manager's team - used by the leaderboard's
// "view team" drill-down. No ownership check by design, same as a real fantasy leaderboard.
export async function getFantasySeasonTeamById(fantasyTeamId: string, fantasyGameweekId?: string) {
  return withSeasonTeamDetails(requiredText(fantasyTeamId, "Fantasy tim je obavezan."), fantasyGameweekId);
}

interface SetPicksPayload {
  fantasySeasonId?: string;
  fantasyGameweekId?: string;
  teamName?: string;
  picks?: { playerId?: string; slot?: string; isCaptain?: boolean }[];
}

export async function setFantasySeasonPicks(user: Actor | null, payload: SetPicksPayload) {
  requireUser(user);
  const actor = user as Actor;
  const seasonId = requiredText(payload.fantasySeasonId, "Sezona je obavezna.");
  const fantasyGameweekId = requiredText(payload.fantasyGameweekId, "Kolo je obavezno.");
  const picks = Array.isArray(payload.picks) ? payload.picks : [];
  if (picks.length !== MAX_PICKS) throw httpError(400, `Fantasy tim mora imati tacno ${MAX_PICKS} igraca.`);
  if (picks.filter((pick) => pick.isCaptain).length !== 1) throw httpError(400, "Moras izabrati tacno jednog kapitena.");

  const details = await transaction(async (client) => {
    const gameweekResult = await client.query("select * from public.fantasy_gameweeks where id = $1 for update", [fantasyGameweekId]);
    const gameweek = gameweekResult.rows[0];
    if (!gameweek) throw httpError(404, "Kolo nije pronadjeno.");
    if (gameweek.fantasy_season_id !== seasonId) throw httpError(400, "Kolo ne pripada izabranoj sezoni.");
    if (!["draft", "open"].includes(gameweek.status)) {
      throw httpError(423, "Fantasy tim je zakljucan za ovo kolo.");
    }
    const phase = computeGameweekPhase(gameweek);
    if (phase === "locked") throw httpError(423, "Fantasy tim je zakljucan za ovo kolo.");

    const team = await ensureFantasySeasonTeamTx(client, actor, seasonId, payload.teamName);

    if (phase === "reposition") {
      const existingPicksResult = await client.query(
        "select player_id, slot from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2",
        [team.id, fantasyGameweekId]
      );
      const baselinePlayers = new Set(existingPicksResult.rows.map((row) => row.player_id));
      const baselineSlotByPlayer = new Map(existingPicksResult.rows.map((row) => [row.player_id, row.slot]));
      const submittedPlayers = new Set(picks.map((pick) => pick.playerId));
      const introducedNew = [...submittedPlayers].some((id) => !baselinePlayers.has(id));
      const droppedExisting = [...baselinePlayers].some((id) => !submittedPlayers.has(id));
      if (introducedNew || droppedExisting) {
        throw httpError(400, "Ovo kolo je vec pocelo - mozes samo da rasporedis vec izabrane igrace (klupa/teren), bez novih transfera.");
      }
      for (const pick of picks) {
        const previousSlot = baselineSlotByPlayer.get(pick.playerId);
        if (previousSlot && previousSlot !== pick.slot) {
          const played = await hasPlayerPlayedInWindow(client.query.bind(client) as unknown as Exec, pick.playerId!, gameweek.starts_at, gameweek.ends_at);
          if (played) {
            throw httpError(400, "Igrac je vec odigrao svoj mec ovog kola i ne moze da promeni poziciju (klupa/teren).");
          }
        }
      }
    }

    await client.query(
      "delete from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2",
      [team.id, fantasyGameweekId]
    );

    let spent = 0;
    const seenPlayers = new Set<string>();
    const seenSlots = new Set<string>();
    for (const pick of picks) {
      const playerId = requiredText(pick.playerId, "Player ID je obavezan.");
      const slot = requiredText(pick.slot, "Slot je obavezan.");
      if (!(slot in SLOT_POSITION_GROUPS)) throw httpError(400, `Nepoznat slot: ${slot}.`);
      const expectedPosition = SLOT_POSITION_GROUPS[slot];
      if (seenPlayers.has(playerId)) throw httpError(400, "Isti igrac ne moze biti izabran dva puta.");
      if (seenSlots.has(slot)) throw httpError(400, "Isti slot ne moze biti popunjen dva puta.");
      seenPlayers.add(playerId);
      seenSlots.add(slot);
      const poolPlayer = await ensurePlayerInSeasonPool(client, playerId, seasonId);
      if (expectedPosition && normalizePosition(poolPlayer.position) !== expectedPosition) {
        throw httpError(400, `Igrac ${poolPlayer.display_name || ""} nije na poziciji ${POSITION_GROUP_LABELS[expectedPosition]} i ne moze na slot ${slot}.`);
      }
      spent += Number(poolPlayer.current_price || 0);
      await client.query(
        `insert into public.fantasy_team_picks (fantasy_team_id, player_id, fantasy_gameweek_id, slot, is_captain)
         values ($1,$2,$3,$4,$5)`,
        [team.id, playerId, fantasyGameweekId, slot, Boolean(pick.isCaptain)]
      );
    }
    // The cap isn't a flat 100 forever - scoreFantasySeasonGameweek shifts a team's
    // budget_cap by the same amount their owned players' prices move each round, so an
    // unchanged squad never gets rejected here just because it got more valuable.
    const budgetCap = Number(team.budget_cap ?? 100);
    if (spent > budgetCap) {
      throw httpError(400, `Tim prelazi budzet od ${budgetCap.toFixed(2)} kredita.`);
    }

    if (phase === "open") {
      const ranked = await fetchRankedGameweeks(client.query.bind(client) as unknown as Exec, seasonId);
      const currentRound = ranked.find((row) => row.id === fantasyGameweekId);
      const roundNumber = currentRound ? currentRound.roundNumber : 1;
      if (!UNLIMITED_TRANSFER_ROUNDS.has(roundNumber)) {
        const previousPlayerIds = await getPreviousGameweekPlayerIds(client.query.bind(client) as unknown as Exec, team.id, ranked, roundNumber);
        if (previousPlayerIds) {
          const transfersUsed = [...seenPlayers].filter((id) => !previousPlayerIds.has(id)).length;
          if (transfersUsed > TRANSFERS_PER_ROUND) {
            throw httpError(400, `Dozvoljeno je najvise ${TRANSFERS_PER_ROUND} transfera ovog kola (pokusao si ${transfersUsed}).`);
          }
        }
      }
    }

    return { teamId: team.id };
  });

  await audit(actor, "fantasy.season.picks.set", "fantasyTeam", details.teamId, { fantasyGameweekId, count: picks.length });
  return withSeasonTeamDetails(details.teamId, fantasyGameweekId);
}

export async function scoreFantasySeasonGameweek(fantasyGameweekId: string, actor: Actor | null) {
  const result = await transaction(async (client) => {
    const gwResult = await client.query("select * from public.fantasy_gameweeks where id = $1 for update", [fantasyGameweekId]);
    const gameweek = gwResult.rows[0];
    if (!gameweek) throw httpError(404, "Fantasy kolo nije pronadjeno.");
    const seasonId = gameweek.fantasy_season_id;
    const windowEnd = gameweek.ends_at || gameweek.locks_at;

    // Guards against the single most destructive mistake here: scoring (which
    // also locks every pick for this round) before any real match has
    // actually finished would silently zero out every player's points and
    // freeze transfers with nothing to show for it.
    const readiness = await client.query(
      `select count(*) filter (where m.status = 'finished')::int as finished
       from public.matches m
       where m.competition_id in (select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1)
         and m.scheduled_at >= $2::timestamptz and m.scheduled_at <= $3::timestamptz`,
      [seasonId, gameweek.starts_at, windowEnd]
    );
    if (readiness.rows[0].finished === 0) {
      throw httpError(400, "Nijedna utakmica u ovom kolu jos nije zavrsena - sacekaj da se odigraju pre bodovanja.");
    }

    const scoreRows = await client.query(
      `with season_competitions as (
         select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1
       ),
       gw_points as (
         select pms.player_id, sum(pms.fantasy_points) as points
         from public.player_match_stats pms
         join public.matches m on m.id = pms.match_id
         where m.competition_id in (select competition_id from season_competitions)
           and m.scheduled_at >= $2::timestamptz and m.scheduled_at <= $3::timestamptz
           and m.status = 'finished'
         group by pms.player_id
       ),
       pick_scores as (
         select ftp.id as pick_id,
                round(
                  coalesce(gwp.points, 0)
                  * case
                      when ftp.slot in ('B2','B3','B4','B5') then 0.5
                      else 1
                    end
                  * case when ftp.is_captain then 2 else 1 end
                )::integer as points
         from public.fantasy_team_picks ftp
         left join gw_points gwp on gwp.player_id = ftp.player_id
         where ftp.fantasy_gameweek_id = $4
       )
       update public.fantasy_team_picks ftp
       set points = pick_scores.points, locked_at = coalesce(ftp.locked_at, now()), updated_at = now()
       from pick_scores
       where ftp.id = pick_scores.pick_id
       returning ftp.fantasy_team_id, ftp.points`,
      [seasonId, gameweek.starts_at, windowEnd, fantasyGameweekId]
    );

    await client.query(
      `with totals as (
         select fantasy_team_id, sum(points)::integer as total
         from public.fantasy_team_picks
         where fantasy_gameweek_id is not null
         group by fantasy_team_id
       )
       update public.fantasy_teams ft
       set total_points = totals.total, last_scored_at = now(), updated_at = now()
       from totals
       where ft.id = totals.fantasy_team_id`
    );

    // Automatic scoring is the terminal step now - there's no separate manual "mark
    // finished" action left, so go straight there instead of parking at 'scoring'.
    await client.query("update public.fantasy_gameweeks set status = 'finished', updated_at = now() where id = $1", [fantasyGameweekId]);

    // Captures each mover's old price alongside its new one (via the `movable` CTE,
    // read before `updated` applies the change) so the exact per-player delta is known -
    // that delta is what also has to flow into the budget_cap of every team that owns
    // the player, or a manager's own unchanged squad would silently exceed their budget
    // the next time prices move.
    const priceUpdates = await client.query(
      `with season_competitions as (
         select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1
       ),
       gw_points as (
         select pms.player_id, sum(pms.fantasy_points) as points
         from public.player_match_stats pms
         join public.matches m on m.id = pms.match_id
         where m.competition_id in (select competition_id from season_competitions)
           and m.scheduled_at >= $2::timestamptz and m.scheduled_at <= $3::timestamptz
           and m.status = 'finished'
         group by pms.player_id
       ),
       movable as (
         select fpp.id, fpp.player_id, fpp.current_price as old_price
         from public.fantasy_player_pool fpp
         join gw_points gwp on gwp.player_id = fpp.player_id
         where fpp.fantasy_season_id = $1 and fpp.is_price_locked = false
       ),
       updated as (
         update public.fantasy_player_pool fpp
         set current_price = case
               when gwp.points > fpp.current_price then least($6::numeric, round(fpp.current_price + $5::numeric, 2))
               when gwp.points < fpp.current_price then greatest($4::numeric, round(fpp.current_price - $5::numeric, 2))
               else fpp.current_price
             end,
             updated_at = now()
         from gw_points gwp
         where fpp.fantasy_season_id = $1 and fpp.player_id = gwp.player_id and fpp.is_price_locked = false
         returning fpp.id, fpp.player_id, fpp.current_price as new_price
       )
       select u.player_id, (u.new_price - m.old_price) as delta
       from updated u
       join movable m on m.id = u.id
       where u.new_price <> m.old_price`,
      [seasonId, gameweek.starts_at, windowEnd, MIN_PRICE, PRICE_STEP, MAX_PRICE]
    );

    if (priceUpdates.rows.length) {
      const playerIds = priceUpdates.rows.map((row) => row.player_id);
      const deltas = priceUpdates.rows.map((row) => Number(row.delta));
      await client.query(
        `update public.fantasy_teams ft
         set budget_cap = ft.budget_cap + moved.delta_sum, updated_at = now()
         from (
           select ftp.fantasy_team_id, sum(pd.delta) as delta_sum
           from public.fantasy_team_picks ftp
           join unnest($1::uuid[], $2::numeric[]) as pd(player_id, delta) on pd.player_id = ftp.player_id
           where ftp.fantasy_gameweek_id = $3
           group by ftp.fantasy_team_id
         ) moved
         where ft.id = moved.fantasy_team_id`,
        [playerIds, deltas, fantasyGameweekId]
      );
    }

    await auditWithClient(client, actor, "fantasy.season.gameweek.score", "fantasyGameweek", fantasyGameweekId, {
      updatedPicks: scoreRows.rowCount,
      pricedPlayers: priceUpdates.rows.length
    });

    return { gameweekId: fantasyGameweekId, updatedPicks: scoreRows.rowCount, pricedPlayers: priceUpdates.rows.length };
  });

  return result;
}

export async function getFantasySeasonLeaderboard(seasonId: string, fantasyGameweekId?: string) {
  const params: unknown[] = [requiredText(seasonId, "Sezona je obavezna.")];
  let scoreSql = "ft.total_points";
  let join = "";
  if (fantasyGameweekId) {
    params.push(fantasyGameweekId);
    scoreSql = "coalesce(gw.points, 0)";
    join = `left join (
      select fantasy_team_id, sum(points)::integer as points
      from public.fantasy_team_picks
      where fantasy_gameweek_id = $2
      group by fantasy_team_id
    ) gw on gw.fantasy_team_id = ft.id`;
  }
  const result = await query(
    `select ft.id, ft.name, ft.total_points, ft.last_scored_at, p.display_name as manager_name, ${scoreSql} as points
     from public.fantasy_teams ft
     join public.profiles p on p.id = ft.user_id
     ${join}
     where ft.fantasy_season_id = $1 and p.role <> 'admin'
       and exists (select 1 from public.fantasy_team_picks ftp where ftp.fantasy_team_id = ft.id)
     order by points desc, ft.created_at asc
     limit 100`,
    params
  );
  return result.rows.map((row, index) => ({
    rank: index + 1,
    fantasyTeamId: row.id,
    name: row.name,
    managerName: row.manager_name,
    points: Number(row.points || 0),
    totalPoints: Number(row.total_points || 0),
    lastScoredAt: row.last_scored_at
  }));
}

async function withSeasonTeamDetails(fantasyTeamId: string, fantasyGameweekId?: string) {
  const teamResult = await query(
    `select ft.id, ft.created_at, ft.updated_at, ft.user_id, ft.fantasy_season_id, fs.name as season_name,
            ft.name, ft.total_points, ft.last_scored_at, ft.budget_cap
     from public.fantasy_teams ft
     left join public.fantasy_seasons fs on fs.id = ft.fantasy_season_id
     where ft.id = $1`,
    [fantasyTeamId]
  );
  const team = teamResult.rows[0];
  if (!team) throw httpError(404, "Fantasy tim nije pronadjen.");
  const params: unknown[] = [fantasyTeamId];
  let whereGameweek = "";
  if (fantasyGameweekId) {
    params.push(fantasyGameweekId);
    whereGameweek = "and ftp.fantasy_gameweek_id = $2";
  }
  const picks = await query(
    `select ftp.id, ftp.created_at, ftp.updated_at, ftp.player_id, p.display_name as player_name,
            p.position, p.avatar_url, p.shirt_number, t.id as team_id, t.name as team_name,
            ftp.fantasy_gameweek_id, fg.name as gameweek_name, fg.starts_at as gw_starts_at, fg.ends_at as gw_ends_at,
            ftp.slot, ftp.is_captain, ftp.locked_at, ftp.points,
            fpp.current_price
     from public.fantasy_team_picks ftp
     join public.players p on p.id = ftp.player_id
     left join public.fantasy_gameweeks fg on fg.id = ftp.fantasy_gameweek_id
     left join public.fantasy_player_pool fpp on fpp.player_id = ftp.player_id and fpp.fantasy_season_id = $${whereGameweek ? 3 : 2}
     left join public.teams t on t.id = fpp.team_id
     where ftp.fantasy_team_id = $1 ${whereGameweek}
     order by ftp.fantasy_gameweek_id nulls last, ftp.slot`,
    [...params, team.fantasy_season_id]
  );
  const spent = picks.rows.reduce((sum, row) => sum + Number(row.current_price || 0), 0);

  const picksWithPlayed = await Promise.all(
    picks.rows.map(async (row) => ({
      ...row,
      has_played: row.gw_starts_at && row.gw_ends_at ? await hasPlayerPlayedInWindow(query as unknown as Exec, row.player_id, row.gw_starts_at, row.gw_ends_at) : false
    }))
  );

  let transferWindow = null;
  if (fantasyGameweekId) {
    const gwRowResult = await query(
      `select starts_at, ends_at, locks_at from public.fantasy_gameweeks where id = $1`,
      [fantasyGameweekId]
    );
    const gwRow = gwRowResult.rows[0];
    const phase = gwRow ? computeGameweekPhase(gwRow) : "open";

    const ranked = await fetchRankedGameweeks(query as unknown as Exec, team.fantasy_season_id);
    const currentRound = ranked.find((row) => row.id === fantasyGameweekId);
    const roundNumber = currentRound ? currentRound.roundNumber : 1;
    const previous = roundNumber > 1 ? ranked.find((row) => row.roundNumber === roundNumber - 1) : null;
    let previousPicks: { playerId: string; slot: string }[] = [];
    if (previous) {
      const prevPicksResult = await query(
        `select player_id, slot from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2`,
        [fantasyTeamId, previous.id]
      );
      previousPicks = prevPicksResult.rows.map((row) => ({ playerId: row.player_id, slot: row.slot }));
    }
    transferWindow = {
      roundNumber,
      isUnlimited: UNLIMITED_TRANSFER_ROUNDS.has(roundNumber),
      transfersAllowed: TRANSFERS_PER_ROUND,
      previousPicks,
      phase
    };
  }

  return {
    id: team.id,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    userId: team.user_id,
    fantasySeasonId: team.fantasy_season_id,
    seasonName: team.season_name || "",
    name: team.name,
    totalPoints: Number(team.total_points || 0),
    lastScoredAt: team.last_scored_at,
    budgetCap: Number(Number(team.budget_cap ?? 100).toFixed(2)),
    budgetSpent: Number(spent.toFixed(2)),
    budgetRemaining: Number((Number(team.budget_cap ?? 100) - spent).toFixed(2)),
    picks: picksWithPlayed.map(normalizePick),
    transferWindow
  };
}

async function ensureFantasySeasonTeam(user: Actor, seasonId: string) {
  const result = await query(
    `insert into public.fantasy_teams (user_id, fantasy_season_id, name)
     values ($1,$2,$3)
     on conflict (user_id, fantasy_season_id) where fantasy_season_id is not null do update set updated_at = now()
     returning id`,
    [user.id, requiredText(seasonId, "Sezona je obavezna."), `${user.displayName || "Korisnik"} FC`]
  );
  return result.rows[0];
}

async function ensureFantasySeasonTeamTx(client: PoolClient, user: Actor, seasonId: string, teamName?: string) {
  const result = await client.query(
    `insert into public.fantasy_teams (user_id, fantasy_season_id, name)
     values ($1,$2,$3)
     on conflict (user_id, fantasy_season_id) where fantasy_season_id is not null do update set
       name = coalesce(nullif(excluded.name, ''), public.fantasy_teams.name),
       updated_at = now()
     returning id, budget_cap`,
    [user.id, seasonId, String(teamName || `${user.displayName || "Korisnik"} FC`).trim()]
  );
  return result.rows[0];
}

async function ensurePlayerInSeasonPool(client: PoolClient, playerId: string, seasonId: string) {
  const poolResult = await client.query(
    `select fpp.player_id, fpp.current_price, p.position, p.display_name
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     where fpp.player_id = $1
       and fpp.fantasy_season_id = $2
       and fpp.is_available = true
       and p.is_active = true
       and t.is_active = true
     limit 1`,
    [playerId, seasonId]
  );
  if (!poolResult.rows[0]) throw httpError(400, "Izabrani igrac nije dostupan u fantasy bazi za ovu sezonu.");
  return poolResult.rows[0];
}

async function replaceSeasonCompetitionsTx(client: PoolClient, seasonId: string, competitionIds: string[]) {
  await client.query("delete from public.fantasy_season_competitions where fantasy_season_id = $1", [seasonId]);
  for (const competitionId of competitionIds) {
    await client.query(
      "insert into public.fantasy_season_competitions (fantasy_season_id, competition_id) values ($1,$2) on conflict do nothing",
      [seasonId, competitionId]
    );
  }
}

async function listSeasonCompetitionRows(seasonId: string) {
  const result = await query(
    `select c.id, c.name, c.season_name, city.name as city_name
     from public.fantasy_season_competitions fsc
     join public.competitions c on c.id = fsc.competition_id
     left join public.cities city on city.id = c.city_id
     where fsc.fantasy_season_id = $1
     order by city.name, c.name`,
    [seasonId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    seasonName: row.season_name,
    cityName: row.city_name || ""
  }));
}

async function getSeasonRow(seasonId: string) {
  const result = await query("select * from public.fantasy_seasons where id = $1", [requiredText(seasonId, "Sezona je obavezna.")]);
  if (!result.rows[0]) throw httpError(404, "Fantasy sezona nije pronadjena.");
  return result.rows[0];
}

async function ensureSeasonTx(client: PoolClient, seasonId: string) {
  const result = await client.query("select * from public.fantasy_seasons where id = $1", [seasonId]);
  if (!result.rows[0]) throw httpError(404, "Fantasy sezona nije pronadjena.");
  return result.rows[0];
}

async function audit(actor: Actor | null, action: string, entityType: string, entityId: string, metadata: unknown) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

async function auditWithClient(client: PoolClient, actor: Actor | null, action: string, entityType: string, entityId: string, metadata: unknown) {
  await client.query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizeSeason(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    status: row.status,
    gameweekLengthDays: Number(row.gameweek_length_days || 7),
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    competitionsCount: row.competitions_count !== undefined ? Number(row.competitions_count || 0) : undefined
  };
}

function normalizeGameweek(row: any) {
  return {
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    name: row.name,
    startsAt: row.starts_at,
    locksAt: row.locks_at,
    endsAt: row.ends_at || "",
    status: row.status
  };
}

function normalizePick(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    playerId: row.player_id,
    playerName: row.player_name,
    position: row.position || "",
    avatarUrl: row.avatar_url || "",
    shirtNumber: row.shirt_number,
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    fantasyGameweekId: row.fantasy_gameweek_id || "",
    gameweekName: row.gameweek_name || "",
    slot: row.slot,
    isCaptain: row.is_captain,
    lockedAt: row.locked_at,
    points: Number(row.points || 0),
    currentPrice: Number(row.current_price || 0),
    hasPlayed: Boolean(row.has_played)
  };
}

function normalizeFantasyPoolPlayer(row: any) {
  return {
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    competitionId: row.competition_id,
    competitionName: row.competition_name || "",
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
    isPriceLocked: Boolean(row.is_price_locked),
    matchAvailability: row.availability_status || "unknown"
  };
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

function validSeasonStatus(status: unknown): string {
  const normalized = String(status || "").trim();
  if (!VALID_SEASON_STATUSES.has(normalized)) throw httpError(400, "Status sezone nije validan.");
  return normalized;
}

function requireUser(user: Actor | null): void {
  if (!user?.id) throw httpError(401, "Moras biti ulogovan.");
}
