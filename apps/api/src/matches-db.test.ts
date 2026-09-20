import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  addMatchEventDb,
  deleteMatchDb,
  getMatchDetailDb,
  listLiveMatchesDb,
  reopenMatchDb,
  setMatchPeriodDb,
  setMatchStatusDb,
  submitMatchPredictionDb,
  undoLastMatchEventDb,
  updateMatchDb,
  upsertLineupDb
} from "./matches-db.ts";
import { query } from "./db.ts";
import {
  cleanupTestData,
  closePool,
  createTestCompetition,
  createTestMatch,
  createTestPlayer,
  createTestTeam,
  newFixtureTracker
} from "./test-helpers.ts";
import type { Actor } from "./types.ts";

// audit_logs.actor_user_id has a real FK to profiles (see fantasy-seasons.test.ts) - an
// empty id makes every audit() call in matches-db.ts insert NULL instead of a well-formed
// but nonexistent UUID, which the FK would reject.
const testActor: Actor = { id: "", role: "admin" };

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// getMatchDetailDb's events come back typed T | null (normalizeEvent falls back to null
// for a missing row), which never actually happens for rows this suite just inserted -
// this narrows the array once so the tests below don't need an optional-chain on every access.
type MatchDetail = Awaited<ReturnType<typeof getMatchDetailDb>>;
function definedEvents(events: MatchDetail["events"]): NonNullable<MatchDetail["events"][number]>[] {
  return events.filter((e): e is NonNullable<typeof e> => e !== null);
}

