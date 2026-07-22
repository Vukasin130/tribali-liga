import { randomUUID } from "node:crypto";
import { hasDatabase } from "./db.mjs";
import {
  addMatchEventDb,
  createMatchDb,
  getMatchDetailDb,
  listLiveMatchesDb,
  setMatchMediaDb,
  setMatchStatusDb,
  submitMatchPredictionDb,
  updateMatchDb,
  upsertLineupDb
} from "./matches-db.mjs";
import { mutateDatabase, timestamp } from "./store.mjs";

export async function listLiveMatches() {
  if (hasDatabase()) return listLiveMatchesDb();
  return mutateDatabase((db) => db.matches
    .filter((match) => match.status === "live")
    .map((match) => enrichMatch(db, match)));
}

export async function getMatchDetail(matchId, user) {
  if (hasDatabase()) return getMatchDetailDb(matchId, user);
  return mutateDatabase((db) => {
    const match = findById(db.matches, matchId, "Utakmica nije pronadjena.");
    return {
      ...enrichMatch(db, match),
      lineups: db.matchLineups.filter((item) => item.matchId === matchId),
      events: db.matchEvents
        .filter((item) => item.matchId === matchId)
        .sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0)),
      playerStats: db.playerMatchStats.filter((item) => item.matchId === matchId),
      media: db.mediaLinks.filter((item) => item.matchId === matchId),
      predictions: { home: 0, draw: 0, away: 0, total: 0, homePercent: 0, drawPercent: 0, awayPercent: 0, userPick: "" }
    };
  });
}

export async function submitMatchPrediction(matchId, payload, user) {
  if (hasDatabase()) return submitMatchPredictionDb(matchId, payload, user);
  throw httpError(501, "Predikcije zahtevaju bazu podataka.");
}

export async function setMatchStatus(matchId, payload, actor) {
  if (hasDatabase()) return setMatchStatusDb(matchId, payload, actor);
  return mutateDatabase((db) => {
    const match = findById(db.matches, matchId, "Utakmica nije pronadjena.");
    const status = String(payload.status || "");
    if (!["scheduled", "live", "finished", "postponed"].includes(status)) {
      throw httpError(400, "Status utakmice nije validan.");
    }
    match.status = status;
    if (payload.homeScore !== undefined) match.homeScore = toNumber(payload.homeScore);
    if (payload.awayScore !== undefined) match.awayScore = toNumber(payload.awayScore);
    match.updatedAt = timestamp();
    audit(db, actor, "match.status", "match", match.id, { status });
    return enrichMatch(db, match);
  });
}

export async function updateMatch(matchId, payload, actor) {
  if (hasDatabase()) return updateMatchDb(matchId, payload, actor);
  return mutateDatabase((db) => {
    const match = findById(db.matches, matchId, "Utakmica nije pronadjena.");
    if (payload.scheduledAt !== undefined) match.scheduledAt = requiredText(payload.scheduledAt, "Datum utakmice je obavezan.");
    if (payload.venue !== undefined) match.venue = String(payload.venue || "").trim();
    if (payload.round !== undefined) match.round = toNumber(payload.round);
    if (payload.status !== undefined) {
      const status = String(payload.status || "");
      if (!["scheduled", "live", "finished", "postponed", "cancelled"].includes(status)) {
        throw httpError(400, "Status utakmice nije validan.");
      }
      match.status = status;
    }
    match.updatedAt = timestamp();
    audit(db, actor, "match.update", "match", match.id, {
      scheduledAt: match.scheduledAt,
      venue: match.venue,
      round: match.round
    });
    return enrichMatch(db, match);
  });
}

export async function upsertLineup(matchId, payload, actor) {
  if (hasDatabase()) return upsertLineupDb(matchId, payload, actor);
  return mutateDatabase((db) => {
    findById(db.matches, matchId, "Utakmica nije pronadjena.");
    const players = Array.isArray(payload.players) ? payload.players : [];
    if (!players.length) throw httpError(400, "Sastav mora imati igrace.");
    db.matchLineups = db.matchLineups.filter((item) => item.matchId !== matchId);
    const rows = players.map((player) => ({
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      matchId,
      playerId: requiredText(player.playerId, "Player ID je obavezan."),
      teamId: requiredText(player.teamId, "Team ID je obavezan."),
      isStarter: Boolean(player.isStarter),
      isGoalkeeper: Boolean(player.isGoalkeeper),
      startedOnBench: !Boolean(player.isStarter),
      shirtNumber: player.shirtNumber ? toNumber(player.shirtNumber) : undefined
    }));
    db.matchLineups.push(...rows);
    audit(db, actor, "match.lineup.upsert", "match", matchId, { count: rows.length });
    return rows;
  });
}

export async function addMatchEvent(matchId, payload, actor) {
  if (hasDatabase()) return addMatchEventDb(matchId, payload, actor);
  return mutateDatabase((db) => {
    const match = findById(db.matches, matchId, "Utakmica nije pronadjena.");
    const event = {
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      matchId,
      minute: toNumber(payload.minute),
      type: requiredText(payload.type, "Tip dogadjaja je obavezan."),
      teamId: String(payload.teamId || ""),
      playerId: String(payload.playerId || ""),
      relatedPlayerId: String(payload.relatedPlayerId || ""),
      text: String(payload.text || "").trim(),
      fantasyPointsDelta: toNumber(payload.fantasyPointsDelta)
    };

    validateEvent(event);
    applyEventToMatch(db, match, event);
    db.matchEvents.push(event);
    match.updatedAt = timestamp();
    audit(db, actor, "match.event.create", "matchEvent", event.id, { matchId, type: event.type });
    return { match: enrichMatch(db, match), event };
  });
}

