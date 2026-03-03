import { NextResponse, type NextRequest } from "next/server";
import { getToken, encode } from "next-auth/jwt";

/**
 * GET /api/auth/token
 *
 * Returns a signed JWT for the authenticated user. The browser calls this
 * before opening the WebSocket to the Cloudflare Agent Worker, which needs
 * a Bearer token it can verify.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Auth not configured" },
      { status: 500 },
    );
  }

  const useSecureCookies =
    request.url.startsWith("https://") ||
    process.env.NODE_ENV === "production";
  const token = await getToken({ req: request, secret, secureCookie: useSecureCookies });
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const salt = useSecureCookies
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const signed = await encode({ token, secret, salt });

  return NextResponse.json({ token: signed });
}
