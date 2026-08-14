import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createFantasyMiniLeague,
  disbandFantasyMiniLeague,
  getFantasyMiniLeague,
  getFantasyMiniLeagueLeaderboard,
  joinFantasyMiniLeague,
  leaveFantasyMiniLeague,
  listMyFantasyMiniLeagues
} from "./fantasy-mini-leagues.ts";
import { cleanupTestData, closePool, createTestCompetition, createTestFantasySeason, newFixtureTracker } from "./test-helpers.ts";
import type { Actor } from "./types.ts";

// These tests exercise the guard logic (auth, existence, "you need a team first") without
// creating real profiles - profiles.id has a hard FK to Supabase's auth.users, which can
// only be populated through the Admin API (see auth.ts), not a plain insert. Same constraint
// fantasy-seasons.test.ts documents and works around. A random UUID is fine as an actor id
// for every path here because none of them reach an insert against fantasy_mini_league_members
// (which does FK to profiles) before the guard under test fires.
function fakeActor(): Actor {
  return { id: randomUUID(), role: "fan" };
}

describe("createFantasyMiniLeague", () => {
  test("rejects an unauthenticated caller", async () => {
    await assert.rejects(
      () => createFantasyMiniLeague(null, { fantasySeasonId: randomUUID(), name: "__test__ league" }),
      (error: any) => {
        assert.equal(error.statusCode, 401);
        return true;
      }
    );
  });

  test("rejects a fantasy season that does not exist", async () => {
    await assert.rejects(
      () => createFantasyMiniLeague(fakeActor(), { fantasySeasonId: randomUUID(), name: "__test__ league" }),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });

  test("rejects a caller who has not built a fantasy team for that season yet", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await assert.rejects(
        () => createFantasyMiniLeague(fakeActor(), { fantasySeasonId: seasonId, name: "__test__ league" }),
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

describe("joinFantasyMiniLeague", () => {
  test("rejects an unknown invite code", async () => {
    await assert.rejects(
      () => joinFantasyMiniLeague(fakeActor(), { inviteCode: "ZZZZZZ" }),
      (error: any) => {
        assert.equal(error.statusCode, 404);
        return true;
      }
    );
  });
});

describe("listMyFantasyMiniLeagues", () => {
  test("returns an empty list for a caller in no leagues", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      const result = await listMyFantasyMiniLeagues(fakeActor(), seasonId);
      assert.deepEqual(result, []);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("getFantasyMiniLeague / leaderboard / leave / disband", () => {
  test("all reject a mini league id that does not exist", async () => {
    const actor = fakeActor();
    const missingId = randomUUID();

    await assert.rejects(() => getFantasyMiniLeague(actor, missingId), (error: any) => {
      assert.equal(error.statusCode, 404);
      return true;
    });
    await assert.rejects(() => getFantasyMiniLeagueLeaderboard(actor, missingId), (error: any) => {
      assert.equal(error.statusCode, 404);
      return true;
    });
    await assert.rejects(() => leaveFantasyMiniLeague(actor, missingId), (error: any) => {
      assert.equal(error.statusCode, 404);
      return true;
    });
    await assert.rejects(() => disbandFantasyMiniLeague(actor, missingId), (error: any) => {
      assert.equal(error.statusCode, 404);
      return true;
    });
  });
});

after(async () => {
  await closePool();
});
