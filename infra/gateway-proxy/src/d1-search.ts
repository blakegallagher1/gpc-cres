export async function searchParcelsD1(
  db: D1Database,
  params: { address?: string; limit?: number }
): Promise<{ data: unknown[]; count: number } | null> {
  const limit = Math.min(params.limit ?? 50, 200);

  if (!params.address) return null;

  // Simple LIKE search on address and owner
  const term = `%${params.address}%`;
  const result = await db
    .prepare(
      `SELECT raw_json, synced_at FROM parcels
       WHERE site_address LIKE ?1 OR owner_name LIKE ?1
       ORDER BY site_address
       LIMIT ?2`
    )
    .bind(term, limit)
    .all();

  if (!result.results?.length) return null;

  return {
    data: result.results.map((r: Record<string, unknown>) => JSON.parse(r.raw_json as string)),
    count: result.results.length,
  };
}

export async function getParcelD1(
  db: D1Database,
  parcelId: string
): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT raw_json FROM parcels WHERE parcel_id = ?")
    .bind(parcelId)
    .first<{ raw_json: string }>();

  return row ? JSON.parse(row.raw_json) : null;
}

export async function getScreeningD1(
  db: D1Database,
  parcelId: string,
  screenType: string
): Promise<unknown | null> {
  const row = await db
    .prepare("SELECT result_json FROM screening WHERE parcel_id = ? AND screen_type = ?")
    .bind(parcelId, screenType)
    .first<{ result_json: string }>();

  return row ? JSON.parse(row.result_json) : null;
}
