import { createBrowserClient } from "@supabase/ssr";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
function isMissingOrPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "placeholder" ||
    normalized.includes("placeholder")
  );
}

function requireEnv(value: string | undefined, name: string): string {
  if (typeof value !== "string" || isMissingOrPlaceholder(value)) {
    throw new Error(`[supabase] Missing valid ${name}.`);
  }
  return value;
}

let configError: Error | null = null;
let supabaseUrl = "https://invalid.supabase.local";
let supabaseKey = "invalid";

try {
  supabaseUrl = requireEnv(rawSupabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
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
