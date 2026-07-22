import http from "node:http";
import { bearerToken, getSessionUser, loginUser, logoutUser, registerUser, requireAdmin } from "./auth.mjs";
import { config, storageMode } from "./config.mjs";
import {
  createNewsPost,
  createStory,
  createStoryFolder,
  deleteNewsPost,
  deleteStory,
  deleteStoryFolder,
  getActiveSponsor,
  getStoryStats,
  listActiveStories,
  listPublishedNews,
  listStoryFolders,
  markStoryViewed,
  toggleStoryLike,
  updateNewsPost,
  updateSponsor,
  updateStoryFolder
} from "./content.mjs";
import {
  addMatchEvent,
  createMatch,
  getMatchDetail,
  listLiveMatches,
  setMatchMedia,
  setMatchStatus,
  submitMatchPrediction,
  updateMatch,
  upsertLineup
} from "./matches.mjs";
import {
  createGoalPoll,
  finishGoalPoll,
  getCurrentGoalPoll,
  getGoalPoll,
  getGoalPollStats,
  setGoalPollStatus,
  updateGoalPoll,
  voteGoalPoll
} from "./goal-polls.mjs";
import {
  assignMatchesToGameweek,
  createGameweek,
  getFantasyLeaderboard,
  getFantasyTeam,
  listGameweeks,
  scoreFantasyGameweek,
  setFantasyPicks,
  updateGameweek
} from "./fantasy.mjs";
import {
  createFantasyGameweek,
  createFantasySeason,
  getFantasySeason,
  getFantasySeasonLeaderboard,
  getFantasySeasonTeam,
  getFantasySeasonTeamById,
  listFantasyGameweeks,
  listFantasySeasonPlayerPool,
  listFantasySeasons,
  scoreFantasySeasonGameweek,
  setFantasySeasonPicks,
  syncFantasySeasonPool,
  updateFantasyGameweek,
  updateFantasySeason
} from "./fantasy-seasons.mjs";
import {
  createCity,
  createCompetition,
  createPlayer,
  createTeam,
  deleteCompetition,
  getCompetition,
  getCompetitionLeaders,
  getCompetitionStandings,
  getPlayerProfile,
  getTeamProfile,
  listCities,
  listCompetitionTeams,
  listCompetitions,
  listPlayers,
  updateCompetition,
  updatePlayer,
  updateTeam
} from "./sports-data.mjs";
import {
  addTeamsToCompetition,
  advanceKnockoutPhase,
  assignCompetitionGroups,
  cloneCompetitionTeams,
  configureCompetition,
  generateCompetitionSchedule,
  getCompetitionSetup,
  prepareKnockoutPhase,
  upsertScheduleSlots
} from "./competition-builder.mjs";
import {
  activateCompetitionSeason,
  getSeasonHub,
  listFantasyPlayerPool,
  syncFantasyPlayerPool
} from "./season-hub.mjs";
import {
  createVerificationRequest,
  getOwnProfile,
  getProfileArchive,
  listMyVerificationRequests,
  listVerificationRequests,
  reviewVerificationRequest,
  updateOwnProfile
} from "./verification.mjs";
import { createUploadTarget } from "./uploads.mjs";
import { getLiveOverview, getRealtimeConfig } from "./realtime.mjs";
import { databaseHealth } from "./db.mjs";
import { cleanupRateLimitBuckets, rateLimit } from "./rate-limit.mjs";

const VERSION = "0.1.0";

setInterval(cleanupRateLimitBuckets, 60 * 1000).unref();

