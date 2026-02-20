function isPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "placeholder" ||
    normalized === "***" ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized.includes("placeholder")
  );
}

function requireHealthyEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (isPlaceholder(value)) {
    throw new Error(`[property-db-check] ${name} is missing or placeholder.`);
  }
  return value!;
}

async function main() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  if (isPlaceholder(url)) {
    throw new Error(
      "[property-db-check] SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing or placeholder.",
    );
  }
  const key = requireHealthyEnv("SUPABASE_SERVICE_ROLE_KEY");

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "invalid-url";
    }
  })();

  const res = await fetch(`${url}/rest/v1/rpc/api_search_parcels`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      search_text: "*",
      limit_rows: 1,
    }),
  });

  let count = 0;
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) count = parsed.length;
  } catch {
    // ignore parse errors, health still based on status.
  }

  console.log(`[property-db-check] host=${host} status=${res.status} sample_rows=${count}`);
  if (!res.ok) {
    console.error(text.slice(0, 400));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[property-db-check] fatal:", error);
  process.exit(1);
});
