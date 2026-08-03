-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "auth"."aal_level" AS ENUM ('aal1', 'aal2', 'aal3');

-- CreateEnum
CREATE TYPE "auth"."code_challenge_method" AS ENUM ('s256', 'plain');

-- CreateEnum
CREATE TYPE "auth"."factor_status" AS ENUM ('unverified', 'verified');

-- CreateEnum
CREATE TYPE "auth"."factor_type" AS ENUM ('totp', 'webauthn', 'phone');

-- CreateEnum
CREATE TYPE "auth"."oauth_authorization_status" AS ENUM ('pending', 'approved', 'denied', 'expired');

-- CreateEnum
CREATE TYPE "auth"."oauth_client_type" AS ENUM ('public', 'confidential');

-- CreateEnum
CREATE TYPE "auth"."oauth_registration_type" AS ENUM ('dynamic', 'manual');

-- CreateEnum
CREATE TYPE "auth"."oauth_response_type" AS ENUM ('code');

-- CreateEnum
CREATE TYPE "auth"."one_time_token_type" AS ENUM ('confirmation_token', 'reauthentication_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token');

-- CreateEnum
CREATE TYPE "competition_status" AS ENUM ('draft', 'scheduled', 'active', 'finished', 'archived');

-- CreateEnum
CREATE TYPE "match_event_type" AS ENUM ('kickoff', 'goal', 'assist', 'shot_on_target', 'goalkeeper_save', 'corner', 'foul', 'yellow_card', 'red_card', 'substitution', 'halftime', 'fulltime', 'second_half', 'shot_off_target', 'penalty', 'two_minutes');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('scheduled', 'live', 'finished', 'postponed', 'cancelled');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('image', 'video', 'youtube', 'link');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('fan', 'verified_player', 'admin');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "logo_url" TEXT,
    "city_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_formats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "format_type" TEXT NOT NULL DEFAULT 'league',
    "teams_count" INTEGER,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "competition_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_phase_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phase_id" UUID NOT NULL,
    "rule_type" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "competition_phase_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_phases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'group',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "group_count" INTEGER,
    "teams_per_group" INTEGER,
    "qualifiers_per_group" INTEGER,
    "best_third_count" INTEGER NOT NULL DEFAULT 0,
    "legs" INTEGER NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "competition_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_schedule_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" TEXT,
    "pitch" TEXT,
    "label" TEXT,
    "is_reserved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "competition_schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "city_id" UUID,
    "name" TEXT NOT NULL,
    "season_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'league',
    "status" "competition_status" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "legacy_source" TEXT,
    "legacy_id" TEXT,
    "format_summary" TEXT,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_gameweeks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fantasy_season_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "locks_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "fantasy_gameweeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_player_pool" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "base_price" DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    "current_price" DECIMAL(6,2) NOT NULL DEFAULT 5.00,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "availability_note" TEXT,
    "fantasy_season_id" UUID,
    "is_price_locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fantasy_player_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_season_competitions" (
    "fantasy_season_id" UUID NOT NULL,
    "competition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_season_competitions_pkey" PRIMARY KEY ("fantasy_season_id","competition_id")
);

