/**
 * Bulk load EBR parcel GeoJSON into ebr_parcels table.
 *
 * Usage:
 *   pnpm ebr:load [--input path/to/ebr-parcels.geojson] [--batch-size 500] [--dry]
 *
 * Requires: DATABASE_URL in .env (root)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_INPUT =
  "/Users/gallagherpropertycompany/louisiana-property-scrape/output/ebr-parcels.geojson";
const DEFAULT_BATCH_SIZE = 500;

type GeoJSONFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: {
    parcel_id?: string;
    address?: string;
    area_sqft?: number;
    owner?: string;
    assessed_value?: number;
  };
};

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

function parseArgs(argv: string[]): {
  input: string;
  batchSize: number;
  dry: boolean;
} {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const val = argv[i];
    if (!val.startsWith("--")) continue;
    if (val === "--dry") {
      args.set("--dry", true);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(val, next);
      i += 1;
    }
  }
  return {
    input: (args.get("--input") as string) ?? DEFAULT_INPUT,
    batchSize: Math.max(100, Number(args.get("--batch-size") ?? DEFAULT_BATCH_SIZE)),
    dry: args.get("--dry") === true,
  };
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`[load_ebr_parcels] Missing ${name}`);
  return v;
}

function toRow(f: GeoJSONFeature): {
  parcel_id: string;
  address: string | null;
  area_sqft: number | null;
  owner: string | null;
  assessed_value: number | null;
  geom: string;
} {
  const p = f.properties ?? {};
  const parcelId = String(p.parcel_id ?? "").trim();
  if (!parcelId) throw new Error("Feature missing parcel_id");
  return {
    parcel_id: parcelId,
    address: p.address ? String(p.address).trim() || null : null,
    area_sqft: typeof p.area_sqft === "number" && Number.isFinite(p.area_sqft) ? p.area_sqft : null,
    owner: p.owner ? String(p.owner).trim() || null : null,
    assessed_value:
      typeof p.assessed_value === "number" && Number.isFinite(p.assessed_value)
        ? p.assessed_value
        : null,
    geom: JSON.stringify(f.geometry),
  };
}

async function main(): Promise<void> {
  const { input, batchSize, dry } = parseArgs(process.argv.slice(2));

  const raw = await readFile(input, "utf-8");
  const data = JSON.parse(raw) as GeoJSONFeatureCollection;
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("Invalid GeoJSON: expected FeatureCollection");
  }

  const seen = new Set<string>();
  const rows: ReturnType<typeof toRow>[] = [];
  let skipped = 0;
  let dupes = 0;
  for (const f of data.features) {
    try {
      const row = toRow(f);
      if (seen.has(row.parcel_id)) {
        dupes += 1;
        continue;
      }
      seen.add(row.parcel_id);
      rows.push(row);
    } catch {
      skipped += 1;
    }
  }

  console.log(`[load_ebr_parcels] Parsed ${rows.length} rows, skipped ${skipped}, duplicates ${dupes}`);

  if (dry) {
    console.log("[load_ebr_parcels] Dry run; exiting");
    return;
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      const base = j * 6;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ST_GeomFromGeoJSON($${base + 6}::jsonb))`,
      );
      values.push(
        r.parcel_id,
        r.address,
        r.area_sqft,
        r.owner,
        r.assessed_value,
        r.geom,
      );
    }

    const sql = `INSERT INTO ebr_parcels (parcel_id, address, area_sqft, owner, assessed_value, geom)
VALUES ${placeholders.join(", ")}
ON CONFLICT (parcel_id) DO UPDATE SET
  address = EXCLUDED.address,
  area_sqft = EXCLUDED.area_sqft,
  owner = EXCLUDED.owner,
  assessed_value = EXCLUDED.assessed_value,
  geom = EXCLUDED.geom`;

    await client.query(sql, values);
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === rows.length) {
      console.log(`[load_ebr_parcels] Inserted ${inserted}/${rows.length}`);
    }
  }

  await client.end();
  console.log(`[load_ebr_parcels] Done. Total inserted/updated: ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
