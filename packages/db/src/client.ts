import { PrismaClient } from "@prisma/client";

declare const globalThis: typeof global & {
  __ENTITLEMENT_OS_PRISMA__?: PrismaClient;
  __ENTITLEMENT_OS_PRISMA_READ__?: PrismaClient;
};

function normalizeDbUrl(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}

function withPoolParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const connectionLimit = process.env.PRISMA_CONNECTION_LIMIT?.trim();
  const poolTimeout = process.env.PRISMA_POOL_TIMEOUT_SECONDS?.trim();

  if (connectionLimit && !parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", connectionLimit);
  }
  if (poolTimeout && !parsed.searchParams.has("pool_timeout")) {
    parsed.searchParams.set("pool_timeout", poolTimeout);
  }

  return parsed.toString();
}

function createPrismaClient(url: string | null): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["error", "warn"],
  });
}

const runtimeDatabaseUrl = normalizeDbUrl(process.env.DATABASE_URL);
const pooledDatabaseUrl = runtimeDatabaseUrl ? withPoolParams(runtimeDatabaseUrl) : null;

// Guardrail: serverless must use Supavisor (port 6543), not Session Mode (5432)
if (
  process.env.NODE_ENV === "production" &&
  pooledDatabaseUrl
) {
  try {
    const u = new URL(pooledDatabaseUrl);
    const port = u.port || (u.protocol === "postgresql:" ? "5432" : "");
    if (port === "5432") {
      console.warn(
        "[db] DATABASE_URL uses port 5432 (Session Mode). Serverless should use port 6543 (Supavisor Transaction Mode) to avoid connection exhaustion."
      );
    }
  } catch {
    /* ignore parse errors */
  }
}

export const prisma: PrismaClient = globalThis.__ENTITLEMENT_OS_PRISMA__ ?? createPrismaClient(pooledDatabaseUrl);

const readReplicaUrl = normalizeDbUrl(process.env.READ_REPLICA_DATABASE_URL);
const useReadReplica = process.env.ENABLE_READ_REPLICA === "true" && Boolean(readReplicaUrl);
const readClientUrl = useReadReplica ? withPoolParams(readReplicaUrl!) : pooledDatabaseUrl;
export const prismaRead: PrismaClient =
  globalThis.__ENTITLEMENT_OS_PRISMA_READ__ ?? createPrismaClient(readClientUrl);

if (process.env.NODE_ENV !== "production") {
  globalThis.__ENTITLEMENT_OS_PRISMA__ = prisma;
  globalThis.__ENTITLEMENT_OS_PRISMA_READ__ = prismaRead;
}
