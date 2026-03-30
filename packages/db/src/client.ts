import { PrismaClient } from "@prisma/client";
import { createGatewayAdapterFactory, type GatewayTarget } from "./gateway-adapter";

declare const globalThis: typeof global & {
  __ENTITLEMENT_OS_PRISMA__?: PrismaClient;
  __ENTITLEMENT_OS_PRISMA_READ__?: PrismaClient;
};

function normalizeDbUrl(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) return null;
  return value.trim();
}

function getFirstConfiguredGatewayKey(): string | null {
  const directKey = process.env.LOCAL_API_KEY?.trim();
  if (directKey) {
    return directKey;
  }

  const legacyGatewayKey = process.env.GATEWAY_API_KEY?.trim();
  if (legacyGatewayKey) {
    return legacyGatewayKey;
  }

  const multiGatewayKeys = process.env.API_KEYS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return multiGatewayKeys?.[0] ?? null;
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

function pushGatewayTarget(
  targets: GatewayTarget[],
  baseUrl: string | null,
  apiKey: string | null,
  name: GatewayTarget["name"],
): void {
  if (!baseUrl || !apiKey) return;
  targets.push({ baseUrl, apiKey, name });
}

function dedupeGatewayTargets(targets: GatewayTarget[]): GatewayTarget[] {
  const seen = new Set<string>();

  return targets.filter((target) => {
    const key = `${target.baseUrl}|${target.apiKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getGatewayTargets(): GatewayTarget[] {
  const proxyUrl = normalizeDbUrl(process.env.GATEWAY_PROXY_URL);
  const directGatewayKey = getFirstConfiguredGatewayKey();
  const proxyKey = process.env.GATEWAY_PROXY_TOKEN?.trim() || directGatewayKey;
  const targets: GatewayTarget[] = [];

  const isHostedRuntime =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV?.trim());

  pushGatewayTarget(targets, proxyUrl, proxyKey, "gateway-proxy");

  if (!proxyUrl && isHostedRuntime) {
    pushGatewayTarget(targets, "https://gateway.gallagherpropco.com", proxyKey, "gateway-proxy");
  }

  const directGatewayUrl = normalizeDbUrl(process.env.GATEWAY_DATABASE_URL);
  pushGatewayTarget(targets, directGatewayUrl, directGatewayKey, "gateway-direct");

  const localApiUrl = isHostedRuntime ? normalizeDbUrl(process.env.LOCAL_API_URL) : null;
  pushGatewayTarget(targets, localApiUrl, directGatewayKey, "local-api");

  return dedupeGatewayTargets(targets);
}

function createPrismaClient(url: string | null): PrismaClient {
  // Prefer hosted HTTP gateways on Vercel, but keep an ordered fallback chain
  // so auth and other Prisma-backed flows can survive one broken /db path.
  const gatewayTargets = getGatewayTargets();

  if (gatewayTargets.length > 0) {
    const adapter = createGatewayAdapterFactory(gatewayTargets);
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
