import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";
import type {
  AnalyticsOverview,
  AuthSession,
  AuthUser,
  City,
  Club,
  Competition,
  CompetitionSetup,
  FantasyMiniLeague,
  FantasySeason,
  FantasySeasonPoolPlayer,
  FantasySeasonTeam,
  GeneratedMatch,
  GoalPoll,
  LeaderboardEntry,
  LeadersResponse,
  MatchAvailabilityRequest,
  MatchDetail,
  MatchSummary,
  MediaLink,
  NewsFeed,
  NewsItem,
  Player,
  PlayerProfile,
  Profile,
  SeasonHub,
  Sponsor,
  StandingGroup,
  StoryFolder,
  StoryItem,
  StoryStats,
  Team,
  TeamProfile,
  VerificationRequest
} from "./types";

export function login(email: string, password: string) {
  return apiPost<AuthSession>("/auth/login", { email, password });
}

export function requestPasswordReset(email: string) {
  return apiPost<{ ok: boolean }>("/auth/forgot-password", { email });
}

export function confirmPasswordReset(email: string, code: string, newPassword: string) {
  return apiPost<{ ok: boolean }>("/auth/reset-password", { email, code, newPassword });
}

export function deleteAccount(password: string) {
  return apiDelete<{ deleted: boolean }>("/profile", { password });
}

export interface UploadTarget {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  resourceType: "image" | "video";
  contentType: string;
  maxSizeBytes: number;
}

