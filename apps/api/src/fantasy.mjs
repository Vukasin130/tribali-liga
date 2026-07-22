import { query, transaction } from "./db.mjs";

const MAX_PICKS = 5;
const VALID_GAMEWEEK_STATUSES = new Set(["draft", "open", "locked", "scoring", "finished"]);

export async function listGameweeks(competitionId) {
  const params = [];
  let where = "";
  if (competitionId) {
    params.push(competitionId);
    where = "where g.competition_id = $1";
  }
  const result = await query(
    `select g.id, g.created_at, g.updated_at, g.competition_id, c.name as competition_name, c.season_name,
            g.name, g.starts_at, g.locks_at, g.ends_at, g.status
     from public.gameweeks g
     left join public.competitions c on c.id = g.competition_id
     ${where}
     order by g.starts_at desc`,
    params
  );
  return result.rows.map(normalizeGameweek);
}

export async function createGameweek(payload, actor) {
  const result = await query(
    `insert into public.gameweeks (competition_id, name, starts_at, locks_at, ends_at, status)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (competition_id, name) do update set
       starts_at = excluded.starts_at,
       locks_at = excluded.locks_at,
       ends_at = excluded.ends_at,
       status = excluded.status,
       updated_at = now()
     returning id`,
    [
      requiredText(payload.competitionId, "Takmicenje je obavezno."),
      requiredText(payload.name, "Naziv kola je obavezan."),
      requiredText(payload.startsAt, "Pocetak kola je obavezan."),
      requiredText(payload.locksAt, "Zakljucavanje kola je obavezno."),
      payload.endsAt || null,
      validGameweekStatus(payload.status || "open")
    ]
  );
  await audit(actor, "gameweek.upsert", "gameweek", result.rows[0].id, { name: payload.name });
  return (await listGameweeks()).find((item) => item.id === result.rows[0].id);
}

export async function updateGameweek(gameweekId, payload, actor) {
  const allowed = [];
  const params = [];
  const push = (sql, value) => {
    params.push(value);
    allowed.push(sql.replace("?", `$${params.length}`));
  };
  if (payload.name !== undefined) push("name = ?", requiredText(payload.name, "Naziv kola je obavezan."));
  if (payload.startsAt !== undefined) push("starts_at = ?", requiredText(payload.startsAt, "Pocetak kola je obavezan."));
  if (payload.locksAt !== undefined) push("locks_at = ?", requiredText(payload.locksAt, "Zakljucavanje kola je obavezno."));
  if (payload.endsAt !== undefined) push("ends_at = ?", payload.endsAt || null);
  if (payload.status !== undefined) push("status = ?", validGameweekStatus(payload.status));
  if (!allowed.length) throw httpError(400, "Nema izmena za kolo.");
  params.push(gameweekId);
  const result = await query(
    `update public.gameweeks
     set ${allowed.join(", ")}, updated_at = now()
     where id = $${params.length}
     returning *`,
    params
  );
  if (!result.rows[0]) throw httpError(404, "Kolo nije pronadjeno.");
  await audit(actor, "gameweek.update", "gameweek", gameweekId, payload);
  return normalizeGameweek(result.rows[0]);
}

export async function assignMatchesToGameweek(gameweekId, payload, actor) {
  const matchIds = Array.isArray(payload.matchIds) ? payload.matchIds.filter(Boolean) : [];
  if (!matchIds.length) throw httpError(400, "Moras poslati utakmice za kolo.");
  const result = await query(
    `update public.matches
     set gameweek_id = $1, updated_at = now()
     where id = any($2::uuid[])
     returning id`,
    [gameweekId, matchIds]
  );
  await audit(actor, "gameweek.matches.assign", "gameweek", gameweekId, { count: result.rowCount });
  return { gameweekId, assigned: result.rowCount };
}

export async function getFantasyTeam(user, competitionId, gameweekId) {
  requireUser(user);
  const team = await ensureFantasyTeam(user, competitionId);
  return withTeamDetails(team.id, gameweekId);
}

