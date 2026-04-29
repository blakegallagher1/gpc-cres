import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type CliOptions = {
  apply: boolean;
  batchSize: number;
  maxRows: number | null;
  assessmentNumbers: string[];
};

type SmartCamaSearchRow = {
  Id?: number;
  AssessmentNumber?: string;
};

type SmartCamaSearchResponse = {
  Data?: {
    data?: SmartCamaSearchRow[];
    recordsFiltered?: number;
  };
};

type SmartCamaAssessment = {
  AssessmentNumber?: string;
  TotalTax?: number | string | null;
  Sales?: SmartCamaSale[];
};

type SmartCamaSale = {
  SaleDate?: string | null;
  SaleAmount?: number | string | null;
  CreatedDateMillis?: number | null;
};

type SmartCamaMoneyRow = {
  parcelId: string;
  saleDate: string | null;
  salePrice: number | null;
  taxAmount: number | null;
  rawPayload: string;
};

const BASE_URL = "https://eastbatonrouge.smartcama.com";
const PARISH = "East Baton Rouge";
const SOURCE_NAME = "EBR Assessor SmartCAMA";
const SOURCE_URI = `${BASE_URL}/Assessments/Search`;
const SCHEMA_SQL_PATH = "infra/sql/zoning/007-assessor-enrichment-surface.sql";
const DEFAULT_BATCH_SIZE = 25;

