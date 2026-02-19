import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isMissingOrPlaceholder, resolveSupabaseUrl } from "./supabaseEnv";

const rawSupabaseUrl = resolveSupabaseUrl();
const rawServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  supabaseUrl = requireEnv(
    rawSupabaseUrl,
    "NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL or SUPABASE_CUSTOM_DOMAIN_URL or NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL",
  );
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
