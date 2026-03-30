import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@entitlement-os/db";
import {
  getCloudflareAccessHeadersFromEnv,
  getPropertyDbConfigOrNull,
} from "@/lib/server/propertyDbEnv";
import { getAuthSecret } from "@/lib/auth/authSecret";

const CORE_ENV_VARS = ["OPENAI_API_KEY"] as const;

function getDbMode(
  gatewayConfigured: boolean,
  directUrlConfigured: boolean
): "gateway" | "direct" | "unconfigured" {
  if (gatewayConfigured) {
    return "gateway";
  }
  if (directUrlConfigured) {
    return "direct";
  }
  return "unconfigured";
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}

function timingSafeTokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function isAuthorized(request: NextRequest) {
  const expectedToken = (
    process.env.HEALTHCHECK_TOKEN || process.env.VERCEL_ACCESS_TOKEN || ""
  ).trim();
  const headerToken = (
    request.headers.get("x-health-token") || getBearerToken(request) || ""
  ).trim();

  if (timingSafeTokenMatch(expectedToken, headerToken)) {
    return true;
  }

  const secret = getAuthSecret();
  if (!secret) {
    return false;
  }

  const token = await getToken({
    req: request,
    secret,
  });
  if (!token?.userId) {
    return false;
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId: token.userId as string },
    select: { orgId: true },
  });
  return Boolean(membership?.orgId);
}

export async function GET(request: NextRequest) {
  const authorized = await isAuthorized(request);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyDbConfig = getPropertyDbConfigOrNull();
  const gatewayConfigured = Boolean(propertyDbConfig);
  const directUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const dbMode = getDbMode(gatewayConfigured, directUrlConfigured);
  const monitorAuthConfigured = Boolean(
    process.env.HEALTHCHECK_TOKEN?.trim() || process.env.VERCEL_ACCESS_TOKEN?.trim()
  );
  const missing: string[] = CORE_ENV_VARS.filter((key) => !process.env[key]);
  if (!getAuthSecret()) {
    missing.push("AUTH_SECRET");
  }
  if (!process.env.LOCAL_API_URL?.trim()) {
    missing.push("LOCAL_API_URL");
  }
  if (!process.env.LOCAL_API_KEY?.trim()) {
    missing.push("LOCAL_API_KEY");
  }
  let propertyDbReachable: boolean | null = null;
  if (propertyDbConfig) {
    try {
      const adminKey = process.env.ADMIN_API_KEY?.trim();
      const authHeader = {
        Authorization: `Bearer ${adminKey ?? propertyDbConfig.key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      };
      const res = await fetch(`${propertyDbConfig.url}/health`, {
        headers: authHeader,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        propertyDbReachable = true;
      } else {
        // Backward compatibility with older gateway deployments.
        const legacyRes = await fetch(`${propertyDbConfig.url}/admin/health`, {
          headers: authHeader,
          signal: AbortSignal.timeout(5000),
        });
        propertyDbReachable = legacyRes.ok;
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

  return NextResponse.json(
    {
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
    },
    { status: status === "ok" ? 200 : 500 }
  );
}
