-- Frozen historical snapshot: schema changes going forward are made through Prisma
-- Migrate (apps/api/prisma/schema.prisma + apps/api/prisma/migrations/), not by
-- hand-editing this file. This file is no longer applied for new changes.

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('fan', 'verified_player', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.verification_status as enum ('none', 'pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.competition_status as enum ('draft', 'scheduled', 'active', 'finished', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_status as enum ('scheduled', 'live', 'finished', 'postponed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.media_type as enum ('image', 'video', 'youtube', 'link');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_event_type as enum (
    'kickoff',
    'goal',
    'assist',
    'shot_on_target',
    'goalkeeper_save',
    'corner',
    'foul',
    'yellow_card',
    'red_card',
    'substitution',
    'halftime',
    'fulltime'
  );
exception when duplicate_object then null;
end $$;

alter type public.match_event_type add value if not exists 'second_half';
alter type public.match_event_type add value if not exists 'shot_off_target';
alter type public.match_event_type add value if not exists 'penalty';
alter type public.match_event_type add value if not exists 'two_minutes';

create or replace function public.calculate_base_price(
  fantasy_points integer,
  goals integer,
  assists integer,
  saves integer
)
returns numeric
language sql
immutable
as $$
  select greatest(
    4.00,
    least(
      13.00,
      round((5.00 + (coalesce(fantasy_points, 0) * 0.08) + (coalesce(goals, 0) * 0.12) + (coalesce(assists, 0) * 0.10) + (coalesce(saves, 0) * 0.04))::numeric, 2)
    )
  )
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  display_name text not null,
  avatar_url text,
  role public.user_role not null default 'fan',
  verification_status public.verification_status not null default 'none',
  verified_player_id uuid
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  city_id uuid references public.cities(id) on delete set null,
  name text not null,
  season_name text not null,
  kind text not null default 'league',
  status public.competition_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  legacy_source text,
  legacy_id text
);

alter table public.competitions add column if not exists legacy_source text;
alter table public.competitions add column if not exists legacy_id text;
alter table public.competitions add column if not exists format_summary text;

create table if not exists public.competition_formats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  format_type text not null default 'league',
  teams_count integer,
  settings jsonb not null default '{}'::jsonb,
  unique(competition_id)
);

create table if not exists public.competition_phases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'group',
  sequence integer not null default 1,
  group_count integer,
  teams_per_group integer,
  qualifiers_per_group integer,
  best_third_count integer not null default 0,
  legs integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  unique(competition_id, code)
);

create table if not exists public.competition_phase_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  phase_id uuid not null references public.competition_phases(id) on delete cascade,
  rule_type text not null,
  config jsonb not null default '{}'::jsonb
);

create table if not exists public.competition_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  starts_at timestamptz not null,
  venue text,
  pitch text,
  label text,
  is_reserved boolean not null default false
);

-- A club is the persistent identity behind a team (name, logo, home city) that
-- carries across every competition/season it ever plays in. `teams` rows stay
-- scoped to one competition each (matches/standings/lineups/fantasy all key off
-- teams.id unchanged) but now point back to the club they belong to, so a new
-- team for an already-known club can inherit its roster instead of starting empty.
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  short_name text,
  logo_url text,
  city_id uuid references public.cities(id) on delete set null,
  is_active boolean not null default true
);

create unique index if not exists clubs_name_unique on public.clubs (lower(trim(name)));

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid references public.competitions(id) on delete cascade,
  name text not null,
  short_name text,
  logo_url text,
  group_name text,
  placement text,
  is_active boolean not null default true,
  legacy_source text,
  legacy_id text
);

alter table public.teams add column if not exists legacy_source text;
alter table public.teams add column if not exists legacy_id text;
alter table public.teams add column if not exists source_team_id uuid references public.teams(id) on delete set null;
alter table public.teams add column if not exists club_id uuid references public.clubs(id) on delete set null;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  team_id uuid references public.teams(id) on delete set null,
  display_name text not null,
  position text,
  shirt_number integer,
  avatar_url text,
  is_active boolean not null default true,
  legacy_source text,
  legacy_id text
);

