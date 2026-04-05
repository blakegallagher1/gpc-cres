import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  queryRawUnsafeMock,
  memoryVerifiedFindManyMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  queryRawUnsafeMock: vi.fn(),
  memoryVerifiedFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafeMock,
    memoryVerified: {
      findMany: memoryVerifiedFindManyMock,
    },
  },
}));

import { POST } from "./route";

describe("POST /api/admin/export", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    queryRawUnsafeMock.mockReset();
    memoryVerifiedFindManyMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
      authorizedBy: "admin_session",
      rule: { routePattern: "/api/admin/export", authMode: "session", scopes: [] },
      key: null,
    });
  });

  it("returns the authorization response when access is denied", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/export", {
        method: "POST",
        body: JSON.stringify({ type: "knowledge" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for an invalid export type", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/export", {
        method: "POST",
        body: JSON.stringify({ type: "invalid" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid export type" });
  });

  it("streams a knowledge CSV export scoped to the authenticated org", async () => {
    queryRawUnsafeMock.mockResolvedValue([
      {
        id: "row-1",
        content_type: "memo",
        source_id: "source-1",
        content_text: 'Alpha "quoted" text',
        created_at: new Date("2026-04-04T00:00:00.000Z"),
      },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/admin/export", {
        method: "POST",
        body: JSON.stringify({ type: "knowledge" }),
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("knowledge_export_");
    expect(queryRawUnsafeMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM knowledge_embeddings WHERE org_id = $1::uuid"),
      "org-1",
      50000,
    );
    expect(body).toContain("id,content_type,source_id,content_text,created_at");
    expect(body).toContain('row-1,memo,source-1,"Alpha ""quoted"" text",2026-04-04T00:00:00.000Z');
  });

  it("streams a memory CSV export scoped to the authenticated org", async () => {
    memoryVerifiedFindManyMock.mockResolvedValue([
      {
        id: "mem-1",
        entityId: "entity-1",
        factType: "ZONING",
        sourceType: "HUMAN_REVIEW",
        economicWeight: 0.8,
        payloadJson: { district: "M-1" },
        createdAt: new Date("2026-04-04T12:30:00.000Z"),
        entity: {
          canonicalAddress: '100 Main "Yard" St',
        },
      },
    ]);

    const response = await POST(
      new NextRequest("http://localhost/api/admin/export", {
        method: "POST",
        body: JSON.stringify({ type: "memory" }),
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("memory_export_");
    expect(memoryVerifiedFindManyMock).toHaveBeenCalledWith({
      where: { orgId: "org-1" },
      orderBy: { createdAt: "desc" },
      take: 50000,
      include: { entity: { select: { canonicalAddress: true } } },
    });
    expect(body).toContain("id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt");
    expect(body).toContain('mem-1,entity-1,"100 Main ""Yard"" St",ZONING,HUMAN_REVIEW,0.8,"{""district"":""M-1""}"');
  });
});