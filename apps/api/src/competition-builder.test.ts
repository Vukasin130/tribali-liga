import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { configureCompetition, generateCompetitionSchedule } from "./competition-builder.ts";
import { query } from "./db.ts";
import { cleanupTestData, closePool, createTestCompetition, createTestTeam, newFixtureTracker } from "./test-helpers.ts";
import type { Actor } from "./types.ts";

// audit_logs.actor_user_id has a real FK to profiles - see fantasy-seasons.test.ts for
// why an empty actor id (rather than a well-formed but nonexistent UUID) is required.
const testActor: Actor = { id: "", role: "admin" };

after(async () => {
  await closePool();
});

describe("generateCompetitionSchedule", () => {
  test("round 1 lands on the exact day the admin picked, not the Monday of that week", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      await createTestTeam(tracker, competitionId, "__test__ home");
      await createTestTeam(tracker, competitionId, "__test__ away");
      await configureCompetition(
        competitionId,
        {
          formatType: "league",
          phases: [{ code: "regular", name: "Regularni deo", type: "league", sequence: 1, legs: 1 }]
        },
        testActor
      );

      // Tuesday, September 1st 2026 - deliberately not a Monday, to catch the old
      // "snaps back to the Monday of startAt's own week" bug.
      const startAt = new Date(2026, 8, 1, 18, 0, 0).toISOString();
      const generated = await generateCompetitionSchedule(
        competitionId,
        { phaseCode: "regular", legs: 1, startAt, intervalMinutes: 60 },
        testActor
      );

      assert.equal(generated.length, 1);
      const scheduled = new Date(generated[0].scheduledAt);
      assert.equal(scheduled.getFullYear(), 2026);
      assert.equal(scheduled.getMonth(), 8); // September, 0-indexed
      assert.equal(scheduled.getDate(), 1);
    } finally {
      await query("delete from public.competition_phases where competition_id = any($1::uuid[])", [tracker.competitionIds]);
      await query("delete from public.competition_formats where competition_id = any($1::uuid[])", [tracker.competitionIds]);
      await cleanupTestData(tracker);
    }
  });
});