interface StandingRow {
  team_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

async function fetchStandings(competitionId: string): Promise<StandingRow[]> {
  const result = await query<StandingRow>(
    `select team_id, played, wins, draws, losses, goals_for, goals_against, points
     from public.team_standings where competition_id = $1`,
    [competitionId]
  );
  return result.rows;
}

// node-postgres returns timestamptz columns as Date objects, not strings - callers should
// compare via .getTime() rather than assert.equal (two Date instances with the same value
// are never reference-equal, so a naive strict-equal always fails even when times match).
async function fetchPeriodStartedAt(matchId: string): Promise<number> {
  const result = await query<{ period_started_at: Date | string | null }>(
    `select period_started_at from public.matches where id = $1`,
    [matchId]
  );
  const value = result.rows[0]?.period_started_at;
  return value ? new Date(value).getTime() : NaN;
}

async function setup2v2(tracker: ReturnType<typeof newFixtureTracker>) {
  const competitionId = await createTestCompetition(tracker);
  const homeTeamId = await createTestTeam(tracker, competitionId, "__test__ home");
  const awayTeamId = await createTestTeam(tracker, competitionId, "__test__ away");
  return { competitionId, homeTeamId, awayTeamId };
}

describe("setMatchStatusDb", () => {
  test("moves a scheduled match to live without logging a fulltime event", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      const detail = await setMatchStatusDb(matchId, { status: "live" }, testActor);
      assert.equal(detail.status, "live");
      assert.equal(definedEvents(detail.events).filter((e) => e.type === "fulltime").length, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("finishing a match logs exactly one fulltime event with the final score", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const detail = await setMatchStatusDb(matchId, { status: "finished", homeScore: 2, awayScore: 1 }, testActor);
      const fulltimeEvents = definedEvents(detail.events).filter((e) => e.type === "fulltime");
      assert.equal(fulltimeEvents.length, 1);
      assert.equal(fulltimeEvents[0].scoreHome, 2);
      assert.equal(fulltimeEvents[0].scoreAway, 1);
      assert.equal(detail.homeScore, 2);
      assert.equal(detail.awayScore, 1);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("finishing an already-finished match does not log a second fulltime event", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);
      const detail = await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      assert.equal(definedEvents(detail.events).filter((e) => e.type === "fulltime").length, 1);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("finishing a match immediately updates the competition standings", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 3, awayScore: 1 }, testActor);

      const standings = await fetchStandings(competitionId);
      const home = standings.find((row) => row.team_id === homeTeamId);
      const away = standings.find((row) => row.team_id === awayTeamId);
      assert.equal(home?.played, 1);
      assert.equal(home?.wins, 1);
      assert.equal(home?.points, 3);
      assert.equal(home?.goals_for, 3);
      assert.equal(home?.goals_against, 1);
      assert.equal(away?.played, 1);
      assert.equal(away?.losses, 1);
      assert.equal(away?.points, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  // Regression test for a real incident: a team withdrew mid-season (KNS Trans, Tribali
  // liga Sabac), got deactivated, and its already-played match got cancelled to void the
  // result. Its team_standings row from before was never deleted, since nothing ever
  // recomputes a row for a team that's both inactive and has zero remaining counted
  // matches - it just sat there forever as a stale ghost entry, still showing in the table.
  test("a deactivated team's standings row disappears once its match is cancelled", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 3, awayScore: 1 }, testActor);

      let standings = await fetchStandings(competitionId);
      assert.ok(standings.some((row) => row.team_id === awayTeamId), "sanity check: the row exists before withdrawing");

      // Mirrors the real fix: the withdrawing team is deactivated, then its match voided.
      await query("update public.teams set is_active = false where id = $1", [awayTeamId]);
      await updateMatchDb(matchId, { status: "cancelled" }, testActor);

      standings = await fetchStandings(competitionId);
      assert.equal(standings.find((row) => row.team_id === awayTeamId), undefined);
      // The surviving, still-active team is untouched (just no longer has a played game).
      const home = standings.find((row) => row.team_id === homeTeamId);
      assert.equal(home?.played, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects an unknown status", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      await assert.rejects(
        () => setMatchStatusDb(matchId, { status: "abandoned" }, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects a match id that does not exist", async () => {
    await assert.rejects(
      () => setMatchStatusDb(randomUUID(), { status: "live" }, testActor),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });

  async function fetchFantasyPoints(matchId: string, playerId: string): Promise<number> {
    const result = await query<{ fantasy_points: number }>(
      `select fantasy_points from public.player_match_stats where match_id = $1 and player_id = $2`,
      [matchId, playerId]
    );
    return Number(result.rows[0]?.fantasy_points ?? 0);
  }

  test("everyone in the lineup gets the flat +2 appearance bonus, regardless of position or result", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const conceding = await createTestPlayer(tracker, homeTeamId, "__test__ conceding defender", "odbrana");
      const notInLineup = await createTestPlayer(tracker, homeTeamId, "__test__ not in lineup", "napad");
      const scorer = await createTestPlayer(tracker, awayTeamId, "__test__ scorer", "napad");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      // notInLineup is deliberately left out entirely.
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: conceding, teamId: homeTeamId, isStarter: true },
            { playerId: scorer, teamId: awayTeamId, isStarter: true }
          ]
        },
        testActor
      );

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 0, awayScore: 1 }, testActor);

