import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  fetchKnowledgeExportRowsMock,
  fetchMemoryExportRowsMock,
  formatKnowledgeCsvHeaderMock,
  formatKnowledgeCsvRowMock,
  formatMemoryCsvHeaderMock,
  formatMemoryCsvRowMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  fetchKnowledgeExportRowsMock: vi.fn(),
  fetchMemoryExportRowsMock: vi.fn(),
  formatKnowledgeCsvHeaderMock: vi.fn(),
  formatKnowledgeCsvRowMock: vi.fn(),
  formatMemoryCsvHeaderMock: vi.fn(),
  formatMemoryCsvRowMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/admin/export.service", () => ({
  fetchKnowledgeExportRows: fetchKnowledgeExportRowsMock,
  fetchMemoryExportRows: fetchMemoryExportRowsMock,
  formatKnowledgeCsvHeader: formatKnowledgeCsvHeaderMock,
  formatKnowledgeCsvRow: formatKnowledgeCsvRowMock,
  formatMemoryCsvHeader: formatMemoryCsvHeaderMock,
  formatMemoryCsvRow: formatMemoryCsvRowMock,
}));

import { POST } from "./route";

describe("POST /api/admin/export", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    fetchKnowledgeExportRowsMock.mockReset();
    fetchMemoryExportRowsMock.mockReset();
    formatKnowledgeCsvHeaderMock.mockReset();
    formatKnowledgeCsvRowMock.mockReset();
    formatMemoryCsvHeaderMock.mockReset();
    formatMemoryCsvRowMock.mockReset();

    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
      authorizedBy: "admin_session",
      rule: { routePattern: "/api/admin/export", authMode: "session", scopes: [] },
      key: null,
    });

    formatKnowledgeCsvHeaderMock.mockReturnValue("id,content_type,source_id,content_text,created_at\n");
    formatKnowledgeCsvRowMock.mockImplementation((row: { id: string }) => `${row.id},...\n`);
    formatMemoryCsvHeaderMock.mockReturnValue("id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt\n");
    formatMemoryCsvRowMock.mockImplementation((row: { id: string }) => `${row.id},...\n`);
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

  it("streams a knowledge CSV export using service functions", async () => {
    fetchKnowledgeExportRowsMock.mockResolvedValue([
      { id: "row-1" },
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
    expect(fetchKnowledgeExportRowsMock).toHaveBeenCalledWith("org-1");
    expect(formatKnowledgeCsvHeaderMock).toHaveBeenCalled();
    expect(formatKnowledgeCsvRowMock).toHaveBeenCalledWith({ id: "row-1" });
    expect(body).toContain("id,content_type,source_id,content_text,created_at");
    expect(body).toContain("row-1,...");
  });

  it("streams a memory CSV export using service functions", async () => {
    fetchMemoryExportRowsMock.mockResolvedValue([
      { id: "mem-1" },
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
    expect(fetchMemoryExportRowsMock).toHaveBeenCalledWith("org-1");
    expect(formatMemoryCsvHeaderMock).toHaveBeenCalled();
    expect(formatMemoryCsvRowMock).toHaveBeenCalledWith({ id: "mem-1" });
    expect(body).toContain("id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt");
    expect(body).toContain("mem-1,...");
  });
});
