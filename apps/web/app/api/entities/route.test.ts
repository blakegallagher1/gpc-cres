import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, entityFindManyMock, entityFindFirstMock, entityCreateMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  entityFindManyMock: vi.fn(),
  entityFindFirstMock: vi.fn(),
  entityCreateMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    entity: {
      findMany: entityFindManyMock,
      findFirst: entityFindFirstMock,
      create: entityCreateMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { GET, POST } from "./route";

describe("/api/entities route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    entityFindManyMock.mockReset();
    entityFindFirstMock.mockReset();
    entityCreateMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 from GET when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/entities"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns entities scoped to the auth org", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });
    entityFindManyMock.mockResolvedValue([{ id: "entity-1", name: "Parent LLC" }]);

    const res = await GET(new NextRequest("http://localhost/api/entities"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entities: [{ id: "entity-1", name: "Parent LLC" }],
    });
    expect(entityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("returns 500 from GET when entity lookup fails", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    const error = new Error("entity lookup failed");
    entityFindManyMock.mockRejectedValue(error);

    const res = await GET(new NextRequest("http://localhost/api/entities"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load entities", entities: [] });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { route: "api.entities", method: "GET" } }),
    );
  });

  it("returns 400 from POST when required fields are missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const req = new NextRequest("http://localhost/api/entities", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name and entityType are required" });
  });

  it("creates a new entity after validating parent ownership", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    entityFindFirstMock.mockResolvedValue({ id: "parent-1" });
    entityCreateMock.mockResolvedValue({ id: "entity-2", name: "Child LLC" });

    const req = new NextRequest("http://localhost/api/entities", {
      method: "POST",
      body: JSON.stringify({
        name: "Child LLC",
        entityType: "LLC",
        parentId: "parent-1",
        ownershipPct: 80,
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ entity: { id: "entity-2", name: "Child LLC" } });
    expect(entityFindFirstMock).toHaveBeenCalledWith({
      where: { id: "parent-1", orgId: "org-1" },
    });
    expect(entityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        name: "Child LLC",
        entityType: "LLC",
        parentId: "parent-1",
        ownershipPct: 80,
      }),
    });
  });
});