-- CreateTable
CREATE TABLE "fantasy_seasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "gameweek_length_days" INTEGER NOT NULL DEFAULT 7,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),

    CONSTRAINT "fantasy_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_team_picks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fantasy_team_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "is_captain" BOOLEAN NOT NULL DEFAULT false,
    "gameweek_id" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "points" INTEGER NOT NULL DEFAULT 0,
    "fantasy_gameweek_id" UUID,

    CONSTRAINT "fantasy_team_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "competition_id" UUID,
    "name" TEXT NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "last_scored_at" TIMESTAMPTZ(6),
    "fantasy_season_id" UUID,

    CONSTRAINT "fantasy_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gameweeks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "locks_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "gameweeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_poll_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poll_id" UUID NOT NULL,
    "player_id" UUID,
    "player_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "goal_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL DEFAULT 'Najlepsi gol nedelje',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ends_at" TIMESTAMPTZ(6),
    "winner_option_id" UUID,
    "copy" TEXT,
    "created_by_user_id" UUID,

    CONSTRAINT "goal_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "goal_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID NOT NULL,
    "minute" INTEGER NOT NULL,
    "type" "match_event_type" NOT NULL,
    "team_id" UUID,
    "player_id" UUID,
    "related_player_id" UUID,
    "score_home" INTEGER,
    "score_away" INTEGER,
    "text" TEXT,
    "fantasy_points_delta" INTEGER NOT NULL DEFAULT 0,
    "legacy_source" TEXT,
    "legacy_id" TEXT,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_lineups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID NOT NULL,
    "team_id" UUID,
    "player_id" UUID,
    "is_starter" BOOLEAN NOT NULL DEFAULT false,
    "is_goalkeeper" BOOLEAN NOT NULL DEFAULT false,
    "pitch_x" DECIMAL,
    "pitch_y" DECIMAL,
    "shirt_number" INTEGER,
    "legacy_source" TEXT,
    "legacy_id" TEXT,

    CONSTRAINT "match_lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_predictions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pick" TEXT NOT NULL,

    CONSTRAINT "match_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID,
    "home_team_id" UUID,
    "away_team_id" UUID,
    "phase" TEXT NOT NULL DEFAULT 'group',
    "group_name" TEXT,
    "round" INTEGER,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" TEXT,
    "status" "match_status" NOT NULL DEFAULT 'scheduled',
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "home_formation" TEXT,
    "away_formation" TEXT,
    "sponsor_id" UUID,
    "legacy_source" TEXT,
    "legacy_id" TEXT,
    "gameweek_id" UUID,
    "phase_id" UUID,
    "period" TEXT NOT NULL DEFAULT 'not_started',
    "period_started_at" TIMESTAMPTZ(6),
    "half_length_minutes" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID,
    "kind" "media_type" NOT NULL DEFAULT 'youtube',
    "label" TEXT NOT NULL DEFAULT 'Snimak utakmice',
    "url" TEXT NOT NULL,

    CONSTRAINT "media_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "media_url" TEXT,
    "media_type" "media_type",
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,

    CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_match_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "notified_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "player_match_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_match_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "match_id" UUID NOT NULL,
    "team_id" UUID,
    "player_id" UUID,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots_on_target" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "corners_won" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "yellow_cards" INTEGER NOT NULL DEFAULT 0,
    "red_cards" INTEGER NOT NULL DEFAULT 0,
    "fantasy_points" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shots_off_target" INTEGER NOT NULL DEFAULT 0,
    "goals_conceded" INTEGER NOT NULL DEFAULT 0,
    "two_minutes" INTEGER NOT NULL DEFAULT 0,
    "own_goals" INTEGER NOT NULL DEFAULT 0,
    "penalties" INTEGER NOT NULL DEFAULT 0,
    "penalty_goals" INTEGER NOT NULL DEFAULT 0,
    "penalty_saves" INTEGER NOT NULL DEFAULT 0,
    "penalty_misses" INTEGER NOT NULL DEFAULT 0,
    "legacy_source" TEXT,
    "legacy_id" TEXT,

    CONSTRAINT "player_match_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_season_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "team_id" UUID,
    "player_id" UUID,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "minutes_played" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shots_on_target" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "goals_conceded" INTEGER NOT NULL DEFAULT 0,
    "yellow_cards" INTEGER NOT NULL DEFAULT 0,
    "red_cards" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "two_minutes" INTEGER NOT NULL DEFAULT 0,
    "fantasy_points" INTEGER NOT NULL DEFAULT 0,
    "own_goals" INTEGER NOT NULL DEFAULT 0,
    "penalties" INTEGER NOT NULL DEFAULT 0,
    "penalty_goals" INTEGER NOT NULL DEFAULT 0,
    "penalty_saves" INTEGER NOT NULL DEFAULT 0,
    "penalty_misses" INTEGER NOT NULL DEFAULT 0,
    "legacy_source" TEXT,
    "legacy_id" TEXT,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team_id" UUID,
    "display_name" TEXT NOT NULL,
    "position" TEXT,
    "shirt_number" INTEGER,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_source" TEXT,
    "legacy_id" TEXT,
    "club_id" UUID,
    "source_player_id" UUID,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'fan',
    "verification_status" "verification_status" NOT NULL DEFAULT 'none',
    "verified_player_id" UUID,
    "push_token" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "logo_url" TEXT,
    "target_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "kind" TEXT NOT NULL DEFAULT 'weekly',

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folder_id" UUID,
    "title" TEXT,
    "media_url" TEXT NOT NULL,
    "media_type" "media_type" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + '72:00:00'::interval),
    "created_by_user_id" UUID,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "logo_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "story_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "story_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "story_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "story_id" UUID NOT NULL,
    "user_id" UUID,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_rosters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "player_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "team_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_standings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "group_name" TEXT,
    "played" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goals_for" INTEGER NOT NULL DEFAULT 0,
    "goals_against" INTEGER NOT NULL DEFAULT 0,
    "goal_difference" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "form" TEXT,
    "position" INTEGER,
    "legacy_source" TEXT,
    "legacy_id" TEXT,

    CONSTRAINT "team_standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "competition_id" UUID,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "logo_url" TEXT,
    "group_name" TEXT,
    "placement" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_source" TEXT,
    "legacy_id" TEXT,
    "source_team_id" UUID,
    "club_id" UUID,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "city_id" UUID,
    "team_id" UUID,
    "player_id" UUID,
    "player_name" TEXT,
    "status" "verification_status" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "competition_formats_competition_id_key" ON "competition_formats"("competition_id");

