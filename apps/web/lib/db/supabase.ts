import { createBrowserClient } from "@supabase/ssr";
import { requireEnv, resolveSupabaseUrl } from "./supabaseEnv";

const rawSupabaseUrl = resolveSupabaseUrl();
const rawSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let configError: Error | null = null;
let supabaseUrl = "https://invalid.supabase.local";
let supabaseKey = "invalid";

try {
  supabaseUrl = requireEnv(
    rawSupabaseUrl,
    "NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL or SUPABASE_CUSTOM_DOMAIN_URL or NEXT_PUBLIC_SUPABASE_URL",
  );
  supabaseKey = requireEnv(rawSupabaseKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
} catch (error) {
  configError = error instanceof Error ? error : new Error(String(error));
}

const baseClient = createBrowserClient(supabaseUrl, supabaseKey);

// Use SSR-compatible browser client so auth uses cookies the middleware can read.
export const supabase = configError
  ? new Proxy(baseClient, {
      get() {
        throw configError;
      },
    })
  : baseClient;