export async function setFantasyPicks(user, payload) {
  requireUser(user);
  const competitionId = requiredText(payload.competitionId, "Takmicenje je obavezno.");
  const gameweekId = requiredText(payload.gameweekId, "Kolo je obavezno.");
  const picks = Array.isArray(payload.picks) ? payload.picks : [];
  if (!picks.length || picks.length > MAX_PICKS) throw httpError(400, `Fantasy tim mora imati od 1 do ${MAX_PICKS} igraca.`);
  if (picks.filter((pick) => pick.isCaptain).length !== 1) throw httpError(400, "Moras izabrati tacno jednog kapitena.");

  const details = await transaction(async (client) => {
    const gameweek = await lockGameweek(client, gameweekId);
    if (gameweek.competition_id !== competitionId) throw httpError(400, "Kolo ne pripada izabranom takmicenju.");
    if (new Date(gameweek.locks_at).getTime() <= Date.now() || !["draft", "open"].includes(gameweek.status)) {
      throw httpError(423, "Fantasy tim je zakljucan za ovo kolo.");
    }

    const team = await ensureFantasyTeamTx(client, user, competitionId, payload.teamName);
    await client.query("delete from public.fantasy_team_picks where fantasy_team_id = $1 and gameweek_id = $2", [team.id, gameweekId]);

    const seenPlayers = new Set();
    const seenSlots = new Set();
    for (const pick of picks) {
      const playerId = requiredText(pick.playerId, "Player ID je obavezan.");
      const slot = requiredText(pick.slot, "Slot je obavezan.");
      if (seenPlayers.has(playerId)) throw httpError(400, "Isti igrac ne moze biti izabran dva puta.");
      if (seenSlots.has(slot)) throw httpError(400, "Isti slot ne moze biti popunjen dva puta.");
      seenPlayers.add(playerId);
      seenSlots.add(slot);
      await ensurePlayerInCompetition(client, playerId, competitionId);
      await client.query(
        `insert into public.fantasy_team_picks (fantasy_team_id, player_id, gameweek_id, slot, is_captain)
         values ($1,$2,$3,$4,$5)`,
        [team.id, playerId, gameweekId, slot, Boolean(pick.isCaptain)]
      );
    }
    return { teamId: team.id };
  });

  await audit(user, "fantasy.picks.set", "fantasyTeam", details.teamId, { gameweekId, count: picks.length });
  return withTeamDetails(details.teamId, gameweekId);
}

export async function scoreFantasyGameweek(gameweekId, actor) {
  const result = await transaction(async (client) => {
    const gameweek = await lockGameweek(client, gameweekId);
    const scoreRows = await client.query(
      `with pick_scores as (
         select ftp.id as pick_id,
                coalesce(sum(pms.fantasy_points), 0) * case when ftp.is_captain then 2 else 1 end as points
         from public.fantasy_team_picks ftp
         join public.fantasy_teams ft on ft.id = ftp.fantasy_team_id
         left join public.matches m on m.gameweek_id = ftp.gameweek_id
         left join public.player_match_stats pms on pms.match_id = m.id and pms.player_id = ftp.player_id
         where ftp.gameweek_id = $1
         group by ftp.id, ftp.is_captain
       )
       update public.fantasy_team_picks ftp
       set points = pick_scores.points, locked_at = coalesce(ftp.locked_at, now()), updated_at = now()
       from pick_scores
       where ftp.id = pick_scores.pick_id
       returning ftp.fantasy_team_id, ftp.points`,
      [gameweekId]
    );

    await client.query(
      `with totals as (
         select fantasy_team_id, sum(points)::integer as total
         from public.fantasy_team_picks
         group by fantasy_team_id
       )
       update public.fantasy_teams ft
       set total_points = totals.total, last_scored_at = now(), updated_at = now()
       from totals
       where ft.id = totals.fantasy_team_id`
    );

    await client.query("update public.gameweeks set status = 'scoring', updated_at = now() where id = $1", [gameweekId]);
    return { gameweek, updatedPicks: scoreRows.rowCount };
  });

  await audit(actor, "fantasy.gameweek.score", "gameweek", gameweekId, result);
  return result;
}

