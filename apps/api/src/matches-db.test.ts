import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  addMatchEventDb,
  getMatchDetailDb,
  listLiveMatchesDb,
  setMatchPeriodDb,
  setMatchStatusDb,
  submitMatchPredictionDb,
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
