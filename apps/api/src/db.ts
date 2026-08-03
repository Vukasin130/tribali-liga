import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "./config.ts";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function hasDatabase(): boolean {
  return Boolean(config.database.url);
}

export function getPool(): pg.Pool | null {
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

// Row shape is left to the caller (query<MyRow>(...)) rather than enforced here - this
// codebase's SQL is hand-written across ~20 files and retrofitting a precise type for
// every query's result is a much larger, separate effort from just getting the project
// onto TypeScript. Defaulting to `any` keeps every existing call site compiling as-is.
export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  const activePool = getPool();
  if (!activePool) throw new Error("Supabase baza nije podesena.");
  return activePool.query<T>(text, params);
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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

interface DatabaseHealth {
  enabled: boolean;
  ok: boolean;
  reason?: string;
  latencyMs?: number;
  checkedAt?: string;
  error?: string;
}

export async function databaseHealth(): Promise<DatabaseHealth> {
  if (!hasDatabase()) {
    return { enabled: false, ok: false, reason: "DATABASE_URL nije podesen" };
  }

  const startedAt = Date.now();
  try {
    const result = await query<{ checked_at: string }>("select now() as checked_at");
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
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
