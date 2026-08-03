// Shared shapes used across backend modules. Deliberately loose (optional fields, no
// strict role union) - this mirrors the actual sanitizeUser() output from auth.ts,
// which differs slightly between Supabase-auth and local-auth mode.
export interface Actor {
  id: string;
  email?: string;
  role?: string;
  displayName?: string;
  [key: string]: unknown;
}