-- CreateIndex
CREATE INDEX "competition_formats_competition_idx" ON "competition_formats"("competition_id");

-- CreateIndex
CREATE INDEX "competition_phase_rules_phase_idx" ON "competition_phase_rules"("phase_id");

-- CreateIndex
CREATE INDEX "competition_phases_competition_idx" ON "competition_phases"("competition_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "competition_phases_competition_id_code_key" ON "competition_phases"("competition_id", "code");

-- CreateIndex
CREATE INDEX "competition_schedule_slots_competition_idx" ON "competition_schedule_slots"("competition_id", "starts_at");

-- CreateIndex
CREATE INDEX "competitions_city_idx" ON "competitions"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_legacy_unique" ON "competitions"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "fantasy_gameweeks_season_idx" ON "fantasy_gameweeks"("fantasy_season_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_gameweeks_fantasy_season_id_name_key" ON "fantasy_gameweeks"("fantasy_season_id", "name");

-- CreateIndex
CREATE INDEX "fantasy_player_pool_competition_idx" ON "fantasy_player_pool"("competition_id", "is_available");

-- CreateIndex
CREATE INDEX "fantasy_player_pool_player_idx" ON "fantasy_player_pool"("player_id");

-- CreateIndex
CREATE INDEX "fantasy_player_pool_season_idx" ON "fantasy_player_pool"("fantasy_season_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_player_pool_legacy_competition_player_key" ON "fantasy_player_pool"("competition_id", "player_id") WHERE (fantasy_season_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_player_pool_season_player_key" ON "fantasy_player_pool"("fantasy_season_id", "player_id") WHERE (fantasy_season_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "fantasy_season_competitions_season_idx" ON "fantasy_season_competitions"("fantasy_season_id");

-- CreateIndex
CREATE INDEX "fantasy_picks_team_fantasy_gameweek_idx" ON "fantasy_team_picks"("fantasy_team_id", "fantasy_gameweek_id");

-- CreateIndex
CREATE INDEX "fantasy_picks_team_gameweek_idx" ON "fantasy_team_picks"("fantasy_team_id", "gameweek_id");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_team_picks_team_player_fgw_key" ON "fantasy_team_picks"("fantasy_team_id", "player_id", "fantasy_gameweek_id") WHERE (fantasy_gameweek_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_team_picks_team_slot_fgw_key" ON "fantasy_team_picks"("fantasy_team_id", "slot", "fantasy_gameweek_id") WHERE (fantasy_gameweek_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "fantasy_teams_user_idx" ON "fantasy_teams"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_teams_user_id_competition_id_key" ON "fantasy_teams"("user_id", "competition_id");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_teams_user_season_key" ON "fantasy_teams"("user_id", "fantasy_season_id") WHERE (fantasy_season_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "gameweeks_competition_idx" ON "gameweeks"("competition_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "gameweeks_competition_id_name_key" ON "gameweeks"("competition_id", "name");

-- CreateIndex
CREATE INDEX "goal_poll_options_poll_idx" ON "goal_poll_options"("poll_id", "sort_order");

-- CreateIndex
CREATE INDEX "goal_votes_poll_idx" ON "goal_votes"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "goal_votes_poll_id_user_id_key" ON "goal_votes"("poll_id", "user_id");

-- CreateIndex
CREATE INDEX "match_events_match_idx" ON "match_events"("match_id", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_legacy_unique" ON "match_events"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "match_lineups_match_id_player_id_key" ON "match_lineups"("match_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_lineups_match_player_unique" ON "match_lineups"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "match_predictions_match_idx" ON "match_predictions"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_predictions_match_id_user_id_key" ON "match_predictions"("match_id", "user_id");

-- CreateIndex
CREATE INDEX "matches_competition_idx" ON "matches"("competition_id");

-- CreateIndex
CREATE INDEX "matches_gameweek_idx" ON "matches"("gameweek_id");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "matches_legacy_unique" ON "matches"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "news_posts_published_idx" ON "news_posts"("is_published", "published_at" DESC);

-- CreateIndex
CREATE INDEX "player_match_availability_match_idx" ON "player_match_availability"("match_id");

-- CreateIndex
CREATE INDEX "player_match_availability_player_idx" ON "player_match_availability"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_match_availability_match_id_player_id_key" ON "player_match_availability"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "player_match_stats_match_idx" ON "player_match_stats"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_match_stats_legacy_unique" ON "player_match_stats"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "player_match_stats_match_id_player_id_key" ON "player_match_stats"("match_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_match_stats_match_player_unique" ON "player_match_stats"("match_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stats_competition_id_player_id_key" ON "player_season_stats"("competition_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stats_legacy_unique" ON "player_season_stats"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "players_club_idx" ON "players"("club_id");

-- CreateIndex
CREATE INDEX "players_team_idx" ON "players"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "players_legacy_unique" ON "players"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "stories_folder_expires_idx" ON "stories"("folder_id", "expires_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "story_folders_title_key" ON "story_folders"("title");

-- CreateIndex
CREATE UNIQUE INDEX "story_likes_story_id_user_id_key" ON "story_likes"("story_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_views_story_id_user_id_key" ON "story_views"("story_id", "user_id");

-- CreateIndex
CREATE INDEX "team_rosters_player_idx" ON "team_rosters"("player_id");

-- CreateIndex
CREATE INDEX "team_rosters_team_idx" ON "team_rosters"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_rosters_player_id_team_id_key" ON "team_rosters"("player_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_standings_competition_id_team_id_group_name_key" ON "team_standings"("competition_id", "team_id", "group_name");

-- CreateIndex
CREATE UNIQUE INDEX "team_standings_legacy_unique" ON "team_standings"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "teams_club_idx" ON "teams"("club_id");

-- CreateIndex
CREATE INDEX "teams_competition_idx" ON "teams"("competition_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_legacy_unique" ON "teams"("legacy_source", "legacy_id") WHERE ((legacy_source IS NOT NULL) AND (legacy_id IS NOT NULL));

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competition_formats" ADD CONSTRAINT "competition_formats_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competition_phase_rules" ADD CONSTRAINT "competition_phase_rules_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competition_phases" ADD CONSTRAINT "competition_phases_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competition_schedule_slots" ADD CONSTRAINT "competition_schedule_slots_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_gameweeks" ADD CONSTRAINT "fantasy_gameweeks_fantasy_season_id_fkey" FOREIGN KEY ("fantasy_season_id") REFERENCES "fantasy_seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_player_pool" ADD CONSTRAINT "fantasy_player_pool_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_player_pool" ADD CONSTRAINT "fantasy_player_pool_fantasy_season_id_fkey" FOREIGN KEY ("fantasy_season_id") REFERENCES "fantasy_seasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_player_pool" ADD CONSTRAINT "fantasy_player_pool_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_player_pool" ADD CONSTRAINT "fantasy_player_pool_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_season_competitions" ADD CONSTRAINT "fantasy_season_competitions_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_season_competitions" ADD CONSTRAINT "fantasy_season_competitions_fantasy_season_id_fkey" FOREIGN KEY ("fantasy_season_id") REFERENCES "fantasy_seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_fantasy_gameweek_id_fkey" FOREIGN KEY ("fantasy_gameweek_id") REFERENCES "fantasy_gameweeks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_fantasy_team_id_fkey" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_gameweek_id_fkey" FOREIGN KEY ("gameweek_id") REFERENCES "gameweeks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_team_picks" ADD CONSTRAINT "fantasy_team_picks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_fantasy_season_id_fkey" FOREIGN KEY ("fantasy_season_id") REFERENCES "fantasy_seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gameweeks" ADD CONSTRAINT "gameweeks_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_poll_options" ADD CONSTRAINT "goal_poll_options_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_poll_options" ADD CONSTRAINT "goal_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "goal_polls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_polls" ADD CONSTRAINT "goal_polls_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_polls" ADD CONSTRAINT "goal_polls_winner_option_fk" FOREIGN KEY ("winner_option_id") REFERENCES "goal_poll_options"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_votes" ADD CONSTRAINT "goal_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "goal_poll_options"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_votes" ADD CONSTRAINT "goal_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "goal_polls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "goal_votes" ADD CONSTRAINT "goal_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_related_player_id_fkey" FOREIGN KEY ("related_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_gameweek_id_fkey" FOREIGN KEY ("gameweek_id") REFERENCES "gameweeks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "competition_phases"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_sponsor_fk" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_match_availability" ADD CONSTRAINT "player_match_availability_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_match_availability" ADD CONSTRAINT "player_match_availability_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_source_player_id_fkey" FOREIGN KEY ("source_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_verified_player_fk" FOREIGN KEY ("verified_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "story_folders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_likes" ADD CONSTRAINT "story_likes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_likes" ADD CONSTRAINT "story_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_rosters" ADD CONSTRAINT "team_rosters_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_rosters" ADD CONSTRAINT "team_rosters_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_standings" ADD CONSTRAINT "team_standings_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "team_standings" ADD CONSTRAINT "team_standings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_source_team_id_fkey" FOREIGN KEY ("source_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

