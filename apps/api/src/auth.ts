import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { config } from "./config.ts";
import { hasDatabase, query } from "./db.ts";
import { mutateDatabase, timestamp, type DbRecord } from "./store.ts";
import { hasSupabaseAuth, supabaseAdmin, supabasePublic } from "./supabase.ts";
import { httpError } from "./errors.ts";
import type { Actor } from "./types.ts";

const ADMIN_EMAIL = config.auth.adminEmail;
const ADMIN_PASSWORD = config.auth.adminPassword;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 32;
const HASH_DIGEST = "sha256";

// Local (offline/demo) fallback shapes - only exercised when Supabase isn't configured.
interface LocalUser extends DbRecord {
  email: string;
  displayName: string;
  role: string;
  verificationStatus: string;
  passwordHash: string;
  passwordSalt: string;
  passwordUpdatedAt: string;
}

interface LocalSession extends DbRecord {
  userId: string;
  token: string;
  expiresAt: string;
}

interface AuthPayload {
  email?: string;
  password?: string;
  displayName?: string;
  name?: string;
  roleIntent?: string;
  role?: string;
  playerName?: string;
  city?: string;
  team?: string;
  teamId?: string;
}

export async function registerUser(payload: AuthPayload) {
  if (canUseSupabaseAuth()) return registerSupabaseUser(payload);
  return registerLocalUser(payload);
}

export async function loginUser(payload: AuthPayload) {
  if (canUseSupabaseAuth()) return loginSupabaseUser(payload);
  return loginLocalUser(payload);
}

export async function getSessionUser(token: string): Promise<Actor | null> {
  if (canUseSupabaseAuth()) return (await getSupabaseSessionUser(token)) as Actor | null;
  return (await getLocalSessionUser(token)) as Actor | null;
}

export async function logoutUser(token: string) {
  if (canUseSupabaseAuth()) return logoutSupabaseUser(token);
  return logoutLocalUser(token);
}

export async function requestPasswordReset(payload: { email?: string }) {
  if (canUseSupabaseAuth()) return requestSupabasePasswordReset(payload);
  throw httpError(501, "Resetovanje lozinke nije dostupno u ovom rezimu.");
}

export async function confirmPasswordReset(payload: { email?: string; code?: string; newPassword?: string }) {
  if (canUseSupabaseAuth()) return confirmSupabasePasswordReset(payload);
  throw httpError(501, "Resetovanje lozinke nije dostupno u ovom rezimu.");
}

export async function deleteOwnAccount(user: Actor | null, payload: { password?: string }) {
  if (!user) throw httpError(401, "Moras biti ulogovan.");
  if (canUseSupabaseAuth()) return deleteSupabaseAccount(user, payload);
  return deleteLocalAccount(user, payload);
}

async function registerSupabaseUser(payload: AuthPayload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || payload.name || "").trim();
  const wantsPlayerVerification = payload.roleIntent === "verified_player" || payload.role === "verified_player";

  if (!displayName) throw httpError(400, "Ime je obavezno.");
  if (!email) throw httpError(400, "Email je obavezan.");
  if (password.length < 6) throw httpError(400, "Lozinka mora imati bar 6 karaktera.");

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  });

  if (error) {
    if (String(error.message || "").toLowerCase().includes("already")) {
      throw httpError(409, "Nalog sa ovim emailom vec postoji.");
    }
    throw httpError(error.status || 500, error.message || "Registracija nije uspela.");
  }

  const userId = data.user?.id;
  if (!userId) throw httpError(500, "Supabase nije vratio korisnika.");

  // One login/registration flow for everyone - the only thing that makes someone an
  // admin is their email matching ADMIN_EMAIL (set in .env). No separate admin
  // sign-up path, no blocking registration for that address.
  const user = await upsertProfile({
    id: userId,
    email,
    displayName,
    role: email === ADMIN_EMAIL ? "admin" : "fan",
    verificationStatus: wantsPlayerVerification ? "pending" : "none"
  });

  if (wantsPlayerVerification) {
    await createVerificationRequest(userId, payload);
  }

  return sanitizeUser(user);
}

async function loginSupabaseUser(payload: AuthPayload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!email || !password) throw httpError(400, "Email i lozinka su obavezni.");

  const { data, error } = await supabasePublic().auth.signInWithPassword({ email, password });
  if (error) throw httpError(401, "Email ili lozinka nisu tacni.");

  const authUser = data.user;
  const session = data.session;
  if (!authUser || !session?.access_token) throw httpError(401, "Email ili lozinka nisu tacni.");

  let profile = await getProfile(authUser.id);
  // Self-healing: if this address matches ADMIN_EMAIL but the profile row somehow
  // isn't marked admin yet (e.g. it predates this check), fix it on the way in.
  if (email === ADMIN_EMAIL && profile && profile.role !== "admin") {
    profile = await upsertProfile({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: "admin",
      verificationStatus: profile.verificationStatus
    });
  }
  await auditLog(profile?.id || authUser.id, "auth.login", "profile", profile?.id || authUser.id, { role: profile?.role || "fan" });

  return {
    token: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "",
    user: sanitizeUser(profile || profileFromAuth(authUser))
  };
}

