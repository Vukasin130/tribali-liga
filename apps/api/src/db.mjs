import pg from "pg";
import { config } from "./config.mjs";

const { Pool } = pg;

let pool;

export function hasDatabase() {
  return Boolean(config.database.url);
}

export function getPool() {
  if (!hasDatabase()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) throw new Error("Supabase baza nije podesena.");
  return activePool.query(text, params);
}

export async function transaction(callback) {
  const activePool = getPool();
  if (!activePool) throw new Error("Supabase baza nije podesena.");
  const client = await activePool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseHealth() {
  if (!hasDatabase()) {
    return { enabled: false, ok: false, reason: "DATABASE_URL nije podesen" };
  }

  const startedAt = Date.now();
  try {
    const result = await query("select now() as checked_at");
    return {
      enabled: true,
      ok: true,
      latencyMs: Date.now() - startedAt,
      checkedAt: result.rows[0]?.checked_at
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error.message
    };
  }
}
