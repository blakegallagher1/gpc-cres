import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@entitlement-os/db";

type DbStatus = {
  ok: boolean;
  latencyMs?: number;
};

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

async function getDbStatus(): Promise<DbStatus> {
  const start = Date.now();

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

async function getMigrationVersion(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string | null }>
    >(
      `SELECT migration_name
       FROM _prisma_migrations
       ORDER BY finished_at DESC NULLS LAST, started_at DESC
       LIMIT 1`
    );
    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const authorized = await isAuthorized(request);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbStatus = await getDbStatus();
  const migrationVersion = dbStatus.ok ? await getMigrationVersion() : null;

  return NextResponse.json(
    {
      dbStatus,
      migrationVersion,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    { status: dbStatus.ok ? 200 : 500 }
  );
}
