import "server-only";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";
import { getAuthSecret } from "@/lib/auth/authSecret";

/**
 * Server-derived route auth identity.
 */
export type AuthResult = { userId: string; orgId: string };

/**
 * Unified route auth state shared by app routes and admin routes.
 */
export type RouteAuthState =
  | {
      status: "authorized";
      auth: AuthResult;
    }
  | {
      status: "unauthenticated";
    }
  | {
      status: "forbidden";
    };

type ResolveRouteAuthOptions =
  | {
      kind: "app";
      request?: Request;
    }
  | {
      kind: "admin";
      localBypassEnabled: boolean;
    };

const DEFAULT_LOCAL_DEV_AUTH_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_LOCAL_DEV_AUTH_USER_ID = "00000000-0000-0000-0000-000000000003";
const MEMBERSHIP_CACHE_TTL_MS = 60_000;

const membershipCache = new Map<string, { validUntil: number }>();

function checkMembershipCache(userId: string, orgId: string): boolean {
  const key = `${userId}:${orgId}`;
  const entry = membershipCache.get(key);
  if (entry && entry.validUntil > Date.now()) return true;
  if (entry) membershipCache.delete(key);
  return false;
}

function setMembershipCache(userId: string, orgId: string): void {
  const key = `${userId}:${orgId}`;
  membershipCache.set(key, { validUntil: Date.now() + MEMBERSHIP_CACHE_TTL_MS });
  if (membershipCache.size > 500) {
    const firstKey = membershipCache.keys().next().value;
    if (firstKey) membershipCache.delete(firstKey);
  }
}

function buildAuthorizedState(auth: AuthResult): RouteAuthState {
  return {
    status: "authorized",
    auth,
  };
}

function getLocalDevAuthResult(): AuthResult {
  const userId = process.env.LOCAL_DEV_AUTH_USER_ID?.trim() || DEFAULT_LOCAL_DEV_AUTH_USER_ID;
  const orgId = process.env.LOCAL_DEV_AUTH_ORG_ID?.trim() || DEFAULT_LOCAL_DEV_AUTH_ORG_ID;
  return { userId, orgId };
}

function isAppRouteLocalBypassEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH !== "true") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.NEXT_PUBLIC_E2E === "true";
}

async function resolveCoordinatorToolAuth(request: Request): Promise<AuthResult | null> {
  const agentToolAuthMode = request.headers.get("x-agent-tool-auth");
  const agentOrgId = request.headers.get("x-agent-org-id");
  const agentUserId = request.headers.get("x-agent-user-id");
  const authHeader = request.headers.get("authorization") ?? "";
  const tokenFromHeader = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  const acceptedTokens = [
    process.env.AGENT_TOOL_INTERNAL_TOKEN,
    process.env.MEMORY_TOOL_SERVICE_TOKEN,
    process.env.LOCAL_API_KEY,
    process.env.COORDINATOR_TOOL_SERVICE_TOKEN,
  ]
    .filter((token): token is string => typeof token === "string" && token.trim().length > 0)
    .map((token) => token.trim());

  if (
    !tokenFromHeader ||
    acceptedTokens.length === 0 ||
    !acceptedTokens.includes(tokenFromHeader) ||
    agentToolAuthMode !== "coordinator-memory" ||
    typeof agentOrgId !== "string" ||
    typeof agentUserId !== "string" ||
    agentOrgId.length === 0 ||
    agentUserId.length === 0
  ) {
    return null;
  }

  if (checkMembershipCache(agentUserId, agentOrgId)) {
    return { userId: agentUserId, orgId: agentOrgId };
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId: agentUserId, orgId: agentOrgId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });

  if (!membership) {
    return null;
  }

  setMembershipCache(agentUserId, agentOrgId);
  return { userId: agentUserId, orgId: agentOrgId };
}

async function resolveAppRouteAuthState(request?: Request): Promise<RouteAuthState> {
  if (isAppRouteLocalBypassEnabled()) {
    return buildAuthorizedState(getLocalDevAuthResult());
  }

  if (!request) {
    return { status: "unauthenticated" };
  }

  const coordinatorAuth = await resolveCoordinatorToolAuth(request);
  if (coordinatorAuth) {
    return buildAuthorizedState(coordinatorAuth);
  }

  const secret = getAuthSecret();
  if (!secret) {
    return { status: "unauthenticated" };
  }

  const requestUrl = (request as NextRequest).url ?? "";
  const secureCookie =
    requestUrl.startsWith("https://") || process.env.NODE_ENV === "production";
  const token = await getToken({
    req: request as NextRequest,
    secret,
    secureCookie,
  });

  if (token?.userId && token?.orgId) {
    return buildAuthorizedState({
      userId: token.userId as string,
      orgId: token.orgId as string,
    });
  }

  return { status: "unauthenticated" };
}

async function resolveAdminRouteAuthState(localBypassEnabled: boolean): Promise<RouteAuthState> {
  if (localBypassEnabled) {
    return buildAuthorizedState({
      userId: "local-dev-user",
      orgId: "local-dev-org",
    });
  }

  const [{ auth }, { isEmailAllowed }] = await Promise.all([
    import("@/auth"),
    import("@/lib/auth/allowedEmails"),
  ]);
  const session = await auth();
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  if (!isEmailAllowed(session.user.email)) {
    return { status: "forbidden" };
  }

  const userId = session.user.id;
  const orgId = (session.user as { orgId?: string | null }).orgId;
  if (!userId || !orgId) {
    return { status: "unauthenticated" };
  }

  return buildAuthorizedState({ userId, orgId });
}

/**
 * Resolves unified auth state for app routes and admin routes.
 */
export async function resolveRouteAuth(
  options: ResolveRouteAuthOptions,
): Promise<RouteAuthState> {
  if (options.kind === "app") {
    return resolveAppRouteAuthState(options.request);
  }

  return resolveAdminRouteAuthState(options.localBypassEnabled);
}

/**
 * Backwards-compatible app route auth helper.
 */
export async function resolveAuth(request?: Request): Promise<AuthResult | null> {
  const state = await resolveRouteAuth({ kind: "app", request });
  return state.status === "authorized" ? state.auth : null;
}
