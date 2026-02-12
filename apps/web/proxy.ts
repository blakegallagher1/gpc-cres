import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const publicRoutes = ["/login", "/signup"];

function getAllowedOrigins(): Set<string> {
  const env = process.env.ALLOWED_CORS_ORIGINS;
  const origins = env
    ? env.split(",").map((o) => o.trim()).filter(Boolean)
    : ["https://gallagherpropco.com", "https://www.gallagherpropco.com"];

  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
  }

  return new Set(origins);
}

function setCorsHeaders(
  res: NextResponse,
  req: NextRequest,
  origin: string,
): void {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  const requestedHeaders = req.headers.get("access-control-request-headers");
  res.headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders ?? "Content-Type, Authorization",
  );

  // Ensure caches don't incorrectly share a response across origins.
  res.headers.set("Vary", "Origin");
}

function handleApiCors(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const allowedOrigins = origin ? getAllowedOrigins() : null;
  const isAllowed = Boolean(origin && allowedOrigins?.has(origin));

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowed && origin) setCorsHeaders(res, req, origin);
    return res;
  }

  const res = NextResponse.next();
  if (isAllowed && origin) setCorsHeaders(res, req, origin);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return handleApiCors(request);
  }

  const response = NextResponse.next();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabaseConfig =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    supabaseUrl !== "undefined" &&
    supabaseUrl !== "null" &&
    supabaseAnonKey !== "undefined" &&
    supabaseAnonKey !== "null";

  if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
    return response;
  }

  // Avoid crashing middleware when auth env is missing; keep public routes reachable.
  if (!hasSupabaseConfig) {
    if (publicRoutes.includes(pathname)) {
      return response;
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "missing_supabase_config");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (publicRoutes.includes(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
