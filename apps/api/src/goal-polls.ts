import { query } from "./db.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const POLL_STATUSES = new Set(["draft", "open", "closed", "tiebreak"]);

export async function getCurrentGoalPoll(user: Actor | null) {
  const result = await query(
    `select id from public.goal_polls
     order by
       case status when 'open' then 1 when 'tiebreak' then 2 when 'closed' then 3 else 4 end,
       created_at desc
     limit 1`
  );
  if (!result.rows[0]) return null;
  return getGoalPoll(result.rows[0].id, user);
}

export async function getGoalPoll(id: string, user: Actor | null) {
  await closePollIfExpired(id);
  const pollResult = await query(
    `select id, created_at, updated_at, title, copy, status, ends_at, winner_option_id, created_by_user_id
     from public.goal_polls
     where id = $1`,
    [id]
  );
  if (!pollResult.rows[0]) throw httpError(404, "Anketa nije pronadjena.");

  const optionsResult = await query(
    `select o.id, o.created_at, o.poll_id, o.player_id, o.player_name, o.title, o.video_url, o.sort_order,
            count(v.id)::int as votes
     from public.goal_poll_options o
     left join public.goal_votes v on v.option_id = o.id
     where o.poll_id = $1
     group by o.id
     order by o.sort_order, o.created_at`,
    [id]
  );

  const userVote = user?.id ? await getUserVote(id, user.id) : null;
  return normalizePoll(pollResult.rows[0], optionsResult.rows, userVote);
}

interface GoalPollOptionInput {
  playerId?: string;
  playerName?: string;
  label?: string;
  title?: string;
  videoUrl?: string;
}

interface CreateGoalPollPayload {
  title?: string;
  copy?: string;
  status?: string;
  endsAt?: string;
  endAt?: string;
  options?: GoalPollOptionInput[];
}

