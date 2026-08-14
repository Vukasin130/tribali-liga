import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createFantasySeason,
  runFantasyGameweekSweep,
  scoreFantasySeasonGameweek,
  setFantasyPoolPlayerAvailability,
  setFantasyPoolPlayerPrice,
  syncFantasySeasonPool
} from "./fantasy-seasons.ts";
import { query } from "./db.ts";
import {
  cleanupTestData,
  closePool,
  createTestCompetition,
  createTestFantasySeason,
  createTestGameweek,
  createTestMatch,
  createTestPlayer,
  createTestPlayerMatchStats,
  createTestTeam,
  newFixtureTracker
} from "./test-helpers.ts";
import type { Actor } from "./types.ts";

// audit_logs.actor_user_id has a real FK to profiles, and these tests don't create a
// profile fixture - an empty id makes the audit insert use NULL (actor?.id || null in
// fantasy-seasons.ts's audit()/auditWithClient()), which the FK allows, instead of a
// well-formed but nonexistent UUID, which it doesn't.
const testActor: Actor = { id: "", role: "admin" };

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return hoursFromNow(days * 24);
}

interface GameweekRow {
  id: string;
  name: string;
  starts_at: string;
  locks_at: string;
  ends_at: string;
  status: string;
}

async function fetchGameweeksForSeason(seasonId: string): Promise<GameweekRow[]> {
  const result = await query<GameweekRow>(
    `select id, name, starts_at, locks_at, ends_at, status from public.fantasy_gameweeks where fantasy_season_id = $1 order by starts_at`,
    [seasonId]
  );
  return result.rows;
}

