import { PrismaClient } from "@prisma/client";
import { createGatewayAdapterFactory } from "./gateway-adapter";

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

function getGatewayConfig(): { url: string | null; key: string | null } {
  const proxyUrl = normalizeDbUrl(process.env.GATEWAY_PROXY_URL);
  const proxyKey = process.env.GATEWAY_PROXY_TOKEN?.trim() || process.env.LOCAL_API_KEY?.trim() || null;
  if (proxyUrl) {
    return { url: proxyUrl, key: proxyKey };
  }

  const isHostedRuntime =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV?.trim());
  if (isHostedRuntime && proxyKey) {
    return { url: "https://gateway.gallagherpropco.com", key: proxyKey };
  }

  const directGatewayUrl = normalizeDbUrl(process.env.GATEWAY_DATABASE_URL);
  const directGatewayKey = process.env.LOCAL_API_KEY?.trim() || null;
  if (directGatewayUrl) {
    return { url: directGatewayUrl, key: directGatewayKey };
  }

  const localApiUrl = isHostedRuntime ? normalizeDbUrl(process.env.LOCAL_API_URL) : null;
  return { url: localApiUrl, key: directGatewayKey };
}

function createPrismaClient(url: string | null): PrismaClient {
  // Prefer the public gateway proxy when configured so Vercel does not depend on
  // direct Cloudflare Access credentials for the FastAPI /db endpoint.
  const gateway = getGatewayConfig();

  if (gateway.url && gateway.key) {
    const adapter = createGatewayAdapterFactory(gateway.url, gateway.key);
    return new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "production"
          ? ["error", "warn"]
          : ["error", "warn"],
    });
  }

  // Direct TCP mode: standard Prisma connection (local dev)
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
