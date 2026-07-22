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

export interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
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

export interface Gameweek {
  id: string;
  competitionId: string;
  competitionName: string;
  seasonName: string;
  name: string;
  startsAt: string;
  locksAt: string;
  endsAt: string | null;
  status: string;
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
  createdAt: string;
  updatedAt: string;
  name: string;
  status: string;
  gameweekLengthDays: number;
  startsAt: string;
  endsAt: string;
  competitionsCount?: number;
  competitions?: FantasySeasonCompetition[];
  gameweeks?: FantasyGameweek[];
}

export interface TeamStanding {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number | null;
  form: string;
}

export interface Team {
  id: string;
  competitionId: string;
  name: string;
  shortName: string;
  logoUrl: string;
  groupName: string;
  placement: string;
  isActive: boolean;
  playersCount: number;
  standing: TeamStanding | null;
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
  startedOnBench: boolean;
  pitchX: number | null;
  pitchY: number | null;
  shirtNumber: number | null;
}

export interface MatchEvent {
  id: string;
  matchId: string;
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
  fantasyPointsDelta: number;
}

export interface Match {
  id: string;
  competitionId: string;
  competitionName: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  gameweekId: string | null;
  phase: string;
  groupName: string | null;
  round: number | null;
  scheduledAt: string;
  venue: string | null;
  status: string;
  homeScore: number;
  awayScore: number;
  homeFormation: string | null;
  awayFormation: string | null;
}

export interface PlayerMatchStat {
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
  shotsOnTarget: number;
  shotsOffTarget: number;
  saves: number;
  goalsConceded: number;
  cornersWon: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  twoMinutes: number;
  ownGoals: number;
  penalties: number;
  penaltyGoals: number;
  penaltySaves: number;
  penaltyMisses: number;
  fantasyPoints: number;
}

export interface MatchDetail extends Match {
  lineups: MatchLineupEntry[];
  events: MatchEvent[];
  playerStats: PlayerMatchStat[];
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
  stories?: StoryItem[];
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
  tiebreak?: boolean;
}

export interface VerificationRequest {
  id: string;
  createdAt: string;
  userId: string;
  email: string;
  displayName: string;
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

export interface Sponsor {
  id: string;
  title: string;
  subtitle: string;
  logoUrl: string;
  targetUrl: string;
  isActive: boolean;
}
