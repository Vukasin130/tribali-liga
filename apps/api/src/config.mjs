import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
const envPath = resolve(projectRoot, ".env");

loadRootEnv();

export const config = {
  api: {
    port: Number(process.env.PORT || 8787),
    host: process.env.API_HOST || "127.0.0.1",
    corsOrigin: process.env.CORS_ORIGIN || "http://127.0.0.1:5173",
    bodyLimitBytes: Number(process.env.API_BODY_LIMIT_BYTES || 1024 * 1024 * 4)
  },
  database: {
    url: process.env.DATABASE_URL || "",
    poolMax: Number(process.env.DB_POOL_MAX || 8),
    idleTimeoutMs: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMs: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000)
  },
  supabase: {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    secretKey: process.env.SUPABASE_SECRET_KEY || ""
  },
  auth: {
    adminEmail: (process.env.ADMIN_EMAIL || "admin@urbanfantasy.rs").toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD || ""
  },
  runtime: {
    isProduction: process.env.NODE_ENV === "production"
  }
};

export function storageMode() {
  return config.database.url ? "supabase-transition" : "file";
}

function loadRootEnv() {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
