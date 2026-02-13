import crypto from "crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { prisma } from "@entitlement-os/db";

type DbStatus = {
  ok: boolean;
  latencyMs?: number;
};

const WORKSPACE_DIRS = ["packages", "apps"] as const;

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

function createSupabaseServerClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    }
  );
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

  const supabase = createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(session);
}

async function hasWorkspaceDirs(root: string): Promise<boolean> {
  try {
    const [appsStat, packagesStat] = await Promise.all([
      stat(path.join(root, "apps")),
      stat(path.join(root, "packages")),
    ]);
    return appsStat.isDirectory() && packagesStat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveRepoRoot(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ];

  for (const candidate of candidates) {
    if (await hasWorkspaceDirs(candidate)) {
      return candidate;
    }
  }

  return cwd;
}

async function readWorkspaceVersions(): Promise<Record<string, string>> {
  const repoRoot = await resolveRepoRoot();
  const versions: Record<string, string> = {};

  for (const workspaceDir of WORKSPACE_DIRS) {
    const rootDir = path.join(repoRoot, workspaceDir);
    let entries: Dirent[] = [];

    try {
      entries = await readdir(rootDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(rootDir, entry.name, "package.json");

      try {
        const raw = await readFile(packageJsonPath, "utf8");
        const parsed = JSON.parse(raw) as { name?: string; version?: string };
        if (parsed.name && parsed.version) {
          versions[parsed.name] = parsed.version;
        }
      } catch {
        continue;
      }
    }
  }

  return versions;
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

  const [dbStatus, workspaceVersions] = await Promise.all([
    getDbStatus(),
    readWorkspaceVersions(),
  ]);
  const migrationVersion = dbStatus.ok ? await getMigrationVersion() : null;

  return NextResponse.json(
    {
      dbStatus,
      migrationVersion,
      workspaceVersions,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    { status: dbStatus.ok ? 200 : 500 }
  );
}
