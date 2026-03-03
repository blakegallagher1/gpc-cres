import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@entitlement-os/db";
import { getPropertyDbConfigOrNull } from "@/lib/server/propertyDbEnv";

const REQUIRED_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_FLAGSHIP_MODEL",
  "OPENAI_STANDARD_MODEL",
  "OPENAI_MINI_MODEL",
  "PERPLEXITY_API_KEY",
  "PERPLEXITY_MODEL",
  "AUTH_SECRET",
  "LOCAL_API_URL",
  "LOCAL_API_KEY",
  "DATABASE_URL",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_SHEETS_API_KEY",
  "GOOGLE_DRIVE_API_KEY",
  "B2_S3_ENDPOINT_URL",
  "B2_ACCESS_KEY_ID",
  "B2_SECRET_ACCESS_KEY",
  "B2_BUCKET",
  "APP_ENV",
  "APP_DEBUG",
  "APP_LOG_LEVEL",
  "AGENT_MAX_TURNS",
  "AGENT_TIMEOUT_SECONDS",
  "AGENT_ENABLE_TRACING",
  "DEFAULT_MARKET_REGION",
  "DEFAULT_STATE",
  "DEFAULT_MSA",
  "ENABLE_WEB_SEARCH",
  "ENABLE_FILE_SEARCH",
  "ENABLE_CODE_INTERPRETER",
  "VERCEL_ACCESS_TOKEN",
  "VERCEL_USER_ID",
  "VERCEL_TEAM_ID",
  "VERCEL_TEAM_URL",
];

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

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
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

  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  const ok = missing.length === 0;

  const propertyDbConfig = getPropertyDbConfigOrNull();
  let propertyDbReachable: boolean | null = null;
  if (propertyDbConfig) {
    try {
      const adminKey = process.env.ADMIN_API_KEY?.trim();
      const res = await fetch(
        `${propertyDbConfig.url}/admin/health`,
        {
          headers: {
            Authorization: `Bearer ${adminKey ?? propertyDbConfig.key}`,
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      propertyDbReachable = res.ok;
    } catch {
      propertyDbReachable = false;
    }
  }

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      missing,
      propertyDb: {
        configured: Boolean(propertyDbConfig),
        reachable: propertyDbReachable,
      },
      build: {
        sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
        ref: process.env.VERCEL_GIT_COMMIT_REF || null,
        provider: process.env.VERCEL_GIT_PROVIDER || null,
      },
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 500 }
  );
}
