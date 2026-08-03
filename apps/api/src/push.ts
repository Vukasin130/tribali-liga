import { query } from "./db.ts";
import { httpError } from "./errors.ts";
import { requiredText } from "./validation.ts";
import type { Actor } from "./types.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export async function registerPushToken(user: Actor | null, token: unknown): Promise<{ ok: true }> {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  const cleaned = requiredText(token, "Push token je obavezan.");
  await query("update public.profiles set push_token = $2, updated_at = now() where id = $1", [user.id, cleaned]);
  return { ok: true };
}

// Best-effort: a failed/slow Expo batch never throws for the caller - a broadcast that
// partially fails should still report what did go out instead of losing the whole send.
async function deliverToExpo(tokens: string[], title: string, body: string, data: unknown): Promise<number> {
  let sent = 0;
  for (let i = 0; i < tokens.length; i += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(i, i + EXPO_BATCH_SIZE);
    const messages = batch.map((to) => ({ to, title, body, data: data || {}, sound: "default" }));
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages)
      });
      if (response.ok) sent += batch.length;
    } catch {
      // Network hiccup on this batch - move on, don't fail the whole broadcast.
    }
  }
  return sent;
}

interface BroadcastPayload {
  title?: string;
  body?: string;
}

export async function sendAdminBroadcast(payload: BroadcastPayload, actor: Actor | null): Promise<{ recipients: number; sent: number }> {
  if (!actor) throw httpError(401, "Moras biti ulogovan.");
  const title = requiredText(payload.title, "Naslov je obavezan.");
  const body = requiredText(payload.body, "Poruka je obavezna.");
  const tokens = await query<{ push_token: string }>(
    "select push_token from public.profiles where push_token is not null and push_token <> ''"
  );
  const sent = await deliverToExpo(tokens.rows.map((row) => row.push_token), title, body, { kind: "broadcast" });
  await audit(actor, "notifications.broadcast", "notification", null, { title, body, recipients: tokens.rowCount, sent });
  return { recipients: tokens.rowCount ?? 0, sent };
}

// Fire-and-forget helper for automatic triggers (e.g. a fantasy gameweek opening) -
// swallows its own errors so a notification hiccup never breaks the action that triggered it.
export async function sendAutomaticNotification(title: string, body: string, data?: unknown): Promise<void> {
  try {
    const tokens = await query<{ push_token: string }>(
      "select push_token from public.profiles where push_token is not null and push_token <> ''"
    );
    const sent = await deliverToExpo(tokens.rows.map((row) => row.push_token), title, body, data);
    await audit(null, "notifications.automatic", "notification", null, { title, body, recipients: tokens.rowCount, sent });
  } catch {
    // Never let a notification failure surface to the caller of the triggering action.
  }
}

// Same as sendAutomaticNotification but targeted at specific profiles only (e.g. the two
// players being asked about one match) - never broadcasts to the whole league.
export async function sendNotificationToProfiles(profileIds: (string | null | undefined)[], title: string, body: string, data?: unknown): Promise<void> {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (!ids.length) return;
  try {
    const tokens = await query<{ push_token: string }>(
      `select push_token from public.profiles where id = any($1::uuid[]) and push_token is not null and push_token <> ''`,
      [ids]
    );
    const sent = await deliverToExpo(tokens.rows.map((row) => row.push_token), title, body, data);
    await audit(null, "notifications.targeted", "notification", null, { title, body, recipients: tokens.rowCount, sent });
  } catch {
    // Never let a notification failure surface to the caller of the triggering action.
  }
}

async function audit(
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actor?.id || null, action, entityType, entityId, JSON.stringify(metadata || {})]
  ).catch(() => undefined);
}
