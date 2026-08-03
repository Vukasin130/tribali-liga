import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.ts";

let publicClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function hasSupabaseAuth(): boolean {
  return Boolean(config.supabase.url && config.supabase.publishableKey && config.supabase.secretKey);
}

export function supabasePublic(): SupabaseClient {
  if (!config.supabase.url || !config.supabase.publishableKey) {
    throw new Error("Supabase public konfiguracija nije podesena.");
  }

  if (!publicClient) {
    publicClient = createClient(config.supabase.url, config.supabase.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return publicClient;
}

export function supabaseAdmin(): SupabaseClient {
  if (!hasSupabaseAuth()) {
    throw new Error("Supabase server konfiguracija nije podesena.");
  }

  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return adminClient;
}
