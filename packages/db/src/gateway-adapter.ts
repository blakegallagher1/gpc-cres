/**
 * Prisma Gateway Adapter — Routes Prisma SQL queries over HTTPS to a
 * Cloudflare Worker that executes them via Hyperdrive against local Postgres.
 *
 * Used on Vercel where direct TCP to the database is not possible.
 * Local dev uses standard DATABASE_URL (direct TCP) instead.
 */

import type {
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlQuery,
  SqlResultSet,
  Transaction,
  IsolationLevel,
  ConnectionInfo,
  ColumnType,
} from "@prisma/driver-adapter-utils";

const ADAPTER_NAME = "prisma-gateway-http";

interface GatewayResponse {
  columnNames: string[];
  columnTypes: number[];
  rows: unknown[][];
  rowCount: number;
  error?: string;
  detail?: string;
  txId?: string;
  ok?: boolean;
}

async function gatewayFetch(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<GatewayResponse> {
  const res = await fetch(`${baseUrl}/db`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gateway DB proxy error (${res.status}): ${text}`);
  }

  return res.json() as Promise<GatewayResponse>;
}

function createQueryable(baseUrl: string, apiKey: string, txId?: string) {
  return {
    provider: "postgres" as const,
    adapterName: ADAPTER_NAME,

    async queryRaw(params: SqlQuery): Promise<SqlResultSet> {
      const resp = await gatewayFetch(baseUrl, apiKey, {
        sql: params.sql,
        args: params.args,
        ...(txId ? { txId } : {}),
      });

      if (resp.error) {
        throw new Error(resp.detail ?? resp.error);
      }

      return {
        columnNames: resp.columnNames ?? [],
        columnTypes: (resp.columnTypes ?? []) as ColumnType[],
        rows: resp.rows ?? [],
      };
    },

    async executeRaw(params: SqlQuery): Promise<number> {
      const resp = await gatewayFetch(baseUrl, apiKey, {
        sql: params.sql,
        args: params.args,
        ...(txId ? { txId } : {}),
      });

      if (resp.error) {
        throw new Error(resp.detail ?? resp.error);
      }

      return resp.rowCount ?? 0;
    },
  };
}

function createAdapter(baseUrl: string, apiKey: string): SqlDriverAdapter {
  const queryable = createQueryable(baseUrl, apiKey);

  return {
    ...queryable,

    getConnectionInfo(): ConnectionInfo {
      return {
        schemaName: "public",
        supportsRelationJoins: true,
      };
    },

    async startTransaction(_isolationLevel?: IsolationLevel): Promise<Transaction> {
      // Begin a transaction on the remote side
      const resp = await gatewayFetch(baseUrl, apiKey, { action: "begin" });
      const txId = resp.txId;
      if (!txId) throw new Error("Failed to start remote transaction");

      const txQueryable = createQueryable(baseUrl, apiKey, txId);

      return {
        ...txQueryable,
        options: { usePhantomQuery: false },

        async commit(): Promise<void> {
          await gatewayFetch(baseUrl, apiKey, { action: "commit", txId });
        },

        async rollback(): Promise<void> {
          await gatewayFetch(baseUrl, apiKey, { action: "rollback", txId });
        },
      };
    },

    async executeScript(script: string): Promise<void> {
      // Split by semicolons and execute each statement
      const statements = script
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sql of statements) {
        await gatewayFetch(baseUrl, apiKey, { sql, args: [] });
      }
    },

    async dispose(): Promise<void> {
      // No persistent connection to clean up — each request is stateless
    },
  };
}

/**
 * Create a Prisma driver adapter factory that routes queries over HTTPS
 * to a Cloudflare Worker with Hyperdrive.
 */
export function createGatewayAdapterFactory(baseUrl: string, apiKey: string): SqlDriverAdapterFactory {
  return {
    provider: "postgres" as const,
    adapterName: ADAPTER_NAME,
    async connect(): Promise<SqlDriverAdapter> {
      return createAdapter(baseUrl, apiKey);
    },
  };
}
