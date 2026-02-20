/**
 * Copy epa_facilities, fema_flood, soils, wetlands from GPC-MOAT to gpc-dashboard.
 *
 * Usage:
 *   pnpm copy-gpc-moat-tables
 *   pnpm copy-gpc-moat-tables --dry
 *
 * Requires:
 *   - GPC_MOAT_DATABASE_URL: Postgres connection string for GPC-MOAT (jueyosscalcljgdorrpy)
 *   - DATABASE_URL or DIRECT_DATABASE_URL: Target gpc-dashboard (yjddspdbxuseowxndrak)
 *
 * Get GPC_MOAT_DATABASE_URL from Supabase Dashboard → GPC-MOAT project → Settings → Database → Connection string (URI)
 */

import { Client } from "pg";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const TABLES = ["epa_facilities", "fema_flood", "soils", "wetlands"] as const;
const BATCH_SIZE = 1000;

async function main() {
  const dry = process.argv.includes("--dry");
  const sourceUrl = process.env.GPC_MOAT_DATABASE_URL?.trim();
  const targetUrl =
    process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!sourceUrl) {
    throw new Error(
      "GPC_MOAT_DATABASE_URL required. Get from Supabase Dashboard → GPC-MOAT → Settings → Database → Connection string (URI)",
    );
  }
  if (!targetUrl) {
    throw new Error("DATABASE_URL or DIRECT_DATABASE_URL required");
  }

  if (dry) {
    console.log("[copy-gpc-moat] Dry run — would copy", TABLES.join(", "));
    return;
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  await source.connect();
  await target.connect();

  try {
    for (const table of TABLES) {
      console.log(`[copy-gpc-moat] Copying ${table}...`);
      const colsRes = await source.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      );
      const cols = colsRes.rows.map((r) => r.column_name);
      if (cols.length === 0) {
        throw new Error(`Table ${table} not found in source`);
      }
      const colList = cols.map((c) => `"${c}"`).join(", ");
      let offset = 0;
      let total = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await source.query(
          `SELECT ${colList} FROM ${table} ORDER BY ctid LIMIT $1 OFFSET $2`,
          [BATCH_SIZE, offset],
        );
        if (res.rows.length === 0) break;
        const valueRows = res.rows.map((row) => cols.map((c) => row[c]));
        const nCols = cols.length;
        const allPlaceholders = valueRows
          .map(
            (_, i) =>
              `(${cols.map((_, j) => `$${i * nCols + j + 1}`).join(", ")})`,
          )
          .join(", ");
        const allVals = valueRows.flat();
        await target.query(
          `INSERT INTO ${table} (${colList}) VALUES ${allPlaceholders}`,
          allVals,
        );
        total += res.rows.length;
        offset += BATCH_SIZE;
        process.stdout.write(`\r  ${total} rows...`);
        if (res.rows.length < BATCH_SIZE) break;
      }
      console.log(`\r  ${table}: ${total} rows`);
    }
    console.log("[copy-gpc-moat] Done.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