export async function getFantasyLeaderboard(competitionId, gameweekId) {
  const params = [competitionId];
  let scoreSql = "ft.total_points";
  let join = "";
  if (gameweekId) {
    params.push(gameweekId);
    scoreSql = "coalesce(gw.points, 0)";
    join = `left join (
      select fantasy_team_id, sum(points)::integer as points
      from public.fantasy_team_picks
      where gameweek_id = $2
      group by fantasy_team_id
    ) gw on gw.fantasy_team_id = ft.id`;
  }
  const result = await query(
    `select ft.id, ft.name, ft.total_points, ft.last_scored_at, p.display_name as manager_name, ${scoreSql} as points
     from public.fantasy_teams ft
     join public.profiles p on p.id = ft.user_id
     ${join}
     where ft.competition_id = $1
     order by points desc, ft.created_at asc
     limit 100`,
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

async function withTeamDetails(fantasyTeamId, gameweekId) {
  const teamResult = await query(
    `select ft.id, ft.created_at, ft.updated_at, ft.user_id, ft.competition_id, c.name as competition_name,
            c.season_name, ft.name, ft.total_points, ft.last_scored_at
     from public.fantasy_teams ft
     left join public.competitions c on c.id = ft.competition_id
     where ft.id = $1`,
    [fantasyTeamId]
  );
  const team = teamResult.rows[0];
  if (!team) throw httpError(404, "Fantasy tim nije pronadjen.");
  const params = [fantasyTeamId];
  let whereGameweek = "";
  if (gameweekId) {
    params.push(gameweekId);
    whereGameweek = "and ftp.gameweek_id = $2";
  }
  const picks = await query(
    `select ftp.id, ftp.created_at, ftp.updated_at, ftp.player_id, p.display_name as player_name,
            p.position, p.avatar_url, p.shirt_number, t.id as team_id, t.name as team_name,
            ftp.gameweek_id, g.name as gameweek_name, ftp.slot, ftp.is_captain, ftp.locked_at, ftp.points
     from public.fantasy_team_picks ftp
     join public.players p on p.id = ftp.player_id
     left join public.teams t on t.id = p.team_id
     left join public.gameweeks g on g.id = ftp.gameweek_id
     where ftp.fantasy_team_id = $1 ${whereGameweek}
     order by ftp.gameweek_id nulls last, ftp.slot`,
    params
  );
  return {
    id: team.id,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    userId: team.user_id,
    competitionId: team.competition_id,
    competitionName: team.competition_name ? `${team.competition_name} - ${team.season_name}` : "",
    name: team.name,
    totalPoints: Number(team.total_points || 0),
    lastScoredAt: team.last_scored_at,
    picks: picks.rows.map(normalizePick)
  };
}

async function ensureFantasyTeam(user, competitionId) {
  const result = await query(
    `insert into public.fantasy_teams (user_id, competition_id, name)
     values ($1,$2,$3)
     on conflict (user_id, competition_id) do update set updated_at = now()
     returning id`,
    [user.id, requiredText(competitionId, "Takmicenje je obavezno."), `${user.displayName || "Korisnik"} FC`]
  );
  return result.rows[0];
}

async function ensureFantasyTeamTx(client, user, competitionId, teamName) {
  const result = await client.query(
    `insert into public.fantasy_teams (user_id, competition_id, name)
     values ($1,$2,$3)
     on conflict (user_id, competition_id) do update set
       name = coalesce(nullif(excluded.name, ''), public.fantasy_teams.name),
       updated_at = now()
     returning id`,
    [user.id, competitionId, String(teamName || `${user.displayName || "Korisnik"} FC`).trim()]
  );
  return result.rows[0];
}

async function lockGameweek(client, gameweekId) {
  const result = await client.query("select * from public.gameweeks where id = $1 for update", [gameweekId]);
  if (!result.rows[0]) throw httpError(404, "Kolo nije pronadjeno.");
  return result.rows[0];
}

async function ensurePlayerInCompetition(client, playerId, competitionId) {
  const poolState = await client.query(
    "select count(*)::int as count from public.fantasy_player_pool where competition_id = $1",
    [competitionId]
  );
  if (Number(poolState.rows[0]?.count || 0) > 0) {
    const poolResult = await client.query(
      `select fpp.player_id
       from public.fantasy_player_pool fpp
       join public.players p on p.id = fpp.player_id
       join public.teams t on t.id = fpp.team_id
       where fpp.player_id = $1
         and fpp.competition_id = $2
         and fpp.is_available = true
         and p.is_active = true
         and t.is_active = true
       limit 1`,
      [playerId, competitionId]
    );
    if (!poolResult.rows[0]) throw httpError(400, "Izabrani igrac nije dostupan u fantasy bazi za ovu sezonu.");
    return;
  }

  const result = await client.query(
    `select p.id
     from public.players p
     join public.teams t on t.id = p.team_id
     where p.id = $1 and t.competition_id = $2 and p.is_active = true`,
    [playerId, competitionId]
  );
  if (!result.rows[0]) throw httpError(400, "Izabrani igrac ne pripada ovom takmicenju ili nije aktivan.");
}

async function audit(actor, action, entityType, entityId, metadata) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizeGameweek(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    competitionId: row.competition_id,
    competitionName: row.competition_name ? `${row.competition_name} - ${row.season_name}` : "",
    name: row.name,
    startsAt: row.starts_at,
    locksAt: row.locks_at,
    endsAt: row.ends_at,
    status: row.status
  };
}

function normalizePick(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    playerId: row.player_id,
    playerName: row.player_name,
    position: row.position || "",
    avatarUrl: row.avatar_url || "",
    shirtNumber: row.shirt_number,
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    gameweekId: row.gameweek_id || "",
    gameweekName: row.gameweek_name || "",
    slot: row.slot,
    isCaptain: row.is_captain,
    lockedAt: row.locked_at,
    points: Number(row.points || 0)
  };
}

function validGameweekStatus(status) {
  const normalized = String(status || "").trim();
  if (!VALID_GAMEWEEK_STATUSES.has(normalized)) throw httpError(400, "Status kola nije validan.");
  return normalized;
}

function requireUser(user) {
  if (!user?.id) throw httpError(401, "Moras biti ulogovan.");
}

function requiredText(value, message) {
  const text = String(value || "").trim();
  if (!text) throw httpError(400, message);
  return text;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
