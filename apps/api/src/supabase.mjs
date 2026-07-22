import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";

let publicClient;
let adminClient;

export function hasSupabaseAuth() {
  return Boolean(config.supabase.url && config.supabase.publishableKey && config.supabase.secretKey);
}

export function supabasePublic() {
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

export function supabaseAdmin() {
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
