import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type CsvRecord = Record<string, string>;
type ParishSummary = {
  parish: string;
  sourceFile: string;
  totalRows: number;
  withParcelId: number;
  existingRows: number;
  missingRows: number;
  applyInserted: number;
  applyFailed: number;
};

type PropertyDbRow = {
  source_key: string;
};

type ImportRow = {
  parish: string;
  parcel_uid: string;
  owner_name: string | null;
  situs_address: string | null;
  legal_desc: string | null;
  acreage: number | null;
  source_key: string;
  source_file: string;
  ingested_at: string;
};

const DEFAULT_DATA_DIR = "parcel_data_updated";
const DEFAULT_REPORT_DIR = "output/parcel-backfill";
const DEFAULT_BATCH_SIZE = 200;

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(value, "true");
    } else {
      args.set(value, next);
      i += 1;
    }
  }

  const apply = args.get("--apply") === "true";
  const dataDir = args.get("--data-dir") ?? DEFAULT_DATA_DIR;
  const reportDir = args.get("--report-dir") ?? DEFAULT_REPORT_DIR;
  const batchSize = Math.max(25, Number(args.get("--batch-size") ?? DEFAULT_BATCH_SIZE));
  return { apply, dataDir, reportDir, batchSize };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[parcel-backfill] Missing required env ${name}.`);
  }
  return value;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toRecords(rows: string[][]): CsvRecord[] {
  if (rows.length === 0) return [];
  const header = rows[0];
  const out: CsvRecord[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const record: CsvRecord = {};
    for (let c = 0; c < header.length; c += 1) {
      record[header[c]] = (row[c] ?? "").trim();
    }
    out.push(record);
  }
  return out;
}

function slugToParishName(fileName: string): string {
  const slug = fileName.replace(/-parcels\.csv$/i, "");
  if (slug === "east-baton-rouge") return "East Baton Rouge";
  if (slug === "west-baton-rouge") return "West Baton Rouge";
  return slug
    .split("-")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeString(value: string | undefined): string | null {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumberOrNull(value: string | undefined): number | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildImportRow(record: CsvRecord, parish: string, sourceFile: string): ImportRow | null {
  const parcelId = normalizeString(record.parcelId);
  if (!parcelId) return null;

  return {
    parish,
    parcel_uid: parcelId,
    owner_name: normalizeString(record.owner),
    situs_address: normalizeString(record.physicalAddress ?? record.mailStreet),
    legal_desc: normalizeString(record.legalDesc),
    acreage: toNumberOrNull(record.parcelAcres),
    source_key: `parish_csv:${parish.toLowerCase().replace(/\s+/g, "_")}:${parcelId}`,
    source_file: sourceFile,
    ingested_at: new Date().toISOString(),
  };
}

async function fetchExistingSourceKeys(
  propertyDbUrl: string,
  propertyDbKey: string,
  sourceKeys: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < sourceKeys.length; i += 250) {
    const slice = sourceKeys.slice(i, i + 250);
    if (slice.length === 0) continue;
    const encoded = slice.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",");
    const url = `${propertyDbUrl}/rest/v1/parcels?select=source_key&source_key=in.(${encodeURIComponent(encoded)})`;
    const res = await fetch(url, {
      headers: {
        apikey: propertyDbKey,
        Authorization: `Bearer ${propertyDbKey}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[parcel-backfill] Failed existing-key query (${res.status}): ${body}`);
    }
    const rows = (await res.json()) as PropertyDbRow[];
    for (const row of rows) {
      if (typeof row?.source_key === "string" && row.source_key.length > 0) {
        existing.add(row.source_key);
      }
    }
  }
  return existing;
}

async function insertRows(
  propertyDbUrl: string,
  propertyDbKey: string,
  rows: ImportRow[],
  batchSize: number,
): Promise<{ inserted: number; failed: number }> {
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(
      `${propertyDbUrl}/rest/v1/parcels?on_conflict=source_key`,
      {
        method: "POST",
        headers: {
          apikey: propertyDbKey,
          Authorization: `Bearer ${propertyDbKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
    );
    if (res.ok) {
      inserted += batch.length;
      continue;
    }

    failed += batch.length;
    const body = await res.text();
    console.error(`[parcel-backfill] batch insert failed (${res.status}): ${body.slice(0, 400)}`);
  }

  return { inserted, failed };
}

async function main() {
  const { apply, dataDir, reportDir, batchSize } = parseArgs(process.argv.slice(2));
  const propertyDbUrl = requireEnv("LA_PROPERTY_DB_URL");
  const propertyDbKey = requireEnv("LA_PROPERTY_DB_KEY");

  const absoluteDataDir = path.resolve(process.cwd(), dataDir);
  const files = (await readdir(absoluteDataDir))
    .filter((name) => name.endsWith(".csv"))
    .sort();
  if (files.length === 0) {
    throw new Error(`[parcel-backfill] No CSV files found in ${absoluteDataDir}`);
  }

  const allSummaries: ParishSummary[] = [];
  let totalRows = 0;
  let totalWithParcelId = 0;
  let totalExisting = 0;
  let totalMissing = 0;
  let totalInserted = 0;
  let totalFailed = 0;

  for (const fileName of files) {
    const sourceFile = path.join(absoluteDataDir, fileName);
    const parish = slugToParishName(fileName);
    const raw = await readFile(sourceFile, "utf8");
    const csvRows = parseCsv(raw);
    const records = toRecords(csvRows);

    const candidates = records
      .map((row) => buildImportRow(row, parish, fileName))
      .filter((row): row is ImportRow => row !== null);
    const sourceKeys = candidates.map((row) => row.source_key);
    const existing = await fetchExistingSourceKeys(propertyDbUrl, propertyDbKey, sourceKeys);
    const missing = candidates.filter((row) => !existing.has(row.source_key));

    let applyInserted = 0;
    let applyFailed = 0;
    if (apply && missing.length > 0) {
      const result = await insertRows(propertyDbUrl, propertyDbKey, missing, batchSize);
      applyInserted = result.inserted;
      applyFailed = result.failed;
    }

    const summary: ParishSummary = {
      parish,
      sourceFile: fileName,
      totalRows: records.length,
      withParcelId: candidates.length,
      existingRows: existing.size,
      missingRows: missing.length,
      applyInserted,
      applyFailed,
    };
    allSummaries.push(summary);

    totalRows += records.length;
    totalWithParcelId += candidates.length;
    totalExisting += existing.size;
    totalMissing += missing.length;
    totalInserted += applyInserted;
    totalFailed += applyFailed;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    dataDir: absoluteDataDir,
    batchSize,
    totals: {
      totalRows,
      totalWithParcelId,
      totalExisting,
      totalMissing,
      totalInserted,
      totalFailed,
    },
    parishes: allSummaries,
  };

  await mkdir(path.resolve(process.cwd(), reportDir), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.resolve(process.cwd(), reportDir, `parcel-backfill-${stamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`[parcel-backfill] mode=${report.mode}`);
  console.log(`[parcel-backfill] report=${reportPath}`);
  for (const summary of allSummaries) {
    console.log(
      `[parcel-backfill] ${summary.parish}: total=${summary.totalRows} existing=${summary.existingRows} missing=${summary.missingRows} inserted=${summary.applyInserted} failed=${summary.applyFailed}`,
    );
  }

  if (apply && totalFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[parcel-backfill] fatal:", error);
  process.exit(1);
});
