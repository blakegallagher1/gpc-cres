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

function getCfAccessHeaders(): Record<string, string> {
  const clientId = process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    return {
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    };
  }
  return {};
}

const GATEWAY_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

async function gatewayFetch(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<GatewayResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl}/db?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Cache-Control": "no-cache",
          ...getCfAccessHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Gateway DB proxy error (${res.status}): ${text}`);
        // Only retry on 502/503/504 (upstream issues)
        if (res.status >= 502 && res.status <= 504 && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }

      return res.json() as Promise<GatewayResponse>;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on network/timeout errors
      if (lastError.name === "AbortError") {
        lastError = new Error(`Gateway DB proxy timeout after ${GATEWAY_TIMEOUT_MS}ms`);
      }
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    }
  }

  throw lastError ?? new Error("Gateway DB proxy: unexpected retry exhaustion");
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
