import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { configureCompetition, generateCompetitionSchedule, resumeCompetitionSchedule } from "./competition-builder.ts";
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

describe("resumeCompetitionSchedule", () => {
  // Mirrors the real incident this was built for: a 12-team single round robin two
  // rounds into its season, with a 13th team joining mid-season.
  test("weaves a mid-season team in without touching or repeating already-played rounds", async () => {
    const tracker = newFixtureTracker();
    try {
      const competitionId = await createTestCompetition(tracker);
      const teamIds: string[] = [];
      for (let i = 1; i <= 12; i += 1) {
        teamIds.push(await createTestTeam(tracker, competitionId, `__test__ team ${String(i).padStart(2, "0")}`));
      }
      await configureCompetition(
        competitionId,
        {
          formatType: "league",
          phases: [{ code: "regular", name: "Regularni deo", type: "league", sequence: 1, legs: 1 }]
        },
        testActor
      );

      const startAt = new Date(2026, 8, 1, 18, 0, 0).toISOString();
      const generated = await generateCompetitionSchedule(
        competitionId,
        { phaseCode: "regular", legs: 1, startAt, intervalMinutes: 60 },
        testActor
      );
      assert.equal(generated.length, 66); // C(12,2) for a single round robin

      // Play out rounds 1 and 2 for real, exactly as the live incident had - everything
      // else stays 'scheduled', untouched history for rounds 3+.
      const round1and2 = generated.filter((match) => match.round === 1 || match.round === 2);
      assert.equal(round1and2.length, 12);
      const playedPairsBefore = new Set(round1and2.map((match) => [match.homeTeamId, match.awayTeamId].sort().join("|")));
      for (const match of round1and2) {
        await query("update public.matches set status = 'finished', home_score = 1, away_score = 0 where id = $1", [match.id]);
      }

      const newTeamId = await createTestTeam(tracker, competitionId, "__test__ team 13 (joined late)");

      const resumeStartAt = new Date(2026, 8, 15, 18, 0, 0).toISOString();
      const resumed = await resumeCompetitionSchedule(
        competitionId,
        { phaseCode: "regular", startAt: resumeStartAt, intervalMinutes: 60 },
        testActor
      );

      // History is untouched: rounds 1-2 are still exactly the 12 finished matches, same
      // pairings, same status - resumeCompetitionSchedule never deletes a played match.
      const afterRounds1and2 = await query(
        "select * from public.matches where competition_id = $1 and round in (1,2)",
        [competitionId]
      );
      assert.equal(afterRounds1and2.rowCount, 12);
      assert.ok(afterRounds1and2.rows.every((row) => row.status === "finished"));

      // Every new pairing is genuinely new - nothing from rounds 1-2 is repeated.
      for (const match of resumed) {
        const key = [match.homeTeamId, match.awayTeamId].sort().join("|");
        assert.ok(!playedPairsBefore.has(key), `pairing ${key} was already played in round 1 or 2`);
      }

      // No new match reuses round 1 or 2's numbers, and every new round has at most 6
      // matches (13 teams, one bye) with nobody appearing twice in the same round.
      assert.ok(resumed.every((match) => match.round >= 3));
      const byRound = new Map<number, any[]>();
      for (const match of resumed) {
        if (!byRound.has(match.round)) byRound.set(match.round, []);
        byRound.get(match.round)!.push(match);
      }
      for (const [round, matches] of byRound.entries()) {
        assert.ok(matches.length <= 6, `round ${round} has ${matches.length} matches, more than 6`);
        const seenTeams = new Set<string>();
        for (const match of matches) {
          assert.ok(!seenTeams.has(match.homeTeamId), `team plays twice in round ${round}`);
          assert.ok(!seenTeams.has(match.awayTeamId), `team plays twice in round ${round}`);
          seenTeams.add(match.homeTeamId);
          seenTeams.add(match.awayTeamId);
        }
      }

      // The new team has the most games left (12, vs 10 for everyone else) - it plays
      // each of its 12 remaining opponents exactly once, each in a different round (it can
      // never play twice in the same round), so it needs at least 12 rounds; a well-packed
      // schedule needs exactly that many, and never drastically more.
      const newTeamRounds = resumed.filter((match) => match.homeTeamId === newTeamId || match.awayTeamId === newTeamId);
      assert.equal(newTeamRounds.length, 12);
      assert.equal(new Set(newTeamRounds.map((match) => match.round)).size, 12);
      assert.ok(byRound.size >= 12 && byRound.size <= 14, `expected 12-14 new rounds, got ${byRound.size}`);

      // The full season (already-played + newly generated) is a complete single round
      // robin for all 13 teams - every pair meets exactly once, nobody plays themselves,
      // nobody is missing.
      const allTeamIds = [...teamIds, newTeamId];
      const allPairs = new Set([...playedPairsBefore, ...resumed.map((match) => [match.homeTeamId, match.awayTeamId].sort().join("|"))]);
      let expectedPairs = 0;
      for (let i = 0; i < allTeamIds.length; i += 1) {
        for (let j = i + 1; j < allTeamIds.length; j += 1) {
          expectedPairs += 1;
          const key = [allTeamIds[i], allTeamIds[j]].sort().join("|");
          assert.ok(allPairs.has(key), `pair ${allTeamIds[i]} vs ${allTeamIds[j]} is missing from the season`);
        }
      }
      assert.equal(allPairs.size, expectedPairs);
    } finally {
      await query("delete from public.competition_phases where competition_id = any($1::uuid[])", [tracker.competitionIds]);
      await query("delete from public.competition_formats where competition_id = any($1::uuid[])", [tracker.competitionIds]);
      await cleanupTestData(tracker);
    }
  });
});