export async function createGoalPoll(payload: CreateGoalPollPayload, actor: Actor) {
  const options = normalizeOptions(payload.options || []);
  if (options.length < 2) throw httpError(400, "Anketa mora imati najmanje dve opcije.");

  const result = await query(
    `insert into public.goal_polls (title, copy, status, ends_at, created_by_user_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      requiredText(payload.title || "Glasaj za gol kola", "Naslov ankete je obavezan."),
      String(payload.copy || "").trim(),
      validStatus(payload.status || "open"),
      payload.endsAt || payload.endAt || null,
      actor.id
    ]
  );

  await replaceOptions(result.rows[0].id, options);
  await audit(actor, "goalPoll.create", "goalPoll", result.rows[0].id, { title: payload.title });
  return getGoalPoll(result.rows[0].id, actor);
}

export async function updateGoalPoll(id: string, payload: CreateGoalPollPayload, actor: Actor) {
  const existing = await query("select id from public.goal_polls where id = $1", [id]);
  if (!existing.rows[0]) throw httpError(404, "Anketa nije pronadjena.");

  await query(
    `update public.goal_polls set
       title = coalesce($2, title),
       copy = coalesce($3, copy),
       status = coalesce($4, status),
       ends_at = coalesce($5, ends_at),
       updated_at = now()
     where id = $1`,
    [
      id,
      payload.title !== undefined ? requiredText(payload.title, "Naslov ankete je obavezan.") : null,
      payload.copy !== undefined ? String(payload.copy || "").trim() : null,
      payload.status !== undefined ? validStatus(payload.status) : null,
      payload.endsAt || payload.endAt || null
    ]
  );

  if (Array.isArray(payload.options)) {
    const options = normalizeOptions(payload.options);
    if (options.length < 2) throw httpError(400, "Anketa mora imati najmanje dve opcije.");
    await replaceOptions(id, options);
  }

  await audit(actor, "goalPoll.update", "goalPoll", id, {});
  return getGoalPoll(id, actor);
}

export async function setGoalPollStatus(id: string, payload: { status?: string; endsAt?: string; endAt?: string }, actor: Actor) {
  const status = validStatus(payload.status);
  const result = await query(
    `update public.goal_polls set status = $2, ends_at = coalesce($3, ends_at), updated_at = now()
     where id = $1
     returning id`,
    [id, status, payload.endsAt || payload.endAt || null]
  );
  if (!result.rows[0]) throw httpError(404, "Anketa nije pronadjena.");
  await audit(actor, "goalPoll.status", "goalPoll", id, { status });
  return getGoalPoll(id, actor);
}

export async function finishGoalPoll(id: string, payload: { winnerOptionId?: string; optionId?: string }, actor: Actor) {
  const totals = await getPollTotals(id);
  if (!totals.options.length) throw httpError(404, "Anketa nije pronadjena.");

  let winnerOptionId = payload.winnerOptionId || payload.optionId || "";
  if (!winnerOptionId) {
    const leaders = leadersFromOptions(totals.options);
    if (leaders.length > 1) {
      await query("update public.goal_polls set status = 'tiebreak', winner_option_id = null, updated_at = now() where id = $1", [id]);
      return { ...(await getGoalPoll(id, actor)), tiebreak: true };
    }
    winnerOptionId = leaders[0]?.id || "";
  }

  if (!totals.options.some((option: any) => option.id === winnerOptionId)) {
    throw httpError(400, "Pobednik mora biti jedna od opcija ankete.");
  }

  await query(
    `update public.goal_polls set status = 'closed', winner_option_id = $2, updated_at = now()
     where id = $1`,
    [id, winnerOptionId]
  );
  await audit(actor, "goalPoll.finish", "goalPoll", id, { winnerOptionId });
  return getGoalPoll(id, actor);
}

export async function voteGoalPoll(id: string, payload: { optionId?: string }, user: Actor | null) {
  if (!user) throw httpError(401, "Moras biti ulogovan za glasanje.");
  await closePollIfExpired(id);

  const poll = await query("select id, status from public.goal_polls where id = $1", [id]);
  if (!poll.rows[0]) throw httpError(404, "Anketa nije pronadjena.");
  if (poll.rows[0].status !== "open") throw httpError(409, "Glasanje nije otvoreno.");

  const optionId = requiredText(payload.optionId, "Opcija za glasanje je obavezna.");
  const option = await query("select id from public.goal_poll_options where id = $1 and poll_id = $2", [optionId, id]);
  if (!option.rows[0]) throw httpError(400, "Opcija nije deo ove ankete.");

  const existing = await getUserVote(id, user.id);
  if (existing?.optionId === optionId) {
    await query("delete from public.goal_votes where poll_id = $1 and user_id = $2", [id, user.id]);
    return { ...(await getGoalPoll(id, user)), voteRemoved: true };
  }
  if (existing) {
    throw httpError(409, "Prvo ponisti trenutni glas, pa glasaj za drugog igraca.");
  }

  await query(
    `insert into public.goal_votes (poll_id, option_id, user_id)
     values ($1, $2, $3)`,
    [id, optionId, user.id]
  );
  return { ...(await getGoalPoll(id, user)), voteSaved: true };
}

export async function getGoalPollStats(id: string) {
  const poll = await getGoalPoll(id, null);
  const votes = await query(
    `select v.id, v.created_at, v.poll_id, v.option_id, v.user_id, p.display_name, p.email
     from public.goal_votes v
     left join public.profiles p on p.id = v.user_id
     where v.poll_id = $1
     order by v.created_at desc`,
    [id]
  );
  return {
    poll,
    votes: votes.rows.map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      pollId: row.poll_id,
      optionId: row.option_id,
      userId: row.user_id,
      displayName: row.display_name || "",
      email: row.email || ""
    }))
  };
}

async function replaceOptions(pollId: string, options: ReturnType<typeof normalizeOptions>) {
  await query("delete from public.goal_poll_options where poll_id = $1", [pollId]);
  for (const [index, option] of options.entries()) {
    await query(
      `insert into public.goal_poll_options (poll_id, player_id, player_name, title, video_url, sort_order)
       values ($1, $2, $3, $4, $5, $6)`,
      [pollId, option.playerId || null, option.playerName, option.title, option.videoUrl, index]
    );
  }
  await query("delete from public.goal_votes where poll_id = $1", [pollId]);
}

async function closePollIfExpired(id: string) {
  const totals = await getPollTotals(id);
  const poll = totals.poll;
  if (!poll || poll.status !== "open" || !poll.ends_at || new Date(poll.ends_at).getTime() > Date.now()) return;
  const leaders = leadersFromOptions(totals.options);
  if (leaders.length === 1) {
    await query(
      "update public.goal_polls set status = 'closed', winner_option_id = $2, updated_at = now() where id = $1",
      [id, leaders[0].id]
    );
  } else {
    await query("update public.goal_polls set status = 'tiebreak', winner_option_id = null, updated_at = now() where id = $1", [id]);
  }
}

async function getPollTotals(id: string) {
  const pollResult = await query("select id, status, ends_at from public.goal_polls where id = $1", [id]);
  const optionsResult = await query(
    `select o.id, count(v.id)::int as votes
     from public.goal_poll_options o
     left join public.goal_votes v on v.option_id = o.id
     where o.poll_id = $1
     group by o.id
     order by o.created_at`,
    [id]
  );
  return { poll: pollResult.rows[0] || null, options: optionsResult.rows };
}

async function getUserVote(pollId: string, userId: string) {
  const result = await query(
    `select id, poll_id, option_id, user_id
     from public.goal_votes
     where poll_id = $1 and user_id = $2
     limit 1`,
    [pollId, userId]
  );
  const row = result.rows[0];
  return row ? { id: row.id, pollId: row.poll_id, optionId: row.option_id, userId: row.user_id } : null;
}

async function audit(actor: Actor | null, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function normalizePoll(row: any, options: any[], userVote: { optionId: string } | null) {
  const totalVotes = options.reduce((sum, option) => sum + Number(option.votes || 0), 0);
  const normalizedOptions = options.map((option) => ({
    id: option.id,
    createdAt: option.created_at,
    pollId: option.poll_id,
    playerId: option.player_id || "",
    playerName: option.player_name,
    title: option.title,
    label: option.title,
    videoUrl: option.video_url,
    sortOrder: option.sort_order,
    votes: Number(option.votes || 0),
    percent: totalVotes ? Math.round((Number(option.votes || 0) / totalVotes) * 100) : 0,
    isWinner: row.winner_option_id === option.id
  }));

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    copy: row.copy || "",
    status: row.status,
    endAt: row.ends_at ? new Date(row.ends_at).getTime() : null,
    endsAt: row.ends_at,
    winnerId: row.winner_option_id || "",
    winnerOptionId: row.winner_option_id || "",
    totalVotes,
    userVote: userVote?.optionId || "",
    options: normalizedOptions
  };
}

function normalizeOptions(options: GoalPollOptionInput[]) {
  return options
    .map((option, index) => ({
      playerId: option.playerId || "",
      playerName: String(option.playerName || option.label || option.title || `Igrac ${index + 1}`).trim(),
      title: String(option.title || option.label || option.playerName || `Opcija ${index + 1}`).trim(),
      videoUrl: requiredText(option.videoUrl, "Svaka opcija mora imati video.")
    }))
    .filter((option) => option.title && option.videoUrl);
}

function leadersFromOptions(options: any[]) {
  const max = Math.max(...options.map((option) => Number(option.votes || 0)), 0);
  return options.filter((option) => Number(option.votes || 0) === max);
}

function validStatus(status: unknown): string {
  const normalized = String(status || "").trim();
  if (!POLL_STATUSES.has(normalized)) throw httpError(400, "Status ankete nije validan.");
  return normalized;
}
