import "server-only";

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import {
  API_ENDPOINT_SCOPE_MATRIX,
  API_KEY_REGISTRY,
  type ApiKeyDefinition,
  type ApiKeyScope,
  type EndpointScopeRule,
} from "./apiKeyRegistry";
import { resolveAuth, resolveRouteAuth, type AuthResult } from "./routeAuth";

type AuthorizedBy =
  | "public"
  | "session"
  | "admin_session"
  | "service_key"
  | "webhook_key";

export interface RouteAuthorizationSuccess {
  ok: true;
  auth: AuthResult | null;
  authorizedBy: AuthorizedBy;
  rule: EndpointScopeRule;
  key: ApiKeyDefinition | null;
}

export interface RouteAuthorizationFailure {
  ok: false;
  response: NextResponse;
}

export type RouteAuthorizationResult =
  | RouteAuthorizationSuccess
  | RouteAuthorizationFailure;

const MEMBERSHIP_CACHE_TTL_MS = 60_000;
const membershipCache = new Map<string, number>();

function timingSafeTokenMatch(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }

  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
      return false;
    }
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function getScopedHeader(
  request: NextRequest,
  primaryName: string,
  fallbackName?: string,
): string | null {
  const primary = request.headers.get(primaryName)?.trim();
  if (primary) {
    return primary;
  }

  if (!fallbackName) {
    return null;
  }

  const fallback = request.headers.get(fallbackName)?.trim();
  return fallback || null;
}

function getRule(routePattern: string): EndpointScopeRule {
  const rule = API_ENDPOINT_SCOPE_MATRIX.find((candidate) => {
    if (candidate.routePattern === routePattern) {
      return true;
    }

    if (!candidate.routePattern.endsWith("/**")) {
      return false;
    }

    const basePattern = candidate.routePattern.slice(0, -3);
    return routePattern === basePattern || routePattern.startsWith(`${basePattern}/`);
  });
  if (!rule) {
    throw new Error(`Missing API endpoint scope matrix entry for route '${routePattern}'`);
  }
  return rule;
}

function getKeyEnvCandidates(keyId: ApiKeyDefinition["keyId"]): string[] {
  switch (keyId) {
    case "coordinator_service_key":
      return [
        "GPC_COORDINATOR_SERVICE_KEY",
        "COORDINATOR_TOOL_SERVICE_TOKEN",
        "AGENT_TOOL_INTERNAL_TOKEN",
        "LOCAL_API_KEY",
      ];
    case "memory_service_key":
      return [
        "GPC_MEMORY_SERVICE_KEY",
        "MEMORY_TOOL_SERVICE_TOKEN",
      ];
    case "admin_control_key":
      return [
        "GPC_ADMIN_CONTROL_KEY",
        "ADMIN_API_KEY",
        "HEALTHCHECK_TOKEN",
        "VERCEL_ACCESS_TOKEN",
      ];
    case "webhook_ingest_key":
      return [
        "GPC_WEBHOOK_INGEST_KEY",
        "SENTINEL_WEBHOOK_SECRET",
        "CRON_SECRET",
      ];
    case "gateway_service_key":
      return [
        "GPC_GATEWAY_SERVICE_KEY",
      ];
    case "public_publishable_key":
      return ["NEXT_PUBLIC_GPC_PUBLISHABLE_KEY"];
    case "ephemeral_client_token":
      return [];
    default:
      return [];
  }
}

function getConfiguredSecrets(key: ApiKeyDefinition): string[] {
  const envNames = [key.envVar, ...getKeyEnvCandidates(key.keyId)];
  return envNames
    .map((envName) => process.env[envName]?.trim() || "")
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function hasRequiredScopes(
  key: ApiKeyDefinition,
  requiredScopes: readonly ApiKeyScope[],
): boolean {
  return requiredScopes.every((scope) => key.scopes.includes(scope));
}

function isMembershipCached(userId: string, orgId: string): boolean {
  const cacheKey = `${userId}:${orgId}`;
  const validUntil = membershipCache.get(cacheKey);
  if (!validUntil) {
    return false;
  }
  if (validUntil <= Date.now()) {
    membershipCache.delete(cacheKey);
    return false;
  }
  return true;
}

function cacheMembership(userId: string, orgId: string): void {
  membershipCache.set(`${userId}:${orgId}`, Date.now() + MEMBERSHIP_CACHE_TTL_MS);
}

async function resolveScopedActor(
  request: NextRequest,
  key: ApiKeyDefinition,
): Promise<AuthResult | null> {
  const orgId = getScopedHeader(request, "x-gpc-org-id", "x-agent-org-id");
  const headerUserId = getScopedHeader(request, "x-gpc-user-id", "x-agent-user-id");

  if (!orgId) {
    return null;
  }

  if (!key.orgScoped) {
    return {
      orgId,
      userId: headerUserId ?? `service:${key.keyId}`,
    };
  }

  if (headerUserId) {
    if (isMembershipCached(headerUserId, orgId)) {
      return { orgId, userId: headerUserId };
    }

    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId: headerUserId,
        orgId,
      },
      select: { orgId: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return null;
    }

    cacheMembership(headerUserId, orgId);
    return { orgId, userId: headerUserId };
  }

  return {
    orgId,
    userId: `service:${key.keyId}`,
  };
}

