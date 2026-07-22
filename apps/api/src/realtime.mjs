import { config } from "./config.mjs";
import { listActiveStories } from "./content.mjs";
import { getCurrentGoalPoll } from "./goal-polls.mjs";
import { listLiveMatches } from "./matches.mjs";

const PUBLIC_TABLES = new Set([
  "matches",
  "match_events",
  "match_lineups",
  "player_match_stats",
  "goal_votes",
  "goal_polls",
  "goal_poll_options",
  "stories",
  "story_views",
  "story_likes",
  "gameweeks",
  "fantasy_teams",
  "fantasy_team_picks",
  "media_links"
]);

export async function getLiveOverview(user) {
  const [matches, stories, goalPoll] = await Promise.all([
    listLiveMatches(),
    listActiveStories(),
    getCurrentGoalPoll(user)
  ]);

  return {
    liveMatches: matches,
    hasLiveMatches: matches.length > 0,
    stories,
    goalPoll,
    realtime: getRealtimeConfig(user, {})
  };
}

export function getRealtimeConfig(user, params = {}) {
  if (!config.supabase.url || !config.supabase.publishableKey) {
    throw httpError(500, "Supabase realtime konfiguracija nije podesena.");
  }

  const matchId = optionalUuid(params.matchId);
  const gameweekId = optionalUuid(params.gameweekId);
  const pollId = optionalUuid(params.pollId);
  const storyId = optionalUuid(params.storyId);

  const channels = [
    {
      name: "live-matches",
      description: "Promene statusa, rezultata i rasporeda live utakmica.",
      events: [
        postgresEvent("matches", "*"),
        postgresEvent("match_events", "INSERT"),
        postgresEvent("player_match_stats", "*")
      ]
    },
    {
      name: "stories",
      description: "Novi story, pregledi i lajkovi story-a.",
      events: [
        postgresEvent("stories", "*"),
        postgresEvent("story_views", "INSERT"),
        postgresEvent("story_likes", "*")
      ]
    },
    {
      name: "goal-polls",
      description: "Live glasanje za najlepši gol i promene opcija ankete.",
      events: [
        postgresEvent("goal_polls", "*"),
        postgresEvent("goal_poll_options", "*"),
        postgresEvent("goal_votes", "*")
      ]
    }
  ];

  if (matchId) {
    channels.push({
      name: `match-${matchId}`,
      description: "Detaljan live kanal za jednu utakmicu.",
      events: [
        postgresEvent("matches", "*", `id=eq.${matchId}`),
        postgresEvent("match_events", "*", `match_id=eq.${matchId}`),
        postgresEvent("match_lineups", "*", `match_id=eq.${matchId}`),
        postgresEvent("player_match_stats", "*", `match_id=eq.${matchId}`),
        postgresEvent("media_links", "*", `match_id=eq.${matchId}`)
      ]
    });
  }

  if (gameweekId) {
    channels.push({
      name: `gameweek-${gameweekId}`,
      description: "Fantasy scoring i promene fantasy tima za jedno kolo.",
      events: [
        postgresEvent("gameweeks", "*", `id=eq.${gameweekId}`),
        postgresEvent("matches", "*", `gameweek_id=eq.${gameweekId}`),
        postgresEvent("fantasy_team_picks", "*", `gameweek_id=eq.${gameweekId}`)
      ]
    });
  }

  if (pollId) {
    channels.push({
      name: `goal-poll-${pollId}`,
      description: "Live rezultat jedne ankete.",
      events: [
        postgresEvent("goal_polls", "*", `id=eq.${pollId}`),
        postgresEvent("goal_poll_options", "*", `poll_id=eq.${pollId}`),
        postgresEvent("goal_votes", "*", `poll_id=eq.${pollId}`)
      ]
    });
  }

  if (storyId) {
    channels.push({
      name: `story-${storyId}`,
      description: "Pregledi i lajkovi jednog story-a.",
      events: [
        postgresEvent("stories", "*", `id=eq.${storyId}`),
        postgresEvent("story_views", "INSERT", `story_id=eq.${storyId}`),
        postgresEvent("story_likes", "*", `story_id=eq.${storyId}`)
      ]
    });
  }

  if (user?.id) {
    channels.push({
      name: `profile-${user.id}`,
      description: "Privatne promene ulogovanog korisnika.",
      private: true,
      events: [
        postgresEvent("profiles", "*", `id=eq.${user.id}`),
        postgresEvent("fantasy_teams", "*", `user_id=eq.${user.id}`)
      ]
    });
  }

  return {
    enabled: true,
    provider: "supabase",
    url: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    requiresAuthForPrivateChannels: true,
    tables: [...PUBLIC_TABLES],
    channels
  };
}

function postgresEvent(table, event, filter = "") {
  return {
    kind: "postgres_changes",
    schema: "public",
    table,
    event,
    filter
  };
}

function optionalUuid(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw httpError(400, "Realtime filter nije validan.");
  }
  return text;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