alter table public.players add column if not exists legacy_source text;
alter table public.players add column if not exists legacy_id text;
alter table public.players add column if not exists club_id uuid references public.clubs(id) on delete set null;
-- Mirrors teams.source_team_id: when a club's roster is cloned into another
-- competition (cloneCompetitionTeams/addClubToCompetition), this points back at
-- the original player row, so a verified-player badge (profiles.verified_player_id)
-- can eventually be resolved across clones instead of only matching the exact
-- competition the player was first verified in.
alter table public.players add column if not exists source_player_id uuid references public.players(id) on delete set null;

do $$
begin
  alter table public.profiles
    add constraint profiles_verified_player_fk
    foreign key (verified_player_id) references public.players(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Expo push token for this device - overwritten on each successful registration, so a
-- user re-installing or switching devices simply replaces the old token.
alter table public.profiles add column if not exists push_token text;

-- Many-to-many player<->team membership. Replaces reliance on players.team_id
-- (which forced a real person to be duplicated into a brand-new players row
-- every time their club entered another competition). A player now has exactly
-- one players row for life; team_rosters records which team(s)/competition(s)
-- they're currently rostered on. players.team_id is left in place (unused by
-- new code) rather than dropped, to avoid touching existing data unnecessarily.
create table if not exists public.team_rosters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  is_active boolean not null default true,
  unique (player_id, team_id)
);
create index if not exists team_rosters_player_idx on public.team_rosters(player_id);
create index if not exists team_rosters_team_idx on public.team_rosters(team_id);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid references public.competitions(id) on delete cascade,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  phase text not null default 'group',
  group_name text,
  round integer,
  scheduled_at timestamptz not null,
  venue text,
  status public.match_status not null default 'scheduled',
  home_score integer not null default 0,
  away_score integer not null default 0,
  home_formation text,
  away_formation text,
  sponsor_id uuid,
  phase_id uuid references public.competition_phases(id) on delete set null,
  legacy_source text,
  legacy_id text
);

alter table public.matches add column if not exists legacy_source text;
alter table public.matches add column if not exists legacy_id text;
alter table public.matches add column if not exists phase_id uuid references public.competition_phases(id) on delete set null;
-- Live clock: period is the current half/pause, period_started_at anchors the
-- client-computed elapsed minute (now - period_started_at), half_length_minutes
-- lets a match customize its half length. No "current minute" is stored - every
-- viewer derives it locally from these three fields, so admin and fans always agree.
alter table public.matches add column if not exists period text not null default 'not_started';
alter table public.matches add column if not exists period_started_at timestamptz;
alter table public.matches add column if not exists half_length_minutes integer not null default 20;

create table if not exists public.gameweeks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  locks_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft',
  unique(competition_id, name)
);

alter table public.matches add column if not exists gameweek_id uuid references public.gameweeks(id) on delete set null;

create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  is_starter boolean not null default false,
  is_goalkeeper boolean not null default false,
  pitch_x numeric,
  pitch_y numeric,
  shirt_number integer,
  legacy_source text,
  legacy_id text,
  unique(match_id, player_id)
);

alter table public.match_lineups add column if not exists legacy_source text;
alter table public.match_lineups add column if not exists legacy_id text;

