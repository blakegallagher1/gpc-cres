import "dotenv/config";

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CliOptions = {
  apply: boolean;
  dryRun: boolean;
  resume: boolean;
  batchSize: number;
  maxRows: number | null;
  concurrency: number;
  assessmentNumbers: string[];
  profileDir: string;
  verificationTimeoutSeconds: number;
  forceVerify: boolean;
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

type Checkpoint = {
  processedIds: string[];
  notFoundIds: string[];
  updatedAt: string;
};

type SmartCamaRequest = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: URLSearchParams;
};

type SmartCamaRequestHandler = (request: SmartCamaRequest) => Promise<Response>;
type SmartCamaAssessmentHandler = (assessmentNumber: string) => Promise<SmartCamaAssessment | null>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://eastbatonrouge.smartcama.com";
const PARISH = "East Baton Rouge";
const SOURCE_NAME = "EBR Assessor SmartCAMA";
const SOURCE_URI = `${BASE_URL}/Assessments/Search`;
const SCHEMA_SQL_PATH = "infra/sql/zoning/007-assessor-enrichment-surface.sql";
const CHECKPOINT_PATH = "output/smartcama-checkpoint.json";
const DEFAULT_PROFILE_DIR = "output/smartcama-browser-profile";
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_VERIFICATION_TIMEOUT_SECONDS = 300;
const SESSION_CHECK_ASSESSMENT = "1267000";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseCli(args: string[]): CliOptions {
  const getValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const maxRowsValue = getValue("--max-rows");
  const assessmentNumbersValue = getValue("--assessment-numbers");
  const verificationTimeoutValue = getValue("--verification-timeout-seconds");
  return {
    apply: args.includes("--apply"),
    dryRun: args.includes("--dry-run"),
    resume: args.includes("--resume"),
    batchSize: Math.max(1, Number(getValue("--batch-size") ?? DEFAULT_BATCH_SIZE)),
    maxRows: maxRowsValue ? Math.max(1, Number(maxRowsValue)) : null,
    concurrency: Math.max(1, Number(getValue("--concurrency") ?? DEFAULT_CONCURRENCY)),
    assessmentNumbers: assessmentNumbersValue
      ? assessmentNumbersValue.split(",").map((v) => v.trim()).filter(Boolean)
      : [],
    profileDir: getValue("--profile-dir") ?? DEFAULT_PROFILE_DIR,
    verificationTimeoutSeconds: verificationTimeoutValue
      ? Math.max(30, Number(verificationTimeoutValue))
      : DEFAULT_VERIFICATION_TIMEOUT_SECONDS,
    forceVerify: args.includes("--force-verify"),
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

export function runRemotePsql(input: string): string {
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

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const raw = String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function parseMoney(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function latestSale(sales: SmartCamaSale[] | undefined): SmartCamaSale | null {
  if (!sales || sales.length === 0) return null;
  return [...sales].sort((left, right) => {
    const leftDate = Date.parse(left.SaleDate ?? "") || (left.CreatedDateMillis ?? 0);
    const rightDate = Date.parse(right.SaleDate ?? "") || (right.CreatedDateMillis ?? 0);
    return rightDate - leftDate;
  })[0] ?? null;
}

export function toMoneyRow(parcelId: string, assessment: SmartCamaAssessment): SmartCamaMoneyRow {
  const sale = latestSale(assessment.Sales);
  return {
    parcelId,
    saleDate: parseDate(sale?.SaleDate),
    salePrice: parseMoney(sale?.SaleAmount),
    taxAmount: parseMoney(assessment.TotalTax),
    rawPayload: JSON.stringify({ smartcama: assessment }),
  };
}

function parsePageMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned.toUpperCase() === "N/A") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function smartCamaPageToAssessment(assessmentNumber: string, bodyText: string): SmartCamaAssessment | null {
  if (bodyText.includes("NO RESULTS FOUND")) return null;
  if (bodyText.includes("Verification") && !bodyText.includes("Assessment 1 of")) {
    throw new Error("SmartCAMA verification or session renewal is required.");
  }
  if (!bodyText.includes("Assessment 1 of") && !bodyText.includes("Total Tax:")) return null;

  const taxMatch = bodyText.match(/Total Tax:\s*\n\s*(?:\$)?([0-9,]+(?:\.\d{2})?|N\/A)/i);
  const taxAmount = taxMatch ? parsePageMoney(taxMatch[1]) : null;
  const sales: SmartCamaSale[] = [];
  const start = bodyText.indexOf("Register No.\tTransfer Date\tTransfer Type\tTransfer Amount\tVendor\tVendee");
  if (start >= 0) {
    const end = bodyText.indexOf("Notes", start);
    const block = bodyText.slice(start, end > start ? end : start + 12000);
    for (const line of block.split("\n").map((value) => value.trim()).filter(Boolean)) {
      const parts = line.split("\t").map((value) => value.trim());
      if (parts.length < 4) continue;
      const date = parts[1];
      const amount = parsePageMoney(parts[3]);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || amount === null) continue;
      sales.push({
        SaleDate: `${date.slice(6, 10)}-${date.slice(0, 2)}-${date.slice(3, 5)}`,
        SaleAmount: amount,
      });
    }
  }

  return {
    AssessmentNumber: assessmentNumber,
    TotalTax: taxAmount,
    Sales: sales,
  };
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

export function buildTargetQuery(limit: number): string {
  return `
SELECT parcel_id
FROM property.parcel_assessor_enrichment
WHERE parish = '${PARISH.replace(/'/g, "''")}'
  AND (sale_price IS NULL OR tax_amount IS NULL)
  AND parcel_id ~ '^[0-9]+$'
ORDER BY parcel_id::bigint
LIMIT ${limit};
`;
}

export function buildUploadSql(rows: SmartCamaMoneyRow[]): string {
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
SELECT COUNT(*) FROM smartcama_money_upload;
COMMIT;
`;
}

// ---------------------------------------------------------------------------
// Checkpoint
// ---------------------------------------------------------------------------

export function loadCheckpoint(): Checkpoint {
  if (!existsSync(CHECKPOINT_PATH)) {
    return { processedIds: [], notFoundIds: [], updatedAt: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8")) as Checkpoint;
}

export function saveCheckpoint(checkpoint: Checkpoint): void {
  checkpoint.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// SmartCAMA HTTP client
// ---------------------------------------------------------------------------

export class SmartCamaClient {
  private cookies = new Map<string, string>();
  private antiForgeryToken: string | null = null;
  private requestHandler: SmartCamaRequestHandler | null = null;
  private assessmentHandler: SmartCamaAssessmentHandler | null = null;

  setCookies(cookiePairs: Array<{ name: string; value: string }>): void {
    for (const { name, value } of cookiePairs) {
      this.cookies.set(name, value);
    }
  }

  setAntiForgeryToken(token: string): void {
    this.antiForgeryToken = token;
  }

  setRequestHandler(handler: SmartCamaRequestHandler): void {
    this.requestHandler = handler;
  }

  setAssessmentHandler(handler: SmartCamaAssessmentHandler): void {
    this.assessmentHandler = handler;
  }

  async fetchAssessment(assessmentNumber: string): Promise<SmartCamaAssessment | null> {
    if (this.assessmentHandler) return this.assessmentHandler(assessmentNumber);
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
    const headers = {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "cookie": this.cookieHeader(),
      "referer": `${BASE_URL}/Assessments/Search`,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
    };
    const url = `${BASE_URL}${path}`;
    const response = this.requestHandler
      ? await this.requestHandler({ url, method: init.method, headers, body: init.body })
      : await fetch(url, {
          method: init.method,
          redirect: "manual",
          headers,
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

// ---------------------------------------------------------------------------
// Playwright session bootstrap
// ---------------------------------------------------------------------------

async function bodyText(page: import("playwright").Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
}

async function isVerifiedAssessmentPage(page: import("playwright").Page): Promise<boolean> {
  const text = await bodyText(page);
  return text.includes("Assessment 1 of") && !text.includes("Verification");
}

async function waitForVerifiedAssessmentPage(
  page: import("playwright").Page,
  sessionCheckUrl: string,
  timeoutSeconds: number,
): Promise<void> {
  const expiresAt = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < expiresAt) {
    if (await isVerifiedAssessmentPage(page)) return;
    const text = await bodyText(page);
    if (!text.includes("Verification")) {
      await page.goto(sessionCheckUrl, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => undefined);
      if (await isVerifiedAssessmentPage(page)) return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`SmartCAMA verification was not cleared within ${timeoutSeconds} seconds.`);
}

async function bootstrapSession(
  client: SmartCamaClient,
  options: Pick<CliOptions, "forceVerify" | "profileDir" | "verificationTimeoutSeconds">,
): Promise<() => Promise<void>> {
  const { chromium } = await import("playwright");
  const profileDir = resolve(options.profileDir);
  mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, { headless: false });
  const page = context.pages()[0] ?? await context.newPage();
  const sessionCheckUrl = `${BASE_URL}/Assessments/Search?AssessmentNumber=${SESSION_CHECK_ASSESSMENT}&ExactSearch=True&PerformSearch=True`;

  console.log(`[smartcama-pw] Opening SmartCAMA with persistent profile: ${profileDir}`);
  await page.goto(sessionCheckUrl, { waitUntil: "networkidle" });

  if (options.forceVerify || !(await isVerifiedAssessmentPage(page))) {
    console.log("[smartcama-pw] SmartCAMA verification is required or the saved profile expired.");
    console.log("[smartcama-pw] Clear verification in the visible Chromium window; the runner will continue automatically.");
    await waitForVerifiedAssessmentPage(page, sessionCheckUrl, options.verificationTimeoutSeconds);
  } else {
    console.log("[smartcama-pw] Reusing verified SmartCAMA browser profile.");
  }

  const token = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[name="__RequestVerificationToken"]');
    return input?.value ?? null;
  });

  if (!token) {
    await context.close();
    throw new Error("Anti-forgery token not found after verification. Is the search page loaded?");
  }

  const cookies = await context.cookies();
  client.setCookies(cookies.map((c) => ({ name: c.name, value: c.value })));
  client.setAntiForgeryToken(token);
  let pageQueue = Promise.resolve();
  client.setAssessmentHandler((assessmentNumber) => {
    const scrape = pageQueue.then(async () => {
      const url = `${BASE_URL}/Assessments/Search?AssessmentNumber=${encodeURIComponent(assessmentNumber)}&ExactSearch=True&PerformSearch=True`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      let body = await page.locator("body").innerText();
      const transferMatch = body.match(/Transfers \((\d+|\*)\)/);
      if (transferMatch) {
        await page.getByText(transferMatch[0]).click().catch(() => undefined);
        await page.waitForTimeout(500);
        body = await page.locator("body").innerText();
      }
      return smartCamaPageToAssessment(assessmentNumber, body);
    });
    pageQueue = scrape.then(() => undefined, () => undefined);
    return scrape;
  });
  client.setRequestHandler(async (request) => {
    const pageResponse = await page.evaluate(
      async ({ url, method, headers, body }) => {
        const allowedHeaders = Object.fromEntries(
          Object.entries(headers).filter(([name]) => !["cookie", "referer", "user-agent"].includes(name)),
        );
        const response = await fetch(url, {
          method,
          headers: allowedHeaders,
          body,
          redirect: "manual",
        });
        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        };
      },
      {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body?.toString(),
      },
    );
    return new Response(pageResponse.body, {
      status: pageResponse.status,
      statusText: pageResponse.statusText,
      headers: pageResponse.headers,
    });
  });

  console.log(`[smartcama-pw] Session captured (${cookies.length} cookies). Browser remains open for direct requests.`);
  return async () => {
    await context.close();
  };
}

// ---------------------------------------------------------------------------
// Counts report
// ---------------------------------------------------------------------------

function reportCounts(): void {
  const sql = `
SELECT
  COUNT(*) FILTER (WHERE sale_price IS NOT NULL) AS sale_price_count,
  COUNT(*) FILTER (WHERE tax_amount IS NOT NULL) AS tax_amount_count,
  COUNT(*) AS total
FROM property.parcel_assessor_enrichment
WHERE parish = '${PARISH.replace(/'/g, "''")}';
`;
  const result = runRemotePsql(sql);
  const [salePriceCount, taxAmountCount, total] = result.split("|");
  console.log(`[smartcama-pw] Counts — sale_price: ${salePriceCount}/${total}, tax_amount: ${taxAmountCount}/${total}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));

  if (options.dryRun) {
    console.log("[smartcama-pw] Dry run. Would query SmartCAMA and upsert sale/tax fields.");
    console.log(JSON.stringify(options, null, 2));
    return;
  }

  if (!options.apply) {
    console.log("[smartcama-pw] No mode selected. Use --dry-run to preview or --apply to run.");
    return;
  }

  runRemotePsql(readFileSync(SCHEMA_SQL_PATH, "utf8"));
  console.log("[smartcama-pw] Before:");
  reportCounts();

  const checkpoint = options.resume
    ? loadCheckpoint()
    : { processedIds: [], notFoundIds: [], updatedAt: new Date().toISOString() };
  const processedSet = new Set([...checkpoint.processedIds, ...checkpoint.notFoundIds]);

  let assessmentNumbers: string[];
  if (options.assessmentNumbers.length > 0) {
    assessmentNumbers = options.assessmentNumbers;
  } else {
    const limit = options.maxRows ?? 1000;
    const output = runRemotePsql(buildTargetQuery(limit));
    assessmentNumbers = output.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  const remaining = assessmentNumbers.filter((id) => !processedSet.has(id));
  console.log(
    `[smartcama-pw] Target: ${assessmentNumbers.length} parcels, ${remaining.length} remaining after checkpoint.`,
  );

  if (remaining.length === 0) {
    console.log("[smartcama-pw] Nothing to do.");
    return;
  }

  const client = new SmartCamaClient();
  const cleanupSession = await bootstrapSession(client, options);

  let enriched = 0;
  let missing = 0;
  let batchRows: SmartCamaMoneyRow[] = [];

  const batches: string[][] = [];
  for (let i = 0; i < remaining.length; i += options.batchSize) {
    batches.push(remaining.slice(i, i + options.batchSize));
  }

  try {
    for (const batch of batches) {
      type FetchResult = { id: string; assessment: SmartCamaAssessment | null };
      const results = await mapConcurrent<string, FetchResult>(batch, options.concurrency, async (id) => {
        try {
          const assessment = await client.fetchAssessment(id);
          return { id, assessment };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes("redirected") || msg.includes("session")) {
            throw error;
          }
          console.warn(`[smartcama-pw] Error fetching ${id}: ${msg}`);
          return { id, assessment: null };
        }
      });

      for (const { id, assessment } of results) {
        if (!assessment) {
          missing += 1;
          checkpoint.notFoundIds.push(id);
          console.log(`[smartcama-pw] not_found: ${id}`);
        } else {
          batchRows.push(toMoneyRow(id, assessment));
          checkpoint.processedIds.push(id);
        }
      }

      if (batchRows.length > 0) {
        runRemotePsql(buildUploadSql(batchRows));
        enriched += batchRows.length;
        batchRows = [];
      }

      saveCheckpoint(checkpoint);
      console.log(
        `[smartcama-pw] Progress: ${enriched + missing}/${remaining.length} (enriched: ${enriched}, not_found: ${missing})`,
      );
    }
  } finally {
    await cleanupSession();
  }

  console.log("[smartcama-pw] After:");
  reportCounts();
  console.log(
    JSON.stringify({
      ok: true,
      parish: PARISH,
      sourceName: SOURCE_NAME,
      targetRows: remaining.length,
      enriched,
      missing,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
