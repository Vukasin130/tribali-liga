import { query, transaction } from "./db.mjs";

const MAX_PICKS = 10;
const VALID_SEASON_STATUSES = new Set(["draft", "active", "finished"]);
const VALID_GAMEWEEK_STATUSES = new Set(["draft", "open", "locked", "scoring", "finished"]);
const MIN_PRICE = 0.5;
const PRICE_STEP = 0.1;
// Starting XI is position-locked: 1 GK + 2 DEF + 2 ATT. The 5-player bench (B1-B5) has no
// position restriction - any player can fill any bench slot. B1 (the 6th player overall)
// scores at full weight; B2-B5 score at half weight.
const SLOT_POSITION_GROUPS = {
  GK: "golman",
  DEF1: "odbrana",
  DEF2: "odbrana",
  ATT1: "napad",
  ATT2: "napad",
  B1: null,
  B2: null,
  B3: null,
  B4: null,
  B5: null
};
const POSITION_GROUP_LABELS = { golman: "golmana", odbrana: "odbranu", napad: "napad" };
// Transfer window: unlimited before round 1 and immediately after rounds 5 and 10 (i.e. while
// building the round 1/6/11 squad); every other round allows at most 4 transfers versus the
// immediately preceding round's squad.
const UNLIMITED_TRANSFER_ROUNDS = new Set([1, 6, 11]);
const TRANSFERS_PER_ROUND = 4;

async function fetchRankedGameweeks(exec, seasonId) {
  const result = await exec(
    `select id, row_number() over (order by starts_at) as round_number
     from public.fantasy_gameweeks
     where fantasy_season_id = $1`,
    [seasonId]
  );
  return result.rows.map((row) => ({ id: row.id, roundNumber: Number(row.round_number) }));
}

// A player counts as "already played" for repositioning purposes the instant their real match
// kicks off (not full-time) - matches EuroLeague Fantasy's own "only if they have not played yet".
async function hasPlayerPlayedInWindow(exec, playerId, startsAt, endsAt) {
  const result = await exec(
    `select exists (
       select 1
       from public.matches m
       join public.players p on p.id = $1
       where (m.home_team_id = p.team_id or m.away_team_id = p.team_id)
         and m.scheduled_at >= $2 and m.scheduled_at <= $3
         and (m.scheduled_at <= now() or m.status in ('live', 'finished'))
     ) as played`,
    [playerId, startsAt, endsAt]
  );
  return Boolean(result.rows[0]?.played);
}

// open: full editing (transfers + repositioning). reposition: past the deadline but the round's
// matches are still being played - only reordering your existing 10 players is allowed, and only
// for players who haven't kicked off yet. locked: round fully closed.
function computeGameweekPhase(gameweek) {
  const now = Date.now();
  const locksAtMs = new Date(gameweek.locks_at).getTime();
  if (now < locksAtMs) return "open";
  const endsAtMs = gameweek.ends_at ? new Date(gameweek.ends_at).getTime() : locksAtMs;
  if (gameweek.ends_at && now < endsAtMs) return "reposition";
  return "locked";
}

async function getPreviousGameweekPlayerIds(exec, teamId, ranked, roundNumber) {
  if (roundNumber <= 1) return null;
  const previous = ranked.find((row) => row.roundNumber === roundNumber - 1);
  if (!previous) return null;
  const result = await exec(
    `select player_id from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2`,
    [teamId, previous.id]
  );
  if (!result.rows.length) return null;
  return new Set(result.rows.map((row) => row.player_id));
}