function unauthorized(message: string, status = 401): RouteAuthorizationFailure {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status }),
  };
}

async function tryServiceKeyAuthorization(
  request: NextRequest,
  rule: EndpointScopeRule,
): Promise<RouteAuthorizationSuccess | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  for (const key of API_KEY_REGISTRY) {
    if (!hasRequiredScopes(key, rule.scopes)) {
      continue;
    }

    const configuredSecrets = getConfiguredSecrets(key);
    if (configuredSecrets.length === 0) {
      continue;
    }

    const matches = configuredSecrets.some((secret) => timingSafeTokenMatch(secret, token));
    if (!matches) {
      continue;
    }

    if (rule.authMode === "webhook") {
      return {
        ok: true,
        auth: null,
        authorizedBy: "webhook_key",
        rule,
        key,
      };
    }

    const auth = await resolveScopedActor(request, key);
    if (!auth) {
      return null;
    }

    const authorizedBy: AuthorizedBy =
      key.storageClass === "internal" ? "service_key" : "service_key";

    return {
      ok: true,
      auth,
      authorizedBy,
      rule,
      key,
    };
  }

  return null;
}

async function trySessionAuthorization(
  request: NextRequest,
  rule: EndpointScopeRule,
): Promise<RouteAuthorizationSuccess | null> {
  if (rule.authMode === "admin") {
    const state = await resolveRouteAuth({
      kind: "admin",
      localBypassEnabled: process.env.NEXT_PUBLIC_DISABLE_AUTH === "true",
    });

    if (state.status !== "authorized") {
      return null;
    }

    return {
      ok: true,
      auth: state.auth,
      authorizedBy: "admin_session",
      rule,
      key: null,
    };
  }

  const auth = await resolveAuth(request);
  if (!auth) {
    return null;
  }

  return {
    ok: true,
    auth,
    authorizedBy: "session",
    rule,
    key: null,
  };
}

export async function authorizeApiRoute(
  request: NextRequest,
  routePattern: string,
): Promise<RouteAuthorizationResult> {
  const rule = getRule(routePattern);

  if (rule.authMode === "public") {
    return {
      ok: true,
      auth: null,
      authorizedBy: "public",
      rule,
      key: null,
    };
  }

  if (rule.authMode === "webhook") {
    const serviceResult = await tryServiceKeyAuthorization(request, rule);
    return serviceResult ?? unauthorized("Unauthorized");
  }

  if (rule.authMode === "internal_only") {
    const serviceResult = await tryServiceKeyAuthorization(request, rule);
    return serviceResult ?? unauthorized("Unauthorized");
  }

  if (rule.authMode === "admin") {
    const serviceResult = await tryServiceKeyAuthorization(request, rule);
    if (serviceResult) {
      return serviceResult;
    }

    const sessionResult = await trySessionAuthorization(request, rule);
    return sessionResult ?? unauthorized("Unauthorized");
  }

  if (rule.authMode === "session") {
    const sessionResult = await trySessionAuthorization(request, rule);
    return sessionResult ?? unauthorized("Unauthorized");
  }

  if (
    rule.authMode === "session_or_ephemeral" ||
    rule.authMode === "service_or_session" ||
    rule.authMode === "service"
  ) {
    const sessionResult = await trySessionAuthorization(request, rule);
    if (sessionResult) {
      return sessionResult;
    }

    const serviceResult = await tryServiceKeyAuthorization(request, rule);
    return serviceResult ?? unauthorized("Unauthorized");
  }

  if (rule.authMode === "publishable_exchange") {
    const serviceResult = await tryServiceKeyAuthorization(request, rule);
    return serviceResult ?? unauthorized("Unauthorized");
  }

  return unauthorized("Unauthorized");
}
