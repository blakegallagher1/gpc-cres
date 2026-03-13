import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  attachRequestId,
  cloneHeadersWithRequestId,
  getOrCreateRequestId,
} from "@/lib/server/requestContext";

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",      // NextAuth internal routes
  "/api/health",    // Health check (public)
];

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

function finalizeResponse(response: NextResponse, requestId: string): NextResponse {
  return attachRequestId(response, requestId);
}

function nextResponseWithRequestId(request: NextRequest, requestId: string): NextResponse {
  const headers = cloneHeadersWithRequestId(request, requestId);
  return finalizeResponse(
    NextResponse.next({
      request: { headers },
    }),
    requestId,
  );
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
    requestedHeaders ?? "Content-Type, Authorization, x-request-id",
  );

  res.headers.set("Vary", "Origin");
}

function handleApiCors(req: NextRequest, requestId: string): NextResponse {
  const origin = req.headers.get("origin");
  const allowedOrigins = origin ? getAllowedOrigins() : null;
  const isAllowed = Boolean(origin && allowedOrigins?.has(origin));

  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowed && origin) setCorsHeaders(res, req, origin);
    return finalizeResponse(res, requestId);
  }

  const res = nextResponseWithRequestId(req, requestId);
  if (isAllowed && origin) setCorsHeaders(res, req, origin);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = getOrCreateRequestId(request);

  try {
    // API routes: handle CORS only (auth is checked per-route by resolveAuth)
    if (pathname.startsWith("/api/")) {
      return handleApiCors(request, requestId);
    }

    // Dev bypass — never active in production
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
      return nextResponseWithRequestId(request, requestId);
    }

    // Allow public paths unconditionally
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    const secureCookie =
      request.url.startsWith("https://") ||
      process.env.NODE_ENV === "production";
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie,
    });

    if (isPublic) {
      // Logged-in users on /login → redirect home
      if (pathname.startsWith("/login") && token) {
        return finalizeResponse(NextResponse.redirect(new URL("/", request.url)), requestId);
      }
      return nextResponseWithRequestId(request, requestId);
    }

    // Protected route — must have valid session
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return finalizeResponse(NextResponse.redirect(loginUrl), requestId);
    }

    return nextResponseWithRequestId(request, requestId);
  } catch (error) {
    console.error(`[proxy][${requestId}]`, error);
    if (pathname.startsWith("/api/")) {
      return finalizeResponse(
        NextResponse.json({ error: "Internal server error" }, { status: 500 }),
        requestId,
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "auth_unavailable");
    return finalizeResponse(NextResponse.redirect(loginUrl), requestId);
  }
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
