import "dotenv/config";

const EXPECTED_CONTRACT_VERSION = "property-db-contract-v1";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8000";

type ParishCount = {
  parish: string | null;
  rowCount: number;
};

type ContractStatus = {
  ok: boolean;
  contractVersion: string;
  checks: Record<string, boolean>;
  rowCountsByParish: ParishCount[];
  columns: Record<string, { missing: string[] }>;
  indexes: { missing: string[] };
};

type GatewayConfig = {
  apiKey: string;
  statusUrl: string;
};

function fail(message: string): never {
  console.error(`[property-db-contract] ${message}`);
  process.exit(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`Expected ${label} to be an object.`);
  }
  return value;
}

function getString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    fail(`Expected ${label} to be a string.`);
  }
  return value;
}

function getBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    fail(`Expected ${label} to be a boolean.`);
  }
  return value;
}

function getStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`Expected ${label} to be a string array.`);
  }
  return value;
}

function parseColumns(value: unknown): Record<string, { missing: string[] }> {
  const columns = getRecord(value, "columns");
  return Object.fromEntries(
    Object.entries(columns).map(([name, columnReport]) => {
      const report = getRecord(columnReport, `columns.${name}`);
      return [name, { missing: getStringArray(report.missing, `columns.${name}.missing`) }];
    }),
  );
}

function parseParishCounts(value: unknown): ParishCount[] {
  if (!Array.isArray(value)) {
    fail("Expected rowCountsByParish to be an array.");
  }
  return value.map((item, index) => {
    const row = getRecord(item, `rowCountsByParish.${index}`);
    const parish = row.parish === null ? null : getString(row.parish, `rowCountsByParish.${index}.parish`);
    const rowCount = row.rowCount;
    if (typeof rowCount !== "number") {
      fail(`Expected rowCountsByParish.${index}.rowCount to be a number.`);
    }
    return { parish, rowCount };
  });
}

function parseContractStatus(value: unknown): ContractStatus {
  const root = getRecord(value, "contract status");
  const checksRecord = getRecord(root.checks, "checks");
  const checks = Object.fromEntries(
    Object.entries(checksRecord).map(([name, check]) => [name, getBoolean(check, `checks.${name}`)]),
  );
  const indexes = getRecord(root.indexes, "indexes");

  return {
    ok: getBoolean(root.ok, "ok"),
    contractVersion: getString(root.contractVersion, "contractVersion"),
    checks,
    rowCountsByParish: parseParishCounts(root.rowCountsByParish),
    columns: parseColumns(root.columns),
    indexes: {
      missing: getStringArray(indexes.missing, "indexes.missing"),
    },
  };
}

function firstPresent(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

function buildGatewayConfig(): GatewayConfig {
  const explicitUrl = process.env.PROPERTY_DB_GATEWAY_URL;
  const localApiUrl = process.env.LOCAL_API_URL;
  const proxyUrl = process.env.GATEWAY_PROXY_URL;
  const baseUrl = explicitUrl ?? localApiUrl ?? proxyUrl ?? DEFAULT_GATEWAY_URL;
  const apiKey = explicitUrl
    ? firstPresent([
        process.env.PROPERTY_DB_GATEWAY_TOKEN,
        process.env.LOCAL_API_KEY,
        process.env.GATEWAY_API_KEY,
        process.env.GATEWAY_PROXY_TOKEN,
      ])
    : localApiUrl
      ? firstPresent([
          process.env.LOCAL_API_KEY,
          process.env.GATEWAY_API_KEY,
          process.env.PROPERTY_DB_GATEWAY_TOKEN,
          process.env.GATEWAY_PROXY_TOKEN,
        ])
      : firstPresent([
          process.env.GATEWAY_PROXY_TOKEN,
          process.env.PROPERTY_DB_GATEWAY_TOKEN,
          process.env.LOCAL_API_KEY,
          process.env.GATEWAY_API_KEY,
        ]);

  if (!apiKey) {
    fail("Set LOCAL_API_KEY, GATEWAY_API_KEY, PROPERTY_DB_GATEWAY_TOKEN, or GATEWAY_PROXY_TOKEN.");
  }

  return {
    apiKey,
    statusUrl: new URL("/property-db/status", baseUrl).toString(),
  };
}

async function main(): Promise<void> {
  const { apiKey, statusUrl } = buildGatewayConfig();
  const cloudflareAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
  const cloudflareAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
    "x-gpc-internal-scope": "parcels.read",
  };
  if (cloudflareAccessClientId && cloudflareAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cloudflareAccessClientId;
    headers["CF-Access-Client-Secret"] = cloudflareAccessClientSecret;
  }

  const response = await fetch(statusUrl, {
    headers,
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    fail(`Gateway returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  const status = parseContractStatus(body);
  if (status.contractVersion !== EXPECTED_CONTRACT_VERSION) {
    fail(`Expected ${EXPECTED_CONTRACT_VERSION}, got ${status.contractVersion}.`);
  }

  const failedChecks = Object.entries(status.checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const missingColumns = Object.entries(status.columns)
    .flatMap(([name, report]) => report.missing.map((column) => `${name}.${column}`));
  const ebrCount = status.rowCountsByParish.find((row) => row.parish === "East Baton Rouge")?.rowCount ?? 0;

  if (!status.ok) {
    fail(
      [
        `Contract check failed.`,
        `failedChecks=${failedChecks.join(",") || "none"}`,
        `missingColumns=${missingColumns.join(",") || "none"}`,
        `missingIndexes=${status.indexes.missing.join(",") || "none"}`,
        `eastBatonRougeRows=${ebrCount}`,
      ].join(" "),
    );
  }

  console.log(
    `[property-db-contract] ok version=${status.contractVersion} eastBatonRougeRows=${ebrCount}`,
  );
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
