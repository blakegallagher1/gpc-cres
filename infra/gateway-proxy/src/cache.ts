import { DataSource } from "./types";

interface CacheEntry {
  value: string;
  updated_at: number;
  ttl_seconds: number;
}

interface CacheResult {
  data: unknown;
  source: DataSource;
  staleness_seconds: number;
}

export async function cacheGet(db: D1Database, key: string): Promise<CacheResult | null> {
  const row = await db
    .prepare("SELECT value, updated_at, ttl_seconds FROM cache WHERE key = ?")
    .bind(key)
    .first<CacheEntry>();

  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  const age = now - row.updated_at;
  const isStale = age > row.ttl_seconds;

  return {
    data: JSON.parse(row.value),
    source: isStale ? "d1-stale" : "d1-cache",
    staleness_seconds: age,
  };
}

export async function cacheSet(
  db: D1Database,
  key: string,
  value: unknown,
  ttlSeconds = 900
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT OR REPLACE INTO cache (key, value, updated_at, ttl_seconds) VALUES (?, ?, ?, ?)"
    )
    .bind(key, JSON.stringify(value), now, ttlSeconds)
    .run();
}

export function buildCacheKey(pathname: string, params?: URLSearchParams): string {
  const base = pathname.replace(/\//g, ":");
  if (!params || params.toString() === "") return base;
  const sorted = new URLSearchParams([...params.entries()].sort());
  return `${base}:${sorted.toString()}`;
}
