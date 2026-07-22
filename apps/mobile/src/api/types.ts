export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verificationStatus: string;
  avatarUrl?: string;
  verifiedPlayerId?: string;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  expiresAt: string;
  user: AuthUser;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  verificationStatus: string;
  verifiedPlayerId: string;
  verifiedPlayerName: string;
  teamId: string;
  teamName: string;
}

export interface Competition {
  id: string;
  cityId: string;
  cityName: string;
  citySlug: string;
  name: string;
  seasonName: string;
  kind: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  teamsCount: number;
  matchesCount: number;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface CompetitionPhase {
  id: string;
  competitionId: string;
  code: string;
  name: string;
  type: "league" | "group" | "knockout" | "classification" | "third_place";
  sequence: number;
  groupCount: number | null;
  teamsPerGroup: number | null;
  qualifiersPerGroup: number | null;
  bestThirdCount: number | null;
  legs: number;
}

export interface CompetitionSetup {
  competition: Competition;
  format: { formatType: string; teamsCount: number | null } | null;
  phases: CompetitionPhase[];
}

export interface GeneratedMatch {
  id: string;
  competitionId: string;
  phaseId: string;
  phaseCode: string;
  phaseName: string;
  phase: string;
  groupName: string;
  round: number | null;
  scheduledAt: string;
  venue: string;
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  mediaUrl: string;
  mediaType: string;
  isPublished: boolean;
  publishedAt: string;
}

export interface NewsFeed {
  featured: NewsItem[];
  latest: NewsItem[];
  all: NewsItem[];
}

export interface StoryItem {
  id: string;
  folderId: string;
  title: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  expiresAt: string;
}

export interface StoryFolder {
  id: string;
  title: string;
  logoUrl: string;
  sortOrder: number;
  isActive: boolean;
  stories: StoryItem[];
}

export interface StoryStatEntry {
  id: string;
  createdAt: string;
  storyId: string;
  userId: string;
  displayName: string;
  email: string;
}

export interface StoryStats {
  storyId: string;
  views: (StoryStatEntry & { viewedAt: string })[];
  likes: StoryStatEntry[];
}

export interface MatchSummary {
  id: string;
  competitionId: string;
  competitionName?: string;
  gameweekId?: string;
  gameweekName?: string;
  phaseName?: string;
  phase: string;
  groupName: string;
  round: number | null;
  scheduledAt: string;
  venue: string;
  status: string;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamShortName: string;
  homeTeamLogoUrl: string;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamShortName: string;
  awayTeamLogoUrl: string;
  homeScore: number;
  awayScore: number;
}

export interface MatchLineupEntry {
  id: string;
  matchId: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  isStarter: boolean;
  isGoalkeeper: boolean;
  shirtNumber: number | null;
}

export interface MatchEventDetail {
  id: string;
  minute: number;
  type: string;
  teamId: string | null;
  teamName: string | null;
  playerId: string | null;
  playerName: string | null;
  relatedPlayerId: string | null;
  relatedPlayerName: string | null;
  scoreHome: number;
  scoreAway: number;
  text: string | null;
}

export interface MatchPlayerStat {
  id: string;
  matchId: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  position: string;
  goals: number;
  assists: number;
  shots: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  fantasyPoints: number;
}

export interface MatchPredictions {
  home: number;
  draw: number;
  away: number;
  total: number;
  homePercent: number;
  drawPercent: number;
  awayPercent: number;
  userPick: "home" | "draw" | "away" | "";
}

export interface MatchDetail extends MatchSummary {
  lineups: MatchLineupEntry[];
  events: MatchEventDetail[];
  playerStats: MatchPlayerStat[];
  predictions: MatchPredictions;
}

export interface FantasyPoolPlayer {
  id: string;
  competitionId: string;
  playerId: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  avatarUrl: string;
  basePrice: number;
  currentPrice: number;
  isAvailable: boolean;
  availabilityNote: string;
  appearances: number;
  goals: number;
  assists: number;
  saves: number;
  fantasyPoints: number;
}

export interface FantasyPick {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  avatarUrl: string;
  shirtNumber: number | null;
  teamId: string;
  teamName: string;
  gameweekId: string;
  gameweekName: string;
  slot: string;
  isCaptain: boolean;
  lockedAt: string | null;
  points: number;
}

export interface FantasyTeam {
  id: string;
  userId: string;
  competitionId: string;
  competitionName: string;
  name: string;
  totalPoints: number;
  lastScoredAt: string | null;
  picks: FantasyPick[];
}

export interface LeaderboardEntry {
  rank: number;
  fantasyTeamId: string;
  name: string;
  managerName: string;
  points: number;
  totalPoints: number;
  lastScoredAt: string | null;
}

export interface Gameweek {
  id: string;
  competitionId: string;
  name: string;
  startsAt: string;
  locksAt: string;
  endsAt: string;
  status: string;
  matchesCount: number;
}

export interface FantasySeasonCompetition {
  id: string;
  name: string;
  seasonName: string;
  cityName: string;
}

export interface FantasyGameweek {
  id: string;
  fantasySeasonId: string;
  name: string;
  startsAt: string;
  locksAt: string;
  endsAt: string | null;
  status: string;
}

export interface FantasySeason {
  id: string;
  name: string;
  status: string;
  gameweekLengthDays: number;
  startsAt: string;
  endsAt: string;
  competitionsCount?: number;
  competitions?: FantasySeasonCompetition[];
  gameweeks?: FantasyGameweek[];
}

export interface FantasySeasonPoolPlayer {
  id: string;
  fantasySeasonId: string;
  competitionId: string;
  competitionName: string;
  playerId: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  avatarUrl: string;
  basePrice: number;
  currentPrice: number;
  isAvailable: boolean;
  availabilityNote: string;
}

export interface FantasySeasonPick {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  avatarUrl: string;
  shirtNumber: number | null;
  teamId: string;
  teamName: string;
  fantasyGameweekId: string;
  gameweekName: string;
  slot: string;
  isCaptain: boolean;
  lockedAt: string | null;
  points: number;
  currentPrice: number;
  hasPlayed: boolean;
}

export interface FantasyTransferWindow {
  roundNumber: number;
  phase: "open" | "reposition" | "locked";
  isUnlimited: boolean;
  transfersAllowed: number;
  previousPicks: { playerId: string; slot: string }[];
}

export interface FantasySeasonTeam {
  id: string;
  userId: string;
  fantasySeasonId: string;
  seasonName: string;
  name: string;
  totalPoints: number;
  lastScoredAt: string | null;
  budgetSpent: number;
  budgetRemaining: number;
  picks: FantasySeasonPick[];
  transferWindow: FantasyTransferWindow | null;
}

export interface StandingRow {
  id: string;
  competitionId: string;
  competitionName?: string;
  seasonName?: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  logoUrl: string;
  groupName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
  position: number | null;
}

export interface StandingGroup {
  name: string;
  rows: StandingRow[];
}

export interface SeasonHub {
  competitions: Competition[];
  activeCompetition: Competition | null;
  gameweeks: Gameweek[];
  matches: MatchSummary[];
  standings: StandingGroup[];
  leaders: Record<string, unknown>;
  fantasyPlayers: FantasyPoolPlayer[];
}

export interface GoalPollOption {
  id: string;
  playerId: string;
  playerName: string;
  title: string;
  videoUrl: string;
  votes: number;
  percent: number;
  isWinner: boolean;
}

export interface GoalPoll {
  id: string;
  title: string;
  copy: string;
  status: "draft" | "open" | "closed" | "tiebreak";
  endsAt: string;
  totalVotes: number;
  userVote: string;
  options: GoalPollOption[];
  voteSaved?: boolean;
  voteRemoved?: boolean;
}

export interface Team {
  id: string;
  competitionId: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  groupName?: string;
  isActive?: boolean;
  playersCount?: number;
}

export interface Player {
  id: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  competitionId: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  avatarUrl: string;
  isActive: boolean;
}

export interface LeaderEntry {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  position: string;
  avatarUrl: string;
  value: number;
  appearances: number;
}

export interface LeadersResponse {
  category: string;
  label: string;
  leaders: LeaderEntry[];
}

export interface VerificationRequest {
  id: string;
  createdAt: string;
  cityId: string;
  cityName: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  matchedPlayerName: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string;
}

export interface TeamProfile {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
  groupName: string;
  achievement: string;
  competition: { id: string; name: string; seasonName: string; kind: string; status: string };
  city: { name: string; slug: string };
  players: Array<{
    id: string;
    displayName: string;
    position: string;
    shirtNumber: number | null;
    avatarUrl: string;
    appearances: number;
    goals: number;
    assists: number;
    saves: number;
    fantasyPoints: number;
  }>;
  standings: StandingRow[];
  matches: MatchSummary[];
  totals: { goals: number; assists: number; saves: number; fantasy_points: number };
  nextMatch: PlayerNextMatch | null;
}

export interface PlayerSeasonStat {
  competitionId: string;
  competitionName: string;
  seasonName: string;
  teamId: string;
  teamName: string;
  appearances: number;
  goals: number;
  assists: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  fantasyPoints: number;
}

export interface PlayerMatchStat {
  matchId: string;
  scheduledAt: string;
  phase: string;
  homeTeamName: string;
  awayTeamName: string;
  score: string;
  goals: number;
  assists: number;
  saves: number;
  fantasyPoints: number;
}

export interface PlayerNextMatch {
  scheduledAt: string;
  venue: string;
  round: number | null;
  homeTeamName: string;
  awayTeamName: string;
  competitionName: string;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  avatarUrl: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  competition: { id: string; name: string; seasonName: string };
  seasonStats: PlayerSeasonStat[];
  matchStats: PlayerMatchStat[];
  nextMatch: PlayerNextMatch | null;
}

export interface Sponsor {
  id: string;
  title: string;
  subtitle: string;
  logoUrl: string;
  targetUrl: string;
}