-- A verified player's self-reported availability for one specific upcoming match -
-- 'unknown' (orange, not answered yet) until they respond 'playing' (green) or
-- 'not_playing' (red) to the day-before push reminder, so fantasy managers can see
-- at a glance whether picking them is safe. Only ever created for players whose
-- profile is claimed+approved (profiles.verified_player_id) - unclaimed players have
-- no rows here and always read as 'unknown'.
create table if not exists public.player_match_availability (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'unknown' check (status in ('unknown', 'playing', 'not_playing')),
  notified_at timestamptz,
  responded_at timestamptz,
  unique (match_id, player_id)
);
create index if not exists player_match_availability_match_idx on public.player_match_availability(match_id);
create index if not exists player_match_availability_player_idx on public.player_match_availability(player_id);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid not null references public.matches(id) on delete cascade,
  minute integer not null check (minute >= 0 and minute <= 130),
  type public.match_event_type not null,
  team_id uuid references public.teams(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  related_player_id uuid references public.players(id) on delete set null,
  score_home integer,
  score_away integer,
  text text,
  fantasy_points_delta integer not null default 0,
  legacy_source text,
  legacy_id text
);

alter table public.match_events add column if not exists legacy_source text;
alter table public.match_events add column if not exists legacy_id text;

create table if not exists public.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  goals integer not null default 0,
  assists integer not null default 0,
  shots_on_target integer not null default 0,
  shots integer not null default 0,
  shots_off_target integer not null default 0,
  saves integer not null default 0,
  goals_conceded integer not null default 0,
  corners_won integer not null default 0,
  fouls integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  two_minutes integer not null default 0,
  own_goals integer not null default 0,
  penalties integer not null default 0,
  penalty_goals integer not null default 0,
  penalty_saves integer not null default 0,
  penalty_misses integer not null default 0,
  fantasy_points integer not null default 0,
  legacy_source text,
  legacy_id text,
  unique(match_id, player_id)
);

alter table public.player_match_stats add column if not exists shots integer not null default 0;
alter table public.player_match_stats add column if not exists shots_off_target integer not null default 0;
alter table public.player_match_stats add column if not exists goals_conceded integer not null default 0;
alter table public.player_match_stats add column if not exists two_minutes integer not null default 0;
alter table public.player_match_stats add column if not exists own_goals integer not null default 0;
alter table public.player_match_stats add column if not exists penalties integer not null default 0;
alter table public.player_match_stats add column if not exists penalty_goals integer not null default 0;
alter table public.player_match_stats add column if not exists penalty_saves integer not null default 0;
alter table public.player_match_stats add column if not exists penalty_misses integer not null default 0;
alter table public.player_match_stats add column if not exists legacy_source text;
alter table public.player_match_stats add column if not exists legacy_id text;

create table if not exists public.team_standings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_name text,
  played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  points integer not null default 0,
  form text,
  position integer,
  legacy_source text,
  legacy_id text,
  unique(competition_id, team_id, group_name)
);

create table if not exists public.player_season_stats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  appearances integer not null default 0,
  minutes_played integer not null default 0,
  goals integer not null default 0,
  assists integer not null default 0,
  shots integer not null default 0,
  shots_on_target integer not null default 0,
  saves integer not null default 0,
  goals_conceded integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  fouls integer not null default 0,
  two_minutes integer not null default 0,
  fantasy_points integer not null default 0,
  own_goals integer not null default 0,
  penalties integer not null default 0,
  penalty_goals integer not null default 0,
  penalty_saves integer not null default 0,
  penalty_misses integer not null default 0,
  legacy_source text,
  legacy_id text,
  unique(competition_id, player_id)
);

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  body text,
  media_url text,
  media_type public.media_type,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.story_folders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  logo_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create unique index if not exists story_folders_title_key on public.story_folders(title);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  folder_id uuid references public.story_folders(id) on delete cascade,
  title text,
  media_url text not null,
  media_type public.media_type not null,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_by_user_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique(story_id, user_id)
);

create table if not exists public.story_likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unique(story_id, user_id)
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  subtitle text,
  logo_url text,
  target_url text,
  is_active boolean not null default true
);

-- 'weekly' = the single "goal of the week" banner (getActiveSponsorDb/updateSponsorDb,
-- always exactly one such row); 'match' = the per-match sponsor list a live match can
-- be assigned one of (listSponsorsDb/createSponsorDb). Without this, both features
-- shared one undifferentiated table and could overwrite/hijack each other.
alter table public.sponsors add column if not exists kind text not null default 'weekly';

