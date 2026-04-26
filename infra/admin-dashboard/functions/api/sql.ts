interface Env {
  UPSTREAM_GATEWAY_URL: string;
  LOCAL_API_KEY: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  ADMIN_SQL_ALLOWED_TABLES?: string;
}

interface SqlRequest {
  sql: string;
  limit?: number;
}

const MAX_ADMIN_SQL_LENGTH = 4_000;
const MAX_ADMIN_SQL_ROWS = 500;
const DEFAULT_ALLOWED_TABLES = "deploys,health_checks,parcels,screening,sync_status";
const ADMIN_SQL_MUTATION_RE =
  /\b(alter|analyze|call|copy|create|delete|drop|execute|grant|insert|listen|lock|merge|notify|refresh|reset|revoke|set|truncate|unlisten|update|vacuum)\b/i;
const ADMIN_SQL_TABLE_RE =
  /\b(?:from|join)\s+(?:only\s+)?(?:(?:"?([A-Za-z_][\w]*)"?\.)?)"?([A-Za-z_][\w]*)"?/gi;

function allowedTables(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_SQL_ALLOWED_TABLES || DEFAULT_ALLOWED_TABLES)
      .split(",")
      .map((table) => table.trim().toLowerCase())
      .filter(Boolean),
  );
}

function validateSqlRequest(body: SqlRequest, env: Env): { sql: string; limit: number } | string {
  const sql = body.sql?.trim();
  if (!sql) return "sql required";
  if (sql.length > MAX_ADMIN_SQL_LENGTH) return "Query is too long";
  if (sql.includes(";") || sql.includes("--") || sql.includes("/*")) {
    return "Query comments and statement separators are not permitted";
  }
  if (!sql.toUpperCase().startsWith("SELECT")) return "Only SELECT queries are permitted";
  if (ADMIN_SQL_MUTATION_RE.test(sql)) return "Query contains a blocked SQL keyword";

  const tables = allowedTables(env);
  if (!tables.has("*")) {
    const matches = Array.from(sql.matchAll(ADMIN_SQL_TABLE_RE));
    const blockedSchema = matches.find(([, schema]) => schema && schema.toLowerCase() !== "public");
    if (blockedSchema?.[1]) return `Schema is not allowed for admin SQL: ${blockedSchema[1]}`;

    const blockedTable = matches
      .map(([, , table]) => table.toLowerCase())
      .find((table) => !tables.has(table));
    if (blockedTable) return `Table is not allowed for admin SQL: ${blockedTable}`;
  }

  const requestedLimit = Number.isFinite(body.limit) ? Math.floor(Number(body.limit)) : MAX_ADMIN_SQL_ROWS;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_ADMIN_SQL_ROWS);
  return { sql, limit };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as SqlRequest;
    const validated = validateSqlRequest(body, env);

    if (typeof validated === "string") {
      return Response.json({ error: validated }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
      "Content-Type": "application/json",
    };

    if (env.CF_ACCESS_CLIENT_ID) {
      headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    }

    if (env.CF_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
    }

    const res = await fetch(`${env.UPSTREAM_GATEWAY_URL}/admin/db/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(validated),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }

    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: `Query failed: ${String(err)}` },
      { status: 502 }
    );
  }
};
