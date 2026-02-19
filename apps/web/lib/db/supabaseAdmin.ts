import "server-only";

import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const rawServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    throw new Error(`[supabaseAdmin] Missing valid ${name}.`);
  }
  return value;
}

let configError: Error | null = null;
let supabaseUrl = "https://invalid.supabase.local";
let supabaseKey = "invalid";

try {
  supabaseUrl = requireEnv(rawSupabaseUrl, "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  supabaseKey = requireEnv(rawServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
} catch (error) {
  configError = error instanceof Error ? error : new Error(String(error));
}

const baseClient = createClient(supabaseUrl, supabaseKey);

export const supabaseAdmin = configError
  ? new Proxy(baseClient, {
      get() {
        throw configError;
      },
    })
  : baseClient;