-- Sponsor logos arrive with their own baked-in background (transparent, white, black,
-- brand-colored, ...) - a single hardcoded white card behind every logo looks broken
-- for any logo that isn't a transparent PNG on white. Admin picks 'light' or 'dark'
-- per sponsor when uploading the logo, and the rendering tile matches it.
alter table public.sponsors add column if not exists logo_background text not null default 'light';

do $$
begin
  alter table public.matches
    add constraint matches_sponsor_fk
    foreign key (sponsor_id) references public.sponsors(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.media_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid references public.matches(id) on delete cascade,
  kind public.media_type not null default 'youtube',
  label text not null default 'Snimak utakmice',
  url text not null
);

create table if not exists public.goal_polls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default 'Najlepsi gol nedelje',
  copy text,
  status text not null default 'draft',
  ends_at timestamptz,
  winner_option_id uuid,
  created_by_user_id uuid references public.profiles(id) on delete set null
);

alter table public.goal_polls add column if not exists copy text;
alter table public.goal_polls add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.goal_poll_options (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  poll_id uuid not null references public.goal_polls(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  title text not null,
  video_url text not null,
  sort_order integer not null default 0
);

alter table public.goal_poll_options add column if not exists sort_order integer not null default 0;

do $$
begin
  alter table public.goal_polls
    add constraint goal_polls_winner_option_fk
    foreign key (winner_option_id) references public.goal_poll_options(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.goal_votes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  poll_id uuid not null references public.goal_polls(id) on delete cascade,
  option_id uuid not null references public.goal_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unique(poll_id, user_id)
);

create table if not exists public.match_predictions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pick text not null check (pick in ('home', 'draw', 'away')),
  unique(match_id, user_id)
);

create table if not exists public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  name text not null,
  total_points integer not null default 0,
  last_scored_at timestamptz,
  unique(user_id, competition_id)
);

create table if not exists public.fantasy_player_pool (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  base_price numeric(6,2) not null default 5.00,
  current_price numeric(6,2) not null default 5.00,
  is_available boolean not null default true,
  availability_note text,
  unique(competition_id, player_id)
);

-- When true, syncFantasySeasonPool must never overwrite base_price/current_price
-- for this row - it's an admin-set preseason price, not the calculated one.
alter table public.fantasy_player_pool add column if not exists is_price_locked boolean not null default false;

create table if not exists public.fantasy_team_picks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  gameweek_id uuid references public.gameweeks(id) on delete cascade,
  slot text not null,
  is_captain boolean not null default false,
  locked_at timestamptz,
  points integer not null default 0,
  unique(fantasy_team_id, player_id, gameweek_id),
  unique(fantasy_team_id, slot, gameweek_id)
);

alter table public.fantasy_teams add column if not exists last_scored_at timestamptz;
alter table public.fantasy_team_picks add column if not exists gameweek_id uuid references public.gameweeks(id) on delete cascade;
alter table public.fantasy_team_picks add column if not exists locked_at timestamptz;
alter table public.fantasy_team_picks add column if not exists points integer not null default 0;

do $$
begin
  alter table public.fantasy_team_picks drop constraint if exists fantasy_team_picks_fantasy_team_id_player_id_key;
exception when undefined_table then null;
end $$;

-- Fantasy seasons: one season can span multiple leagues/cities (competitions).
create table if not exists public.fantasy_seasons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  status text not null default 'draft',
  gameweek_length_days integer not null default 7,
  starts_at timestamptz,
  ends_at timestamptz
);

create table if not exists public.fantasy_season_competitions (
  fantasy_season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fantasy_season_id, competition_id)
);

-- Fantasy gameweeks run on a fixed calendar independent of each league's own schedule.
create table if not exists public.fantasy_gameweeks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fantasy_season_id uuid not null references public.fantasy_seasons(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  locks_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft',
  unique(fantasy_season_id, name)
);