function normalizePosition(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listFantasySeasons() {
  const result = await query(
    `select fs.*, count(distinct fsc.competition_id)::int as competitions_count
     from public.fantasy_seasons fs
     left join public.fantasy_season_competitions fsc on fsc.fantasy_season_id = fs.id
     group by fs.id
     order by fs.created_at desc`
  );
  return result.rows.map(normalizeSeason);
}

export async function getFantasySeason(seasonId) {
  const season = await getSeasonRow(seasonId);
  const [competitions, gameweeks] = await Promise.all([
    listSeasonCompetitionRows(seasonId),
    listFantasyGameweeks(seasonId)
  ]);
  return { ...normalizeSeason(season), competitions, gameweeks };
}

export async function createFantasySeason(payload, actor) {
  const competitionIds = uniqueIds(payload.competitionIds);
  if (!competitionIds.length) throw httpError(400, "Izaberi bar jednu ligu za fantasy sezonu.");

  const seasonId = await transaction(async (client) => {
    const result = await client.query(
      `insert into public.fantasy_seasons (name, status, gameweek_length_days, starts_at, ends_at)
       values ($1,$2,$3,$4,$5)
       returning id`,
      [
        requiredText(payload.name, "Naziv sezone je obavezan."),
        validSeasonStatus(payload.status || "draft"),
        Number(payload.gameweekLengthDays) > 0 ? Number(payload.gameweekLengthDays) : 7,
        payload.startsAt || null,
        payload.endsAt || null
      ]
    );
    const id = result.rows[0].id;
    await replaceSeasonCompetitionsTx(client, id, competitionIds);
    await auditWithClient(client, actor, "fantasy.season.create", "fantasySeason", id, { competitionIds });
    return id;
  });

  return getFantasySeason(seasonId);
}

export async function updateFantasySeason(seasonId, payload, actor) {
  await getSeasonRow(seasonId);
  await transaction(async (client) => {
    const allowed = [];
    const params = [];
    const push = (sql, value) => {
      params.push(value);
      allowed.push(sql.replace("?", `$${params.length}`));
    };
    if (payload.name !== undefined) push("name = ?", requiredText(payload.name, "Naziv sezone je obavezan."));
    if (payload.status !== undefined) push("status = ?", validSeasonStatus(payload.status));
    if (payload.gameweekLengthDays !== undefined) push("gameweek_length_days = ?", Number(payload.gameweekLengthDays) > 0 ? Number(payload.gameweekLengthDays) : 7);
    if (payload.startsAt !== undefined) push("starts_at = ?", payload.startsAt || null);
    if (payload.endsAt !== undefined) push("ends_at = ?", payload.endsAt || null);
    if (allowed.length) {
      params.push(seasonId);
      await client.query(`update public.fantasy_seasons set ${allowed.join(", ")}, updated_at = now() where id = $${params.length}`, params);
    }
    if (payload.competitionIds !== undefined) {
      const competitionIds = uniqueIds(payload.competitionIds);
      if (!competitionIds.length) throw httpError(400, "Sezona mora imati bar jednu ligu.");
      await replaceSeasonCompetitionsTx(client, seasonId, competitionIds);
    }
    await auditWithClient(client, actor, "fantasy.season.update", "fantasySeason", seasonId, payload);
  });
  return getFantasySeason(seasonId);
}

export async function syncFantasySeasonPool(seasonId, actor) {
  const result = await transaction(async (client) => {
    await ensureSeasonTx(client, seasonId);
    const competitions = await client.query(
      "select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1",
      [seasonId]
    );
    if (!competitions.rows.length) throw httpError(400, "Sezona nema dodeljenu nijednu ligu.");

    let available = 0;
    let unavailable = 0;
    for (const row of competitions.rows) {
      const competitionId = row.competition_id;
      const inserted = await client.query(
        `insert into public.fantasy_player_pool
           (fantasy_season_id, competition_id, player_id, team_id, base_price, current_price, is_available)
         select $2::uuid, t.competition_id, p.id, t.id,
                calculate_base_price(coalesce(ps.fantasy_points,0), coalesce(ps.goals,0), coalesce(ps.assists,0), coalesce(ps.saves,0)),
                calculate_base_price(coalesce(ps.fantasy_points,0), coalesce(ps.goals,0), coalesce(ps.assists,0), coalesce(ps.saves,0)),
                true
         from public.players p
         join public.teams t on t.id = p.team_id
         left join public.player_season_stats ps on ps.player_id = p.id and ps.competition_id = t.competition_id
         where t.competition_id = $1 and t.is_active = true and p.is_active = true
         on conflict (competition_id, player_id) do update set
           fantasy_season_id = excluded.fantasy_season_id,
           team_id = excluded.team_id,
           base_price = excluded.base_price,
           current_price = case
             when public.fantasy_player_pool.fantasy_season_id is distinct from excluded.fantasy_season_id
               then excluded.current_price
             else public.fantasy_player_pool.current_price
           end,
           is_available = true,
           availability_note = null,
           updated_at = now()
         returning id`,
        [competitionId, seasonId]
      );
      available += inserted.rowCount;

      const disabled = await client.query(
        `update public.fantasy_player_pool fpp set
           is_available = false,
           availability_note = 'Igrac vise nije u aktivnom rosteru ove lige.',
           updated_at = now()
         where fpp.competition_id = $1 and fpp.fantasy_season_id = $2
           and not exists (
             select 1 from public.players p join public.teams t on t.id = p.team_id
             where p.id = fpp.player_id and t.id = fpp.team_id and t.competition_id = fpp.competition_id
               and p.is_active = true and t.is_active = true
           )`,
        [competitionId, seasonId]
      );
      unavailable += disabled.rowCount;
    }

    await auditWithClient(client, actor, "fantasy.season.pool.sync", "fantasySeason", seasonId, { available, unavailable });
    return { available, unavailable };
  });

  return { seasonId, ...result };
}

export async function listFantasySeasonPlayerPool(seasonId, filters = {}) {
  const params = [requiredText(seasonId, "Sezona je obavezna.")];
  const where = ["fpp.fantasy_season_id = $1"];

  if (filters.availableOnly !== false) where.push("fpp.is_available = true");
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`fpp.team_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(`(p.display_name ilike $${params.length} or t.name ilike $${params.length})`);
  }

  const result = await query(
    `select fpp.*, p.display_name, p.position, p.shirt_number, p.avatar_url,
            t.name as team_name, t.short_name as team_short_name, t.logo_url as team_logo_url,
            c.name as competition_name, c.season_name as competition_season_name
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     left join public.competitions c on c.id = fpp.competition_id
     where ${where.join(" and ")}
     order by fpp.is_available desc, fpp.current_price desc, p.display_name
     limit 600`,
    params
  );
  return result.rows.map(normalizeFantasyPoolPlayer);
}

export async function listFantasyGameweeks(seasonId) {
  const result = await query(
    `select * from public.fantasy_gameweeks where fantasy_season_id = $1 order by starts_at`,
    [seasonId]
  );
  return result.rows.map(normalizeGameweek);
}

export async function createFantasyGameweek(payload, actor) {
  const seasonId = requiredText(payload.fantasySeasonId, "Sezona je obavezna.");
  await getSeasonRow(seasonId);
  const result = await query(
    `insert into public.fantasy_gameweeks (fantasy_season_id, name, starts_at, locks_at, ends_at, status)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (fantasy_season_id, name) do update set
       starts_at = excluded.starts_at,
       locks_at = excluded.locks_at,
       ends_at = excluded.ends_at,
       status = excluded.status,
       updated_at = now()
     returning id`,
    [
      seasonId,
      requiredText(payload.name, "Naziv kola je obavezan."),
      requiredText(payload.startsAt, "Pocetak kola je obavezan."),
      requiredText(payload.locksAt, "Zakljucavanje kola je obavezno."),
      payload.endsAt || null,
      validGameweekStatus(payload.status || "open")
    ]
  );
  await audit(actor, "fantasy.gameweek.upsert", "fantasyGameweek", result.rows[0].id, { name: payload.name });
  return (await listFantasyGameweeks(seasonId)).find((item) => item.id === result.rows[0].id);
}

export async function updateFantasyGameweek(gameweekId, payload, actor) {
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
    `update public.fantasy_gameweeks set ${allowed.join(", ")}, updated_at = now() where id = $${params.length} returning *`,
    params
  );
  if (!result.rows[0]) throw httpError(404, "Kolo nije pronadjeno.");
  await audit(actor, "fantasy.gameweek.update", "fantasyGameweek", gameweekId, payload);
  return normalizeGameweek(result.rows[0]);
}

export async function getFantasySeasonTeam(user, seasonId, fantasyGameweekId) {
  requireUser(user);
  const team = await ensureFantasySeasonTeam(user, seasonId);
  return withSeasonTeamDetails(team.id, fantasyGameweekId);
}

// Public (any logged-in user) read of any manager's team - used by the leaderboard's
// "view team" drill-down. No ownership check by design, same as a real fantasy leaderboard.
export async function getFantasySeasonTeamById(fantasyTeamId, fantasyGameweekId) {
  return withSeasonTeamDetails(requiredText(fantasyTeamId, "Fantasy tim je obavezan."), fantasyGameweekId);
}

export async function setFantasySeasonPicks(user, payload) {
  requireUser(user);
  const seasonId = requiredText(payload.fantasySeasonId, "Sezona je obavezna.");
  const fantasyGameweekId = requiredText(payload.fantasyGameweekId, "Kolo je obavezno.");
  const picks = Array.isArray(payload.picks) ? payload.picks : [];
  if (picks.length !== MAX_PICKS) throw httpError(400, `Fantasy tim mora imati tacno ${MAX_PICKS} igraca.`);
  if (picks.filter((pick) => pick.isCaptain).length !== 1) throw httpError(400, "Moras izabrati tacno jednog kapitena.");

  const details = await transaction(async (client) => {
    const gameweekResult = await client.query("select * from public.fantasy_gameweeks where id = $1 for update", [fantasyGameweekId]);
    const gameweek = gameweekResult.rows[0];
    if (!gameweek) throw httpError(404, "Kolo nije pronadjeno.");
    if (gameweek.fantasy_season_id !== seasonId) throw httpError(400, "Kolo ne pripada izabranoj sezoni.");
    if (!["draft", "open"].includes(gameweek.status)) {
      throw httpError(423, "Fantasy tim je zakljucan za ovo kolo.");
    }
    const phase = computeGameweekPhase(gameweek);
    if (phase === "locked") throw httpError(423, "Fantasy tim je zakljucan za ovo kolo.");

    const team = await ensureFantasySeasonTeamTx(client, user, seasonId, payload.teamName);

    if (phase === "reposition") {
      const existingPicksResult = await client.query(
        "select player_id, slot from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2",
        [team.id, fantasyGameweekId]
      );
      const baselinePlayers = new Set(existingPicksResult.rows.map((row) => row.player_id));
      const baselineSlotByPlayer = new Map(existingPicksResult.rows.map((row) => [row.player_id, row.slot]));
      const submittedPlayers = new Set(picks.map((pick) => pick.playerId));
      const introducedNew = [...submittedPlayers].some((id) => !baselinePlayers.has(id));
      const droppedExisting = [...baselinePlayers].some((id) => !submittedPlayers.has(id));
      if (introducedNew || droppedExisting) {
        throw httpError(400, "Ovo kolo je vec pocelo - mozes samo da rasporedis vec izabrane igrace (klupa/teren), bez novih transfera.");
      }
      for (const pick of picks) {
        const previousSlot = baselineSlotByPlayer.get(pick.playerId);
        if (previousSlot && previousSlot !== pick.slot) {
          const played = await hasPlayerPlayedInWindow(client.query.bind(client), pick.playerId, gameweek.starts_at, gameweek.ends_at);
          if (played) {
            throw httpError(400, "Igrac je vec odigrao svoj mec ovog kola i ne moze da promeni poziciju (klupa/teren).");
          }
        }
      }
    }

    await client.query(
      "delete from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2",
      [team.id, fantasyGameweekId]
    );

    let spent = 0;
    const seenPlayers = new Set();
    const seenSlots = new Set();
    for (const pick of picks) {
      const playerId = requiredText(pick.playerId, "Player ID je obavezan.");
      const slot = requiredText(pick.slot, "Slot je obavezan.");
      if (!(slot in SLOT_POSITION_GROUPS)) throw httpError(400, `Nepoznat slot: ${slot}.`);
      const expectedPosition = SLOT_POSITION_GROUPS[slot];
      if (seenPlayers.has(playerId)) throw httpError(400, "Isti igrac ne moze biti izabran dva puta.");
      if (seenSlots.has(slot)) throw httpError(400, "Isti slot ne moze biti popunjen dva puta.");
      seenPlayers.add(playerId);
      seenSlots.add(slot);
      const poolPlayer = await ensurePlayerInSeasonPool(client, playerId, seasonId);
      if (expectedPosition && normalizePosition(poolPlayer.position) !== expectedPosition) {
        throw httpError(400, `Igrac ${poolPlayer.display_name || ""} nije na poziciji ${POSITION_GROUP_LABELS[expectedPosition]} i ne moze na slot ${slot}.`);
      }
      spent += Number(poolPlayer.current_price || 0);
      await client.query(
        `insert into public.fantasy_team_picks (fantasy_team_id, player_id, fantasy_gameweek_id, slot, is_captain)
         values ($1,$2,$3,$4,$5)`,
        [team.id, playerId, fantasyGameweekId, slot, Boolean(pick.isCaptain)]
      );
    }
    if (spent > 100) throw httpError(400, "Tim prelazi budzet od 100 kredita.");

    if (phase === "open") {
      const ranked = await fetchRankedGameweeks(client.query.bind(client), seasonId);
      const currentRound = ranked.find((row) => row.id === fantasyGameweekId);
      const roundNumber = currentRound ? currentRound.roundNumber : 1;
      if (!UNLIMITED_TRANSFER_ROUNDS.has(roundNumber)) {
        const previousPlayerIds = await getPreviousGameweekPlayerIds(client.query.bind(client), team.id, ranked, roundNumber);
        if (previousPlayerIds) {
          const transfersUsed = [...seenPlayers].filter((id) => !previousPlayerIds.has(id)).length;
          if (transfersUsed > TRANSFERS_PER_ROUND) {
            throw httpError(400, `Dozvoljeno je najvise ${TRANSFERS_PER_ROUND} transfera ovog kola (pokusao si ${transfersUsed}).`);
          }
        }
      }
    }

    return { teamId: team.id };
  });

  await audit(user, "fantasy.season.picks.set", "fantasyTeam", details.teamId, { fantasyGameweekId, count: picks.length });
  return withSeasonTeamDetails(details.teamId, fantasyGameweekId);
}

export async function scoreFantasySeasonGameweek(fantasyGameweekId, actor) {
  const result = await transaction(async (client) => {
    const gwResult = await client.query("select * from public.fantasy_gameweeks where id = $1 for update", [fantasyGameweekId]);
    const gameweek = gwResult.rows[0];
    if (!gameweek) throw httpError(404, "Fantasy kolo nije pronadjeno.");
    const seasonId = gameweek.fantasy_season_id;
    const windowEnd = gameweek.ends_at || gameweek.locks_at;

    const scoreRows = await client.query(
      `with season_competitions as (
         select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1
       ),
       gw_points as (
         select pms.player_id, sum(pms.fantasy_points) as points
         from public.player_match_stats pms
         join public.matches m on m.id = pms.match_id
         where m.competition_id in (select competition_id from season_competitions)
           and m.scheduled_at >= $2::timestamptz and m.scheduled_at <= $3::timestamptz
         group by pms.player_id
       ),
       pick_scores as (
         select ftp.id as pick_id,
                round(
                  coalesce(gwp.points, 0)
                  * case
                      when ftp.slot in ('B2','B3','B4','B5') then 0.5
                      else 1
                    end
                  * case when ftp.is_captain then 2 else 1 end
                )::integer as points
         from public.fantasy_team_picks ftp
         left join gw_points gwp on gwp.player_id = ftp.player_id
         where ftp.fantasy_gameweek_id = $4
       )
       update public.fantasy_team_picks ftp
       set points = pick_scores.points, locked_at = coalesce(ftp.locked_at, now()), updated_at = now()
       from pick_scores
       where ftp.id = pick_scores.pick_id
       returning ftp.fantasy_team_id, ftp.points`,
      [seasonId, gameweek.starts_at, windowEnd, fantasyGameweekId]
    );

    await client.query(
      `with totals as (
         select fantasy_team_id, sum(points)::integer as total
         from public.fantasy_team_picks
         where fantasy_gameweek_id is not null
         group by fantasy_team_id
       )
       update public.fantasy_teams ft
       set total_points = totals.total, last_scored_at = now(), updated_at = now()
       from totals
       where ft.id = totals.fantasy_team_id`
    );

    await client.query("update public.fantasy_gameweeks set status = 'scoring', updated_at = now() where id = $1", [fantasyGameweekId]);

    const priceUpdates = await client.query(
      `with season_competitions as (
         select competition_id from public.fantasy_season_competitions where fantasy_season_id = $1
       ),
       gw_points as (
         select pms.player_id, sum(pms.fantasy_points) as points
         from public.player_match_stats pms
         join public.matches m on m.id = pms.match_id
         where m.competition_id in (select competition_id from season_competitions)
           and m.scheduled_at >= $2::timestamptz and m.scheduled_at <= $3::timestamptz
         group by pms.player_id
       )
       update public.fantasy_player_pool fpp
       set current_price = greatest($4::numeric, round(fpp.current_price + (gwp.points - fpp.current_price) * $5::numeric, 2)),
           updated_at = now()
       from gw_points gwp
       where fpp.fantasy_season_id = $1 and fpp.player_id = gwp.player_id
       returning fpp.player_id, fpp.current_price`,
      [seasonId, gameweek.starts_at, windowEnd, MIN_PRICE, PRICE_STEP]
    );

    await auditWithClient(client, actor, "fantasy.season.gameweek.score", "fantasyGameweek", fantasyGameweekId, {
      updatedPicks: scoreRows.rowCount,
      pricedPlayers: priceUpdates.rowCount
    });

    return { gameweekId: fantasyGameweekId, updatedPicks: scoreRows.rowCount, pricedPlayers: priceUpdates.rowCount };
  });

  return result;
}

export async function getFantasySeasonLeaderboard(seasonId, fantasyGameweekId) {
  const params = [requiredText(seasonId, "Sezona je obavezna.")];
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
     from public.fantasy_teams ft
     join public.profiles p on p.id = ft.user_id
     ${join}
     where ft.fantasy_season_id = $1
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

async function withSeasonTeamDetails(fantasyTeamId, fantasyGameweekId) {
  const teamResult = await query(
    `select ft.id, ft.created_at, ft.updated_at, ft.user_id, ft.fantasy_season_id, fs.name as season_name,
            ft.name, ft.total_points, ft.last_scored_at
     from public.fantasy_teams ft
     left join public.fantasy_seasons fs on fs.id = ft.fantasy_season_id
     where ft.id = $1`,
    [fantasyTeamId]
  );
  const team = teamResult.rows[0];
  if (!team) throw httpError(404, "Fantasy tim nije pronadjen.");
  const params = [fantasyTeamId];
  let whereGameweek = "";
  if (fantasyGameweekId) {
    params.push(fantasyGameweekId);
    whereGameweek = "and ftp.fantasy_gameweek_id = $2";
  }
  const picks = await query(
    `select ftp.id, ftp.created_at, ftp.updated_at, ftp.player_id, p.display_name as player_name,
            p.position, p.avatar_url, p.shirt_number, t.id as team_id, t.name as team_name,
            ftp.fantasy_gameweek_id, fg.name as gameweek_name, fg.starts_at as gw_starts_at, fg.ends_at as gw_ends_at,
            ftp.slot, ftp.is_captain, ftp.locked_at, ftp.points,
            fpp.current_price
     from public.fantasy_team_picks ftp
     join public.players p on p.id = ftp.player_id
     left join public.teams t on t.id = p.team_id
     left join public.fantasy_gameweeks fg on fg.id = ftp.fantasy_gameweek_id
     left join public.fantasy_player_pool fpp on fpp.player_id = ftp.player_id and fpp.fantasy_season_id = $${whereGameweek ? 3 : 2}
     where ftp.fantasy_team_id = $1 ${whereGameweek}
     order by ftp.fantasy_gameweek_id nulls last, ftp.slot`,
    [...params, team.fantasy_season_id]
  );
  const spent = picks.rows.reduce((sum, row) => sum + Number(row.current_price || 0), 0);

  const picksWithPlayed = await Promise.all(
    picks.rows.map(async (row) => ({
      ...row,
      has_played: row.gw_starts_at && row.gw_ends_at ? await hasPlayerPlayedInWindow(query, row.player_id, row.gw_starts_at, row.gw_ends_at) : false
    }))
  );

  let transferWindow = null;
  if (fantasyGameweekId) {
    const gwRowResult = await query(
      `select starts_at, ends_at, locks_at from public.fantasy_gameweeks where id = $1`,
      [fantasyGameweekId]
    );
    const gwRow = gwRowResult.rows[0];
    const phase = gwRow ? computeGameweekPhase(gwRow) : "open";

    const ranked = await fetchRankedGameweeks(query, team.fantasy_season_id);
    const currentRound = ranked.find((row) => row.id === fantasyGameweekId);
    const roundNumber = currentRound ? currentRound.roundNumber : 1;
    const previous = roundNumber > 1 ? ranked.find((row) => row.roundNumber === roundNumber - 1) : null;
    let previousPicks = [];
    if (previous) {
      const prevPicksResult = await query(
        `select player_id, slot from public.fantasy_team_picks where fantasy_team_id = $1 and fantasy_gameweek_id = $2`,
        [fantasyTeamId, previous.id]
      );
      previousPicks = prevPicksResult.rows.map((row) => ({ playerId: row.player_id, slot: row.slot }));
    }
    transferWindow = {
      roundNumber,
      isUnlimited: UNLIMITED_TRANSFER_ROUNDS.has(roundNumber),
      transfersAllowed: TRANSFERS_PER_ROUND,
      previousPicks,
      phase
    };
  }

  return {
    id: team.id,
    createdAt: team.created_at,
    updatedAt: team.updated_at,
    userId: team.user_id,
    fantasySeasonId: team.fantasy_season_id,
    seasonName: team.season_name || "",
    name: team.name,
    totalPoints: Number(team.total_points || 0),
    lastScoredAt: team.last_scored_at,
    budgetSpent: Number(spent.toFixed(2)),
    budgetRemaining: Number((100 - spent).toFixed(2)),
    picks: picksWithPlayed.map(normalizePick),
    transferWindow
  };
}

async function ensureFantasySeasonTeam(user, seasonId) {
  const result = await query(
    `insert into public.fantasy_teams (user_id, fantasy_season_id, name)
     values ($1,$2,$3)
     on conflict (user_id, fantasy_season_id) where fantasy_season_id is not null do update set updated_at = now()
     returning id`,
    [user.id, requiredText(seasonId, "Sezona je obavezna."), `${user.displayName || "Korisnik"} FC`]
  );
  return result.rows[0];
}

async function ensureFantasySeasonTeamTx(client, user, seasonId, teamName) {
  const result = await client.query(
    `insert into public.fantasy_teams (user_id, fantasy_season_id, name)
     values ($1,$2,$3)
     on conflict (user_id, fantasy_season_id) where fantasy_season_id is not null do update set
       name = coalesce(nullif(excluded.name, ''), public.fantasy_teams.name),
       updated_at = now()
     returning id`,
    [user.id, seasonId, String(teamName || `${user.displayName || "Korisnik"} FC`).trim()]
  );
  return result.rows[0];
}

async function ensurePlayerInSeasonPool(client, playerId, seasonId) {
  const poolResult = await client.query(
    `select fpp.player_id, fpp.current_price, p.position, p.display_name
     from public.fantasy_player_pool fpp
     join public.players p on p.id = fpp.player_id
     join public.teams t on t.id = fpp.team_id
     where fpp.player_id = $1
       and fpp.fantasy_season_id = $2
       and fpp.is_available = true
       and p.is_active = true
       and t.is_active = true
     limit 1`,
    [playerId, seasonId]
  );
  if (!poolResult.rows[0]) throw httpError(400, "Izabrani igrac nije dostupan u fantasy bazi za ovu sezonu.");
  return poolResult.rows[0];
}

async function replaceSeasonCompetitionsTx(client, seasonId, competitionIds) {
  await client.query("delete from public.fantasy_season_competitions where fantasy_season_id = $1", [seasonId]);
  for (const competitionId of competitionIds) {
    await client.query(
      "insert into public.fantasy_season_competitions (fantasy_season_id, competition_id) values ($1,$2) on conflict do nothing",
      [seasonId, competitionId]
    );
  }
}

async function listSeasonCompetitionRows(seasonId) {
  const result = await query(
    `select c.id, c.name, c.season_name, city.name as city_name
     from public.fantasy_season_competitions fsc
     join public.competitions c on c.id = fsc.competition_id
     left join public.cities city on city.id = c.city_id
     where fsc.fantasy_season_id = $1
     order by city.name, c.name`,
    [seasonId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    seasonName: row.season_name,
    cityName: row.city_name || ""
  }));
}

async function getSeasonRow(seasonId) {
  const result = await query("select * from public.fantasy_seasons where id = $1", [requiredText(seasonId, "Sezona je obavezna.")]);
  if (!result.rows[0]) throw httpError(404, "Fantasy sezona nije pronadjena.");
  return result.rows[0];
}

async function ensureSeasonTx(client, seasonId) {
  const result = await client.query("select * from public.fantasy_seasons where id = $1", [seasonId]);
  if (!result.rows[0]) throw httpError(404, "Fantasy sezona nije pronadjena.");
  return result.rows[0];
}

async function audit(actor, action, entityType, entityId, metadata) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

async function auditWithClient(client, actor, action, entityType, entityId, metadata) {
  await client.query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizeSeason(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    status: row.status,
    gameweekLengthDays: Number(row.gameweek_length_days || 7),
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    competitionsCount: row.competitions_count !== undefined ? Number(row.competitions_count || 0) : undefined
  };
}

function normalizeGameweek(row) {
  return {
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    name: row.name,
    startsAt: row.starts_at,
    locksAt: row.locks_at,
    endsAt: row.ends_at || "",
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
    fantasyGameweekId: row.fantasy_gameweek_id || "",
    gameweekName: row.gameweek_name || "",
    slot: row.slot,
    isCaptain: row.is_captain,
    lockedAt: row.locked_at,
    points: Number(row.points || 0),
    currentPrice: Number(row.current_price || 0),
    hasPlayed: Boolean(row.has_played)
  };
}

function normalizeFantasyPoolPlayer(row) {
  return {
    id: row.id,
    fantasySeasonId: row.fantasy_season_id,
    competitionId: row.competition_id,
    competitionName: row.competition_name || "",
    playerId: row.player_id,
    teamId: row.team_id,
    teamName: row.team_name || "",
    teamShortName: row.team_short_name || "",
    teamLogoUrl: row.team_logo_url || "",
    displayName: row.display_name,
    position: row.position || "",
    shirtNumber: row.shirt_number,
    avatarUrl: row.avatar_url || "",
    basePrice: Number(row.base_price || 0),
    currentPrice: Number(row.current_price || 0),
    isAvailable: row.is_available,
    availabilityNote: row.availability_note || ""
  };
}

function uniqueIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))];
}

function validSeasonStatus(status) {
  const normalized = String(status || "").trim();
  if (!VALID_SEASON_STATUSES.has(normalized)) throw httpError(400, "Status sezone nije validan.");
  return normalized;
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
