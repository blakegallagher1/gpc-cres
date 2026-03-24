import { Env } from "./types";

interface SyncBatch {
  parcels?: Array<{
    parcel_id: string;
    owner_name?: string;
    site_address?: string;
    zoning_type?: string;
    acres?: number;
    legal_description?: string;
    assessed_value?: number;
    geometry?: string;
    raw_json: string;
  }>;
  screening?: Array<{
    parcel_id: string;
    screen_type: string;
    result_json: string;
  }>;
}

export { SyncBatch };

export function validateSyncToken(request: Request, env: Env): boolean {
  const token = request.headers.get("X-Sync-Token");
  return !!env.SYNC_TOKEN && token === env.SYNC_TOKEN;
}

export async function handleSyncBatch(db: D1Database, batch: SyncBatch): Promise<{ parcels: number; screening: number }> {
  const now = Math.floor(Date.now() / 1000);
  let parcelCount = 0;
  let screenCount = 0;

  if (batch.parcels?.length) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO parcels
       (parcel_id, owner_name, site_address, zoning_type, acres, legal_description, assessed_value, geometry, raw_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // D1 batch limit is 100 statements per batch
    const chunks = chunkArray(batch.parcels, 100);
    for (const chunk of chunks) {
      await db.batch(
        chunk.map((p) =>
          stmt.bind(
            p.parcel_id,
            p.owner_name ?? null,
            p.site_address ?? null,
            p.zoning_type ?? null,
            p.acres ?? null,
            p.legal_description ?? null,
            p.assessed_value ?? null,
            p.geometry ?? null,
            p.raw_json,
            now
          )
        )
      );
      parcelCount += chunk.length;
    }
  }

  if (batch.screening?.length) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO screening (parcel_id, screen_type, result_json, synced_at)
       VALUES (?, ?, ?, ?)`
    );
    const chunks = chunkArray(batch.screening, 100);
    for (const chunk of chunks) {
      await db.batch(
        chunk.map((s) => stmt.bind(s.parcel_id, s.screen_type, s.result_json, now))
      );
      screenCount += chunk.length;
    }
  }

  // Update sync status
  await db
    .prepare("UPDATE sync_status SET last_sync_at = ?, rows_synced = rows_synced + ?, last_error = NULL, updated_at = ? WHERE id = 'main'")
    .bind(now, parcelCount + screenCount, now)
    .run();

  return { parcels: parcelCount, screening: screenCount };
}

export async function getSyncStatus(db: D1Database) {
  const status = await db.prepare("SELECT * FROM sync_status WHERE id = 'main'").first();
  const parcelCount = await db.prepare("SELECT COUNT(*) as count FROM parcels").first<{ count: number }>();
  const screenCount = await db.prepare("SELECT COUNT(*) as count FROM screening").first<{ count: number }>();
  return {
    ...status,
    total_parcels: parcelCount?.count ?? 0,
    total_screening: screenCount?.count ?? 0,
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