      // Home conceded, so no clean sheet either way - both lineup players still get the
      // plain appearance bonus regardless.
      assert.equal(await fetchFantasyPoints(matchId, conceding), 2);
      assert.equal(await fetchFantasyPoints(matchId, scorer), 2);
      // Never listed in the lineup at all - no appearance bonus.
      assert.equal(await fetchFantasyPoints(matchId, notInLineup), 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a clean sheet stacks on top of the appearance bonus, not instead of it", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const keeper = await createTestPlayer(tracker, homeTeamId, "__test__ keeper", "golman");
      const striker = await createTestPlayer(tracker, awayTeamId, "__test__ striker");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: keeper, teamId: homeTeamId, isStarter: true },
            { playerId: striker, teamId: awayTeamId, isStarter: true }
          ]
        },
        testActor
      );

      // Home wins 1-0 - home kept a clean sheet, away conceded.
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      // Keeper: +2 appearance, +2 clean sheet.
      assert.equal(await fetchFantasyPoints(matchId, keeper), 4);
      // Striker played too, so still gets the plain appearance bonus - just not a clean
      // sheet, since their side conceded.
      assert.equal(await fetchFantasyPoints(matchId, striker), 2);

      const events = await query<{ type: string }>(
        `select type from public.match_events where match_id = $1 and type = 'clean_sheet'`,
        [matchId]
      );
      assert.equal(events.rowCount, 1);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("an attacker on the clean sheet side gets the appearance bonus but not the clean sheet one", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const keeper = await createTestPlayer(tracker, homeTeamId, "__test__ keeper", "golman");
      const attacker = await createTestPlayer(tracker, homeTeamId, "__test__ attacker", "napad");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: keeper, teamId: homeTeamId, isStarter: true },
            { playerId: attacker, teamId: homeTeamId, isStarter: true }
          ]
        },
        testActor
      );

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 2, awayScore: 0 }, testActor);

      assert.equal(await fetchFantasyPoints(matchId, keeper), 4);
      assert.equal(await fetchFantasyPoints(matchId, attacker), 2);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("both sides get the clean sheet bonus on a 0-0", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const homePlayer = await createTestPlayer(tracker, homeTeamId, "__test__ home player", "golman");
      const awayPlayer = await createTestPlayer(tracker, awayTeamId, "__test__ away player", "odbrana");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: homePlayer, teamId: homeTeamId, isStarter: true },
            { playerId: awayPlayer, teamId: awayTeamId, isStarter: true }
          ]
        },
        testActor
      );

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 0, awayScore: 0 }, testActor);

      assert.equal(await fetchFantasyPoints(matchId, homePlayer), 4);
      assert.equal(await fetchFantasyPoints(matchId, awayPlayer), 4);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("no appearance or clean sheet bonus for anyone when the match has no lineup at all", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      // Mirrors the admin's "unesi konacan rezultat" shortcut - no lineup ever built.
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      const events = await query<{ type: string }>(
        `select type from public.match_events where match_id = $1 and type in ('clean_sheet', 'appearance')`,
        [matchId]
      );
      assert.equal(events.rowCount, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("finishing an already-finished match does not award either bonus twice", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const keeper = await createTestPlayer(tracker, homeTeamId, "__test__ keeper", "golman");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await upsertLineupDb(matchId, { players: [{ playerId: keeper, teamId: homeTeamId, isStarter: true }] }, testActor);

      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      assert.equal(await fetchFantasyPoints(matchId, keeper), 4);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("reopenMatchDb", () => {
  // The real incident this exists for: an admin's finger slipped and finished a match
  // that had barely kicked off, with previously no way to undo it - the match was
  // permanently stuck read-only in the "review" screen.
  test("undoes an accidental finish, restoring first_half and resuming the same clock", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);
      const kickoffAnchor = await fetchPeriodStartedAt(matchId);

      const finished = await setMatchStatusDb(matchId, { status: "finished", homeScore: 0, awayScore: 0 }, testActor);
      assert.equal(definedEvents(finished.events).filter((e) => e.type === "fulltime").length, 1);

      const reopened = await reopenMatchDb(matchId, testActor);
      assert.equal(reopened.status, "live");
      // The phantom "match ended" entry is gone, and the clock's anchor is untouched -
      // same kickoff time as before, not reset to 0'.
      assert.equal(definedEvents(reopened.events).filter((e) => e.type === "fulltime").length, 0);
      assert.equal(await fetchPeriodStartedAt(matchId), kickoffAnchor);

      const standings = await fetchStandings(competitionId);
      const home = standings.find((row) => row.team_id === homeTeamId);
      assert.equal(home?.played, 0, "a reopened match should no longer count in standings");
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("restores second_half, not first_half, when that's what was actually being played", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);
      await setMatchPeriodDb(matchId, { period: "halftime" }, testActor);
      await setMatchPeriodDb(matchId, { period: "second_half" }, testActor);
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 1 }, testActor);

      const reopened = await reopenMatchDb(matchId, testActor);
      const periodRow = await query<{ period: string }>("select period from public.matches where id = $1", [matchId]);
      assert.equal(periodRow.rows[0]?.period, "second_half");
      assert.equal(reopened.status, "live");
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects reopening a match that isn't finished", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(
        () => reopenMatchDb(matchId, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects a match id that does not exist", async () => {
    await assert.rejects(
      () => reopenMatchDb(randomUUID(), testActor),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });
});

describe("setMatchPeriodDb", () => {
  test("rejects an invalid period", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(
        () => setMatchPeriodDb(matchId, { period: "finished" }, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects a match id that does not exist", async () => {
    await assert.rejects(
      () => setMatchPeriodDb(randomUUID(), { period: "first_half" }, testActor),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });

  test("starting the first half anchors the clock and logs a kickoff event", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const detail = await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);
      assert.equal(detail.period, "first_half");
      assert.ok(detail.periodStartedAt);
      const kickoffEvents = definedEvents(detail.events).filter((e) => e.type === "kickoff");
      assert.equal(kickoffEvents.length, 1);
      assert.equal(kickoffEvents[0].minute, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("moving to halftime logs a halftime event without re-anchoring the clock", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);
      const afterKickoff = await fetchPeriodStartedAt(matchId);

      const detail = await setMatchPeriodDb(matchId, { period: "halftime" }, testActor);
      const afterHalftime = await fetchPeriodStartedAt(matchId);

      assert.equal(detail.period, "halftime");
      assert.equal(definedEvents(detail.events).filter((e) => e.type === "halftime").length, 1);
      assert.equal(afterHalftime, afterKickoff);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("moving to the second half re-anchors the clock with a fresh timestamp", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);
      const afterKickoff = await fetchPeriodStartedAt(matchId);
      await setMatchPeriodDb(matchId, { period: "halftime" }, testActor);

      const detail = await setMatchPeriodDb(matchId, { period: "second_half" }, testActor);
      const afterSecondHalf = await fetchPeriodStartedAt(matchId);

      assert.equal(detail.period, "second_half");
      assert.equal(definedEvents(detail.events).filter((e) => e.type === "second_half").length, 1);
      assert.ok(afterSecondHalf > afterKickoff);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("addMatchEventDb", () => {
  test("rejects an unknown event type", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(
        () => addMatchEventDb(matchId, { type: "own_goal_party", minute: 10 }, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects a minute outside the 0-130 range", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(() => addMatchEventDb(matchId, { type: "goal", minute: -1, teamId: homeTeamId }, testActor));
      await assert.rejects(() => addMatchEventDb(matchId, { type: "goal", minute: 131, teamId: homeTeamId }, testActor));
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a goal increments the scoring team's score and the scorer's stats", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const { match } = await addMatchEventDb(matchId, { type: "goal", minute: 23, teamId: homeTeamId, playerId: scorer }, testActor);

      assert.equal(match.homeScore, 1);
      assert.equal(match.awayScore, 0);
      const scorerStats = match.playerStats.find((s) => s.playerId === scorer);
      assert.equal(scorerStats?.goals, 1);
      assert.equal(scorerStats?.fantasyPoints, 5);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a goal's assist provider gets assist stats and fantasy points too", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const assister = await createTestPlayer(tracker, homeTeamId, "__test__ assister");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const { match } = await addMatchEventDb(
        matchId,
        { type: "goal", minute: 40, teamId: homeTeamId, playerId: scorer, relatedPlayerId: assister },
        testActor
      );

      const assisterStats = match.playerStats.find((s) => s.playerId === assister);
      assert.equal(assisterStats?.assists, 1);
      assert.equal(assisterStats?.fantasyPoints, 3);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a yellow card gives the player a card and negative fantasy points", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const defender = await createTestPlayer(tracker, awayTeamId, "__test__ defender", "odbrana");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const { match } = await addMatchEventDb(
        matchId,
        { type: "yellow_card", minute: 55, teamId: awayTeamId, playerId: defender },
        testActor
      );

      const stats = match.playerStats.find((s) => s.playerId === defender);
      assert.equal(stats?.yellowCards, 1);
      assert.equal(stats?.fantasyPoints, -1);
      // A card never touches the score.
      assert.equal(match.homeScore, 0);
      assert.equal(match.awayScore, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a substitution is logged with no stat-rule side effects", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const goingOut = await createTestPlayer(tracker, homeTeamId, "__test__ tired player");
      const comingIn = await createTestPlayer(tracker, homeTeamId, "__test__ fresh player");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      const { match, event } = await addMatchEventDb(
        matchId,
        {
          type: "substitution",
          minute: 60,
          teamId: homeTeamId,
          playerId: comingIn,
          relatedPlayerId: goingOut,
          text: "tired player izasao, fresh player usao"
        },
        testActor
      );

      assert.equal(event?.type, "substitution");
      assert.equal(event?.relatedPlayerId, goingOut);
      assert.equal(match.playerStats.find((s) => s.playerId === comingIn), undefined);
      assert.equal(match.playerStats.find((s) => s.playerId === goingOut), undefined);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("two goals by the same player accumulate instead of overwriting", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ brace scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await addMatchEventDb(matchId, { type: "goal", minute: 12, teamId: homeTeamId, playerId: scorer }, testActor);
      const { match } = await addMatchEventDb(matchId, { type: "goal", minute: 78, teamId: homeTeamId, playerId: scorer }, testActor);

      assert.equal(match.homeScore, 2);
      const stats = match.playerStats.find((s) => s.playerId === scorer);
      assert.equal(stats?.goals, 2);
      assert.equal(stats?.fantasyPoints, 10);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a goal on a still-live match does not yet count toward the competition standings", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await addMatchEventDb(matchId, { type: "goal", minute: 5, teamId: homeTeamId, playerId: scorer }, testActor);

      const standings = await fetchStandings(competitionId);
      const home = standings.find((row) => row.team_id === homeTeamId);
      assert.equal(home?.played, 0);
      assert.equal(home?.points, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("deleteMatchDb", () => {
  // Real incident: a team was kicked out of a league mid-season and its fixtures were
  // cancelled (status='cancelled', see updateMatchDb), but a cancelled match still shows
  // up in every fixture list forever - confusing to browse. This actually removes the row.
  test("removes the match and every dependent row, and standings recalculate as if it never happened", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(-1), { status: "live" });
      await addMatchEventDb(matchId, { type: "goal", minute: 23, teamId: homeTeamId, playerId: scorer }, testActor);
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      let standings = await fetchStandings(competitionId);
      assert.equal(standings.find((row) => row.team_id === homeTeamId)?.played, 1);

      await deleteMatchDb(matchId, testActor);

      const remainingMatch = await query("select id from public.matches where id = $1", [matchId]);
      assert.equal(remainingMatch.rowCount, 0);
      const remainingEvents = await query("select id from public.match_events where match_id = $1", [matchId]);
      assert.equal(remainingEvents.rowCount, 0);
      const remainingStats = await query("select id from public.player_match_stats where match_id = $1", [matchId]);
      assert.equal(remainingStats.rowCount, 0);

      standings = await fetchStandings(competitionId);
      const home = standings.find((row) => row.team_id === homeTeamId);
      assert.equal(home?.played ?? 0, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects a match id that does not exist", async () => {
    await assert.rejects(
      () => deleteMatchDb(randomUUID(), testActor),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });
});

describe("undoLastMatchEventDb", () => {
  // Real incident: an admin's finger slipped and tapped the wrong player/action during
  // live scoring, with no way back except editing the database directly.
  test("reverses a goal - score, scorer stats, and the event itself", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(matchId, { type: "goal", minute: 23, teamId: homeTeamId, playerId: scorer }, testActor);

      const detail = await undoLastMatchEventDb(matchId, testActor);

      assert.equal(detail.homeScore, 0);
      assert.equal(detail.awayScore, 0);
      const stats = detail.playerStats.find((s) => s.playerId === scorer);
      assert.equal(stats?.goals ?? 0, 0);
      assert.equal(stats?.fantasyPoints ?? 0, 0);
      assert.equal(detail.events.filter((e) => e?.type === "goal").length, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("reverses a goal's assist along with the goal itself", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const assister = await createTestPlayer(tracker, homeTeamId, "__test__ assister");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(
        matchId,
        { type: "goal", minute: 40, teamId: homeTeamId, playerId: scorer, relatedPlayerId: assister },
        testActor
      );

      const detail = await undoLastMatchEventDb(matchId, testActor);

      const assisterStats = detail.playerStats.find((s) => s.playerId === assister);
      assert.equal(assisterStats?.assists ?? 0, 0);
      assert.equal(assisterStats?.fantasyPoints ?? 0, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("reverses a card without touching the score", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const defender = await createTestPlayer(tracker, awayTeamId, "__test__ defender", "odbrana");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(matchId, { type: "yellow_card", minute: 55, teamId: awayTeamId, playerId: defender }, testActor);

      const detail = await undoLastMatchEventDb(matchId, testActor);

      const stats = detail.playerStats.find((s) => s.playerId === defender);
      assert.equal(stats?.yellowCards ?? 0, 0);
      assert.equal(stats?.fantasyPoints ?? 0, 0);
      assert.equal(detail.homeScore, 0);
      assert.equal(detail.awayScore, 0);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("only undoes the single most recent action, leaving earlier ones alone", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ brace scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(matchId, { type: "goal", minute: 12, teamId: homeTeamId, playerId: scorer }, testActor);
      await addMatchEventDb(matchId, { type: "goal", minute: 78, teamId: homeTeamId, playerId: scorer }, testActor);

      const detail = await undoLastMatchEventDb(matchId, testActor);

      assert.equal(detail.homeScore, 1);
      const stats = detail.playerStats.find((s) => s.playerId === scorer);
      assert.equal(stats?.goals, 1);
      assert.equal(stats?.fantasyPoints, 5);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("skips over clock events to undo the last real player action", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(matchId, { type: "goal", minute: 12, teamId: homeTeamId, playerId: scorer }, testActor);
      await setMatchPeriodDb(matchId, { period: "halftime" }, testActor);

      const detail = await undoLastMatchEventDb(matchId, testActor);

      assert.equal(detail.homeScore, 0);
      // The halftime clock event is untouched - only the goal (the last real player
      // action) was undone.
      assert.equal(detail.events.filter((e) => e?.type === "halftime").length, 1);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects undoing on a finished match", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const scorer = await createTestPlayer(tracker, homeTeamId, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      await addMatchEventDb(matchId, { type: "goal", minute: 12, teamId: homeTeamId, playerId: scorer }, testActor);
      await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 0 }, testActor);

      await assert.rejects(
        () => undoLastMatchEventDb(matchId, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("rejects undoing when there's nothing to undo", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(
        () => undoLastMatchEventDb(matchId, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("upsertLineupDb", () => {
  test("rejects an empty player list", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      await assert.rejects(
        () => upsertLineupDb(matchId, { players: [] }, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("stores starters and bench with the correct isStarter flags", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const starter = await createTestPlayer(tracker, homeTeamId, "__test__ starter");
      const benchPlayer = await createTestPlayer(tracker, homeTeamId, "__test__ bench player");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      const lineup = await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: starter, teamId: homeTeamId, isStarter: true },
            { playerId: benchPlayer, teamId: homeTeamId, isStarter: false }
          ]
        },
        testActor
      );

      assert.equal(lineup.length, 2);
      assert.equal(lineup.find((p) => p.playerId === starter)?.isStarter, true);
      assert.equal(lineup.find((p) => p.playerId === benchPlayer)?.isStarter, false);
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("replaces the previous lineup entirely rather than merging - the substitution flow", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const goingOut = await createTestPlayer(tracker, homeTeamId, "__test__ subbed out");
      const comingIn = await createTestPlayer(tracker, homeTeamId, "__test__ subbed in");
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      await upsertLineupDb(matchId, { players: [{ playerId: goingOut, teamId: homeTeamId, isStarter: true }] }, testActor);

      const afterSub = await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: goingOut, teamId: homeTeamId, isStarter: false },
            { playerId: comingIn, teamId: homeTeamId, isStarter: true }
          ]
        },
        testActor
      );

      assert.equal(afterSub.length, 2);
      assert.equal(afterSub.find((p) => p.playerId === comingIn)?.isStarter, true);
      assert.equal(afterSub.find((p) => p.playerId === goingOut)?.isStarter, false);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("submitMatchPredictionDb", () => {
  test("rejects an unauthenticated caller", async () => {
    await assert.rejects(
      () => submitMatchPredictionDb(randomUUID(), { pick: "home" }, null),
      (error: any) => {
        assert.equal(error.statusCode, 401);
        return true;
      }
    );
  });

  test("rejects an invalid pick value", async () => {
    await assert.rejects(
      () => submitMatchPredictionDb(randomUUID(), { pick: "banana" }, { id: randomUUID(), role: "fan" }),
      (error: any) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  });

  test("rejects a match id that does not exist", async () => {
    await assert.rejects(
      () => submitMatchPredictionDb(randomUUID(), { pick: "home" }, { id: randomUUID(), role: "fan" }),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });

  test("rejects voting once the match has kicked off", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });

      await assert.rejects(
        () => submitMatchPredictionDb(matchId, { pick: "home" }, { id: randomUUID(), role: "fan" }),
        (error: any) => {
          assert.equal(error.statusCode, 409);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("listLiveMatchesDb", () => {
  test("includes a live match and excludes a scheduled one", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const liveMatchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0), { status: "live" });
      const scheduledMatchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(2), {
        status: "scheduled"
      });

      const live = await listLiveMatchesDb();
      const ids = live.map((m) => m.id);
      assert.ok(ids.includes(liveMatchId));
      assert.ok(!ids.includes(scheduledMatchId));
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("a full live match, kickoff to full time", () => {
  test("walks the whole admin flow and lands on correct events, stats and standings", async () => {
    const tracker = newFixtureTracker();
    try {
      const { competitionId, homeTeamId, awayTeamId } = await setup2v2(tracker);
      const homeScorer = await createTestPlayer(tracker, homeTeamId, "__test__ home scorer");
      const homeAssister = await createTestPlayer(tracker, homeTeamId, "__test__ home assister");
      const homeStarter = await createTestPlayer(tracker, homeTeamId, "__test__ home starter");
      const homeSub = await createTestPlayer(tracker, homeTeamId, "__test__ home sub");
      const awayScorer = await createTestPlayer(tracker, awayTeamId, "__test__ away scorer");
      const awayDefender = await createTestPlayer(tracker, awayTeamId, "__test__ away defender", "odbrana");

      const matchId = await createTestMatch(tracker, competitionId, homeTeamId, awayTeamId, hoursFromNow(0));

      // Kickoff.
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: homeScorer, teamId: homeTeamId, isStarter: true },
            { playerId: homeAssister, teamId: homeTeamId, isStarter: true },
            { playerId: homeStarter, teamId: homeTeamId, isStarter: true },
            { playerId: homeSub, teamId: homeTeamId, isStarter: false },
            { playerId: awayScorer, teamId: awayTeamId, isStarter: true },
            { playerId: awayDefender, teamId: awayTeamId, isStarter: true }
          ]
        },
        testActor
      );
      await setMatchStatusDb(matchId, { status: "live" }, testActor);
      await setMatchPeriodDb(matchId, { period: "first_half" }, testActor);

      // Home team scores with an assist.
      await addMatchEventDb(
        matchId,
        { type: "goal", minute: 18, teamId: homeTeamId, playerId: homeScorer, relatedPlayerId: homeAssister },
        testActor
      );

      // A booking, then a substitution for the home side.
      await addMatchEventDb(matchId, { type: "yellow_card", minute: 30, teamId: awayTeamId, playerId: awayDefender }, testActor);
      await addMatchEventDb(
        matchId,
        {
          type: "substitution",
          minute: 35,
          teamId: homeTeamId,
          playerId: homeSub,
          relatedPlayerId: homeStarter,
          text: "__test__ home starter izasao, __test__ home sub usao"
        },
        testActor
      );
      await upsertLineupDb(
        matchId,
        {
          players: [
            { playerId: homeScorer, teamId: homeTeamId, isStarter: true },
            { playerId: homeAssister, teamId: homeTeamId, isStarter: true },
            { playerId: homeStarter, teamId: homeTeamId, isStarter: false },
            { playerId: homeSub, teamId: homeTeamId, isStarter: true },
            { playerId: awayScorer, teamId: awayTeamId, isStarter: true },
            { playerId: awayDefender, teamId: awayTeamId, isStarter: true }
          ]
        },
        testActor
      );

      // Half time, second half, away team equalizes.
      await setMatchPeriodDb(matchId, { period: "halftime" }, testActor);
      await setMatchPeriodDb(matchId, { period: "second_half" }, testActor);
      await addMatchEventDb(matchId, { type: "goal", minute: 70, teamId: awayTeamId, playerId: awayScorer }, testActor);

      // Full time.
      const final = await setMatchStatusDb(matchId, { status: "finished", homeScore: 1, awayScore: 1 }, testActor);

      assert.equal(final.status, "finished");
      assert.equal(final.homeScore, 1);
      assert.equal(final.awayScore, 1);

      const finalEvents = definedEvents(final.events);
      const eventTypes = finalEvents.map((e) => e.type);
      for (const expected of ["kickoff", "goal", "yellow_card", "substitution", "halftime", "second_half", "fulltime"]) {
        assert.ok(eventTypes.includes(expected), `missing ${expected} in event timeline`);
      }
      // Chronological order (minute ascending).
      const minutes = finalEvents.map((e) => e.minute);
      assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b));

      const scorerStats = final.playerStats.find((s) => s.playerId === homeScorer);
      assert.equal(scorerStats?.goals, 1);
      const assisterStats = final.playerStats.find((s) => s.playerId === homeAssister);
      assert.equal(assisterStats?.assists, 1);
      const defenderStats = final.playerStats.find((s) => s.playerId === awayDefender);
      assert.equal(defenderStats?.yellowCards, 1);

      const lineupAfter = final.lineups.filter((l) => l.teamId === homeTeamId);
      assert.equal(lineupAfter.find((l) => l.playerId === homeSub)?.isStarter, true);
      assert.equal(lineupAfter.find((l) => l.playerId === homeStarter)?.isStarter, false);

      const standings = await fetchStandings(competitionId);
      const home = standings.find((row) => row.team_id === homeTeamId);
      const away = standings.find((row) => row.team_id === awayTeamId);
      assert.equal(home?.played, 1);
      assert.equal(home?.draws, 1);
      assert.equal(home?.points, 1);
      assert.equal(away?.played, 1);
      assert.equal(away?.draws, 1);
      assert.equal(away?.points, 1);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

after(async () => {
  await closePool();
});
