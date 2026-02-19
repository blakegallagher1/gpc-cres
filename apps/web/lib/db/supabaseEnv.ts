function normalize(value: string | undefined): string {
  return (value ?? "").trim();
}

export function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalized = normalize(value).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "placeholder" ||
    normalized.includes("placeholder")
  );
}

export function requireEnv(value: string | undefined, name: string): string {
  if (typeof value !== "string" || isMissingOrPlaceholder(value)) {
    throw new Error(`[supabase] Missing valid ${name}.`);
  }
  return value.trim();
}

export function resolveSupabaseUrl(): string | undefined {
  const candidates = [
    process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN_URL,
    process.env.SUPABASE_CUSTOM_DOMAIN_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ];
  return candidates.find((value) => !isMissingOrPlaceholder(value))?.trim();
}

export function resolveSupabaseAnonKey(): string | undefined {
  const candidates = [process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_ANON_KEY];
  return candidates.find((value) => !isMissingOrPlaceholder(value))?.trim();
}
