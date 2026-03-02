async function main() {
  const url = process.env.LOCAL_API_URL?.trim();
  if (!url) {
    throw new Error("[property-db-check] Missing LOCAL_API_URL.");
  }
  const key = process.env.LOCAL_API_KEY?.trim();
  if (!key) {
    throw new Error("[property-db-check] Missing LOCAL_API_KEY.");
  }

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "invalid-url";
    }
  })();

  const res = await fetch(`${url}/property-db/rpc/api_search_parcels`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
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