export async function setMatchMedia(matchId, payload, actor) {
  if (hasDatabase()) return setMatchMediaDb(matchId, payload, actor);
  return mutateDatabase((db) => {
    findById(db.matches, matchId, "Utakmica nije pronadjena.");
    const kind = String(payload.kind || "youtube");
    const existing = db.mediaLinks.find((item) => item.matchId === matchId && item.kind === kind);
    const item = existing || {
      id: randomUUID(),
      createdAt: timestamp(),
      matchId,
      kind
    };
    item.updatedAt = timestamp();
    item.url = requiredText(payload.url, "Media link je obavezan.");
    item.label = String(payload.label || "Snimak utakmice").trim();
    if (!existing) db.mediaLinks.push(item);
    audit(db, actor, "match.media.upsert", "mediaLink", item.id, { matchId, kind });
    return item;
  });
}

export async function createMatch(payload, actor) {
  if (hasDatabase()) return createMatchDb(payload, actor);
  return mutateDatabase((db) => {
    const item = {
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      competitionId: requiredText(payload.competitionId, "Takmicenje je obavezno."),
      homeTeamId: requiredText(payload.homeTeamId, "Domacin je obavezan."),
      awayTeamId: requiredText(payload.awayTeamId, "Gost je obavezan."),
      phase: String(payload.phase || "group"),
      groupName: String(payload.groupName || ""),
      round: payload.round ? toNumber(payload.round) : undefined,
      scheduledAt: requiredText(payload.scheduledAt, "Datum utakmice je obavezan."),
      venue: String(payload.venue || "").trim(),
      status: payload.status || "scheduled",
      homeScore: toNumber(payload.homeScore),
      awayScore: toNumber(payload.awayScore),
      videoUrl: String(payload.videoUrl || "").trim()
    };
    db.matches.push(item);
    audit(db, actor, "match.create", "match", item.id, { homeTeamId: item.homeTeamId, awayTeamId: item.awayTeamId });
    return enrichMatch(db, item);
  });
}

function applyEventToMatch(db, match, event) {
  if (event.type === "goal") {
    if (event.teamId === match.homeTeamId) match.homeScore = toNumber(match.homeScore) + 1;
    if (event.teamId === match.awayTeamId) match.awayScore = toNumber(match.awayScore) + 1;
    incrementStat(db, event, "goals", 1, 5);
    if (event.relatedPlayerId) incrementStat(db, { ...event, playerId: event.relatedPlayerId }, "assists", 1, 3);
  }
  if (event.type === "shot_on_target") incrementStat(db, event, "shotsOnTarget", 1, 1);
  if (event.type === "goalkeeper_save") incrementStat(db, event, "saves", 1, 1);
  if (event.type === "corner") incrementStat(db, event, "cornersWon", 1, 0);
  if (event.type === "foul") incrementStat(db, event, "fouls", 1, 0);
  if (event.type === "yellow_card") incrementStat(db, event, "yellowCards", 1, -1);
  if (event.type === "red_card") incrementStat(db, event, "redCards", 1, -3);
}

function incrementStat(db, event, field, amount, fantasyDelta) {
  if (!event.playerId || !event.teamId) return;
  let stat = db.playerMatchStats.find((item) => item.matchId === event.matchId && item.playerId === event.playerId);
  if (!stat) {
    stat = {
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      matchId: event.matchId,
      playerId: event.playerId,
      teamId: event.teamId,
      goals: 0,
      assists: 0,
      shotsOnTarget: 0,
      saves: 0,
      cornersWon: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      fantasyPoints: 0
    };
    db.playerMatchStats.push(stat);
  }
  stat[field] = toNumber(stat[field]) + amount;
  stat.fantasyPoints = toNumber(stat.fantasyPoints) + fantasyDelta;
  stat.updatedAt = timestamp();
}

function enrichMatch(db, match) {
  const homeTeam = db.teams.find((team) => team.id === match.homeTeamId);
  const awayTeam = db.teams.find((team) => team.id === match.awayTeamId);
  const competition = db.competitions.find((item) => item.id === match.competitionId);
  return {
    ...match,
    homeTeamName: homeTeam?.name || match.homeTeamId,
    awayTeamName: awayTeam?.name || match.awayTeamId,
    competitionName: competition ? `${competition.name} - ${competition.seasonName}` : match.competitionId
  };
}

function validateEvent(event) {
  const validTypes = new Set([
    "kickoff",
    "goal",
    "assist",
    "shot_on_target",
    "goalkeeper_save",
    "corner",
    "foul",
    "yellow_card",
    "red_card",
    "substitution",
    "halftime",
    "fulltime"
  ]);
  if (!validTypes.has(event.type)) throw httpError(400, "Tip dogadjaja nije validan.");
  if (event.minute < 0 || event.minute > 130) throw httpError(400, "Minut dogadjaja nije validan.");
}

function findById(items, id, message) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw httpError(404, message);
  return item;
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function audit(db, actor, action, entityType, entityId, metadata) {
  db.auditLogs.push({
    id: randomUUID(),
    createdAt: timestamp(),
    updatedAt: timestamp(),
    actorUserId: actor.id,
    action,
    entityType,
    entityId,
    metadata
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
