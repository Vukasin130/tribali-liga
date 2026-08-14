import type { PoolClient } from "pg";
import { query, transaction } from "./db.ts";
import { scoreFantasySeasonGameweek, syncFantasySeasonPool } from "./fantasy-seasons.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const VALID_MATCH_STATUSES = new Set(["scheduled", "live", "finished", "postponed", "cancelled"]);
const VALID_PERIODS = new Set(["first_half", "halftime", "second_half"]);
const PERIOD_EVENT_TYPE: Record<string, string> = { first_half: "kickoff", halftime: "halftime", second_half: "second_half" };
const VALID_EVENT_TYPES = new Set([
  "kickoff",
  "goal",
  "assist",
  "second_half",
  "shot_on_target",
  "shot_off_target",
  "goalkeeper_save",
  "corner",
  "foul",
  "penalty",
  "two_minutes",
  "yellow_card",
  "red_card",
  "substitution",
  "halftime",
  "fulltime"
]);

const STAT_RULES: Record<string, { field: string; amount: number; fantasy: number }> = {
  goal: { field: "goals", amount: 1, fantasy: 5 },
  shot_on_target: { field: "shots_on_target", amount: 1, fantasy: 1 },
  shot_off_target: { field: "shots_off_target", amount: 1, fantasy: 0 },
  goalkeeper_save: { field: "saves", amount: 1, fantasy: 1 },
  corner: { field: "corners_won", amount: 1, fantasy: 0 },
  foul: { field: "fouls", amount: 1, fantasy: 0 },
  penalty: { field: "penalties", amount: 1, fantasy: 0 },
  two_minutes: { field: "two_minutes", amount: 1, fantasy: -1 },
  yellow_card: { field: "yellow_cards", amount: 1, fantasy: -1 },
  red_card: { field: "red_cards", amount: 1, fantasy: -3 }
};

export async function listLiveMatchesDb() {
  const result = await query(matchBaseSql("where m.status = 'live' order by m.scheduled_at"));
  return result.rows.map(normalizeMatch);
}

