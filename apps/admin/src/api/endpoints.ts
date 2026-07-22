import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";
import type {
  AuthSession,
  AuthUser,
  City,
  Competition,
  FantasyGameweek,
  FantasySeason,
  Gameweek,
  GoalPoll,
  Match,
  MatchDetail,
  NewsFeed,
  NewsItem,
  Player,
  Sponsor,
  StoryFolder,
  StoryItem,
  Team,
  VerificationRequest
} from "./types";

export function login(email: string, password: string) {
  return apiPost<AuthSession>("/auth/login", { email, password });
}

export function fetchSession() {
  return apiGet<AuthUser>("/auth/session");
}

export function listCities() {
  return apiGet<City[]>("/cities");
}

export function createCity(payload: { name: string }) {
  return apiPost<City>("/admin/cities", payload);
}

export function listCompetitions(params: { cityId?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.cityId) query.set("cityId", params.cityId);
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return apiGet<Competition[]>(`/competitions${qs ? `?${qs}` : ""}`);
}

export function createCompetition(payload: { cityId?: string; name: string; seasonName: string; kind?: string; status?: string }) {
  return apiPost<Competition>("/admin/competitions", payload);
}

export function configureCompetition(competitionId: string, payload: { formatType: "league" | "tournament" }) {
  return apiPut(`/admin/competitions/${competitionId}/configure`, payload);
}

export function syncFantasyPool(competitionId: string) {
  return apiPost<{ competitionId: string; available: number; unavailable: number }>(`/admin/competitions/${competitionId}/sync-fantasy-pool`);
}

export function cloneCompetitionTeams(
  competitionId: string,
  payload: { sourceCompetitionId: string; includePlayers?: boolean; syncFantasy?: boolean }
) {
  return apiPost<{ teams: Team[]; playersCount: number }>(`/admin/competitions/${competitionId}/clone-teams`, payload);
}

export function listCompetitionTeams(competitionId: string) {
  return apiGet<Team[]>(`/competitions/${competitionId}/teams`);
}

export function createTeam(payload: { competitionId: string; name: string; shortName?: string; groupName?: string }) {
  return apiPost<Team>("/admin/teams", payload);
}

export function updateTeam(teamId: string, payload: Partial<{ name: string; shortName: string; groupName: string; isActive: boolean }>) {
  return apiPatch<Team>(`/admin/teams/${teamId}`, payload);
}

export function listPlayers(params: { teamId?: string; competitionId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.teamId) query.set("teamId", params.teamId);
  if (params.competitionId) query.set("competitionId", params.competitionId);
  const qs = query.toString();
  return apiGet<Player[]>(`/players${qs ? `?${qs}` : ""}`);
}

export function createPlayer(payload: { teamId: string; displayName: string; position?: string; shirtNumber?: number }) {
  return apiPost<Player>("/admin/players", payload);
}

export function updatePlayer(playerId: string, payload: Partial<{ displayName: string; position: string; shirtNumber: number; isActive: boolean }>) {
  return apiPatch<Player>(`/admin/players/${playerId}`, payload);
}

export function createMatch(payload: {
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  venue?: string;
}) {
  return apiPost<MatchDetail>("/admin/matches", payload);
}

export function getMatchDetail(matchId: string) {
  return apiGet<MatchDetail>(`/matches/${matchId}`);
}

export function listLiveMatches() {
  return apiGet<Match[]>("/matches/live");
}

export async function listCompetitionMatches(competitionId: string) {
  const hub = await apiGet<{ matches: Match[] }>(`/seasons/${competitionId}`);
  return hub.matches;
}

export function setMatchStatus(matchId: string, status: string, scores?: { homeScore?: number; awayScore?: number }) {
  return apiPatch<MatchDetail>(`/admin/matches/${matchId}/status`, { status, ...scores });
}

export interface LineupPlayerInput {
  playerId: string;
  teamId: string;
  isStarter?: boolean;
  isGoalkeeper?: boolean;
  shirtNumber?: number;
}

export function setMatchLineup(matchId: string, players: LineupPlayerInput[]) {
  return apiPut(`/admin/matches/${matchId}/lineup`, { players });
}

export interface MatchEventInput {
  type: string;
  minute: number;
  teamId?: string;
  playerId?: string;
  relatedPlayerId?: string;
  text?: string;
  fantasyPointsDelta?: number;
}

export function addMatchEvent(matchId: string, event: MatchEventInput) {
  return apiPost<{ match: MatchDetail; event: unknown }>(`/admin/matches/${matchId}/events`, event);
}

export interface UploadTarget {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
  contentType: string;
  maxSizeBytes: number;
}

export function createUploadTarget(payload: { purpose: "story" | "news" | "goal" | "logo"; contentType: string; sizeBytes: number }) {
  return apiPost<UploadTarget>("/uploads/signed-url", payload);
}

export function fetchNews() {
  return apiGet<NewsFeed>("/news");
}

export function createNews(payload: { title: string; body?: string; mediaUrl?: string; mediaType?: string; isPublished?: boolean }) {
  return apiPost<NewsItem>("/admin/news", payload);
}