export function createUploadTarget(payload: { purpose: "story" | "news" | "goal" | "logo" | "avatar"; contentType: string; sizeBytes: number }) {
  return apiPost<UploadTarget>("/uploads/signed-url", payload);
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

export function createStoryFolder(payload: { title: string; logoUrl?: string; sortOrder?: number }) {
  return apiPost<StoryFolder>("/admin/story-folders", payload);
}

export function createStory(payload: { folderId: string; title?: string; mediaUrl: string; mediaType?: "image" | "video"; expiresAt?: string }) {
  return apiPost<StoryItem>("/admin/stories", payload);
}

export function deleteStory(id: string) {
  return apiDelete<{ deleted: boolean }>(`/admin/stories/${id}`);
}

export function fetchStoryStats(id: string) {
  return apiGet<StoryStats>(`/admin/stories/${id}/stats`);
}

export function fetchStoryFolders() {
  return apiGet<StoryFolder[]>("/stories/folders");
}

export function register(payload: { email: string; password: string; displayName: string; roleIntent?: string; teamId?: string }) {
  return apiPost<AuthUser>("/auth/register", payload);
}

export function fetchSession() {
  return apiGet<AuthUser>("/auth/session");
}

export function fetchProfile() {
  return apiGet<Profile>("/profile");
}

export function updateProfile(payload: Partial<{ displayName: string; avatarUrl: string }>) {
  return apiPatch<Profile>("/profile", payload);
}

export function registerPushToken(token: string) {
  return apiPost<{ ok: boolean }>("/push-token", { token });
}

export function sendAdminNotification(title: string, body: string) {
  return apiPost<{ recipients: number; sent: number }>("/admin/notifications/send", { title, body });
}

export function fetchMyAvailabilityRequests() {
  return apiGet<MatchAvailabilityRequest[]>("/profile/availability");
}

export function setMatchAvailability(matchId: string, status: "playing" | "not_playing") {
  return apiPost<MatchAvailabilityRequest>(`/matches/${matchId}/availability`, { status });
}

export function fetchNews() {
  return apiGet<NewsFeed>("/news");
}

export function fetchStories() {
  return apiGet<StoryFolder[]>("/stories");
}

export function listCompetitions() {
  return apiGet<Competition[]>("/competitions");
}

export function listCities() {
  return apiGet<City[]>("/cities");
}

export function createCity(payload: { name: string }) {
  return apiPost<City>("/admin/cities", payload);
}

export function createCompetition(payload: { cityId?: string; name: string; seasonName: string; kind?: string; status?: string }) {
  return apiPost<Competition>("/admin/competitions", payload);
}

export function updateCompetition(
  competitionId: string,
  payload: Partial<{ cityId: string; name: string; seasonName: string; kind: string; status: string; startsAt: string; endsAt: string }>
) {
  return apiPatch<Competition>(`/admin/competitions/${competitionId}`, payload);
}

export function deleteCompetition(competitionId: string) {
  return apiDelete<{ id: string; deleted: boolean }>(`/admin/competitions/${competitionId}`);
}

export function createTeam(payload: { competitionId?: string; name: string; shortName?: string; groupName?: string }) {
  return apiPost<Team>("/admin/teams", payload);
}

export function fetchClubs(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiGet<Club[]>(`/clubs${qs}`);
}

export function addClubToCompetition(
  competitionId: string,
  payload: { clubId: string; groupName?: string; includePlayers?: boolean }
) {
  return apiPost<{ team: Team; playersCount: number }>(`/admin/competitions/${competitionId}/teams-from-club`, payload);
}

export function updateTeam(teamId: string, payload: Partial<{ name: string; shortName: string; logoUrl: string; groupName: string; isActive: boolean }>) {
  return apiPatch<Team>(`/admin/teams/${teamId}`, payload);
}

export function createPlayer(payload: { teamId: string; displayName: string; position?: string; shirtNumber?: number; avatarUrl?: string }) {
  return apiPost<Player>("/admin/players", payload);
}

export function updatePlayer(
  playerId: string,
  payload: Partial<{ displayName: string; position: string; shirtNumber: number | null; avatarUrl: string; isActive: boolean }>
) {
  return apiPatch<Player>(`/admin/players/${playerId}`, payload);
}

export function createMatch(payload: { competitionId: string; homeTeamId: string; awayTeamId: string; scheduledAt: string; venue?: string }) {
  return apiPost<MatchDetail>("/admin/matches", payload);
}

export function updateMatch(
  matchId: string,
  payload: Partial<{ scheduledAt: string; venue: string; round: number; status: string; sponsorId: string; halfLengthMinutes: number }>
) {
  return apiPatch<MatchDetail>(`/admin/matches/${matchId}`, payload);
}

export function setMatchPeriod(matchId: string, period: "first_half" | "halftime" | "second_half") {
  return apiPatch<MatchDetail>(`/admin/matches/${matchId}/period`, { period });
}

export function setMatchMedia(matchId: string, payload: { kind?: string; label?: string; url: string }) {
  return apiPatch<MediaLink>(`/admin/matches/${matchId}/media`, payload);
}

export interface CompetitionPhaseInput {
  code: string;
  name: string;
  type: "league" | "group" | "knockout" | "classification" | "third_place";
  sequence?: number;
  groupCount?: number;
  teamsPerGroup?: number;
  qualifiersPerGroup?: number;
  bestThirdCount?: number;
  legs?: number;
}

export function configureCompetition(competitionId: string, payload: { formatType: "league" | "tournament" | "hybrid"; phases?: CompetitionPhaseInput[] }) {
  return apiPut<{ format: unknown; phases: unknown[] }>(`/admin/competitions/${competitionId}/configure`, payload);
}

export function fetchCompetitionSetup(competitionId: string) {
  return apiGet<CompetitionSetup>(`/competitions/${competitionId}/setup`);
}

export function assignCompetitionGroups(competitionId: string, payload: { groupCount?: number; groupNames?: string[] }) {
  return apiPut<Team[]>(`/admin/competitions/${competitionId}/groups`, payload);
}

export function generateCompetitionSchedule(
  competitionId: string,
  payload: { phaseCode?: string; mode?: "replace" | "append"; legs?: number; intervalMinutes?: number; startAt?: string; venue?: string }
) {
  return apiPost<GeneratedMatch[]>(`/admin/competitions/${competitionId}/generate-schedule`, payload);
}

export function prepareKnockoutPhase(
  competitionId: string,
  payload: { phaseCode?: string; qualifiersCount?: number; includeThirdPlace?: boolean; startAt?: string; intervalMinutes?: number; venue?: string }
) {
  return apiPost<{ qualifiers: unknown[]; matches: GeneratedMatch[] }>(`/admin/competitions/${competitionId}/prepare-knockout`, payload);
}

export function advanceKnockoutPhase(competitionId: string, payload: { phaseCode?: string; includeThirdPlace?: boolean }) {
  return apiPost<{ champion: { teamId: string; teamName: string } | null; matches: GeneratedMatch[] }>(
    `/admin/competitions/${competitionId}/advance-knockout`,
    payload
  );
}

export function activateCompetition(competitionId: string, payload: { status?: string } = {}) {
  return apiPost<{ competition: Competition; gameweeks: unknown[] }>(`/admin/competitions/${competitionId}/activate`, payload);
}

export function fetchSeasonHub(competitionId?: string) {
  const qs = competitionId ? `?competitionId=${encodeURIComponent(competitionId)}` : "";
  return apiGet<SeasonHub>(`/seasons${qs}`);
}

export function listLiveMatches() {
  return apiGet<MatchSummary[]>("/matches/live");
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
  return apiPut<{ players: unknown[] }>(`/admin/matches/${matchId}/lineup`, { players });
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

export interface FantasyPickInput {
  playerId: string;
  slot: string;
  isCaptain?: boolean;
}

export function listFantasySeasons() {
  return apiGet<FantasySeason[]>("/fantasy-seasons");
}

export function fetchFantasySeason(seasonId: string) {
  return apiGet<Required<FantasySeason>>(`/fantasy-seasons/${seasonId}`);
}

export function fetchFantasySeasonPlayerPool(seasonId: string, search?: string, availableOnly = true) {
  const params = new URLSearchParams({ fantasySeasonId: seasonId });
  if (search) params.set("search", search);
  if (!availableOnly) params.set("availableOnly", "false");
  return apiGet<FantasySeasonPoolPlayer[]>(`/fantasy-seasons-player-pool?${params.toString()}`);
}

export function fetchFantasySeasonTeam(seasonId: string, gameweekId?: string) {
  const params = new URLSearchParams({ fantasySeasonId: seasonId });
  if (gameweekId) params.set("fantasyGameweekId", gameweekId);
  return apiGet<FantasySeasonTeam>(`/fantasy-seasons/team?${params.toString()}`);
}

export function saveFantasySeasonPicks(payload: { fantasySeasonId: string; fantasyGameweekId: string; picks: FantasyPickInput[] }) {
  return apiPut<FantasySeasonTeam>("/fantasy-seasons/picks", payload);
}

export function fetchFantasySeasonTeamById(fantasyTeamId: string, gameweekId?: string) {
  const params = new URLSearchParams({ fantasyTeamId });
  if (gameweekId) params.set("fantasyGameweekId", gameweekId);
  return apiGet<FantasySeasonTeam>(`/fantasy-seasons/team-by-id?${params.toString()}`);
}

export function fetchFantasySeasonLeaderboard(seasonId: string, gameweekId?: string) {
  const params = new URLSearchParams({ fantasySeasonId: seasonId });
  if (gameweekId) params.set("fantasyGameweekId", gameweekId);
  return apiGet<LeaderboardEntry[]>(`/fantasy-seasons/leaderboard?${params.toString()}`);
}

export function listMyFantasyMiniLeagues(seasonId: string) {
  return apiGet<FantasyMiniLeague[]>(`/fantasy-mini-leagues?${new URLSearchParams({ fantasySeasonId: seasonId }).toString()}`);
}

export function createFantasyMiniLeague(payload: { fantasySeasonId: string; name: string }) {
  return apiPost<FantasyMiniLeague>("/fantasy-mini-leagues", payload);
}

export function joinFantasyMiniLeague(inviteCode: string) {
  return apiPost<FantasyMiniLeague>("/fantasy-mini-leagues/join", { inviteCode });
}

export function fetchFantasyMiniLeague(miniLeagueId: string) {
  return apiGet<FantasyMiniLeague>(`/fantasy-mini-leagues/${miniLeagueId}`);
}

export function fetchFantasyMiniLeagueLeaderboard(miniLeagueId: string, gameweekId?: string) {
  const params = gameweekId ? `?${new URLSearchParams({ fantasyGameweekId: gameweekId }).toString()}` : "";
  return apiGet<LeaderboardEntry[]>(`/fantasy-mini-leagues/${miniLeagueId}/leaderboard${params}`);
}

export function leaveFantasyMiniLeague(miniLeagueId: string) {
  return apiPost<{ ok: true }>(`/fantasy-mini-leagues/${miniLeagueId}/leave`, {});
}

export function disbandFantasyMiniLeague(miniLeagueId: string) {
  return apiDelete<{ ok: true }>(`/fantasy-mini-leagues/${miniLeagueId}`);
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

export function setFantasyPoolPlayerPrice(seasonId: string, playerId: string, price: number, isPriceLocked = true) {
  return apiPatch<FantasySeasonPoolPlayer>(`/admin/fantasy-seasons/${seasonId}/pool/${playerId}/price`, { price, isPriceLocked });
}

export function setFantasyPoolPlayerAvailability(seasonId: string, playerId: string, isAvailable: boolean) {
  return apiPatch<FantasySeasonPoolPlayer>(`/admin/fantasy-seasons/${seasonId}/pool/${playerId}/availability`, { isAvailable });
}

export function fetchCurrentGoalPoll() {
  return apiGet<GoalPoll | null>("/goal-poll");
}

export function voteGoalPoll(pollId: string, optionId: string) {
  return apiPost<GoalPoll>(`/goal-polls/${pollId}/vote`, { optionId });
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

export function updateSponsor(payload: { id?: string; title: string; subtitle?: string; logoUrl?: string; targetUrl?: string; isActive?: boolean; logoBackground?: "light" | "dark" }) {
  return apiPatch<Sponsor>("/admin/sponsor", payload);
}

export function fetchDiscount() {
  return apiGet<Sponsor | null>("/discount");
}

export function fetchDiscountForAdmin() {
  return apiGet<Sponsor | null>("/admin/discount");
}

export function updateDiscount(payload: { id?: string; title: string; subtitle?: string; logoUrl?: string; targetUrl?: string; isActive?: boolean; logoBackground?: "light" | "dark" }) {
  return apiPatch<Sponsor>("/admin/discount", payload);
}

export function fetchGeneralSponsors() {
  return apiGet<Sponsor[]>("/sponsors/general");
}

export function fetchAllGeneralSponsors() {
  return apiGet<Sponsor[]>("/admin/sponsors/general");
}

export function createGeneralSponsor(payload: { title: string; subtitle?: string; logoUrl?: string; targetUrl?: string; logoBackground?: "light" | "dark" }) {
  return apiPost<Sponsor>("/admin/sponsors/general", payload);
}

export function updateGeneralSponsor(
  id: string,
  payload: { title: string; subtitle?: string; logoUrl?: string; targetUrl?: string; isActive?: boolean; logoBackground?: "light" | "dark" }
) {
  return apiPatch<Sponsor>(`/admin/sponsors/general/${id}`, payload);
}

export function deleteGeneralSponsor(id: string) {
  return apiDelete<{ id: string }>(`/admin/sponsors/general/${id}`);
}

export function markStoryViewed(storyId: string) {
  return apiPost<{ anonymous?: boolean; storyId: string }>(`/stories/${storyId}/view`);
}

export function toggleStoryLike(storyId: string) {
  return apiPost<{ liked: boolean; count: number }>(`/stories/${storyId}/like`);
}

export function fetchMatchDetail(matchId: string) {
  return apiGet<MatchDetail>(`/matches/${matchId}`);
}

export function submitMatchPrediction(matchId: string, pick: "home" | "draw" | "away") {
  return apiPost<MatchDetail>(`/matches/${matchId}/predict`, { pick });
}

export function fetchCompetitionTeams(competitionId: string) {
  return apiGet<Team[]>(`/competitions/${competitionId}/teams`);
}

export function fetchAllTeams() {
  return apiGet<Team[]>("/teams");
}

export function fetchMyVerificationRequests() {
  return apiGet<VerificationRequest[]>("/profile/verifications");
}

export function requestVerification(payload: { teamId?: string; playerId?: string; playerName: string }) {
  return apiPost<VerificationRequest>("/profile/verifications", payload);
}

export function listVerificationRequests(status?: string) {
  return apiGet<VerificationRequest[]>(`/admin/verifications${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}

export function reviewVerificationRequest(
  id: string,
  payload: { status: "approved" | "rejected"; playerId?: string; teamId?: string; adminNote?: string }
) {
  return apiPatch<VerificationRequest>(`/admin/verifications/${id}`, payload);
}

export function fetchTeamPlayers(teamId: string) {
  return apiGet<Player[]>(`/players?teamId=${encodeURIComponent(teamId)}`);
}

export function fetchTeamProfile(teamId: string) {
  return apiGet<TeamProfile>(`/teams/${teamId}`);
}

export function fetchPlayerProfile(playerId: string) {
  return apiGet<PlayerProfile>(`/players/${playerId}`);
}

export function fetchPlayers(competitionId?: string) {
  return apiGet<Player[]>(competitionId ? `/players?competitionId=${encodeURIComponent(competitionId)}` : "/players");
}

export function searchPlayers(searchQuery: string) {
  return apiGet<Player[]>(`/players/search?q=${encodeURIComponent(searchQuery)}`);
}

export function addPlayerToTeam(teamId: string, playerId: string) {
  return apiPost<TeamProfile>(`/admin/teams/${teamId}/roster`, { playerId });
}

export function removePlayerFromTeam(teamId: string, playerId: string) {
  return apiDelete<TeamProfile>(`/admin/teams/${teamId}/roster/${playerId}`);
}

export function fetchLeaders(competitionId: string, category: "goals" | "assists" | "saves" | "mvp" = "goals") {
  return apiGet<LeadersResponse>(`/competitions/${competitionId}/leaders?category=${category}`);
}

export function fetchCompetitionStandings(competitionId: string) {
  return apiGet<StandingGroup[]>(`/competitions/${competitionId}/standings`);
}

export function fetchAnalyticsOverview() {
  return apiGet<AnalyticsOverview>("/admin/analytics/overview");
}
