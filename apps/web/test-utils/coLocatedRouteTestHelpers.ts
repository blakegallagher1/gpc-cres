import { NextRequest } from "next/server";
import { beforeEach, expect, vi } from "vitest";

export const {
  resolveAuthMock,
  authorizeApiRouteMock,
} = {
  resolveAuthMock: vi.fn(),
  authorizeApiRouteMock: vi.fn(),
};

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

export function setupRouteAuthMocks() {
  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    authorizeApiRouteMock.mockReset();
  });
}

type MethodName = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type RouteContext = {
  params?: Promise<Record<string, string>>;
};

type ResolveAuthOptions = {
  loadRoute: () => Promise<Record<string, unknown>>;
  method: MethodName;
  url: string;
  body?: unknown;
  context?: RouteContext;
};

export async function expectResolveAuthUnauthorized(options: ResolveAuthOptions) {
  const { loadRoute, method, url, body, context } = options;
  resolveAuthMock.mockResolvedValue(null);
  const mod = await loadRoute();
  const handler = mod[method] as
    | ((request: NextRequest, context?: RouteContext) => Promise<Response>)
    | undefined;
  if (!handler) {
    throw new Error(`Missing handler for method ${method}`);
  }

  const request = new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  const response = await handler(request, context);
  expect(response.status).toBe(401);
}

type AuthorizeApiRouteOptions = {
  loadRoute: () => Promise<Record<string, unknown>>;
  method: MethodName;
  url: string;
  body?: unknown;
  context?: RouteContext;
  unauthorizedStatus?: number;
};

export async function expectAuthorizeApiRouteUnauthorized(
  options: AuthorizeApiRouteOptions,
) {
  const { loadRoute, method, url, body, context, unauthorizedStatus = 401 } = options;
  authorizeApiRouteMock.mockResolvedValue({
    ok: true,
    auth: null,
  });
  const mod = await loadRoute();
  const handler = mod[method] as
    | ((request: NextRequest, context?: RouteContext) => Promise<Response>)
    | undefined;
  if (!handler) {
    throw new Error(`Missing handler for method ${method}`);
  }

  const request = new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  const response = await handler(request, context);
  expect(response.status).toBe(unauthorizedStatus);
}