alter table public.fantasy_teams add column if not exists fantasy_season_id uuid references public.fantasy_seasons(id) on delete cascade;
alter table public.fantasy_player_pool add column if not exists fantasy_season_id uuid references public.fantasy_seasons(id) on delete set null;
alter table public.fantasy_team_picks add column if not exists fantasy_gameweek_id uuid references public.fantasy_gameweeks(id) on delete cascade;

do $$
begin
  alter table public.fantasy_player_pool drop constraint if exists fantasy_player_pool_fantasy_season_id_fkey;
  alter table public.fantasy_player_pool
    add constraint fantasy_player_pool_fantasy_season_id_fkey
    foreign key (fantasy_season_id) references public.fantasy_seasons(id) on delete set null;
exception when undefined_table then null;
end $$;

-- The original unique(competition_id, player_id) meant two fantasy seasons
-- sharing the same underlying league would fight over the exact same pool
-- rows - syncing one season would silently reassign (steal) another season's
-- players. Split into two properly-scoped partial uniques instead: one row
-- per (season, player) for season-based pools, one row per (competition,
-- player) only for the legacy season-less pool (fantasy_season_id null).
alter table public.fantasy_player_pool drop constraint if exists fantasy_player_pool_competition_id_player_id_key;
create unique index if not exists fantasy_player_pool_season_player_key
  on public.fantasy_player_pool(fantasy_season_id, player_id) where fantasy_season_id is not null;
create unique index if not exists fantasy_player_pool_legacy_competition_player_key
  on public.fantasy_player_pool(competition_id, player_id) where fantasy_season_id is null;

create unique index if not exists fantasy_teams_user_season_key on public.fantasy_teams(user_id, fantasy_season_id) where fantasy_season_id is not null;
create unique index if not exists fantasy_team_picks_team_player_fgw_key on public.fantasy_team_picks(fantasy_team_id, player_id, fantasy_gameweek_id) where fantasy_gameweek_id is not null;
create unique index if not exists fantasy_team_picks_team_slot_fgw_key on public.fantasy_team_picks(fantasy_team_id, slot, fantasy_gameweek_id) where fantasy_gameweek_id is not null;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  player_name text,
  status public.verification_status not null default 'pending',
  admin_note text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists competitions_city_idx on public.competitions(city_id);