export function updateNews(id: string, payload: Partial<{ title: string; body: string; mediaUrl: string; mediaType: string; isPublished: boolean }>) {
  return apiPatch<NewsItem>(`/admin/news/${id}`, payload);
}

export function deleteNews(id: string) {
  return apiDelete<{ deleted: boolean }>(`/admin/news/${id}`);
}

export function fetchStoryFolders() {
  return apiGet<StoryFolder[]>("/stories/folders");
}

export function fetchStories() {
  return apiGet<StoryFolder[]>("/stories");
}

export function createStoryFolder(payload: { title: string; logoUrl?: string; sortOrder?: number }) {
  return apiPost<StoryFolder>("/admin/story-folders", payload);
}

export function deleteStoryFolder(id: string) {
  return apiDelete<{ deleted: boolean }>(`/admin/story-folders/${id}`);
}

export function createStory(payload: { folderId: string; title?: string; mediaUrl: string; mediaType?: "image" | "video"; expiresAt?: string }) {
  return apiPost<StoryItem>("/admin/stories", payload);
}

export function deleteStory(id: string) {
  return apiDelete<{ deleted: boolean }>(`/admin/stories/${id}`);
}

export function fetchCurrentGoalPoll() {
  return apiGet<GoalPoll | null>("/goal-poll");
}

export interface GoalPollOptionInput {
  playerName?: string;
  title: string;
  videoUrl: string;
}

export function createGoalPoll(payload: { title: string; copy?: string; status?: string; endsAt?: string; options: GoalPollOptionInput[] }) {
  return apiPost<GoalPoll>("/admin/goal-polls", payload);
}

export function setGoalPollStatus(id: string, status: string, endsAt?: string) {
  return apiPatch<GoalPoll>(`/admin/goal-polls/${id}/status`, { status, endsAt });
}

export function finishGoalPoll(id: string, winnerOptionId?: string) {
  return apiPost<GoalPoll & { tiebreak?: boolean }>(`/admin/goal-polls/${id}/finish`, winnerOptionId ? { winnerOptionId } : {});
}

export function fetchSponsor() {
  return apiGet<Sponsor | null>("/sponsor");
}

export function updateSponsor(payload: { id?: string; title: string; subtitle?: string; logoUrl?: string; targetUrl?: string; isActive?: boolean }) {
  return apiPatch<Sponsor>("/admin/sponsor", payload);
}

export function listGameweeks(competitionId: string) {
  return apiGet<Gameweek[]>(`/gameweeks?competitionId=${encodeURIComponent(competitionId)}`);
}

export function createGameweek(payload: { competitionId: string; name: string; startsAt: string; locksAt: string; endsAt?: string; status?: string }) {
  return apiPost<Gameweek>("/admin/gameweeks", payload);
}

export function updateGameweek(id: string, payload: Partial<{ name: string; startsAt: string; locksAt: string; endsAt: string; status: string }>) {
  return apiPatch<Gameweek>(`/admin/gameweeks/${id}`, payload);
}

export function scoreGameweek(id: string) {
  return apiPost<unknown>(`/admin/gameweeks/${id}/score`);
}

export function listFantasySeasons() {
  return apiGet<FantasySeason[]>("/fantasy-seasons");
}

export function getFantasySeason(id: string) {
  return apiGet<Required<FantasySeason>>(`/fantasy-seasons/${id}`);
}

export function createFantasySeason(payload: {
  name: string;
  competitionIds: string[];
  gameweekLengthDays?: number;
  status?: string;
  startsAt?: string;
  endsAt?: string;
}) {
  return apiPost<Required<FantasySeason>>("/admin/fantasy-seasons", payload);
}

export function updateFantasySeason(
  id: string,
  payload: Partial<{ name: string; status: string; gameweekLengthDays: number; startsAt: string; endsAt: string; competitionIds: string[] }>
) {
  return apiPatch<Required<FantasySeason>>(`/admin/fantasy-seasons/${id}`, payload);
}

export function syncFantasySeasonPool(seasonId: string) {
  return apiPost<{ seasonId: string; available: number; unavailable: number }>(`/admin/fantasy-seasons/${seasonId}/sync-pool`);
}

export function createFantasyGameweek(payload: {
  fantasySeasonId: string;
  name: string;
  startsAt: string;
  locksAt: string;
  endsAt?: string;
  status?: string;
}) {
  return apiPost<FantasyGameweek>("/admin/fantasy-gameweeks", payload);
}

export function updateFantasyGameweek(id: string, payload: Partial<{ name: string; startsAt: string; locksAt: string; endsAt: string; status: string }>) {
  return apiPatch<FantasyGameweek>(`/admin/fantasy-gameweeks/${id}`, payload);
}

export function scoreFantasySeasonGameweek(id: string) {
  return apiPost<{ gameweekId: string; updatedPicks: number; pricedPlayers: number }>(`/admin/fantasy-gameweeks/${id}/score`);
}

export function listVerificationRequests(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<VerificationRequest[]>(`/admin/verifications${qs}`);
}

export function reviewVerificationRequest(id: string, payload: { status: "approved" | "rejected"; playerId?: string; teamId?: string; adminNote?: string }) {
  return apiPatch<VerificationRequest>(`/admin/verifications/${id}`, payload);
}
