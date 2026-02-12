import "server-only";

import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const rawServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const hasSupabaseConfig =
  Boolean(rawSupabaseUrl && (rawServiceRoleKey || rawAnonKey)) &&
  rawSupabaseUrl !== "undefined" &&
  rawSupabaseUrl !== "null";

const supabaseUrl = hasSupabaseConfig
  ? (rawSupabaseUrl ?? "https://placeholder.supabase.co")
  : "https://placeholder.supabase.co";

// Prefer service role key, but fall back to anon/placeholder for build-time.
const supabaseKey =
  (rawServiceRoleKey && rawServiceRoleKey !== "undefined" && rawServiceRoleKey !== "null"
    ? rawServiceRoleKey
    : null) ??
  (rawAnonKey && rawAnonKey !== "undefined" && rawAnonKey !== "null" ? rawAnonKey : null) ??
  "placeholder";

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

