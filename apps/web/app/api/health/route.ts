import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const REQUIRED_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENAI_FLAGSHIP_MODEL",
  "OPENAI_STANDARD_MODEL",
  "OPENAI_MINI_MODEL",
  "PERPLEXITY_API_KEY",
  "PERPLEXITY_MODEL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "DATABASE_URL",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_SHEETS_API_KEY",
  "GOOGLE_DRIVE_API_KEY",
  "B2_APPLICATION_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_BUCKET_NAME",
  "B2_ENDPOINT_URL",
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
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
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

function createSupabaseServerClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
  if (!supabase) {
    return false;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(session);
}

export async function GET(request: NextRequest) {
  const authorized = await isAuthorized(request);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  const ok = missing.length === 0;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      missing,
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
