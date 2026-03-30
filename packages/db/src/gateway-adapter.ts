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

/**
 * Ordered gateway target used for Prisma HTTPS failover in hosted runtimes.
 */
export interface GatewayTarget {
  baseUrl: string;
  apiKey: string;
  name?: string;
}

interface GatewayFetchResult {
  response: GatewayResponse;
  target: GatewayTarget;
}

class GatewayHttpError extends Error {}

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
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function describeTarget(target: GatewayTarget): string {
  return target.name ? `${target.name} (${target.baseUrl})` : target.baseUrl;
}

async function gatewayFetchFromTarget(
  target: GatewayTarget,
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
      const res = await fetch(`${target.baseUrl}/db?_t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.apiKey}`,
          "Cache-Control": "no-cache",
          ...getCfAccessHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(
          `${describeTarget(target)} gateway DB proxy error (${res.status}): ${text}`,
        );
        // Retry on 404 (intermittent CF Access/tunnel routing), 502/503/504 (upstream issues)
        if ((res.status === 404 || (res.status >= 502 && res.status <= 504)) && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw new GatewayHttpError(err.message);
      }

      return res.json() as Promise<GatewayResponse>;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof GatewayHttpError) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on network/timeout errors
      if (lastError.name === "AbortError") {
        lastError = new Error(
          `${describeTarget(target)} gateway DB proxy timeout after ${GATEWAY_TIMEOUT_MS}ms`,
        );
      }
      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    }
  }

  throw lastError ?? new Error("Gateway DB proxy: unexpected retry exhaustion");
}

async function gatewayFetch(
  targets: GatewayTarget[],
  body: Record<string, unknown>,
): Promise<GatewayFetchResult> {
  if (targets.length === 0) {
    throw new Error("Gateway DB proxy called without any configured targets");
  }

  const errors: string[] = [];

  for (const target of targets) {
    try {
      const response = await gatewayFetchFromTarget(target, body);
      return { response, target };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Gateway DB proxy failed across ${targets.length} target(s): ${errors.join(" | ")}`);
}

function createQueryable(targets: GatewayTarget[], txId?: string) {
  return {
    provider: "postgres" as const,
    adapterName: ADAPTER_NAME,

    async queryRaw(params: SqlQuery): Promise<SqlResultSet> {
      const { response } = await gatewayFetch(targets, {
        sql: params.sql,
        args: params.args,
        ...(txId ? { txId } : {}),
      });

      if (response.error) {
        throw new Error(response.detail ?? response.error);
      }

      return {
        columnNames: response.columnNames ?? [],
        columnTypes: (response.columnTypes ?? []) as ColumnType[],
        rows: response.rows ?? [],
      };
    },

    async executeRaw(params: SqlQuery): Promise<number> {
      const { response } = await gatewayFetch(targets, {
        sql: params.sql,
        args: params.args,
        ...(txId ? { txId } : {}),
      });

      if (response.error) {
        throw new Error(response.detail ?? response.error);
      }

      return response.rowCount ?? 0;
    },
  };
}

function createAdapter(targets: GatewayTarget[]): SqlDriverAdapter {
  const queryable = createQueryable(targets);

  return {
    ...queryable,

    getConnectionInfo(): ConnectionInfo {
      return {
        schemaName: "public",
        supportsRelationJoins: true,
      };
    },

    async startTransaction(_isolationLevel?: IsolationLevel): Promise<Transaction> {
      // Begin a transaction on one gateway target and pin the rest of the
      // transaction lifecycle to that target because txIds are target-local.
      const { response, target } = await gatewayFetch(targets, { action: "begin" });
      const txId = response.txId;
      if (!txId) throw new Error("Failed to start remote transaction");

      const txTargets = [target];
      const txQueryable = createQueryable(txTargets, txId);

      return {
        ...txQueryable,
        options: { usePhantomQuery: false },

        async commit(): Promise<void> {
          await gatewayFetch(txTargets, { action: "commit", txId });
        },

        async rollback(): Promise<void> {
          await gatewayFetch(txTargets, { action: "rollback", txId });
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
        await gatewayFetch(targets, { sql, args: [] });
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
export function createGatewayAdapterFactory(
  targetsOrBaseUrl: GatewayTarget[] | string,
  apiKey?: string,
): SqlDriverAdapterFactory {
  const targets = Array.isArray(targetsOrBaseUrl)
    ? targetsOrBaseUrl
    : [{ baseUrl: targetsOrBaseUrl, apiKey: apiKey ?? "", name: "gateway" }];

  return {
    provider: "postgres" as const,
    adapterName: ADAPTER_NAME,
    async connect(): Promise<SqlDriverAdapter> {
      return createAdapter(targets);
    },
  };
}
