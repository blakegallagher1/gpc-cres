interface Env {
  DB: D1Database;
}

interface SyncStatusRow {
  id: string;
  last_sync_at: string;
  status: string;
  rows_synced: number;
}

interface CountRow {
  count: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const statusRow = await env.DB.prepare(
      "SELECT * FROM sync_status WHERE id = 'main'"
    ).first<SyncStatusRow>();

    const parcelCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM parcels"
    ).first<CountRow>();

    const screenCountRow = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM screening"
    ).first<CountRow>();

    const syncStatus = statusRow || {
      id: "main",
      last_sync_at: null,
      status: "unknown",
      rows_synced: 0,
    };

    return Response.json({
      ...syncStatus,
      total_parcels: parcelCountRow?.count ?? 0,
      total_screening: screenCountRow?.count ?? 0,
    });
  } catch (err) {
    return Response.json(
      {
        id: "main",
        last_sync_at: null,
        status: "error",
        error: String(err),
      },
      { status: 500 }
    );
  }
};