const server = http.createServer(async (req, res) => {
  try {
    setBaseHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    protectRoute(req, url);

    if (req.method === "GET" && url.pathname === "/health") {
      const db = await databaseHealth();
      sendJson(res, 200, {
        ok: true,
        data: {
          service: "tribali-liga-api",
          status: db.enabled && !db.ok ? "degraded" : "ok",
          storage: storageMode(),
          database: db,
          version: VERSION,
          checkedAt: new Date().toISOString()
        }
      });
      return;
    }

    if (url.pathname === "/auth/register" && req.method === "POST") {
      const user = await registerUser(await readJson(req));
      sendJson(res, 201, { ok: true, data: user });
      return;
    }

    if (url.pathname === "/auth/login" && req.method === "POST") {
      const session = await loginUser(await readJson(req));
      sendJson(res, 200, { ok: true, data: session });
      return;
    }

    if (url.pathname === "/auth/session" && req.method === "GET") {
      const user = await getSessionUser(bearerToken(req));
      sendJson(res, user ? 200 : 401, user ? { ok: true, data: user } : { ok: false, data: null, error: "Session expired" });
      return;
    }

    if (url.pathname === "/auth/logout" && req.method === "POST") {
      const result = await logoutUser(bearerToken(req));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    const token = bearerToken(req);
    const sessionUser = token ? await getSessionUser(token) : null;

    if (url.pathname === "/profile" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getOwnProfile(sessionUser) });
      return;
    }

    if (url.pathname === "/profile" && req.method === "PATCH") {
      sendJson(res, 200, { ok: true, data: await updateOwnProfile(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/profile/archive" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getProfileArchive(sessionUser) });
      return;
    }

    if (url.pathname === "/profile/verifications" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listMyVerificationRequests(sessionUser) });
      return;
    }

    if (url.pathname === "/profile/verifications" && req.method === "POST") {
      sendJson(res, 201, { ok: true, data: await createVerificationRequest(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/admin/verifications" && req.method === "GET") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await listVerificationRequests({ status: url.searchParams.get("status") || "" }) });
      return;
    }

    const adminVerificationMatch = url.pathname.match(/^\/admin\/verifications\/([^/]+)$/);
    if (adminVerificationMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await reviewVerificationRequest(adminVerificationMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/cities" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listCities() });
      return;
    }

    if (url.pathname === "/admin/cities" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createCity(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/competitions" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await listCompetitions({
          cityId: url.searchParams.get("cityId") || "",
          status: url.searchParams.get("status") || ""
        })
      });
      return;
    }

    if (url.pathname === "/seasons" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getSeasonHub(url.searchParams.get("competitionId") || "") });
      return;
    }

    const seasonDetailMatch = url.pathname.match(/^\/seasons\/([^/]+)$/);
    if (seasonDetailMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getSeasonHub(seasonDetailMatch[1]) });
      return;
    }

    if (url.pathname === "/admin/competitions" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createCompetition(await readJson(req), sessionUser) });
      return;
    }

    const competitionMatch = url.pathname.match(/^\/competitions\/([^/]+)$/);
    if (competitionMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getCompetition(competitionMatch[1]) });
      return;
    }

    const competitionSetupMatch = url.pathname.match(/^\/competitions\/([^/]+)\/setup$/);
    if (competitionSetupMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getCompetitionSetup(competitionSetupMatch[1]) });
      return;
    }

    const competitionTeamsMatch = url.pathname.match(/^\/competitions\/([^/]+)\/teams$/);
    if (competitionTeamsMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listCompetitionTeams(competitionTeamsMatch[1]) });
      return;
    }

    if (url.pathname === "/teams" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listCompetitionTeams("") });
      return;
    }

    const competitionStandingsMatch = url.pathname.match(/^\/competitions\/([^/]+)\/standings$/);
    if (competitionStandingsMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getCompetitionStandings(competitionStandingsMatch[1]) });
      return;
    }

    const competitionLeadersMatch = url.pathname.match(/^\/competitions\/([^/]+)\/leaders$/);
    if (competitionLeadersMatch && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await getCompetitionLeaders(competitionLeadersMatch[1], url.searchParams.get("category") || "goals")
      });
      return;
    }

    const adminCompetitionMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)$/);
    if (adminCompetitionMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateCompetition(adminCompetitionMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (adminCompetitionMatch && req.method === "DELETE") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await deleteCompetition(adminCompetitionMatch[1], sessionUser) });
      return;
    }

    const adminCompetitionConfigureMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/configure$/);
    if (adminCompetitionConfigureMatch && req.method === "PUT") {
      requireAdmin(sessionUser);
      sendJson(res, 200, {
        ok: true,
        data: await configureCompetition(adminCompetitionConfigureMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionTeamsMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/teams$/);
    if (adminCompetitionTeamsMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, {
        ok: true,
        data: await addTeamsToCompetition(adminCompetitionTeamsMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionCloneTeamsMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/clone-teams$/);
    if (adminCompetitionCloneTeamsMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, {
        ok: true,
        data: await cloneCompetitionTeams(adminCompetitionCloneTeamsMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionGroupsMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/groups$/);
    if (adminCompetitionGroupsMatch && req.method === "PUT") {
      requireAdmin(sessionUser);
      sendJson(res, 200, {
        ok: true,
        data: await assignCompetitionGroups(adminCompetitionGroupsMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionSlotsMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/schedule-slots$/);
    if (adminCompetitionSlotsMatch && req.method === "PUT") {
      requireAdmin(sessionUser);
      sendJson(res, 200, {
        ok: true,
        data: await upsertScheduleSlots(adminCompetitionSlotsMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionGenerateScheduleMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/generate-schedule$/);
    if (adminCompetitionGenerateScheduleMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, {
        ok: true,
        data: await generateCompetitionSchedule(adminCompetitionGenerateScheduleMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionKnockoutMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/prepare-knockout$/);
    if (adminCompetitionKnockoutMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, {
        ok: true,
        data: await prepareKnockoutPhase(adminCompetitionKnockoutMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionAdvanceKnockoutMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/advance-knockout$/);
    if (adminCompetitionAdvanceKnockoutMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, {
        ok: true,
        data: await advanceKnockoutPhase(adminCompetitionAdvanceKnockoutMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    const adminCompetitionSyncFantasyMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/sync-fantasy-pool$/);
    if (adminCompetitionSyncFantasyMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, {
        ok: true,
        data: await syncFantasyPlayerPool(adminCompetitionSyncFantasyMatch[1], sessionUser)
      });
      return;
    }

    const adminCompetitionActivateMatch = url.pathname.match(/^\/admin\/competitions\/([^/]+)\/activate$/);
    if (adminCompetitionActivateMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, {
        ok: true,
        data: await activateCompetitionSeason(adminCompetitionActivateMatch[1], await readJson(req), sessionUser)
      });
      return;
    }

    if (url.pathname === "/players" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await listPlayers({
          teamId: url.searchParams.get("teamId") || "",
          competitionId: url.searchParams.get("competitionId") || ""
        })
      });
      return;
    }

    if (url.pathname === "/admin/teams" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createTeam(await readJson(req), sessionUser) });
      return;
    }

    const teamProfileMatch = url.pathname.match(/^\/teams\/([^/]+)$/);
    if (teamProfileMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getTeamProfile(teamProfileMatch[1]) });
      return;
    }

    const adminTeamMatch = url.pathname.match(/^\/admin\/teams\/([^/]+)$/);
    if (adminTeamMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateTeam(adminTeamMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/admin/players" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createPlayer(await readJson(req), sessionUser) });
      return;
    }

    const playerProfileMatch = url.pathname.match(/^\/players\/([^/]+)$/);
    if (playerProfileMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getPlayerProfile(playerProfileMatch[1]) });
      return;
    }

    const adminPlayerMatch = url.pathname.match(/^\/admin\/players\/([^/]+)$/);
    if (adminPlayerMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updatePlayer(adminPlayerMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/news" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listPublishedNews() });
      return;
    }

    if (url.pathname === "/admin/news" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createNewsPost(await readJson(req), sessionUser) });
      return;
    }

    const adminNewsMatch = url.pathname.match(/^\/admin\/news\/([^/]+)$/);
    if (adminNewsMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateNewsPost(adminNewsMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (adminNewsMatch && req.method === "DELETE") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await deleteNewsPost(adminNewsMatch[1], sessionUser) });
      return;
    }

    if (url.pathname === "/stories/folders" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listStoryFolders() });
      return;
    }

    if (url.pathname === "/stories" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listActiveStories() });
      return;
    }

    if (url.pathname === "/admin/story-folders" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createStoryFolder(await readJson(req), sessionUser) });
      return;
    }

    const adminStoryFolderMatch = url.pathname.match(/^\/admin\/story-folders\/([^/]+)$/);
    if (adminStoryFolderMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateStoryFolder(adminStoryFolderMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (adminStoryFolderMatch && req.method === "DELETE") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await deleteStoryFolder(adminStoryFolderMatch[1], sessionUser) });
      return;
    }

    if (url.pathname === "/admin/stories" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createStory(await readJson(req), sessionUser) });
      return;
    }

    const adminStoryMatch = url.pathname.match(/^\/admin\/stories\/([^/]+)$/);
    if (adminStoryMatch && req.method === "DELETE") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await deleteStory(adminStoryMatch[1], sessionUser) });
      return;
    }

    const storyViewMatch = url.pathname.match(/^\/stories\/([^/]+)\/view$/);
    if (storyViewMatch && req.method === "POST") {
      sendJson(res, 200, { ok: true, data: await markStoryViewed(storyViewMatch[1], sessionUser) });
      return;
    }

    const storyLikeMatch = url.pathname.match(/^\/stories\/([^/]+)\/like$/);
    if (storyLikeMatch && req.method === "POST") {
      sendJson(res, 200, { ok: true, data: await toggleStoryLike(storyLikeMatch[1], sessionUser) });
      return;
    }

    const storyStatsMatch = url.pathname.match(/^\/admin\/stories\/([^/]+)\/stats$/);
    if (storyStatsMatch && req.method === "GET") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await getStoryStats(storyStatsMatch[1]) });
      return;
    }

    if (url.pathname === "/sponsor" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getActiveSponsor() });
      return;
    }

    if (url.pathname === "/admin/sponsor" && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateSponsor(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/uploads/signed-url" && req.method === "POST") {
      sendJson(res, 201, { ok: true, data: await createUploadTarget(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/live/overview" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getLiveOverview(sessionUser) });
      return;
    }

    if (url.pathname === "/realtime/config" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: getRealtimeConfig(sessionUser, {
          matchId: url.searchParams.get("matchId") || "",
          gameweekId: url.searchParams.get("gameweekId") || "",
          pollId: url.searchParams.get("pollId") || "",
          storyId: url.searchParams.get("storyId") || ""
        })
      });
      return;
    }

    if (url.pathname === "/goal-poll" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getCurrentGoalPoll(sessionUser) });
      return;
    }

    const goalPollDetailMatch = url.pathname.match(/^\/goal-polls\/([^/]+)$/);
    if (goalPollDetailMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getGoalPoll(goalPollDetailMatch[1], sessionUser) });
      return;
    }

    const goalPollVoteMatch = url.pathname.match(/^\/goal-polls\/([^/]+)\/vote$/);
    if (goalPollVoteMatch && req.method === "POST") {
      sendJson(res, 200, { ok: true, data: await voteGoalPoll(goalPollVoteMatch[1], await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/admin/goal-polls" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createGoalPoll(await readJson(req), sessionUser) });
      return;
    }

    const adminGoalPollMatch = url.pathname.match(/^\/admin\/goal-polls\/([^/]+)$/);
    if (adminGoalPollMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateGoalPoll(adminGoalPollMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminGoalPollStatusMatch = url.pathname.match(/^\/admin\/goal-polls\/([^/]+)\/status$/);
    if (adminGoalPollStatusMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await setGoalPollStatus(adminGoalPollStatusMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminGoalPollFinishMatch = url.pathname.match(/^\/admin\/goal-polls\/([^/]+)\/finish$/);
    if (adminGoalPollFinishMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await finishGoalPoll(adminGoalPollFinishMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminGoalPollStatsMatch = url.pathname.match(/^\/admin\/goal-polls\/([^/]+)\/stats$/);
    if (adminGoalPollStatsMatch && req.method === "GET") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await getGoalPollStats(adminGoalPollStatsMatch[1]) });
      return;
    }

    if (url.pathname === "/gameweeks" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listGameweeks(url.searchParams.get("competitionId") || "") });
      return;
    }

    if (url.pathname === "/admin/gameweeks" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createGameweek(await readJson(req), sessionUser) });
      return;
    }

    const adminGameweekMatch = url.pathname.match(/^\/admin\/gameweeks\/([^/]+)$/);
    if (adminGameweekMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateGameweek(adminGameweekMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminGameweekMatchesMatch = url.pathname.match(/^\/admin\/gameweeks\/([^/]+)\/matches$/);
    if (adminGameweekMatchesMatch && req.method === "PUT") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await assignMatchesToGameweek(adminGameweekMatchesMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminGameweekScoreMatch = url.pathname.match(/^\/admin\/gameweeks\/([^/]+)\/score$/);
    if (adminGameweekScoreMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await scoreFantasyGameweek(adminGameweekScoreMatch[1], sessionUser) });
      return;
    }

    if (url.pathname === "/fantasy/team" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getFantasyTeam(sessionUser, url.searchParams.get("competitionId"), url.searchParams.get("gameweekId")) });
      return;
    }

    if (url.pathname === "/fantasy/player-pool" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await listFantasyPlayerPool(url.searchParams.get("competitionId"), {
          teamId: url.searchParams.get("teamId") || "",
          search: url.searchParams.get("search") || "",
          availableOnly: url.searchParams.get("availableOnly") !== "false"
        })
      });
      return;
    }

    if (url.pathname === "/fantasy/picks" && req.method === "PUT") {
      sendJson(res, 200, { ok: true, data: await setFantasyPicks(sessionUser, await readJson(req)) });
      return;
    }

    if (url.pathname === "/fantasy/leaderboard" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await getFantasyLeaderboard(url.searchParams.get("competitionId"), url.searchParams.get("gameweekId") || "")
      });
      return;
    }

    if (url.pathname === "/fantasy-seasons" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listFantasySeasons() });
      return;
    }

    if (url.pathname === "/admin/fantasy-seasons" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createFantasySeason(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/fantasy-seasons/team" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await getFantasySeasonTeam(sessionUser, url.searchParams.get("fantasySeasonId"), url.searchParams.get("fantasyGameweekId"))
      });
      return;
    }

    if (url.pathname === "/fantasy-seasons/team-by-id" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await getFantasySeasonTeamById(url.searchParams.get("fantasyTeamId"), url.searchParams.get("fantasyGameweekId"))
      });
      return;
    }

    if (url.pathname === "/fantasy-seasons/picks" && req.method === "PUT") {
      sendJson(res, 200, { ok: true, data: await setFantasySeasonPicks(sessionUser, await readJson(req)) });
      return;
    }

    if (url.pathname === "/fantasy-seasons/leaderboard" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await getFantasySeasonLeaderboard(url.searchParams.get("fantasySeasonId"), url.searchParams.get("fantasyGameweekId") || "")
      });
      return;
    }

    const fantasySeasonMatch = url.pathname.match(/^\/fantasy-seasons\/([^/]+)$/);
    if (fantasySeasonMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getFantasySeason(fantasySeasonMatch[1]) });
      return;
    }

    const adminFantasySeasonMatch = url.pathname.match(/^\/admin\/fantasy-seasons\/([^/]+)$/);
    if (adminFantasySeasonMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateFantasySeason(adminFantasySeasonMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminFantasySeasonSyncMatch = url.pathname.match(/^\/admin\/fantasy-seasons\/([^/]+)\/sync-pool$/);
    if (adminFantasySeasonSyncMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await syncFantasySeasonPool(adminFantasySeasonSyncMatch[1], sessionUser) });
      return;
    }

    if (url.pathname === "/fantasy-seasons-player-pool" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        data: await listFantasySeasonPlayerPool(url.searchParams.get("fantasySeasonId"), {
          teamId: url.searchParams.get("teamId") || "",
          search: url.searchParams.get("search") || "",
          availableOnly: url.searchParams.get("availableOnly") !== "false"
        })
      });
      return;
    }

    if (url.pathname === "/admin/fantasy-gameweeks" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createFantasyGameweek(await readJson(req), sessionUser) });
      return;
    }

    if (url.pathname === "/fantasy-gameweeks" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listFantasyGameweeks(url.searchParams.get("fantasySeasonId") || "") });
      return;
    }

    const adminFantasyGameweekMatch = url.pathname.match(/^\/admin\/fantasy-gameweeks\/([^/]+)$/);
    if (adminFantasyGameweekMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateFantasyGameweek(adminFantasyGameweekMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminFantasyGameweekScoreMatch = url.pathname.match(/^\/admin\/fantasy-gameweeks\/([^/]+)\/score$/);
    if (adminFantasyGameweekScoreMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await scoreFantasySeasonGameweek(adminFantasyGameweekScoreMatch[1], sessionUser) });
      return;
    }

    if (url.pathname === "/matches/live" && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await listLiveMatches() });
      return;
    }

    if (url.pathname === "/admin/matches" && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await createMatch(await readJson(req), sessionUser) });
      return;
    }

    const matchDetailMatch = url.pathname.match(/^\/matches\/([^/]+)$/);
    if (matchDetailMatch && req.method === "GET") {
      sendJson(res, 200, { ok: true, data: await getMatchDetail(matchDetailMatch[1], sessionUser) });
      return;
    }

    const matchPredictMatch = url.pathname.match(/^\/matches\/([^/]+)\/predict$/);
    if (matchPredictMatch && req.method === "POST") {
      sendJson(res, 200, { ok: true, data: await submitMatchPrediction(matchPredictMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminMatchStatusMatch = url.pathname.match(/^\/admin\/matches\/([^/]+)\/status$/);
    if (adminMatchStatusMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await setMatchStatus(adminMatchStatusMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminMatchUpdateMatch = url.pathname.match(/^\/admin\/matches\/([^/]+)$/);
    if (adminMatchUpdateMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await updateMatch(adminMatchUpdateMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminMatchLineupMatch = url.pathname.match(/^\/admin\/matches\/([^/]+)\/lineup$/);
    if (adminMatchLineupMatch && req.method === "PUT") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await upsertLineup(adminMatchLineupMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminMatchEventMatch = url.pathname.match(/^\/admin\/matches\/([^/]+)\/events$/);
    if (adminMatchEventMatch && req.method === "POST") {
      requireAdmin(sessionUser);
      sendJson(res, 201, { ok: true, data: await addMatchEvent(adminMatchEventMatch[1], await readJson(req), sessionUser) });
      return;
    }

    const adminMatchMediaMatch = url.pathname.match(/^\/admin\/matches\/([^/]+)\/media$/);
    if (adminMatchMediaMatch && req.method === "PATCH") {
      requireAdmin(sessionUser);
      sendJson(res, 200, { ok: true, data: await setMatchMedia(adminMatchMediaMatch[1], await readJson(req), sessionUser) });
      return;
    }

    sendJson(res, 404, { ok: false, data: null, error: "Route not found" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, { ok: false, data: null, error: error.message || "Server error" });
  }
});

server.listen(config.api.port, config.api.host, () => {
  console.log(`Tribali Liga API running on http://${config.api.host}:${config.api.port}`);
});

// "localhost" and "127.0.0.1" are the same machine but different origins as far as
// browser CORS is concerned - always allow both for local admin dev regardless of
// CORS_ORIGIN, so which hostname someone happens to type never silently breaks login.
const ALWAYS_ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8081",
  "http://localhost:8081"
]);
const CONFIGURED_ORIGINS = new Set(
  String(config.api.corsOrigin || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function setBaseHeaders(req, res) {
  const origin = req.headers.origin;
  if (CONFIGURED_ORIGINS.has("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && (ALWAYS_ALLOWED_ORIGINS.has(origin) || CONFIGURED_ORIGINS.has(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", config.api.corsOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.api.bodyLimitBytes) {
      throw httpError(413, "Zahtev je prevelik.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function protectRoute(req, url) {
  rateLimit(req, { key: "global", limit: 240, windowMs: 60 * 1000 });

  if (url.pathname.startsWith("/auth/login")) {
    rateLimit(req, { key: "auth-login", limit: 8, windowMs: 60 * 1000 });
  }

  if (url.pathname.startsWith("/auth/register")) {
    rateLimit(req, { key: "auth-register", limit: 5, windowMs: 60 * 1000 });
  }

  if (url.pathname.startsWith("/admin/")) {
    rateLimit(req, { key: "admin", limit: 60, windowMs: 60 * 1000 });
  }

  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    rateLimit(req, { key: "write", limit: 120, windowMs: 60 * 1000 });
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
