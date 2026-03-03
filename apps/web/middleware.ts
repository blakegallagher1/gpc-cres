import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",      // NextAuth internal routes
  "/api/health",    // Health check (public)
  "/api/external/", // ChatGPT plugin routes (auth inside)
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    // API routes: handle CORS only (auth is checked per-route by resolveAuth)
    if (pathname.startsWith("/api/")) {
      return handleApiCors(request);
    }

    // Dev bypass — never active in production
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
      return NextResponse.next();
    }

    // Allow public paths unconditionally
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });

    if (isPublic) {
      // Logged-in users on /login → redirect home
      if (pathname.startsWith("/login") && token) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    }

    // Protected route — must have valid session
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error("[middleware]", error);
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "auth_unavailable");
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
