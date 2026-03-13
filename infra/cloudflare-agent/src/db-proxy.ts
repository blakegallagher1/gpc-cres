/**
 * DB Proxy — Executes parameterized SQL via Hyperdrive connection to local Postgres.
 * Returns Prisma-compatible columnar result format for the gateway adapter.
 */

import pg from "pg";
import type { Env } from "./types";

const { Client } = pg;

// Postgres OID → Prisma ColumnType mapping (subset covering common types)
// See: https://github.com/brianc/node-pg-types and @prisma/driver-adapter-utils ColumnTypeEnum
const PG_OID_TO_PRISMA_COLUMN_TYPE: Record<number, number> = {
  16: 5,    // bool → Boolean
  20: 1,    // int8 → Int64
  21: 0,    // int2 → Int32
  23: 0,    // int4 → Int32
  25: 7,    // text → Text
  114: 11,  // json → Json
  700: 2,   // float4 → Float
  701: 3,   // float8 → Double
  790: 4,   // money → Numeric
  1043: 6,  // varchar → Character
  1082: 8,  // date → Date
  1083: 9,  // time → Time
  1114: 10, // timestamp → DateTime
  1184: 10, // timestamptz → DateTime
  1700: 4,  // numeric → Numeric
  2950: 15, // uuid → Uuid
  3802: 11, // jsonb → Json
  1042: 6,  // bpchar (char) → Character
  17: 13,   // bytea → Bytes
  1009: 71, // text[] → TextArray
  1015: 71, // varchar[] → TextArray
  1016: 65, // int8[] → Int64Array
  1007: 64, // int4[] → Int32Array
  1000: 69, // bool[] → BooleanArray
  2951: 78, // uuid[] → UuidArray
};

function pgOidToColumnType(oid: number): number {
  return PG_OID_TO_PRISMA_COLUMN_TYPE[oid] ?? 7; // default to Text
}

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array || v instanceof Buffer) return Array.from(v);
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return v;
}

interface QueryRequest {
  sql: string;
  args?: unknown[];
  // Transaction support
  transaction?: { sql: string; args?: unknown[] }[];
  // Transaction control
  action?: "begin" | "commit" | "rollback";
  txId?: string;
}

// Active transactions keyed by txId
const activeTxClients = new Map<string, pg.Client>();

function databaseErrorResponse(error: unknown, label: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db-proxy] ${label}:`, message);
  return Response.json({ error: "Database error", detail: message }, { status: 500 });
}

export async function handleDbProxy(request: Request, env: Env): Promise<Response> {
  // Auth check
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token !== env.LOCAL_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: QueryRequest;
  try {
    body = await request.json() as QueryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let transientClient: pg.Client | null = null;
  let shouldCloseTransientClient = false;

  try {
    // --- Transaction control (begin/commit/rollback) ---
    if (body.action === "begin") {
      const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      transientClient = client;
      shouldCloseTransientClient = true;
      await client.connect();
      await client.query("BEGIN");
      const txId = crypto.randomUUID();
      activeTxClients.set(txId, client);
      transientClient = null;
      shouldCloseTransientClient = false;
      // Auto-cleanup after 30s
      setTimeout(() => {
        const c = activeTxClients.get(txId);
        if (c) {
          c.query("ROLLBACK").catch(() => {});
          c.end().catch(() => {});
          activeTxClients.delete(txId);
        }
      }, 30_000);
      return Response.json({ txId });
    }

    if (body.action === "commit" && body.txId) {
      const client = activeTxClients.get(body.txId);
      if (!client) return Response.json({ error: "Transaction not found" }, { status: 404 });
      await client.query("COMMIT");
      await client.end();
      activeTxClients.delete(body.txId);
      return Response.json({ ok: true });
    }

    if (body.action === "rollback" && body.txId) {
      const client = activeTxClients.get(body.txId);
      if (!client) return Response.json({ error: "Transaction not found" }, { status: 404 });
      await client.query("ROLLBACK");
      await client.end();
      activeTxClients.delete(body.txId);
      return Response.json({ ok: true });
    }

    // --- Query execution (single or within transaction) ---
    const sql = (body.sql ?? "").trim();
    if (!sql) {
      return Response.json({ error: "Missing 'sql' field" }, { status: 400 });
    }

    const args = body.args ?? [];

    // Use transaction client if txId provided, otherwise create one-shot client
    let client: pg.Client;
    if (body.txId) {
      const txClient = activeTxClients.get(body.txId);
      if (!txClient) return Response.json({ error: "Transaction not found" }, { status: 404 });
      client = txClient;
    } else {
      client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
      transientClient = client;
      shouldCloseTransientClient = true;
      await client.connect();
    }

    const res = await client.query({ text: sql, values: args, rowMode: "array" });

    // Build Prisma-compatible columnar response
    const columnNames = (res.fields ?? []).map((f: pg.FieldDef) => f.name);
    const columnTypes = (res.fields ?? []).map((f: pg.FieldDef) => pgOidToColumnType(f.dataTypeID));
    const rows = (res.rows ?? []).map((row: unknown[]) => row.map(serializeValue));

    return Response.json({
      columnNames,
      columnTypes,
      rows,
      rowCount: res.rowCount ?? 0,
    });
  } catch (err) {
    return databaseErrorResponse(err, body.action ? `Transaction ${body.action} failed` : "Query error");
  } finally {
    if (shouldCloseTransientClient && transientClient) {
      try {
        await transientClient.end();
      } catch {
        // ignore close failures on one-shot or failed transient clients
      }
    }
  }
}