export async function getMatchDetailDb(matchId: string, user?: Actor | null) {
  const matchResult = await query(matchBaseSql("where m.id = $1"), [matchId]);
  if (!matchResult.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");

  const [lineups, events, stats, media, predictions] = await Promise.all([
    query(
      `select l.id, l.created_at, l.updated_at, l.match_id, l.team_id, t.name as team_name,
              l.player_id, p.display_name as player_name, p.position, p.avatar_url, l.is_starter, l.is_goalkeeper,
              l.pitch_x, l.pitch_y, l.shirt_number
       from public.match_lineups l
       left join public.teams t on t.id = l.team_id
       left join public.players p on p.id = l.player_id
       where l.match_id = $1
       order by l.team_id, l.is_starter desc, l.shirt_number nulls last, p.display_name`,
      [matchId]
    ),
    query(
      `select e.id, e.created_at, e.updated_at, e.match_id, e.minute, e.type, e.team_id,
              t.name as team_name, e.player_id, p.display_name as player_name,
              e.related_player_id, rp.display_name as related_player_name,
              e.score_home, e.score_away, e.text, e.fantasy_points_delta
       from public.match_events e
       left join public.teams t on t.id = e.team_id
       left join public.players p on p.id = e.player_id
       left join public.players rp on rp.id = e.related_player_id
       where e.match_id = $1
       order by e.minute, e.created_at`,
      [matchId]
    ),
    query(
      `select s.id, s.created_at, s.updated_at, s.match_id, s.team_id, t.name as team_name,
              s.player_id, p.display_name as player_name, p.position,
              s.goals, s.assists, s.shots, s.shots_on_target, s.shots_off_target, s.saves,
              s.goals_conceded, s.corners_won, s.fouls, s.yellow_cards, s.red_cards,
              s.two_minutes, s.own_goals, s.penalties, s.penalty_goals, s.penalty_saves,
              s.penalty_misses, s.fantasy_points
       from public.player_match_stats s
       left join public.teams t on t.id = s.team_id
       left join public.players p on p.id = s.player_id
       where s.match_id = $1
       order by s.fantasy_points desc, p.display_name`,
      [matchId]
    ),
    query(
      `select id, created_at, updated_at, match_id, kind, label, url
       from public.media_links
       where match_id = $1
       order by created_at`,
      [matchId]
    ),
    query(
      `select pick, count(*)::int as count
       from public.match_predictions
       where match_id = $1
       group by pick`,
      [matchId]
    )
  ]);

  const userPrediction = user?.id
    ? await query(
        "select pick from public.match_predictions where match_id = $1 and user_id = $2 limit 1",
        [matchId, user.id]
      )
    : null;

  return {
    ...normalizeMatch(matchResult.rows[0]),
    lineups: lineups.rows.map(normalizeLineup),
    events: events.rows.map(normalizeEvent),
    playerStats: stats.rows.map(normalizePlayerStats),
    media: media.rows.map(normalizeMedia),
    predictions: normalizePredictions(predictions.rows, userPrediction?.rows[0]?.pick || "")
  };
}

export async function submitMatchPredictionDb(matchId: string, payload: { pick?: string }, user: Actor | null) {
  if (!user?.id) throw httpError(401, "Moras biti ulogovan da bi glasao za rezultat.");
  const pick = String(payload.pick || "").trim();
  if (!["home", "draw", "away"].includes(pick)) throw httpError(400, "Predikcija mora biti home, draw ili away.");

  const matchResult = await query("select id, status from public.matches where id = $1", [matchId]);
  if (!matchResult.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
  if (matchResult.rows[0].status !== "scheduled") {
    throw httpError(409, "Glasanje je moguce samo pre pocetka utakmice.");
  }

  await query(
    `insert into public.match_predictions (match_id, user_id, pick)
     values ($1, $2, $3)
     on conflict (match_id, user_id) do update set pick = excluded.pick, updated_at = now()`,
    [matchId, user.id, pick]
  );

  return getMatchDetailDb(matchId, user);
}

function normalizePredictions(rows: any[], userPick: string) {
  const counts: Record<string, number> = { home: 0, draw: 0, away: 0 };
  for (const row of rows) {
    if (row.pick in counts) counts[row.pick] = Number(row.count || 0);
  }
  const total = counts.home + counts.draw + counts.away;
  return {
    home: counts.home,
    draw: counts.draw,
    away: counts.away,
    total,
    homePercent: total ? Math.round((counts.home / total) * 100) : 0,
    drawPercent: total ? Math.round((counts.draw / total) * 100) : 0,
    awayPercent: total ? Math.round((counts.away / total) * 100) : 0,
    userPick
  };
}

interface SetMatchStatusPayload {
  status?: string;
  homeScore?: number;
  awayScore?: number;
}

export async function setMatchStatusDb(matchId: string, payload: SetMatchStatusPayload, actor: Actor) {
  const status = validStatus(payload.status);
  const result = await transaction(async (client) => {
    const current = await client.query(
      "select period, period_started_at, half_length_minutes, home_score, away_score from public.matches where id = $1",
      [matchId]
    );
    if (!current.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
    const wasAlreadyFinished = current.rows[0].period === "finished";
    const finishMinute = computeElapsedMinuteServer(current.rows[0]);
    const finalHomeScore = payload.homeScore !== undefined ? toNumber(payload.homeScore) : Number(current.rows[0].home_score || 0);
    const finalAwayScore = payload.awayScore !== undefined ? toNumber(payload.awayScore) : Number(current.rows[0].away_score || 0);

    const updated = await client.query(
      `update public.matches set
         status = $2::public.match_status,
         period = case when $2::text = 'finished' then 'finished' else period end,
         home_score = coalesce($3, home_score),
         away_score = coalesce($4, away_score),
         updated_at = now()
       where id = $1
       returning id, competition_id, scheduled_at`,
      [matchId, status, payload.homeScore !== undefined ? finalHomeScore : null, payload.awayScore !== undefined ? finalAwayScore : null]
    );
    if (!updated.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
    if (status === "finished" && !wasAlreadyFinished) {
      await client.query(
        `insert into public.match_events (match_id, minute, type, score_home, score_away)
         values ($1, $2, 'fulltime', $3, $4)`,
        [matchId, Math.min(130, Math.max(0, finishMinute)), finalHomeScore, finalAwayScore]
      );
    }
    await recalculateCompetitionStandings(client, updated.rows[0].competition_id);
    await recalculatePlayerSeasonStats(client, updated.rows[0].competition_id);
    return updated;
  });

  // Fantasy team totals/prices previously only updated when an admin remembered
  // to press a separate "score gameweek" button - a finished match now cascades
  // into it automatically, the same way it already cascades into standings above.
  // Runs after the main transaction commits (mirrors how team/club sync elsewhere
  // in this codebase calls out to fantasy pool sync post-commit) and is wrapped so
  // a fantasy-side failure never blocks the match result itself from saving.
  if (status === "finished") {
    await syncFantasySeasonsForMatch(result.rows[0].competition_id, result.rows[0].scheduled_at, actor).catch(() => undefined);
  }
  await audit(actor, "match.status", "match", matchId, { status });
  return getMatchDetailDb(matchId);
}

// Advances the match clock: first_half/second_half anchor period_started_at (so
// the elapsed minute keeps ticking from there), halftime just freezes it in
// place. Each transition also logs the matching system event (kickoff/halftime/
// second_half) at the minute computed from the *previous* period, so the event
// timeline reads correctly (e.g. halftime logs at ~half_length_minutes, not 0).
export async function setMatchPeriodDb(matchId: string, payload: { period?: string }, actor: Actor) {
  const period = String(payload.period || "").trim();
  if (!VALID_PERIODS.has(period)) throw httpError(400, "Faza utakmice nije validna.");

  await transaction(async (client) => {
    const current = await client.query(
      "select id, competition_id, period, period_started_at, half_length_minutes, home_score, away_score from public.matches where id = $1",
      [matchId]
    );
    if (!current.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
    const eventMinute = computeElapsedMinuteServer(current.rows[0]);

    const anchorsClock = period === "first_half" || period === "second_half";
    await client.query(
      `update public.matches set
         period = $2,
         period_started_at = case when $3 then now() else period_started_at end,
         updated_at = now()
       where id = $1`,
      [matchId, period, anchorsClock]
    );

    await client.query(
      `insert into public.match_events (match_id, minute, type, score_home, score_away)
       values ($1, $2, $3, $4, $5)`,
      [
        matchId,
        Math.min(130, Math.max(0, eventMinute)),
        PERIOD_EVENT_TYPE[period],
        Number(current.rows[0].home_score || 0),
        Number(current.rows[0].away_score || 0)
      ]
    );

    return current.rows[0];
  });

  await audit(actor, "match.period", "match", matchId, { period });
  return getMatchDetailDb(matchId);
}

interface UpdateMatchPayload {
  scheduledAt?: string;
  venue?: string;
  round?: number;
  status?: string;
  sponsorId?: string;
  halfLengthMinutes?: number;
}

export async function updateMatchDb(matchId: string, payload: UpdateMatchPayload, actor: Actor) {
  const result = await query(
    `update public.matches set
       scheduled_at = coalesce($2, scheduled_at),
       venue = coalesce($3, venue),
       round = coalesce($4, round),
       status = coalesce($5, status),
       sponsor_id = case when $6 then $7::uuid else sponsor_id end,
       half_length_minutes = coalesce($8, half_length_minutes),
       updated_at = now()
     where id = $1
     returning id, competition_id, scheduled_at`,
    [
      matchId,
      payload.scheduledAt || null,
      payload.venue !== undefined ? String(payload.venue || "").trim() : null,
      payload.round !== undefined ? toNumber(payload.round) : null,
      payload.status !== undefined ? validStatus(payload.status) : null,
      payload.sponsorId !== undefined,
      payload.sponsorId || null,
      payload.halfLengthMinutes !== undefined ? toNumber(payload.halfLengthMinutes) : null
    ]
  );
  if (!result.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
  if (payload.status !== undefined) {
    // Keeps this endpoint consistent with setMatchStatusDb (PATCH .../status) -
    // whichever route a status change comes through, standings/player stats/
    // fantasy scoring must stay in sync rather than only updating for one path.
    await recalculateCompetitionStandings({ query } as unknown as PoolClient, result.rows[0].competition_id);
    await recalculatePlayerSeasonStats({ query } as unknown as PoolClient, result.rows[0].competition_id);
    if (payload.status === "finished") {
      await syncFantasySeasonsForMatch(result.rows[0].competition_id, result.rows[0].scheduled_at, actor).catch(() => undefined);
    }
  }
  await audit(actor, "match.update", "match", matchId, {
    scheduledAt: payload.scheduledAt || null,
    venue: payload.venue || null,
    round: payload.round || null
  });
  return getMatchDetailDb(matchId);
}

interface LineupPlayerInput {
  playerId?: string;
  teamId?: string;
  isStarter?: boolean;
  isGoalkeeper?: boolean;
  pitchX?: number;
  pitch_x?: number;
  pitchY?: number;
  pitch_y?: number;
  shirtNumber?: number;
}

export async function upsertLineupDb(matchId: string, payload: { players?: LineupPlayerInput[] }, actor: Actor) {
  const players = Array.isArray(payload.players) ? payload.players : [];
  if (!players.length) throw httpError(400, "Sastav mora imati igrace.");

  const rows = await transaction(async (client) => {
    await ensureMatch(client, matchId);
    await client.query("delete from public.match_lineups where match_id = $1", [matchId]);
    const inserted = [];
    for (const player of players) {
      const result = await client.query(
        `insert into public.match_lineups
           (match_id, player_id, team_id, is_starter, is_goalkeeper, pitch_x, pitch_y, shirt_number)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id, created_at, updated_at, match_id, team_id, player_id, is_starter, is_goalkeeper, pitch_x, pitch_y, shirt_number`,
        [
          matchId,
          requiredText(player.playerId, "Player ID je obavezan."),
          requiredText(player.teamId, "Team ID je obavezan."),
          Boolean(player.isStarter),
          Boolean(player.isGoalkeeper),
          player.pitchX ?? player.pitch_x ?? null,
          player.pitchY ?? player.pitch_y ?? null,
          player.shirtNumber ? toNumber(player.shirtNumber) : null
        ]
      );
      inserted.push(result.rows[0]);
    }
    return inserted;
  });

  await audit(actor, "match.lineup.upsert", "match", matchId, { count: rows.length });
  return rows.map(normalizeLineup);
}

interface MatchEventPayload {
  type?: string;
  minute?: number;
  teamId?: string;
  playerId?: string;
  relatedPlayerId?: string;
  fantasyPointsDelta?: number;
  text?: string;
}

export async function addMatchEventDb(matchId: string, payload: MatchEventPayload, actor: Actor) {
  const event = await transaction(async (client) => {
    const match = await ensureMatch(client, matchId);
    const type = validEventType(payload.type);
    const minute = toNumber(payload.minute);
    if (minute < 0 || minute > 130) throw httpError(400, "Minut dogadjaja nije validan.");

    const teamId = payload.teamId || null;
    const playerId = payload.playerId || null;
    const relatedPlayerId = payload.relatedPlayerId || null;
    let homeScore = Number(match.home_score || 0);
    let awayScore = Number(match.away_score || 0);

    if (type === "goal") {
      if (teamId === match.home_team_id) homeScore += 1;
      if (teamId === match.away_team_id) awayScore += 1;
    }

    const fantasyDelta = toNumber(payload.fantasyPointsDelta ?? STAT_RULES[type]?.fantasy ?? 0);
    const eventResult = await client.query(
      `insert into public.match_events
         (match_id, minute, type, team_id, player_id, related_player_id, score_home, score_away, text, fantasy_points_delta)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        matchId,
        minute,
        type,
        teamId,
        playerId,
        relatedPlayerId,
        homeScore,
        awayScore,
        String(payload.text || "").trim(),
        fantasyDelta
      ]
    );

    if (type === "goal") {
      await client.query("update public.matches set home_score = $2, away_score = $3, updated_at = now() where id = $1", [
        matchId,
        homeScore,
        awayScore
      ]);
      if (relatedPlayerId && teamId) {
        await incrementPlayerStat(client, matchId, teamId, relatedPlayerId, "assists", 1, 3);
      }
    }

    if (STAT_RULES[type] && playerId && teamId) {
      await incrementPlayerStat(client, matchId, teamId, playerId, STAT_RULES[type].field, STAT_RULES[type].amount, fantasyDelta);
    }

    await recalculateCompetitionStandings(client, match.competition_id);
    return eventResult.rows[0].id;
  });

  await audit(actor, "match.event.create", "matchEvent", event, { matchId, type: payload.type });
  return {
    match: await getMatchDetailDb(matchId),
    event: (await getEvent(event))
  };
}

// One media link per (match, kind) - re-saving (e.g. correcting a stream URL) replaces
// the previous row for that kind rather than piling up duplicates. There's no `id` to
// conflict on for a fresh insert, so the upsert has to be keyed on (match_id, kind)
// explicitly via delete-then-insert inside a transaction.
export async function setMatchMediaDb(matchId: string, payload: { kind?: string; label?: string; url?: string }, actor: Actor) {
  const kind = mediaKind(payload.kind || "youtube");
  const label = String(payload.label || "Snimak utakmice").trim();
  const url = requiredText(payload.url, "Media link je obavezan.");

  const row = await transaction(async (client) => {
    await ensureMatch(client, matchId);
    await client.query("delete from public.media_links where match_id = $1 and kind = $2", [matchId, kind]);
    const result = await client.query(
      `insert into public.media_links (match_id, kind, label, url)
       values ($1, $2, $3, $4)
       returning id, created_at, updated_at, match_id, kind, label, url`,
      [matchId, kind, label, url]
    );
    return result.rows[0];
  });

  await audit(actor, "match.media.upsert", "mediaLink", row.id, { matchId, kind });
  return normalizeMedia(row);
}

interface CreateMatchPayload {
  competitionId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  gameweekId?: string;
  phase?: string;
  groupName?: string;
  round?: number;
  scheduledAt?: string;
  venue?: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  homeFormation?: string;
  awayFormation?: string;
}

export async function createMatchDb(payload: CreateMatchPayload, actor: Actor) {
  const result = await query(
    `insert into public.matches
       (competition_id, home_team_id, away_team_id, gameweek_id, phase, group_name, round, scheduled_at, venue, status, home_score, away_score, home_formation, away_formation)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     returning id`,
    [
      requiredText(payload.competitionId, "Takmicenje je obavezno."),
      requiredText(payload.homeTeamId, "Domacin je obavezan."),
      requiredText(payload.awayTeamId, "Gost je obavezan."),
      payload.gameweekId || null,
      String(payload.phase || "group"),
      String(payload.groupName || ""),
      payload.round ? toNumber(payload.round) : null,
      requiredText(payload.scheduledAt, "Datum utakmice je obavezan."),
      String(payload.venue || "").trim(),
      validStatus(payload.status || "scheduled"),
      toNumber(payload.homeScore),
      toNumber(payload.awayScore),
      String(payload.homeFormation || "").trim(),
      String(payload.awayFormation || "").trim()
    ]
  );
  await audit(actor, "match.create", "match", result.rows[0].id, {});
  return getMatchDetailDb(result.rows[0].id);
}

async function incrementPlayerStat(client: PoolClient, matchId: string, teamId: string, playerId: string, field: string, amount: number, fantasyDelta: number) {
  await client.query(
    `insert into public.player_match_stats
       (match_id, team_id, player_id, ${field}, fantasy_points)
     values ($1, $2, $3, $4, $5)
     on conflict (match_id, player_id) do update set
       ${field} = public.player_match_stats.${field} + excluded.${field},
       fantasy_points = public.player_match_stats.fantasy_points + excluded.fantasy_points,
       updated_at = now()`,
    [matchId, teamId, playerId, amount, fantasyDelta]
  );
}

async function ensureMatch(client: PoolClient, matchId: string) {
  const result = await client.query("select * from public.matches where id = $1 for update", [matchId]);
  if (!result.rows[0]) throw httpError(404, "Utakmica nije pronadjena.");
  return result.rows[0];
}

export async function recalculateCompetitionStandings(client: PoolClient, competitionId: string | null) {
  if (!competitionId) return;
  const teams = await client.query(
    `select id, name, coalesce(group_name, '') as group_name
     from public.teams
     where competition_id = $1 and is_active = true
     order by coalesce(group_name, ''), name`,
    [competitionId]
  );
  const rows = new Map<string, any>();
  const keyFor = (teamId: string, groupName = "") => `${teamId}:${groupName || ""}`;
  for (const team of teams.rows) {
    rows.set(keyFor(team.id, team.group_name), {
      teamId: team.id,
      teamName: team.name,
      groupName: team.group_name || "",
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0
    });
  }

  const matches = await client.query(
    `select id, home_team_id, away_team_id, coalesce(group_name, '') as group_name, home_score, away_score
     from public.matches
     where competition_id = $1
       and status = 'finished'
       and home_team_id is not null
       and away_team_id is not null
       and phase not in ('knockout', 'third_place')`,
    [competitionId]
  );

  const ensureRow = (teamId: string, groupName: string) => {
    const team = teams.rows.find((item) => item.id === teamId);
    const key = keyFor(teamId, groupName || team?.group_name || "");
    if (!rows.has(key)) {
      rows.set(key, {
        teamId,
        teamName: team?.name || "",
        groupName: groupName || team?.group_name || "",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    }
    return rows.get(key);
  };

  for (const match of matches.rows) {
    const groupName = match.group_name || "";
    const home = ensureRow(match.home_team_id, groupName);
    const away = ensureRow(match.away_team_id, groupName);
    const homeScore = Number(match.home_score || 0);
    const awayScore = Number(match.away_score || 0);
    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const standings = [...rows.values()].map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst
  }));
  const byGroup = standings.reduce((groups: Record<string, any[]>, row) => {
    const key = row.groupName || "";
    groups[key] ||= [];
    groups[key].push(row);
    return groups;
  }, {});
  for (const groupRows of Object.values(byGroup)) {
    groupRows
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.teamName.localeCompare(b.teamName, "sr")
      )
      .forEach((row, index) => {
        row.position = index + 1;
      });
  }

  for (const row of standings) {
    await client.query(
      `insert into public.team_standings
         (competition_id, team_id, group_name, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (competition_id, team_id, group_name) do update set
         played = excluded.played,
         wins = excluded.wins,
         draws = excluded.draws,
         losses = excluded.losses,
         goals_for = excluded.goals_for,
         goals_against = excluded.goals_against,
         goal_difference = excluded.goal_difference,
         points = excluded.points,
         position = excluded.position,
         updated_at = now()`,
      [
        competitionId,
        row.teamId,
        row.groupName,
        row.played,
        row.wins,
        row.draws,
        row.losses,
        row.goalsFor,
        row.goalsAgainst,
        row.goalDifference,
        row.points,
        row.position
      ]
    );
  }
}

// player_season_stats backs the leaders/search screens and the fantasy pool's
// base-price calculation, but nothing wrote to it from live play before this -
// only the one-off historical import script did. Called alongside
// recalculateCompetitionStandings so a finished match immediately shows up
// there too, the same way it already does for the league table.
export async function recalculatePlayerSeasonStats(client: PoolClient, competitionId: string | null) {
  if (!competitionId) return;

  const finishedMatches = await client.query(
    "select id from public.matches where competition_id = $1 and status = 'finished'",
    [competitionId]
  );
  const matchIds = finishedMatches.rows.map((row) => row.id);

  const players = await client.query(
    `select p.id, tr.team_id
     from public.players p
     join public.team_rosters tr on tr.player_id = p.id and tr.is_active = true
     join public.teams t on t.id = tr.team_id
     where t.competition_id = $1 and p.is_active = true`,
    [competitionId]
  );

  const appearances = new Map<string, number>();
  const stats = new Map<string, any>();

  if (matchIds.length) {
    const lineupRows = await client.query(
      `select player_id, count(distinct match_id)::int as appearances
       from public.match_lineups
       where match_id = any($1::uuid[])
       group by player_id`,
      [matchIds]
    );
    for (const row of lineupRows.rows) appearances.set(row.player_id, Number(row.appearances));

    const statRows = await client.query(
      `select player_id,
              coalesce(sum(goals), 0)::int as goals,
              coalesce(sum(assists), 0)::int as assists,
              coalesce(sum(shots), 0)::int as shots,
              coalesce(sum(shots_on_target), 0)::int as shots_on_target,
              coalesce(sum(saves), 0)::int as saves,
              coalesce(sum(goals_conceded), 0)::int as goals_conceded,
              coalesce(sum(yellow_cards), 0)::int as yellow_cards,
              coalesce(sum(red_cards), 0)::int as red_cards,
              coalesce(sum(fouls), 0)::int as fouls,
              coalesce(sum(two_minutes), 0)::int as two_minutes,
              coalesce(sum(fantasy_points), 0)::int as fantasy_points,
              coalesce(sum(own_goals), 0)::int as own_goals,
              coalesce(sum(penalties), 0)::int as penalties,
              coalesce(sum(penalty_goals), 0)::int as penalty_goals,
              coalesce(sum(penalty_saves), 0)::int as penalty_saves,
              coalesce(sum(penalty_misses), 0)::int as penalty_misses
       from public.player_match_stats
       where match_id = any($1::uuid[])
       group by player_id`,
      [matchIds]
    );
    for (const row of statRows.rows) stats.set(row.player_id, row);
  }

  for (const player of players.rows) {
    const s = stats.get(player.id) || {};
    await client.query(
      `insert into public.player_season_stats
         (competition_id, team_id, player_id, appearances, goals, assists, shots, shots_on_target, saves,
          goals_conceded, yellow_cards, red_cards, fouls, two_minutes, fantasy_points, own_goals,
          penalties, penalty_goals, penalty_saves, penalty_misses)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (competition_id, player_id) do update set
         team_id = excluded.team_id,
         appearances = excluded.appearances,
         goals = excluded.goals,
         assists = excluded.assists,
         shots = excluded.shots,
         shots_on_target = excluded.shots_on_target,
         saves = excluded.saves,
         goals_conceded = excluded.goals_conceded,
         yellow_cards = excluded.yellow_cards,
         red_cards = excluded.red_cards,
         fouls = excluded.fouls,
         two_minutes = excluded.two_minutes,
         fantasy_points = excluded.fantasy_points,
         own_goals = excluded.own_goals,
         penalties = excluded.penalties,
         penalty_goals = excluded.penalty_goals,
         penalty_saves = excluded.penalty_saves,
         penalty_misses = excluded.penalty_misses,
         updated_at = now()`,
      [
        competitionId,
        player.team_id,
        player.id,
        appearances.get(player.id) || 0,
        Number(s.goals || 0),
        Number(s.assists || 0),
        Number(s.shots || 0),
        Number(s.shots_on_target || 0),
        Number(s.saves || 0),
        Number(s.goals_conceded || 0),
        Number(s.yellow_cards || 0),
        Number(s.red_cards || 0),
        Number(s.fouls || 0),
        Number(s.two_minutes || 0),
        Number(s.fantasy_points || 0),
        Number(s.own_goals || 0),
        Number(s.penalties || 0),
        Number(s.penalty_goals || 0),
        Number(s.penalty_saves || 0),
        Number(s.penalty_misses || 0)
      ]
    );
  }
}

// Only the season-based fantasy system (fantasy_seasons/fantasy_gameweeks) is
// actually used by the mobile app today - the older per-competition gameweek
// system has no live caller, so it's deliberately not wired up here. Re-syncs
// pricing and re-scores every fantasy gameweek whose date window covers this
// match for every fantasy season this competition belongs to.
async function syncFantasySeasonsForMatch(competitionId: string | null, scheduledAt: string, actor: Actor) {
  if (!competitionId) return;
  const seasons = await query(
    "select fantasy_season_id from public.fantasy_season_competitions where competition_id = $1",
    [competitionId]
  );
  for (const { fantasy_season_id: seasonId } of seasons.rows) {
    await syncFantasySeasonPool(seasonId, actor).catch(() => undefined);
    const gameweeks = await query(
      `select id from public.fantasy_gameweeks
       where fantasy_season_id = $1 and starts_at <= $2 and coalesce(ends_at, locks_at) >= $2`,
      [seasonId, scheduledAt]
    );
    for (const gameweek of gameweeks.rows) {
      await scoreFantasySeasonGameweek(gameweek.id, actor).catch(() => undefined);
    }
  }
}

async function getEvent(eventId: string) {
  const result = await query(
    `select e.id, e.created_at, e.updated_at, e.match_id, e.minute, e.type, e.team_id,
            t.name as team_name, e.player_id, p.display_name as player_name,
            e.related_player_id, rp.display_name as related_player_name,
            e.score_home, e.score_away, e.text, e.fantasy_points_delta
     from public.match_events e
     left join public.teams t on t.id = e.team_id
     left join public.players p on p.id = e.player_id
     left join public.players rp on rp.id = e.related_player_id
     where e.id = $1`,
    [eventId]
  );
  return normalizeEvent(result.rows[0]);
}

async function audit(actor: Actor | null, action: string, entityType: string, entityId: string, metadata: unknown) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function matchBaseSql(whereClause: string): string {
  return `select m.id, m.created_at, m.updated_at, m.competition_id,
                 c.name as competition_name_raw, c.season_name,
                 m.home_team_id, ht.name as home_team_name, ht.short_name as home_team_short_name, ht.logo_url as home_team_logo_url,
                 m.away_team_id, at.name as away_team_name, at.short_name as away_team_short_name, at.logo_url as away_team_logo_url,
                 m.gameweek_id, g.name as gameweek_name, m.phase, m.group_name, m.round, m.scheduled_at, m.venue, m.status,
                 m.home_score, m.away_score, m.home_formation, m.away_formation, m.sponsor_id,
                 m.period, m.period_started_at, m.half_length_minutes,
                 s.title as sponsor_title, s.subtitle as sponsor_subtitle, s.logo_url as sponsor_logo_url, s.target_url as sponsor_target_url
          from public.matches m
          left join public.competitions c on c.id = m.competition_id
          left join public.gameweeks g on g.id = m.gameweek_id
          left join public.teams ht on ht.id = m.home_team_id
          left join public.teams at on at.id = m.away_team_id
          left join public.sponsors s on s.id = m.sponsor_id
          ${whereClause}`;
}

function normalizeMatch(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    competitionId: row.competition_id,
    competitionName: row.competition_name_raw ? `${row.competition_name_raw} - ${row.season_name}` : row.competition_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeTeamName: row.home_team_name || row.home_team_id,
    awayTeamName: row.away_team_name || row.away_team_id,
    homeTeamShortName: row.home_team_short_name || "",
    awayTeamShortName: row.away_team_short_name || "",
    homeTeamLogoUrl: row.home_team_logo_url || "",
    awayTeamLogoUrl: row.away_team_logo_url || "",
    gameweekId: row.gameweek_id || "",
    gameweekName: row.gameweek_name || "",
    phase: row.phase,
    groupName: row.group_name || "",
    round: row.round,
    scheduledAt: row.scheduled_at,
    venue: row.venue || "",
    status: row.status,
    homeScore: Number(row.home_score || 0),
    awayScore: Number(row.away_score || 0),
    homeFormation: row.home_formation || "",
    awayFormation: row.away_formation || "",
    sponsorId: row.sponsor_id || "",
    period: row.period || "not_started",
    periodStartedAt: row.period_started_at || "",
    halfLengthMinutes: Number(row.half_length_minutes || 20),
    sponsor: row.sponsor_id
      ? {
          id: row.sponsor_id,
          title: row.sponsor_title || "",
          subtitle: row.sponsor_subtitle || "",
          logoUrl: row.sponsor_logo_url || "",
          targetUrl: row.sponsor_target_url || ""
        }
      : null
  };
}

function normalizeLineup(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchId: row.match_id,
    teamId: row.team_id,
    teamName: row.team_name || "",
    playerId: row.player_id,
    playerName: row.player_name || "",
    position: row.position || "",
    avatarUrl: row.avatar_url || "",
    isStarter: row.is_starter,
    isGoalkeeper: row.is_goalkeeper,
    startedOnBench: !row.is_starter,
    pitchX: row.pitch_x === null ? null : Number(row.pitch_x),
    pitchY: row.pitch_y === null ? null : Number(row.pitch_y),
    shirtNumber: row.shirt_number
  };
}

function normalizeEvent(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchId: row.match_id,
    minute: row.minute,
    type: row.type,
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    playerId: row.player_id || "",
    playerName: row.player_name || "",
    relatedPlayerId: row.related_player_id || "",
    relatedPlayerName: row.related_player_name || "",
    scoreHome: row.score_home,
    scoreAway: row.score_away,
    text: row.text || "",
    fantasyPointsDelta: row.fantasy_points_delta
  };
}

function normalizePlayerStats(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchId: row.match_id,
    teamId: row.team_id,
    teamName: row.team_name || "",
    playerId: row.player_id,
    playerName: row.player_name || "",
    position: row.position || "",
    goals: row.goals,
    assists: row.assists,
    shots: row.shots,
    shotsOnTarget: row.shots_on_target,
    shotsOffTarget: row.shots_off_target,
    saves: row.saves,
    goalsConceded: row.goals_conceded,
    cornersWon: row.corners_won,
    fouls: row.fouls,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    twoMinutes: row.two_minutes,
    ownGoals: row.own_goals,
    penalties: row.penalties,
    penaltyGoals: row.penalty_goals,
    penaltySaves: row.penalty_saves,
    penaltyMisses: row.penalty_misses,
    fantasyPoints: row.fantasy_points
  };
}

function normalizeMedia(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchId: row.match_id,
    kind: row.kind,
    label: row.label,
    url: row.url
  };
}

// Mirrors apps/mobile/src/utils/matchClock.ts computeElapsedMinute - used here
// only to timestamp the automatic kickoff/halftime/second_half/fulltime events
// server-side at the moment of transition, not for any live ticking.
function computeElapsedMinuteServer(row: any): number {
  const halfLength = Number(row.half_length_minutes || 20);
  if (row.period === "halftime") return halfLength;
  if ((row.period === "first_half" || row.period === "second_half") && row.period_started_at) {
    const elapsed = Math.floor((Date.now() - new Date(row.period_started_at).getTime()) / 60000);
    return row.period === "first_half" ? Math.min(halfLength, elapsed) : halfLength + elapsed;
  }
  return 0;
}

function validStatus(status: unknown): string {
  const normalized = String(status || "").trim();
  if (!VALID_MATCH_STATUSES.has(normalized)) throw httpError(400, "Status utakmice nije validan.");
  return normalized;
}

function validEventType(type: unknown): string {
  const normalized = String(type || "").trim();
  if (!VALID_EVENT_TYPES.has(normalized)) throw httpError(400, "Tip dogadjaja nije validan.");
  return normalized;
}

function mediaKind(kind: unknown): string {
  const normalized = String(kind || "youtube").trim();
  return ["image", "video", "youtube", "link"].includes(normalized) ? normalized : "link";
}

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
