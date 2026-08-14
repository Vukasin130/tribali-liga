import { randomBytes } from "node:crypto";
import { query } from "./db.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

// Excludes ambiguous characters (0/O, 1/I) so codes are easy to read aloud/type.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;
const MAX_INVITE_CODE_ATTEMPTS = 5;

function requireUser(user: Actor | null): asserts user is Actor {
  if (!user?.id) throw httpError(401, "Moras biti ulogovan.");
}

function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

async function requireFantasyTeam(userId: string, fantasySeasonId: string): Promise<void> {
  const result = await query(
    "select 1 from public.fantasy_teams where user_id = $1 and fantasy_season_id = $2",
    [userId, fantasySeasonId]
  );
  if (!result.rows[0]) throw httpError(400, "Prvo napravi svoj fantasy tim za ovu sezonu.");
}

async function requireMembership(userId: string, miniLeagueId: string): Promise<void> {
  const result = await query(
    "select 1 from public.fantasy_mini_league_members where user_id = $1 and fantasy_mini_league_id = $2",
    [userId, miniLeagueId]
  );
  if (!result.rows[0]) throw httpError(403, "Nisi clan ove lige.");
}

async function loadMiniLeagueRow(id: string) {
  const result = await query("select * from public.fantasy_mini_leagues where id = $1", [id]);
  if (!result.rows[0]) throw httpError(404, "Liga nije pronadjena.");
  return result.rows[0];
}

async function withMemberCount(row: any, actorId: string) {
  const countResult = await query(
    "select count(*)::int as count from public.fantasy_mini_league_members where fantasy_mini_league_id = $1",
    [row.id]
  );
  return {
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    name: row.name,
    inviteCode: row.creator_user_id === actorId ? row.invite_code : "",
    memberCount: Number(countResult.rows[0]?.count || 0),
    isCreator: row.creator_user_id === actorId,
    createdAt: row.created_at
  };
}

export async function createFantasyMiniLeague(actor: Actor | null, payload: { fantasySeasonId?: string; name?: string }) {
  requireUser(actor);
  const fantasySeasonId = requiredText(payload.fantasySeasonId, "Fantasy sezona je obavezna.");
  const name = requiredText(payload.name, "Naziv lige je obavezan.");

  const season = await query("select id from public.fantasy_seasons where id = $1", [fantasySeasonId]);
  if (!season.rows[0]) throw httpError(404, "Fantasy sezona nije pronadjena.");
  await requireFantasyTeam(actor.id, fantasySeasonId);

  let row: any = null;
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    try {
      const result = await query(
        `insert into public.fantasy_mini_leagues (fantasy_season_id, creator_user_id, name, invite_code)
         values ($1, $2, $3, $4)
         returning *`,
        [fantasySeasonId, actor.id, name, generateInviteCode()]
      );
      row = result.rows[0];
      break;
    } catch (error) {
      if ((error as { code?: string }).code === "23505" && attempt < MAX_INVITE_CODE_ATTEMPTS - 1) continue;
      throw error;
    }
  }
  if (!row) throw httpError(500, "Nije moguce generisati kod za ligu, pokusaj ponovo.");

  await query(
    "insert into public.fantasy_mini_league_members (fantasy_mini_league_id, user_id) values ($1, $2)",
    [row.id, actor.id]
  );

  return withMemberCount(row, actor.id);
}

export async function joinFantasyMiniLeague(actor: Actor | null, payload: { inviteCode?: string }) {
  requireUser(actor);
  const inviteCode = requiredText(payload.inviteCode, "Kod za pridruzivanje je obavezan.").trim().toUpperCase();

  const result = await query("select * from public.fantasy_mini_leagues where invite_code = $1", [inviteCode]);
  const row = result.rows[0];
  if (!row) throw httpError(404, "Liga sa tim kodom ne postoji.");

  await requireFantasyTeam(actor.id, row.fantasy_season_id);
  await query(
    `insert into public.fantasy_mini_league_members (fantasy_mini_league_id, user_id)
     values ($1, $2)
     on conflict (fantasy_mini_league_id, user_id) do nothing`,
    [row.id, actor.id]
  );

  return withMemberCount(row, actor.id);
}

