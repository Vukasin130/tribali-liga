import { query } from "./db.ts";
import { sendNotificationToProfiles } from "./push.ts";
import { httpError } from "./errors.ts";
import type { Actor } from "./types.ts";

const VALID_STATUSES = new Set(["playing", "not_playing"]);

// Verified players answer for themselves - resolved via profiles.verified_player_id,
// never by matchId/playerId alone, so nobody can report availability for someone else.
export async function setMyMatchAvailability(matchId: string, payload: { status?: string }, user: Actor | null) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const status = String(payload.status || "").trim();
  if (!VALID_STATUSES.has(status)) throw httpError(400, "Status mora biti 'playing' ili 'not_playing'.");

  const profile = await query("select verified_player_id from public.profiles where id = $1", [user.id]);
  const playerId = profile.rows[0]?.verified_player_id;
  if (!playerId) throw httpError(403, "Samo verifikovani igraci mogu da se izjasne.");

  const match = await query(
    `select m.id from public.matches m
     join public.team_rosters tr on tr.team_id in (m.home_team_id, m.away_team_id) and tr.player_id = $2 and tr.is_active = true
     where m.id = $1
     limit 1`,
    [matchId, playerId]
  );
  if (!match.rows[0]) throw httpError(404, "Utakmica nije pronadjena za tvoj tim.");

  const result = await query(
    `insert into public.player_match_availability (match_id, player_id, status, responded_at)
     values ($1, $2, $3, now())
     on conflict (match_id, player_id) do update set status = excluded.status, responded_at = now(), updated_at = now()
     returning *`,
    [matchId, playerId, status]
  );
  return normalizeAvailability(result.rows[0]);
}

// Everything this verified player has been asked about and hasn't answered yet
// (or answered before kickoff, so they can still change their mind).
export async function getMyAvailabilityRequests(user: Actor | null) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const profile = await query("select verified_player_id from public.profiles where id = $1", [user.id]);
  const playerId = profile.rows[0]?.verified_player_id;
  if (!playerId) return [];

  const result = await query(
    `select pma.*, m.scheduled_at, m.home_team_id, m.away_team_id,
            ht.name as home_team_name, at.name as away_team_name
     from public.player_match_availability pma
     join public.matches m on m.id = pma.match_id
     join public.teams ht on ht.id = m.home_team_id
     join public.teams at on at.id = m.away_team_id
     where pma.player_id = $1 and m.status = 'scheduled' and m.scheduled_at > now()
     order by m.scheduled_at asc
     limit 10`,
    [playerId]
  );
  return result.rows.map((row: any) => ({
    ...normalizeAvailability(row),
    scheduledAt: row.scheduled_at,
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name
  }));
}

// Scheduled sweep (called every ~30 min from server.ts): finds matches kicking off in
// roughly 24h that haven't been asked about yet, creates an 'unknown' row per verified
// player on either side, and pushes them a reminder. Restart-safe - notified_at lives in
// the DB, so a server restart never causes a duplicate ping.
export async function runAvailabilityNotificationSweep() {
  const matches = await query(
    `select m.id, m.scheduled_at, m.home_team_id, m.away_team_id, ht.name as home_team_name, at.name as away_team_name
     from public.matches m
     join public.teams ht on ht.id = m.home_team_id
     join public.teams at on at.id = m.away_team_id
     where m.status = 'scheduled'
       and m.scheduled_at between now() + interval '22 hours' and now() + interval '26 hours'
       and not exists (
         select 1 from public.player_match_availability pma
         where pma.match_id = m.id and pma.notified_at is not null
       )`
  );

  for (const match of matches.rows) {
    const players = await query(
      `select distinct p.id as player_id, pr.id as profile_id
       from public.team_rosters tr
       join public.players p on p.id = tr.player_id
       join public.profiles pr on pr.verified_player_id = p.id and pr.verification_status = 'approved'
       where tr.team_id in ($1, $2) and tr.is_active = true`,
      [match.home_team_id, match.away_team_id]
    );
    if (!players.rows.length) continue;

    for (const player of players.rows) {
      await query(
        `insert into public.player_match_availability (match_id, player_id, status, notified_at)
         values ($1, $2, 'unknown', now())
         on conflict (match_id, player_id) do update set notified_at = now()
         where public.player_match_availability.notified_at is null`,
        [match.id, player.player_id]
      );
    }

    await sendNotificationToProfiles(
      players.rows.map((row: any) => row.profile_id),
      "Igras li sutra?",
      `${match.home_team_name} - ${match.away_team_name} je sutra. Javi se u profilu da li igras.`,
      { kind: "availability_request", matchId: match.id }
    );
  }

  return { matchesNotified: matches.rowCount };
}

function normalizeAvailability(row: any) {
  return {
    id: row.id,
    matchId: row.match_id,
    playerId: row.player_id,
    status: row.status,
    respondedAt: row.responded_at
  };
}
