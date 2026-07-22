# Backend hardening status

This app is currently in a safe transition state:

- Auth, profiles, verification requests, news, stories, story stats, sponsors, goal polls, matches, fantasy teams, scoring, uploads, and realtime config now use Supabase when `.env` is configured.
- The API now checks Supabase health through a pooled Postgres connection.
- Request bodies are capped to avoid accidental huge JSON payload crashes.
- Login, register, admin, write, and global request paths have rate limits.
- Public database tables have RLS enabled.
- Data API grants are explicit instead of relying on broad Supabase defaults.

## Migration order

1. Auth and profiles - done
2. Verification requests - done
3. News and stories - done
4. Sponsors - done
5. Goal polls - done
6. Matches, lineups, events, stats, and media - done
7. Fantasy teams, picks, scoring, and gameweek locks - done
8. Production storage for uploaded videos/images - done
9. Realtime subscriptions for live match/fantasy updates - done

Each step should keep the app working before the next one starts.

## Goal poll rules

- Admin creates and edits the poll options.
- Every option must have a video URL.
- A signed-in user can vote once per poll.
- Clicking the same option again removes that user's vote.
- Voting for a different option while a vote already exists is blocked until the user removes the current vote.
- If the poll ends with one clear leader, that option becomes the winner.
- If the poll ends tied, the poll enters `tiebreak` status and admin must choose the winner.
- Admin statistics can list voters and vote totals.

## Match rules

- Admin creates matches against existing competitions and teams.
- Admin can switch match status between scheduled, live, finished, postponed, and cancelled.
- Lineups replace the previous lineup for that match in one operation.
- Match events are written transactionally so a failed event cannot partially change the score.
- Goal events update the match score and player fantasy stats.
- Related player on a goal is treated as the assist provider.
- Saves, cards, corners, fouls, and shots on target update player match stats.
- Media links are stored per match for YouTube/live/highlight access.
- Public match detail returns match info, lineups, events, player stats, and media in one payload.

## Fantasy rules

- A user can have one fantasy team per competition.
- Picks are tied to a gameweek so the same player can be selected again in a later round without corrupting history.
- Each gameweek has `starts_at`, `locks_at`, optional `ends_at`, and a status.
- User picks are blocked after `locks_at` or when the gameweek is no longer `draft/open`.
- Current server rule allows up to 5 selected players and exactly one captain.
- Captain points are doubled during scoring.
- Gameweek scoring is calculated from real `player_match_stats` connected through matches assigned to that gameweek.
- Leaderboards can be returned by competition total or by a specific gameweek.

## Upload/storage rules

- Uploaded media is stored in Supabase Storage, not as large JSON payloads through the API.
- `app-media` is a private bucket for stories, news media, goal poll videos, and match media.
- `team-logos` is a public bucket for logo/image assets.
- The API returns signed upload URLs through `/uploads/signed-url`.
- Current limits are 100 MB for app media and 5 MB for logos.
- Allowed formats are PNG, JPEG, WebP, SVG for logos, plus MP4, WebM, and QuickTime for media.

## Realtime rules

- Supabase Realtime is enabled through the `supabase_realtime` publication.
- Realtime tables currently covered: `matches`, `match_events`, `match_lineups`, `player_match_stats`, `goal_votes`, `goal_polls`, `goal_poll_options`, `stories`, `story_views`, `story_likes`, `gameweeks`, `fantasy_teams`, `fantasy_team_picks`, and `media_links`.
- These tables use `replica identity full` so updates have enough context for clients.
- `/live/overview` returns the initial live state for live matches, active stories, current goal poll, and realtime configuration.
- `/realtime/config` returns Supabase URL, publishable key, and channel definitions for live matches, match detail, gameweek fantasy scoring, story stats, goal poll stats, and private profile/fantasy updates.
- Private profile/fantasy channels require an authenticated Supabase session; the service role key is never exposed to the client.

## Imported legacy data

The WordPress/FLM exports have been imported into Supabase through:

- `npm run db:import:wp`
- `npm run db:import:flm`

Imported from the full FLM CSV export:

- 8 old competitions from `flm_liga`
- 51 competition-team records
- 574 historical player records
- 195 old matches from `wp_flm_utakmice.csv`
- 1,979 lineup records
- 6,086 match timeline events
- 51 group table rows
- 1,736 player-match stat rows
- 500 player-season stat rows
- 66 YouTube/media links attached to imported matches

The imports are idempotent for legacy records, so they can be run again without duplicating records.

Known export gaps:

- 4,303 empty `auto_nastup` rows were intentionally skipped because lineups already represent appearances and those rows are not timeline events.
- 73 lineup rows reference match IDs that are not present in `wp_flm_utakmice.csv`.
- 161 lineup rows reference IDs that are missing from `wp_flm_igraci.csv`; in `wp_posts.csv` those IDs are attachments or absent records, not usable player profiles.
- Full old gallery assets behind `galerija_ids` are not imported until the actual file URLs/assets are available.

## Admin account

The admin account must not use a public default password on Supabase. Set these in `.env` before using admin login:

```env
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=use-a-long-private-password
```