export async function leaveFantasyMiniLeague(actor: Actor | null, miniLeagueId: string) {
  requireUser(actor);
  const row = await loadMiniLeagueRow(miniLeagueId);
  await requireMembership(actor.id, miniLeagueId);

  if (row.creator_user_id === actor.id) {
    const countResult = await query(
      "select count(*)::int as count from public.fantasy_mini_league_members where fantasy_mini_league_id = $1",
      [miniLeagueId]
    );
    const memberCount = Number(countResult.rows[0]?.count || 0);
    if (memberCount > 1) {
      throw httpError(409, "Kao osnivac prvo moras raspustiti ligu ako zelis da izadjes, dok ima drugih clanova.");
    }
    await query("delete from public.fantasy_mini_leagues where id = $1", [miniLeagueId]);
    return { ok: true };
  }

  await query(
    "delete from public.fantasy_mini_league_members where fantasy_mini_league_id = $1 and user_id = $2",
    [miniLeagueId, actor.id]
  );
  return { ok: true };
}

export async function disbandFantasyMiniLeague(actor: Actor | null, miniLeagueId: string) {
  requireUser(actor);
  const row = await loadMiniLeagueRow(miniLeagueId);
  if (row.creator_user_id !== actor.id) throw httpError(403, "Samo osnivac moze da raspusti ligu.");
  await query("delete from public.fantasy_mini_leagues where id = $1", [miniLeagueId]);
  return { ok: true };
}

export async function listMyFantasyMiniLeagues(actor: Actor | null, fantasySeasonId: string) {
  requireUser(actor);
  requiredText(fantasySeasonId, "Fantasy sezona je obavezna.");

  const result = await query(
    `select fml.*, count(m2.id)::int as member_count
     from public.fantasy_mini_leagues fml
     join public.fantasy_mini_league_members mine on mine.fantasy_mini_league_id = fml.id and mine.user_id = $1
     left join public.fantasy_mini_league_members m2 on m2.fantasy_mini_league_id = fml.id
     where fml.fantasy_season_id = $2
     group by fml.id
     order by fml.created_at desc`,
    [actor.id, fantasySeasonId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    name: row.name,
    inviteCode: row.creator_user_id === actor.id ? row.invite_code : "",
    memberCount: Number(row.member_count || 0),
    isCreator: row.creator_user_id === actor.id,
    createdAt: row.created_at
  }));
}

export async function getFantasyMiniLeague(actor: Actor | null, miniLeagueId: string) {
  requireUser(actor);
  const row = await loadMiniLeagueRow(miniLeagueId);
  await requireMembership(actor.id, miniLeagueId);
  return withMemberCount(row, actor.id);
}

export async function getFantasyMiniLeagueLeaderboard(actor: Actor | null, miniLeagueId: string, fantasyGameweekId?: string) {
  requireUser(actor);
  await loadMiniLeagueRow(miniLeagueId);
  await requireMembership(actor.id, miniLeagueId);

  const params: unknown[] = [miniLeagueId];
  let scoreSql = "ft.total_points";
  let join = "";
  if (fantasyGameweekId) {
    params.push(fantasyGameweekId);
    scoreSql = "coalesce(gw.points, 0)";
    join = `left join (
      select fantasy_team_id, sum(points)::integer as points
      from public.fantasy_team_picks
      where fantasy_gameweek_id = $2
      group by fantasy_team_id
    ) gw on gw.fantasy_team_id = ft.id`;
  }

  const result = await query(
    `select ft.id, ft.name, ft.total_points, ft.last_scored_at, p.display_name as manager_name, ${scoreSql} as points
     from public.fantasy_mini_league_members fmlm
     join public.fantasy_teams ft on ft.user_id = fmlm.user_id
     join public.fantasy_mini_leagues fml on fml.id = fmlm.fantasy_mini_league_id and fml.fantasy_season_id = ft.fantasy_season_id
     join public.profiles p on p.id = ft.user_id
     ${join}
     where fmlm.fantasy_mini_league_id = $1
       and exists (select 1 from public.fantasy_team_picks ftp where ftp.fantasy_team_id = ft.id)
     order by points desc, ft.created_at asc`,
    params
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    fantasyTeamId: row.id,
    name: row.name,
    managerName: row.manager_name,
    points: Number(row.points || 0),
    totalPoints: Number(row.total_points || 0),
    lastScoredAt: row.last_scored_at
  }));
}
