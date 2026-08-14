// Shared fixture builders for apps/api's node:test suites. These insert directly against
// the same DB the dev server uses (no separate test DB - see the fantasy round-automation
// plan this was introduced alongside) rather than going through the HTTP layer, so tests
// stay focused on the module under test. Every row created here is tagged with a
// __test__ prefix and tracked so cleanupTestData() can remove exactly what a test made.
import { query } from "./db.ts";

export { closePool } from "./db.ts";

export interface TestFixtureIds {
  competitionIds: string[];
  teamIds: string[];
  playerIds: string[];
  matchIds: string[];
  fantasySeasonIds: string[];
}

export function newFixtureTracker(): TestFixtureIds {
  return { competitionIds: [], teamIds: [], playerIds: [], matchIds: [], fantasySeasonIds: [] };
}

export async function createTestCompetition(tracker: TestFixtureIds, name = "__test__ competition"): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.competitions (name, season_name, kind) values ($1, '__test__ season', 'league') returning id`,
    [name]
  );
  const id = result.rows[0].id;
  tracker.competitionIds.push(id);
  return id;
}

export async function createTestTeam(tracker: TestFixtureIds, competitionId: string, name = "__test__ team"): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.teams (competition_id, name) values ($1, $2) returning id`,
    [competitionId, name]
  );
  const id = result.rows[0].id;
  tracker.teamIds.push(id);
  return id;
}

export async function createTestPlayer(
  tracker: TestFixtureIds,
  teamId: string,
  name = "__test__ player",
  position = "napad"
): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.players (team_id, display_name, position) values ($1, $2, $3) returning id`,
    [teamId, name, position]
  );
  const id = result.rows[0].id;
  tracker.playerIds.push(id);
  await query(`insert into public.team_rosters (player_id, team_id, is_active) values ($1, $2, true)`, [id, teamId]);
  return id;
}

export async function createTestMatch(
  tracker: TestFixtureIds,
  competitionId: string,
  homeTeamId: string,
  awayTeamId: string,
  scheduledAt: Date,
  opts: { status?: "scheduled" | "live" | "finished"; homeScore?: number; awayScore?: number } = {}
): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.matches (competition_id, home_team_id, away_team_id, scheduled_at, status, home_score, away_score)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [competitionId, homeTeamId, awayTeamId, scheduledAt.toISOString(), opts.status ?? "scheduled", opts.homeScore ?? 0, opts.awayScore ?? 0]
  );
  const id = result.rows[0].id;
  tracker.matchIds.push(id);
  return id;
}

export async function createTestPlayerMatchStats(
  matchId: string,
  teamId: string,
  playerId: string,
  fields: { goals?: number; assists?: number; fantasyPoints: number }
): Promise<void> {
  await query(
    `insert into public.player_match_stats (match_id, team_id, player_id, goals, assists, fantasy_points)
     values ($1, $2, $3, $4, $5, $6)`,
    [matchId, teamId, playerId, fields.goals ?? 0, fields.assists ?? 0, fields.fantasyPoints]
  );
}

export async function createTestFantasySeason(
  tracker: TestFixtureIds,
  competitionIds: string[],
  name = "__test__ fantasy season",
  status: "draft" | "active" | "finished" = "active"
): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.fantasy_seasons (name, status) values ($1, $2) returning id`,
    [name, status]
  );
  const id = result.rows[0].id;
  tracker.fantasySeasonIds.push(id);
  for (const competitionId of competitionIds) {
    await query(`insert into public.fantasy_season_competitions (fantasy_season_id, competition_id) values ($1, $2)`, [
      id,
      competitionId
    ]);
  }
  return id;
}

// For tests that need precise control over a round's own window (independent of real
// match data) - e.g. exercising scoreFantasySeasonGameweek directly. The name is
// randomized so repeated calls under the same fantasy season never collide on the
// (fantasy_season_id, name) unique constraint.
export async function createTestGameweek(
  tracker: TestFixtureIds,
  fantasySeasonId: string,
  window: { startsAt: Date; locksAt: Date; endsAt: Date; status?: "open" | "locked" | "finished" }
): Promise<string> {
  const result = await query<{ id: string }>(
    `insert into public.fantasy_gameweeks (fantasy_season_id, name, starts_at, locks_at, ends_at, status)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      fantasySeasonId,
      `__test__ gw ${crypto.randomUUID()}`,
      window.startsAt.toISOString(),
      window.locksAt.toISOString(),
      window.endsAt.toISOString(),
      window.status ?? "locked"
    ]
  );
  return result.rows[0].id;
}

// Deletes everything a test's tracker recorded, in dependency order, rather than relying
// on cascade behavior that isn't consistently defined across every FK in the schema.
export async function cleanupTestData(tracker: TestFixtureIds): Promise<void> {
  if (tracker.fantasySeasonIds.length) {
    // fantasy_gameweeks -> fantasy_team_picks and fantasy_teams -> fantasy_team_picks both
    // cascade, so deleting gameweeks/teams below is enough to also clear picks.
    await query(`delete from public.fantasy_gameweeks where fantasy_season_id = any($1::uuid[])`, [tracker.fantasySeasonIds]);
    await query(`delete from public.fantasy_player_pool where fantasy_season_id = any($1::uuid[])`, [tracker.fantasySeasonIds]);
    await query(`delete from public.fantasy_teams where fantasy_season_id = any($1::uuid[])`, [tracker.fantasySeasonIds]);
    await query(`delete from public.fantasy_season_competitions where fantasy_season_id = any($1::uuid[])`, [
      tracker.fantasySeasonIds
    ]);
    await query(`delete from public.fantasy_seasons where id = any($1::uuid[])`, [tracker.fantasySeasonIds]);
  }
  if (tracker.matchIds.length) {
    await query(`delete from public.player_match_stats where match_id = any($1::uuid[])`, [tracker.matchIds]);
    await query(`delete from public.matches where id = any($1::uuid[])`, [tracker.matchIds]);
  }
  if (tracker.playerIds.length) {
    await query(`delete from public.team_rosters where player_id = any($1::uuid[])`, [tracker.playerIds]);
    await query(`delete from public.players where id = any($1::uuid[])`, [tracker.playerIds]);
  }
  if (tracker.teamIds.length) {
    await query(`delete from public.teams where id = any($1::uuid[])`, [tracker.teamIds]);
  }
  if (tracker.competitionIds.length) {
    await query(`delete from public.competitions where id = any($1::uuid[])`, [tracker.competitionIds]);
  }
}
