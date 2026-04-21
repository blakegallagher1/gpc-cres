import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { getHealthStatusSnapshot, userHasHealthAccess } from "@gpc/server";

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

  const { userId } = getAuth(request);
  if (!userId) {
    return false;
  }

  return userHasHealthAccess(userId);
}

export async function GET(request: NextRequest) {
  const authorized = await isAuthorized(request);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getHealthStatusSnapshot({
    authSecretConfigured: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
    localApiUrlConfigured: Boolean(process.env.LOCAL_API_URL?.trim()),
    localApiKeyConfigured: Boolean(process.env.LOCAL_API_KEY?.trim()),
  });

  return NextResponse.json(
    payload,
    { status: payload.status === "ok" ? 200 : 500 }
  );
}