describe("runFantasyGameweekSweep", () => {
  test("a week with matches far in the future becomes an open round", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      await createTestMatch(tracker, competitionId, home, away, daysFromNow(14));
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await runFantasyGameweekSweep();

      const gameweeks = await fetchGameweeksForSeason(seasonId);
      assert.equal(gameweeks.length, 1);
      assert.equal(gameweeks[0].name, "Kolo 1");
      assert.equal(gameweeks[0].status, "open");
      assert.ok(new Date(gameweeks[0].locks_at).getTime() > Date.now());
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a round whose first match already kicked off this week is locked", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      await createTestMatch(tracker, competitionId, home, away, hoursFromNow(-2));
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await runFantasyGameweekSweep();

      const gameweeks = await fetchGameweeksForSeason(seasonId);
      assert.equal(gameweeks.length, 1);
      assert.equal(gameweeks[0].status, "locked");
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a fully-played past week with a finished match is scored and marked finished", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      const scorer = await createTestPlayer(tracker, home, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, home, away, daysFromNow(-21), { status: "finished" });
      await createTestPlayerMatchStats(matchId, home, scorer, { fantasyPoints: 7 });
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await runFantasyGameweekSweep();

      const gameweeks = await fetchGameweeksForSeason(seasonId);
      assert.equal(gameweeks.length, 1);
      assert.equal(gameweeks[0].status, "finished");
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("a past week with no finished match yet stays locked instead of being scored empty", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      await createTestMatch(tracker, competitionId, home, away, daysFromNow(-21), { status: "scheduled" });
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await runFantasyGameweekSweep();

      const gameweeks = await fetchGameweeksForSeason(seasonId);
      assert.equal(gameweeks.length, 1);
      assert.equal(gameweeks[0].status, "locked");
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("re-running the sweep never changes a round that's already finished", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      const scorer = await createTestPlayer(tracker, home, "__test__ scorer");
      const matchId = await createTestMatch(tracker, competitionId, home, away, daysFromNow(-21), { status: "finished" });
      await createTestPlayerMatchStats(matchId, home, scorer, { fantasyPoints: 3 });
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);

      await runFantasyGameweekSweep();
      const before = await fetchGameweeksForSeason(seasonId);
      assert.equal(before[0].status, "finished");

      // A new, earlier match lands in the same already-finished week - if the guard
      // didn't hold, this would shift the round's recorded locks_at backward.
      await createTestMatch(tracker, competitionId, home, away, daysFromNow(-22), { status: "finished" });
      await runFantasyGameweekSweep();

      const after = await fetchGameweeksForSeason(seasonId);
      assert.equal(after.length, 1);
      assert.equal(new Date(after[0].locks_at).getTime(), new Date(before[0].locks_at).getTime());
      assert.equal(after[0].status, "finished");
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("scoreFantasySeasonGameweek", () => {
  test("throws when no match in the round's window has finished yet", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);
      const gameweekId = await createTestGameweek(tracker, seasonId, {
        startsAt: daysFromNow(-8),
        locksAt: daysFromNow(-7),
        endsAt: daysFromNow(-1)
      });

      await assert.rejects(
        () => scoreFantasySeasonGameweek(gameweekId, testActor),
        (error: any) => {
          assert.equal(error.statusCode, 400);
          return true;
        }
      );
    } finally {
      await cleanupTestData(tracker);
    }
  });

  test("moves an unlocked player's price but leaves a locked player's price untouched", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const home = await createTestTeam(tracker, competitionId, "__test__ home");
      const away = await createTestTeam(tracker, competitionId, "__test__ away");
      const star = await createTestPlayer(tracker, home, "__test__ star");
      const lockedPlayer = await createTestPlayer(tracker, home, "__test__ locked player");
      const matchId = await createTestMatch(tracker, competitionId, home, away, daysFromNow(-1), { status: "finished" });
      await createTestPlayerMatchStats(matchId, home, star, { fantasyPoints: 12 });
      await createTestPlayerMatchStats(matchId, home, lockedPlayer, { fantasyPoints: 12 });

      const seasonId = await createTestFantasySeason(tracker, [competitionId]);
      await syncFantasySeasonPool(seasonId, testActor);
      const lockedPrice = 9;
      await setFantasyPoolPlayerPrice(seasonId, lockedPlayer, { price: lockedPrice, isPriceLocked: true }, testActor);

      const gameweekId = await createTestGameweek(tracker, seasonId, {
        startsAt: daysFromNow(-2),
        locksAt: daysFromNow(-1),
        endsAt: hoursFromNow(-1)
      });

      const result = await scoreFantasySeasonGameweek(gameweekId, testActor);
      assert.equal(result.pricedPlayers, 1); // only the unlocked player moved

      const pool = await query<{ player_id: string; current_price: string }>(
        `select player_id, current_price from public.fantasy_player_pool where fantasy_season_id = $1`,
        [seasonId]
      );
      const lockedRow = pool.rows.find((row) => row.player_id === lockedPlayer);
      const unlockedRow = pool.rows.find((row) => row.player_id === star);
      assert.equal(Number(lockedRow?.current_price), lockedPrice);
      assert.notEqual(Number(unlockedRow?.current_price), 5);
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("setFantasyPoolPlayerPrice / setFantasyPoolPlayerAvailability", () => {
  test("rejects a price outside the 4-13 range", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const team = await createTestTeam(tracker, competitionId);
      const player = await createTestPlayer(tracker, team);
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);
      await syncFantasySeasonPool(seasonId, testActor);

      await assert.rejects(() => setFantasyPoolPlayerPrice(seasonId, player, { price: 20, isPriceLocked: true }, testActor));
      await assert.rejects(() => setFantasyPoolPlayerPrice(seasonId, player, { price: 1, isPriceLocked: true }, testActor));
    } finally {
      await cleanupTestData(tracker);
    }
  });

  // Regression test: setFantasyPoolPlayerPrice/Availability used to `returning *` the bare
  // fantasy_player_pool row, which has no display_name/team_name/competition_name columns -
  // the pool card in the UI would blank out immediately after an edit until the page was
  // reloaded. Both functions now re-fetch through the same join the list endpoint uses.
  test("price and availability responses still carry the player's display info", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const team = await createTestTeam(tracker, competitionId, "__test__ regression team");
      const player = await createTestPlayer(tracker, team, "__test__ regression player");
      const seasonId = await createTestFantasySeason(tracker, [competitionId]);
      await syncFantasySeasonPool(seasonId, testActor);

      const priced = await setFantasyPoolPlayerPrice(seasonId, player, { price: 8, isPriceLocked: true }, testActor);
      assert.equal(priced.displayName, "__test__ regression player");
      assert.equal(priced.teamName, "__test__ regression team");

      const toggled = await setFantasyPoolPlayerAvailability(seasonId, player, { isAvailable: false }, testActor);
      assert.equal(toggled.displayName, "__test__ regression player");
      assert.equal(toggled.teamName, "__test__ regression team");
    } finally {
      await cleanupTestData(tracker);
    }
  });
});

describe("createFantasySeason", () => {
  test("rejects an empty competitionIds list", async () => {
    await assert.rejects(() => createFantasySeason({ name: "__test__ no leagues", competitionIds: [] }, testActor));
  });
});

after(async () => {
  await closePool();
});
