import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Env lives at the repo root (fantasy-app/.env), not per-app - load it explicitly by
// path so `prisma` CLI commands work regardless of the directory they're invoked from,
// without duplicating DATABASE_URL/DIRECT_URL into a second .env file.
dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  experimental: {
    externalTables: true
  },
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  // CLI-only connection (introspection, migrations). Supabase's plain "Direct connection"
  // is IPv6-only and unreachable from this network, so DIRECT_URL here is actually the
  // Session pooler connection (IPv4, persistent sessions - Supabase's own recommended
  // fallback, and still supports the advisory locks Migrate needs, unlike the Transaction
  // pooler). The app's own runtime client (src/prisma.ts) is unaffected by this file and
  // keeps using the pooled DATABASE_URL via its own explicit `datasourceUrl` option.
  datasource: {
    url: process.env.DIRECT_URL
  },
  // auth.* is Supabase's own managed schema (not ours to migrate) - public.profiles has
  // one FK into auth.users, so multi-schema introspection is needed to resolve it, but
  // every auth.* table stays externally managed: Prisma models them (for the relation)
  // without ever generating migrations against them.
  tables: {
    external: [
      "auth.audit_log_entries",
      "auth.custom_oauth_providers",
      "auth.flow_state",
      "auth.identities",
      "auth.instances",
      "auth.mfa_amr_claims",
      "auth.mfa_challenges",
      "auth.mfa_factors",
      "auth.oauth_authorizations",
      "auth.oauth_client_states",
      "auth.oauth_clients",
      "auth.oauth_consents",
      "auth.one_time_tokens",
      "auth.refresh_tokens",
      "auth.saml_providers",
      "auth.saml_relay_states",
      "auth.schema_migrations",
      "auth.sessions",
      "auth.sso_domains",
      "auth.sso_providers",
      "auth.users",
      "auth.webauthn_challenges",
      "auth.webauthn_credentials"
    ]
  }
});