create unique index if not exists competitions_legacy_unique on public.competitions(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists competition_formats_competition_idx on public.competition_formats(competition_id);
create index if not exists competition_phases_competition_idx on public.competition_phases(competition_id, sequence);
create index if not exists competition_phase_rules_phase_idx on public.competition_phase_rules(phase_id);
create index if not exists competition_schedule_slots_competition_idx on public.competition_schedule_slots(competition_id, starts_at);
create index if not exists teams_competition_idx on public.teams(competition_id);
create unique index if not exists teams_legacy_unique on public.teams(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists teams_club_idx on public.teams(club_id);
create index if not exists players_team_idx on public.players(team_id);
create unique index if not exists players_legacy_unique on public.players(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists players_club_idx on public.players(club_id);
create index if not exists matches_competition_idx on public.matches(competition_id);
create unique index if not exists matches_legacy_unique on public.matches(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists matches_status_idx on public.matches(status);
create index if not exists matches_gameweek_idx on public.matches(gameweek_id);
create index if not exists gameweeks_competition_idx on public.gameweeks(competition_id, starts_at);
create unique index if not exists match_lineups_match_player_unique on public.match_lineups(match_id, player_id);
create index if not exists match_events_match_idx on public.match_events(match_id, minute);
create unique index if not exists match_events_legacy_unique on public.match_events(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists player_match_stats_match_idx on public.player_match_stats(match_id);
create unique index if not exists player_match_stats_match_player_unique on public.player_match_stats(match_id, player_id);
create unique index if not exists player_match_stats_legacy_unique on public.player_match_stats(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create unique index if not exists team_standings_legacy_unique on public.team_standings(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create unique index if not exists player_season_stats_legacy_unique on public.player_season_stats(legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null;
create index if not exists news_posts_published_idx on public.news_posts(is_published, published_at desc);
create index if not exists stories_folder_expires_idx on public.stories(folder_id, expires_at desc);
create index if not exists goal_votes_poll_idx on public.goal_votes(poll_id);
create index if not exists match_predictions_match_idx on public.match_predictions(match_id);
create index if not exists goal_poll_options_poll_idx on public.goal_poll_options(poll_id, sort_order);
create index if not exists fantasy_teams_user_idx on public.fantasy_teams(user_id);
create index if not exists fantasy_picks_team_gameweek_idx on public.fantasy_team_picks(fantasy_team_id, gameweek_id);
create index if not exists fantasy_player_pool_competition_idx on public.fantasy_player_pool(competition_id, is_available);
create index if not exists fantasy_player_pool_player_idx on public.fantasy_player_pool(player_id);
create index if not exists fantasy_player_pool_season_idx on public.fantasy_player_pool(fantasy_season_id, is_available);
create index if not exists fantasy_gameweeks_season_idx on public.fantasy_gameweeks(fantasy_season_id, starts_at);
create index if not exists fantasy_season_competitions_season_idx on public.fantasy_season_competitions(fantasy_season_id);
create index if not exists fantasy_picks_team_fantasy_gameweek_idx on public.fantasy_team_picks(fantasy_team_id, fantasy_gameweek_id);

grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.cities, public.competitions, public.teams, public.players,
  public.matches, public.match_lineups, public.match_events, public.player_match_stats,
  public.team_standings, public.player_season_stats, public.gameweeks,
  public.competition_formats, public.competition_phases, public.competition_phase_rules,
  public.competition_schedule_slots,
  public.story_folders, public.stories, public.sponsors, public.media_links,
  public.goal_polls, public.goal_poll_options to anon, authenticated;

grant select on public.news_posts to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.story_views to authenticated;
grant select, insert, delete on public.story_likes to authenticated;
grant select, insert, update, delete on public.goal_votes to authenticated;
grant select, insert, update, delete on public.match_predictions to authenticated;
grant select, insert, update, delete on public.fantasy_teams to authenticated;
grant select, insert, update, delete on public.fantasy_team_picks to authenticated;
grant select on public.fantasy_player_pool to anon, authenticated;
grant select on public.fantasy_seasons, public.fantasy_season_competitions, public.fantasy_gameweeks to anon, authenticated;
grant select, insert on public.verification_requests to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_formats enable row level security;
alter table public.competition_phases enable row level security;
alter table public.competition_phase_rules enable row level security;
alter table public.competition_schedule_slots enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.team_rosters enable row level security;
alter table public.matches enable row level security;
alter table public.gameweeks enable row level security;
alter table public.match_lineups enable row level security;
alter table public.player_match_availability enable row level security;
alter table public.match_events enable row level security;
alter table public.player_match_stats enable row level security;
alter table public.team_standings enable row level security;
alter table public.player_season_stats enable row level security;
alter table public.news_posts enable row level security;
alter table public.story_folders enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_likes enable row level security;
alter table public.sponsors enable row level security;
alter table public.media_links enable row level security;
alter table public.goal_polls enable row level security;
alter table public.goal_poll_options enable row level security;
alter table public.goal_votes enable row level security;
alter table public.match_predictions enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.fantasy_team_picks enable row level security;
alter table public.fantasy_player_pool enable row level security;
alter table public.fantasy_seasons enable row level security;
alter table public.fantasy_season_competitions enable row level security;
alter table public.fantasy_gameweeks enable row level security;
alter table public.verification_requests enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cities','competitions','teams','players','team_rosters','matches','match_lineups','player_match_availability','match_events',
    'player_match_stats','team_standings','player_season_stats','gameweeks','story_folders','stories','sponsors','media_links',
    'goal_polls','goal_poll_options','competition_formats','competition_phases','competition_phase_rules',
    'competition_schedule_slots','fantasy_player_pool','fantasy_seasons','fantasy_season_competitions','fantasy_gameweeks'
  ]
  loop
    execute format('drop policy if exists "public read %I" on public.%I', table_name, table_name);
    execute format('create policy "public read %I" on public.%I for select to anon, authenticated using (true)', table_name, table_name);
  end loop;
end $$;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id and role <> 'admin');

drop policy if exists "public read published news" on public.news_posts;
create policy "public read published news" on public.news_posts
  for select to anon, authenticated
  using (is_published = true);

drop policy if exists "public read active story folders" on public.story_folders;
create policy "public read active story folders" on public.story_folders
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists "public read active stories" on public.stories;
create policy "public read active stories" on public.stories
  for select to anon, authenticated
  using (expires_at > now());

drop policy if exists "story views own insert" on public.story_views;
create policy "story views own insert" on public.story_views
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "story views own read" on public.story_views;
create policy "story views own read" on public.story_views
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "story likes own manage" on public.story_likes;
create policy "story likes own manage" on public.story_likes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "goal votes own manage" on public.goal_votes;
create policy "goal votes own manage" on public.goal_votes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "match predictions own manage" on public.match_predictions;
create policy "match predictions own manage" on public.match_predictions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "fantasy teams own manage" on public.fantasy_teams;
create policy "fantasy teams own manage" on public.fantasy_teams
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "fantasy picks own team manage" on public.fantasy_team_picks;
create policy "fantasy picks own team manage" on public.fantasy_team_picks
  for all to authenticated
  using (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = fantasy_team_id and ft.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.fantasy_teams ft
      where ft.id = fantasy_team_id and ft.user_id = (select auth.uid())
    )
  );

drop policy if exists "verification own insert" on public.verification_requests;
create policy "verification own insert" on public.verification_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "verification own read" on public.verification_requests;
create policy "verification own read" on public.verification_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.cities (name, slug, is_active)
values ('Novi Sad', 'novi-sad', true), ('Zrenjanin', 'zrenjanin', true)
on conflict (slug) do nothing;

insert into public.story_folders (title, sort_order, is_active)
values ('Novi Sad', 1, true), ('Zrenjanin', 2, true), ('Gameweek', 3, true)
on conflict (title) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('app-media', 'app-media', true, 104857600, array['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime']),
  ('team-logos', 'team-logos', true, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Backfill: one club per distinct (trimmed, case-insensitive) team name that
-- doesn't have one yet, then link every matching team/player to it. Idempotent
-- and additive only (only ever fills club_id where it is still null) - safe to
-- re-run, never touches existing team/player/match/standings rows.
insert into public.clubs (name, short_name, logo_url, city_id)
select distinct on (lower(trim(t.name)))
  t.name, t.short_name, t.logo_url, c.city_id
from public.teams t
left join public.competitions c on c.id = t.competition_id
where t.club_id is null
order by lower(trim(t.name)), t.created_at asc
on conflict (lower(trim(name))) do nothing;

update public.teams t
set club_id = clubs.id
from public.clubs
where t.club_id is null and lower(trim(t.name)) = lower(trim(clubs.name));

update public.players p
set club_id = t.club_id
from public.teams t
where p.team_id = t.id and p.club_id is null and t.club_id is not null;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'matches',
    'match_events',
    'match_lineups',
    'player_match_stats',
    'goal_votes',
    'goal_polls',
    'goal_poll_options',
    'stories',
    'story_views',
    'story_likes',
    'gameweeks',
    'fantasy_teams',
    'fantasy_team_picks',
    'fantasy_gameweeks',
    'media_links'
  ]
  loop
    execute format('alter table public.%I replica identity full', realtime_table);
    begin
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