async function getSupabaseSessionUser(token: string) {
  if (!token) return null;
  const { data, error } = await supabasePublic().auth.getUser(token);
  if (error || !data.user) return null;
  const profile = await getProfile(data.user.id);
  return sanitizeUser(profile || profileFromAuth(data.user));
}

async function logoutSupabaseUser(token: string) {
  if (token) {
    await auditLog(null, "auth.logout", "session", null, {});
  }
  return { loggedOut: true };
}

// Always reports success regardless of whether the email is registered - never let a
// "forgot password" form reveal which addresses have accounts. Supabase's own recovery
// email (default template) carries both a link and a 6-digit code, so the app never
// needs to send email itself.
async function requestSupabasePasswordReset(payload: { email?: string }) {
  const email = normalizeEmail(payload.email);
  if (!email) throw httpError(400, "Email je obavezan.");
  await supabasePublic().auth.resetPasswordForEmail(email).catch(() => undefined);
  return { ok: true };
}

async function confirmSupabasePasswordReset(payload: { email?: string; code?: string; newPassword?: string }) {
  const email = normalizeEmail(payload.email);
  const code = String(payload.code || "").trim();
  const newPassword = String(payload.newPassword || "");
  if (!email || !code) throw httpError(400, "Email i kod su obavezni.");
  if (newPassword.length < 6) throw httpError(400, "Lozinka mora imati bar 6 karaktera.");

  const { data, error } = await supabasePublic().auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error || !data.user) throw httpError(400, "Kod nije tacan ili je istekao.");

  const admin = supabaseAdmin();
  const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, { password: newPassword });
  if (updateError) throw httpError(500, updateError.message || "Lozinka nije promenjena.");

  await auditLog(data.user.id, "auth.password_reset", "profile", data.user.id, {});
  return { ok: true };
}

async function deleteSupabaseAccount(user: Actor, payload: { password?: string }) {
  const password = String(payload.password || "");
  if (!password) throw httpError(400, "Unesi lozinku da potvrdis brisanje naloga.");

  const { error: verifyError } = await supabasePublic().auth.signInWithPassword({ email: user.email || "", password });
  if (verifyError) throw httpError(401, "Pogresna lozinka.");

  await auditLog(user.id, "auth.account_delete", "profile", user.id, {});
  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw httpError(500, error.message || "Nalog nije obrisan.");
  return { deleted: true };
}

async function getProfile(id: string) {
  const result = await query(
    `select id, email, display_name, role, verification_status, verified_player_id, avatar_url, created_at, updated_at
     from public.profiles
     where id = $1
     limit 1`,
    [id]
  );
  return result.rows[0] ? normalizeProfile(result.rows[0]) : null;
}

interface UpsertProfileInput {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verificationStatus: string;
}

async function upsertProfile({ id, email, displayName, role, verificationStatus }: UpsertProfileInput) {
  const result = await query(
    `insert into public.profiles (id, email, display_name, role, verification_status)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       email = excluded.email,
       display_name = excluded.display_name,
       role = excluded.role,
       verification_status = excluded.verification_status,
       updated_at = now()
     returning id, email, display_name, role, verification_status, verified_player_id, avatar_url, created_at, updated_at`,
    [id, email, displayName, role, verificationStatus]
  );
  return normalizeProfile(result.rows[0]);
}

async function createVerificationRequest(userId: string, payload: AuthPayload) {
  await query(
    `insert into public.verification_requests (user_id, player_name, team_id, status)
     values ($1, $2, $3, 'pending')`,
    [
      userId,
      String(payload.playerName || payload.displayName || payload.name || "").trim(),
      payload.teamId ? payload.teamId.trim() || null : null
    ]
  );
}

