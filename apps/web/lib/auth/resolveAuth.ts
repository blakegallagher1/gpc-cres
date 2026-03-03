import "server-only";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";

export type AuthResult = { userId: string; orgId: string };

export async function resolveAuth(request?: Request): Promise<AuthResult | null> {
  // 1. Dev bypass — never active in production
  if (
    process.env.NEXT_PUBLIC_DISABLE_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return { userId: "dev-user", orgId: "dev-org" };
  }

  if (!request) return null;

  const agentToolAuthMode = request.headers.get("x-agent-tool-auth");
  const agentOrgId = request.headers.get("x-agent-org-id");
  const agentUserId = request.headers.get("x-agent-user-id");
  const authHeader = request.headers.get("authorization") ?? "";
  const tokenFromHeader = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  // Accepted tokens for coordinator-memory (memory tools use MEMORY_TOOL_SERVICE_TOKEN etc.)
  const acceptedTokens = [
    process.env.AGENT_TOOL_INTERNAL_TOKEN,
    process.env.MEMORY_TOOL_SERVICE_TOKEN,
    process.env.LOCAL_API_KEY,
    process.env.COORDINATOR_TOOL_SERVICE_TOKEN,
  ]
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim());

  // 2. Coordinator-memory bypass — Prisma-only path, no token verification.
  //    This path is used by the AI coordinator for memory operations.
  if (
    tokenFromHeader &&
    acceptedTokens.length > 0 &&
    acceptedTokens.includes(tokenFromHeader) &&
    agentToolAuthMode === "coordinator-memory" &&
    typeof agentOrgId === "string" &&
    typeof agentUserId === "string" &&
    agentOrgId.length > 0 &&
    agentUserId.length > 0
  ) {
    const membership = await prisma.orgMembership.findFirst({
      where: { userId: agentUserId, orgId: agentOrgId },
      orderBy: { createdAt: "asc" },
      select: { orgId: true },
    });
    if (membership) return { userId: agentUserId, orgId: agentOrgId };
    return null;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  // 3. Unified token path — getToken handles both cookies and Authorization Bearer.
  //    For browser requests, it reads the session cookie.
  //    For Cloudflare Worker requests, it reads the Authorization header.
  const reqUrl = (request as NextRequest).url ?? "";
  const secureCookie =
    reqUrl.startsWith("https://") || process.env.NODE_ENV === "production";
  const token = await getToken({
    req: request as NextRequest,
    secret,
    secureCookie,
  });
  if (token?.userId && token?.orgId) {
    return {
      userId: token.userId as string,
      orgId: token.orgId as string,
    };
  }

  return null;
}
