import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, entityFindFirstMock, entityUpdateMock, entityDeleteMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  entityFindFirstMock: vi.fn(),
  entityUpdateMock: vi.fn(),
  entityDeleteMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    entity: {
      findFirst: entityFindFirstMock,
      update: entityUpdateMock,
      delete: entityDeleteMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { DELETE, GET, PATCH } from "./route";

describe("/api/entities/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    entityFindFirstMock.mockReset();
    entityUpdateMock.mockReset();
    entityDeleteMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 from GET when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/entities/entity-1"), {
      params: Promise.resolve({ id: "entity-1" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 from GET when entity is missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    entityFindFirstMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/entities/entity-1"), {
      params: Promise.resolve({ id: "entity-1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Entity not found" });
  });

  it("returns entity detail from GET", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    entityFindFirstMock.mockResolvedValue({ id: "entity-1", name: "Parent LLC" });

    const res = await GET(new NextRequest("http://localhost/api/entities/entity-1"), {
      params: Promise.resolve({ id: "entity-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entity: { id: "entity-1", name: "Parent LLC" } });
    expect(entityFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "entity-1", orgId: "org-1" } }),
    );
  });

  it("updates allowed fields via PATCH", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    entityFindFirstMock.mockResolvedValue({ id: "entity-1", name: "Parent LLC" });
    entityUpdateMock.mockResolvedValue({ id: "entity-1", name: "Updated LLC", state: "LA" });

    const req = new NextRequest("http://localhost/api/entities/entity-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated LLC", state: "LA", taxId: "12-345" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "entity-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entity: { id: "entity-1", name: "Updated LLC", state: "LA" },
    });
    expect(entityUpdateMock).toHaveBeenCalledWith({
      where: { id: "entity-1" },
      data: { name: "Updated LLC", state: "LA", taxId: "12-345" },
    });
  });

  it("deletes an existing entity", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    entityFindFirstMock.mockResolvedValue({ id: "entity-1", name: "Parent LLC" });

    const req = new NextRequest("http://localhost/api/entities/entity-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "entity-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(entityDeleteMock).toHaveBeenCalledWith({ where: { id: "entity-1" } });
  });
});