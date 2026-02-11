import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasSupabaseConfig =
  Boolean(rawSupabaseUrl && rawSupabaseKey) &&
  rawSupabaseUrl !== "undefined" &&
  rawSupabaseUrl !== "null" &&
  rawSupabaseKey !== "undefined" &&
  rawSupabaseKey !== "null";

const supabaseUrl = hasSupabaseConfig
  ? (rawSupabaseUrl ?? "https://placeholder.supabase.co")
  : "https://placeholder.supabase.co";
const supabaseKey = hasSupabaseConfig ? (rawSupabaseKey ?? "placeholder") : "placeholder";

// Use SSR-compatible browser client so auth uses cookies the middleware can read.
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

// Server-side client with service role (for API routes)
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey
);
