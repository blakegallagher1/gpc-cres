import { prisma } from "@entitlement-os/db";
import {
  getCloudflareAccessHeadersFromEnv,
  getPropertyDbConfigOrNull,
} from "../search/property-db-gateway.service";

const CORE_ENV_VARS = ["OPENAI_API_KEY"] as const;

export type DbStatus = {
  ok: boolean;
  latencyMs?: number;
};

function getDbMode(
  gatewayConfigured: boolean,
  directUrlConfigured: boolean,
): "gateway" | "direct" | "unconfigured" {
  if (gatewayConfigured) {
    return "gateway";
  }
  if (directUrlConfigured) {
    return "direct";
  }
  return "unconfigured";
}

async function getDbStatus(): Promise<DbStatus> {
  const startedAt = Date.now();

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false };
  }
}

async function getMigrationVersion(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string | null }>>(
      `SELECT migration_name
       FROM _prisma_migrations
       ORDER BY finished_at DESC NULLS LAST, started_at DESC
       LIMIT 1`,
    );
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

export async function getHealthStatusSnapshot(options: {
  authSecretConfigured: boolean;
  localApiUrlConfigured: boolean;
  localApiKeyConfigured: boolean;
}): Promise<{
  status: "ok" | "degraded" | "down";
  missing: string[];
  propertyDb: {
    configured: boolean;
    reachable: boolean | null;
    dbMode: "gateway" | "direct" | "unconfigured";
    gatewayConfigured: boolean;
    directUrlConfigured: boolean;
    monitorAuthConfigured: boolean;
  };
  build: {
    sha: string | null;
    ref: string | null;
    provider: string | null;
  };
  timestamp: string;
}> {
  const propertyDbConfig = getPropertyDbConfigOrNull();
  const gatewayConfigured = Boolean(propertyDbConfig);
  const directUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const dbMode = getDbMode(gatewayConfigured, directUrlConfigured);
  const monitorAuthConfigured = Boolean(
    process.env.HEALTHCHECK_TOKEN?.trim() || process.env.VERCEL_ACCESS_TOKEN?.trim(),
  );
  const missing: string[] = CORE_ENV_VARS.filter((key) => !process.env[key]);

  if (!options.authSecretConfigured) {
    missing.push("AUTH_SECRET");
  }
  if (!options.localApiUrlConfigured) {
    missing.push("LOCAL_API_URL");
  }
  if (!options.localApiKeyConfigured) {
    missing.push("LOCAL_API_KEY");
  }

  let propertyDbReachable: boolean | null = null;
  if (propertyDbConfig) {
    try {
      const adminKey = process.env.ADMIN_API_KEY?.trim();
      const headers = {
        Authorization: `Bearer ${adminKey ?? propertyDbConfig.key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      };
      const response = await fetch(`${propertyDbConfig.url}/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        propertyDbReachable = true;
      } else {
        const legacyResponse = await fetch(`${propertyDbConfig.url}/admin/health`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        propertyDbReachable = legacyResponse.ok;
      }
    } catch {
      propertyDbReachable = false;
    }
  }

  const status =
    propertyDbReachable === false || !gatewayConfigured || missing.includes("OPENAI_API_KEY")
      ? "down"
      : missing.length > 0 || !monitorAuthConfigured
        ? "degraded"
        : "ok";

  return {
    status,
    missing,
    propertyDb: {
      configured: gatewayConfigured,
      reachable: propertyDbReachable,
      dbMode,
      gatewayConfigured,
      directUrlConfigured,
      monitorAuthConfigured,
    },
    build: {
      sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      provider: process.env.VERCEL_GIT_PROVIDER || null,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function getDetailedHealthStatus(): Promise<{
  dbStatus: DbStatus;
  propertyDb: {
    dbMode: "gateway" | "direct" | "unconfigured";
    gatewayConfigured: boolean;
    directUrlConfigured: boolean;
  };
  migrationVersion: string | null;
  timestamp: string;
  uptimeSeconds: number;
}> {
  const dbStatus = await getDbStatus();
  const migrationVersion = dbStatus.ok ? await getMigrationVersion() : null;
  const gatewayConfigured = Boolean(getPropertyDbConfigOrNull());
  const directUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());

  return {
    dbStatus,
    propertyDb: {
      dbMode: getDbMode(gatewayConfigured, directUrlConfigured),
      gatewayConfigured,
      directUrlConfigured,
    },
    migrationVersion,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
