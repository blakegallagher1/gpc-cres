import "server-only";
import { auth as clerkAuth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@entitlement-os/db";
import {
  DEFAULT_LOCAL_DEV_AUTH_ORG_ID,
  DEFAULT_LOCAL_DEV_AUTH_USER_ID,
  getLocalDevAuthResult,
  isAppRouteLocalBypassEnabled,
} from "@/lib/auth/localDevBypass";

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

const clerkToPrismaCache = new Map<string, { prismaId: string; validUntil: number }>();

function getClerkToPrismaCache(clerkUserId: string): string | null {
  const entry = clerkToPrismaCache.get(clerkUserId);
  if (entry && entry.validUntil > Date.now()) return entry.prismaId;
  if (entry) clerkToPrismaCache.delete(clerkUserId);
  return null;
}

function setClerkToPrismaCache(clerkUserId: string, prismaId: string): void {
  clerkToPrismaCache.set(clerkUserId, {
    prismaId,
    validUntil: Date.now() + MEMBERSHIP_CACHE_TTL_MS,
  });
  if (clerkToPrismaCache.size > 500) {
    const firstKey = clerkToPrismaCache.keys().next().value;
    if (firstKey) clerkToPrismaCache.delete(firstKey);
  }
}

function buildAuthorizedState(auth: AuthResult): RouteAuthState {
  return {
    status: "authorized",
    auth,
  };
}

async function resolveLocalDevAuthState(): Promise<RouteAuthState> {
  const configured = getLocalDevAuthResult();
  const hasOverride = Boolean(
    process.env.LOCAL_DEV_AUTH_USER_ID?.trim() ||
      process.env.LOCAL_DEV_AUTH_ORG_ID?.trim(),
  );
  if (!hasOverride) {
    return buildAuthorizedState(configured);
  }

  try {
    const configuredMembership = await prisma.orgMembership.findFirst({
      where: { userId: configured.userId, orgId: configured.orgId },
      select: { userId: true, orgId: true },
    });
    if (configuredMembership) {
      return buildAuthorizedState(configured);
    }

    const fallbackMembership =
      (await prisma.orgMembership.findFirst({
        where: {
          userId: DEFAULT_LOCAL_DEV_AUTH_USER_ID,
          orgId: DEFAULT_LOCAL_DEV_AUTH_ORG_ID,
        },
        select: { userId: true, orgId: true },
      })) ??
      (await prisma.orgMembership.findFirst({
        orderBy: { createdAt: "asc" },
        select: { userId: true, orgId: true },
      }));
    if (fallbackMembership) {
      return buildAuthorizedState(fallbackMembership);
    }
  } catch {
    return buildAuthorizedState(configured);
  }

  return buildAuthorizedState(configured);
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
    return resolveLocalDevAuthState();
  }

  if (!request) {
    return { status: "unauthenticated" };
  }

  const coordinatorAuth = await resolveCoordinatorToolAuth(request);
  if (coordinatorAuth) {
    return buildAuthorizedState(coordinatorAuth);
  }

  const { userId: clerkUserId } = await clerkAuth();
  if (!clerkUserId) {
    return { status: "unauthenticated" };
  }

  const cachedPrismaId = getClerkToPrismaCache(clerkUserId);
  let prismaUserId: string;

  if (cachedPrismaId) {
    prismaUserId = cachedPrismaId;
  } else {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      return { status: "unauthenticated" };
    }

    const dbUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (!dbUser) {
      return { status: "unauthenticated" };
    }

    setClerkToPrismaCache(clerkUserId, dbUser.id);
    prismaUserId = dbUser.id;
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId: prismaUserId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!membership) {
    return { status: "unauthenticated" };
  }

  setMembershipCache(prismaUserId, membership.orgId);
  return buildAuthorizedState({ userId: prismaUserId, orgId: membership.orgId });
}

async function resolveAdminRouteAuthState(localBypassEnabled: boolean): Promise<RouteAuthState> {
  if (localBypassEnabled) {
    return buildAuthorizedState({
      userId: "local-dev-user",
      orgId: "local-dev-org",
    });
  }

  const [{ isEmailAllowed }] = await Promise.all([
    import("@/lib/auth/allowedEmails"),
  ]);

  const user = await currentUser();
  if (!user) {
    return { status: "unauthenticated" };
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!isEmailAllowed(email)) {
    return { status: "forbidden" };
  }

  const cachedPrismaId = email ? getClerkToPrismaCache(user.id) : null;
  let prismaUserId: string;

  if (cachedPrismaId) {
    prismaUserId = cachedPrismaId;
  } else {
    if (!email) {
      return { status: "unauthenticated" };
    }
    const dbUser = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (!dbUser) {
      return { status: "unauthenticated" };
    }
    setClerkToPrismaCache(user.id, dbUser.id);
    prismaUserId = dbUser.id;
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId: prismaUserId },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!membership) {
    return { status: "unauthenticated" };
  }

  return buildAuthorizedState({ userId: prismaUserId, orgId: membership.orgId });
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
