import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const schemaPath = resolve(projectRoot, "supabase", "schema.sql");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL nije pronadjen u .env fajlu.");
  process.exit(1);
}

if (connectionString.includes("[YOUR-PASSWORD]")) {
  console.error("DATABASE_URL jos uvek ima placeholder za lozinku.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  const schema = await readFile(schemaPath, "utf8");
  await client.connect();
  await client.query(schema);
  const result = await client.query(`
    select count(*)::int as table_count
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'profiles','cities','competitions','teams','players','matches','match_events',
        'news_posts','story_folders','stories','goal_polls','fantasy_teams'
      )
  `);
  console.log(`Supabase schema OK. Core tables: ${result.rows[0].table_count}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