async function auditLog(actorUserId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  await query(
    `insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [actorUserId, action, entityType, entityId, JSON.stringify(metadata || {})]
  );
}

function profileFromAuth(user: any) {
  return {
    id: user.id,
    email: user.email || "",
    displayName: user.user_metadata?.display_name || user.email || "Korisnik",
    role: "fan",
    verificationStatus: "none"
  };
}

function normalizeProfile(row: any) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || "",
    role: row.role,
    verificationStatus: row.verification_status,
    verifiedPlayerId: row.verified_player_id || ""
  };
}

function canUseSupabaseAuth(): boolean {
  return hasDatabase() && hasSupabaseAuth();
}

async function registerLocalUser(payload: AuthPayload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const displayName = String(payload.displayName || payload.name || "").trim();
  const wantsPlayerVerification = payload.roleIntent === "verified_player" || payload.role === "verified_player";

  if (!displayName) throw httpError(400, "Ime je obavezno.");
  if (!email) throw httpError(400, "Email je obavezan.");
  if (password.length < 6) throw httpError(400, "Lozinka mora imati bar 6 karaktera.");

  return mutateDatabase((db) => {
    const users = db.users as LocalUser[];
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      throw httpError(409, "Nalog sa ovim emailom vec postoji.");
    }

    const passwordRecord = hashPassword(password);
    const user: LocalUser = {
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      email,
      displayName,
      role: email === ADMIN_EMAIL ? "admin" : "fan",
      verificationStatus: wantsPlayerVerification ? "pending" : "none",
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      passwordUpdatedAt: timestamp()
    };

    users.push(user);

    if (wantsPlayerVerification) {
      db.verificationRequests.push({
        id: randomUUID(),
        createdAt: timestamp(),
        updatedAt: timestamp(),
        userId: user.id,
        email,
        displayName,
        city: String(payload.city || "").trim(),
        team: String(payload.team || "").trim(),
        playerName: String(payload.playerName || "").trim(),
        status: "pending",
        sentToEmail: ADMIN_EMAIL
      });
    }

    return sanitizeUser(user);
  });
}

async function loginLocalUser(payload: AuthPayload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  if (!email || !password) throw httpError(400, "Email i lozinka su obavezni.");
  if (email === ADMIN_EMAIL && config.runtime.isProduction && !ADMIN_PASSWORD) {
    throw httpError(500, "Admin lozinka mora biti podesena kroz okruzenje.");
  }

  return mutateDatabase((db) => {
    const users = db.users as LocalUser[];
    const user = users.find((item) => normalizeEmail(item.email) === email);
    if (!user) throw httpError(401, "Email ili lozinka nisu tacni.");

    if (email === ADMIN_EMAIL && !user.passwordHash && password === ADMIN_PASSWORD) {
      const passwordRecord = hashPassword(password);
      user.passwordHash = passwordRecord.hash;
      user.passwordSalt = passwordRecord.salt;
      user.passwordUpdatedAt = timestamp();
      user.updatedAt = timestamp();
    }

    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw httpError(401, "Email ili lozinka nisu tacni.");
    }

    const session = createSession(user.id);
    (db.sessions as LocalSession[]).push(session);
    db.auditLogs.push({
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      actorUserId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role }
    });

    return { token: session.token, expiresAt: session.expiresAt, user: sanitizeUser(user) };
  });
}

async function getLocalSessionUser(token: string) {
  if (!token) return null;
  return mutateDatabase((db) => {
    const nowMs = Date.now();
    db.sessions = (db.sessions as LocalSession[]).filter((session) => new Date(session.expiresAt).getTime() > nowMs);
    const session = (db.sessions as LocalSession[]).find((item) => item.token === token);
    if (!session) return null;
    const user = (db.users as LocalUser[]).find((item) => item.id === session.userId);
    return user ? sanitizeUser(user) : null;
  });
}

async function logoutLocalUser(token: string) {
  if (!token) return { loggedOut: true };
  return mutateDatabase((db) => {
    db.sessions = (db.sessions as LocalSession[]).filter((session) => session.token !== token);
    return { loggedOut: true };
  });
}

async function deleteLocalAccount(user: Actor, payload: { password?: string }) {
  const password = String(payload.password || "");
  return mutateDatabase((db) => {
    const users = db.users as LocalUser[];
    const record = users.find((item) => item.id === user.id);
    if (!record) throw httpError(404, "Nalog nije pronadjen.");
    if (!verifyPassword(password, record.passwordSalt, record.passwordHash)) {
      throw httpError(401, "Pogresna lozinka.");
    }
    db.users = users.filter((item) => item.id !== user.id);
    db.sessions = (db.sessions as LocalSession[]).filter((session) => session.userId !== user.id);
    db.auditLogs.push({
      id: randomUUID(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      actorUserId: user.id,
      action: "auth.account_delete",
      entityType: "user",
      entityId: user.id,
      metadata: {}
    });
    return { deleted: true };
  });
}

export function requireAdmin(user: Actor | null): asserts user is Actor {
  if (!user || user.role !== "admin") throw httpError(403, "Samo administrator moze da menja ove podatke.");
}

export function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function sanitizeUser(user: any): Record<string, unknown> | null {
  if (!user) return null;
  const { passwordHash, passwordSalt, passwordUpdatedAt, ...safeUser } = user;
  return safeUser;
}

function createSession(userId: string): LocalSession {
  const createdAt = timestamp();
  return {
    id: randomUUID(),
    createdAt,
    updatedAt: createdAt,
    userId,
    token: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString("hex");
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!salt || !expectedHash) return false;
  const actual = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}