function parseCli(args: string[]): CliOptions {
  const getValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const maxRowsValue = getValue("--max-rows");
  const assessmentNumbersValue = getValue("--assessment-numbers");
  return {
    apply: args.includes("--apply"),
    batchSize: Math.max(1, Number(getValue("--batch-size") ?? DEFAULT_BATCH_SIZE)),
    maxRows: maxRowsValue ? Math.max(1, Number(maxRowsValue)) : null,
    assessmentNumbers: assessmentNumbersValue
      ? assessmentNumbersValue.split(",").map((value) => value.trim()).filter(Boolean)
      : [],
  };
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function runRemotePsql(input: string): string {
  const localPsqlCommand = process.env.PROPERTY_DB_PSQL_CMD;
  if (localPsqlCommand && localPsqlCommand.trim().length > 0) {
    return execFileSync("sh", ["-c", localPsqlCommand], {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  const host = optionalEnv("PROPERTY_DB_SSH_HOST", "bg");
  const container = optionalEnv("PROPERTY_DB_CONTAINER", "entitlement-os-postgres");
  const database = optionalEnv("PROPERTY_DB_NAME", "entitlement_os");
  const user = optionalEnv("PROPERTY_DB_USER", "postgres");
  return execFileSync(
    "ssh",
    [host, "docker", "exec", "-i", container, "psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
    { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function parseMoney(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function latestSale(sales: SmartCamaSale[] | undefined): SmartCamaSale | null {
  if (!sales || sales.length === 0) return null;
  return [...sales].sort((left, right) => {
    const leftDate = Date.parse(left.SaleDate ?? "") || (left.CreatedDateMillis ?? 0);
    const rightDate = Date.parse(right.SaleDate ?? "") || (right.CreatedDateMillis ?? 0);
    return rightDate - leftDate;
  })[0] ?? null;
}

function buildTargetQuery(limit: number): string {
  return `
SELECT parcel_id
FROM property.parcel_assessor_enrichment
WHERE parish = '${PARISH.replace(/'/g, "''")}'
  AND (sale_price IS NULL OR tax_amount IS NULL)
ORDER BY parcel_id
LIMIT ${limit};
`;
}

function readTargetAssessmentNumbers(options: CliOptions): string[] {
  if (options.assessmentNumbers.length > 0) return options.assessmentNumbers;
  const limit = options.maxRows ?? options.batchSize;
  const output = runRemotePsql(buildTargetQuery(limit));
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function buildUploadSql(rows: SmartCamaMoneyRow[]): string {
  const header = ["parcel_id", "sale_date", "sale_price", "tax_amount", "raw_payload"].join(",");
  const csvRows = rows.map((row) =>
    [row.parcelId, row.saleDate, row.salePrice, row.taxAmount, row.rawPayload].map(csvCell).join(","),
  );

  return `
BEGIN;
CREATE TEMP TABLE smartcama_money_upload (
  parcel_id text,
  sale_date date,
  sale_price numeric,
  tax_amount numeric,
  raw_payload jsonb
) ON COMMIT DROP;
\\copy smartcama_money_upload FROM STDIN WITH (FORMAT csv, HEADER true)
${header}
${csvRows.join("\n")}
\\.
INSERT INTO property.parcel_assessor_enrichment (
  parish,
  parcel_id,
  source_name,
  source_uri,
  sale_date,
  sale_price,
  tax_amount,
  raw_payload,
  imported_at
)
SELECT
  '${PARISH.replace(/'/g, "''")}',
  parcel_id,
  '${SOURCE_NAME.replace(/'/g, "''")}',
  '${SOURCE_URI.replace(/'/g, "''")}',
  sale_date,
  sale_price,
  tax_amount,
  raw_payload,
  now()
FROM smartcama_money_upload
ON CONFLICT (parish, parcel_id) DO UPDATE
SET source_name = CASE
      WHEN EXCLUDED.sale_price IS NOT NULL OR EXCLUDED.tax_amount IS NOT NULL THEN EXCLUDED.source_name
      ELSE property.parcel_assessor_enrichment.source_name
    END,
    source_uri = CASE
      WHEN EXCLUDED.sale_price IS NOT NULL OR EXCLUDED.tax_amount IS NOT NULL THEN EXCLUDED.source_uri
      ELSE property.parcel_assessor_enrichment.source_uri
    END,
    sale_date = COALESCE(EXCLUDED.sale_date, property.parcel_assessor_enrichment.sale_date),
    sale_price = COALESCE(EXCLUDED.sale_price, property.parcel_assessor_enrichment.sale_price),
    tax_amount = COALESCE(EXCLUDED.tax_amount, property.parcel_assessor_enrichment.tax_amount),
    raw_payload = property.parcel_assessor_enrichment.raw_payload || EXCLUDED.raw_payload,
    imported_at = now();
COMMIT;
SELECT COUNT(*) FROM smartcama_money_upload;
`;
}

class SmartCamaClient {
  private cookies = new Map<string, string>();
  private antiForgeryToken: string | null = null;

  constructor() {
    const cookieHeader = process.env.SMARTCAMA_COOKIE;
    if (!cookieHeader) return;
    for (const cookie of cookieHeader.split(";")) {
      const [key, ...valueParts] = cookie.trim().split("=");
      const value = valueParts.join("=");
      if (key && value) this.cookies.set(key, value);
    }
  }

  async initialize(): Promise<void> {
    const response = await this.request("/Assessments/Search", { method: "GET" });
    const body = await response.text();
    this.antiForgeryToken = body.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1] ?? null;
    if (!this.antiForgeryToken) {
      throw new Error("SmartCAMA anti-forgery token was not found on the search page.");
    }
  }

  async fetchAssessment(assessmentNumber: string): Promise<SmartCamaAssessment | null> {
    const search = await this.searchAssessment(assessmentNumber);
    const id = search.Data?.data?.[0]?.Id;
    if (!id) return null;
    const params = new URLSearchParams({ Id: String(id) });
    const response = await this.request(`/Assessments/FetchAssessment?${params.toString()}`, {
      method: "POST",
      body: this.withToken(new URLSearchParams()),
    });
    return (await response.json()) as SmartCamaAssessment;
  }

  private async searchAssessment(assessmentNumber: string): Promise<SmartCamaSearchResponse> {
    const body = this.withToken(this.buildSearchBody(assessmentNumber));
    const response = await this.request("/Assessments/SearchAjax", { method: "POST", body });
    return (await response.json()) as SmartCamaSearchResponse;
  }

  private buildSearchBody(assessmentNumber: string): URLSearchParams {
    const body = new URLSearchParams();
    body.set("AssessmentNumber", assessmentNumber);
    body.set("ExactSearch", "true");
    body.set("PerformSearch", "true");
    body.set("InitialSearch", "true");
    body.set("DTableRequest[draw]", "1");
    body.set("DTableRequest[start]", "0");
    body.set("DTableRequest[length]", "10");
    body.set("DTableRequest[search][value]", "");
    body.set("DTableRequest[search][regex]", "false");
    const columns = [
      ["Select", "0", "false", "false"],
      ["Action", "1", "false", "false"],
      ["Assessment.AssessmentNumber", "AssessmentNumber", "true", "true"],
      ["Owner.LastName1OrBusiness", "LastOrBusiness", "true", "true"],
      ["Owner.FirstName1", "First", "true", "true"],
      ["Assessment.FullPhysicalAddress", "PhysicalAddress", "true", "true"],
    ];
    columns.forEach(([name, data, searchable, orderable], index) => {
      body.set(`DTableRequest[columns][${index}][data]`, data);
      body.set(`DTableRequest[columns][${index}][name]`, name);
      body.set(`DTableRequest[columns][${index}][searchable]`, searchable);
      body.set(`DTableRequest[columns][${index}][orderable]`, orderable);
      body.set(`DTableRequest[columns][${index}][search][value]`, "");
      body.set(`DTableRequest[columns][${index}][search][regex]`, "false");
    });
    body.set("DTableRequest[order][0][column]", "2");
    body.set("DTableRequest[order][0][dir]", "asc");
    return body;
  }

  private withToken(body: URLSearchParams): URLSearchParams {
    if (!this.antiForgeryToken) throw new Error("SmartCAMA client has not been initialized.");
    body.set("__RequestVerificationToken", this.antiForgeryToken);
    return body;
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: URLSearchParams }): Promise<Response> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      redirect: "manual",
      headers: {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "cookie": this.cookieHeader(),
        "referer": `${BASE_URL}/Assessments/Search`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
      body: init.body,
    });
    this.storeCookies(response);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      throw new Error(`SmartCAMA redirected to ${location}; verification or session renewal is required.`);
    }
    if (!response.ok) {
      throw new Error(`SmartCAMA request failed ${response.status} ${response.statusText} for ${path}`);
    }
    return response;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  private storeCookies(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const cookies = headers.getSetCookie?.() ?? [];
    const legacy = response.headers.get("set-cookie");
    if (legacy) cookies.push(...legacy.split(/,(?=[^;,]+=)/));
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const [key, value] = pair.split("=");
      if (key && value) this.cookies.set(key.trim(), value.trim());
    }
  }
}

function toMoneyRow(parcelId: string, assessment: SmartCamaAssessment): SmartCamaMoneyRow {
  const sale = latestSale(assessment.Sales);
  return {
    parcelId,
    saleDate: parseDate(sale?.SaleDate),
    salePrice: parseMoney(sale?.SaleAmount),
    taxAmount: parseMoney(assessment.TotalTax),
    rawPayload: JSON.stringify({ smartcama: assessment }),
  };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  if (!options.apply) {
    console.log("[ebr-smartcama-enrichment] Dry run. Re-run with --apply to query SmartCAMA and upsert sale/tax fields.");
    return;
  }

  runRemotePsql(readFileSync(SCHEMA_SQL_PATH, "utf8"));
  const assessmentNumbers = readTargetAssessmentNumbers(options);
  const client = new SmartCamaClient();
  await client.initialize();

  let enriched = 0;
  let missing = 0;
  const rows: SmartCamaMoneyRow[] = [];
  for (const assessmentNumber of assessmentNumbers) {
    const assessment = await client.fetchAssessment(assessmentNumber);
    if (!assessment) {
      missing += 1;
      continue;
    }
    rows.push(toMoneyRow(assessmentNumber, assessment));
    if (rows.length >= options.batchSize) {
      runRemotePsql(buildUploadSql(rows.splice(0)));
      enriched += options.batchSize;
      console.log(`[ebr-smartcama-enrichment] upserted ${enriched}/${assessmentNumbers.length}`);
    }
  }

  if (rows.length > 0) {
    runRemotePsql(buildUploadSql(rows));
    enriched += rows.length;
  }

  console.log(JSON.stringify({ ok: true, parish: PARISH, sourceName: SOURCE_NAME, targetRows: assessmentNumbers.length, enriched, missing }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
