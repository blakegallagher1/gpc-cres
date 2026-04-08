import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, buildEvidencePackageMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  buildEvidencePackageMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  getDownloadUrlFromGateway: vi.fn(),
}));

vi.mock("@gpc/server", () => ({
  buildEvidencePackage: buildEvidencePackageMock,
  EvidenceDeliveryNotFoundError: class EvidenceDeliveryNotFoundError extends Error {},
  parseEvidenceLimit: (value: string | null, fallback: number) =>
    value == null || value.trim().length === 0 ? fallback : Number(value),
}));

import { GET } from "./route";

describe("GET /api/evidence/sources/[sourceId]/package", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    buildEvidencePackageMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/evidence/sources/source-1/package"),
      { params: Promise.resolve({ sourceId: "source-1" }) },
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(buildEvidencePackageMock).not.toHaveBeenCalled();
  });

  it("returns the package payload with attachment headers", async () => {
    resolveAuthMock.mockResolvedValue({
      orgId: "org-1",
      userId: "user-1",
    });
    buildEvidencePackageMock.mockResolvedValue({
      source: { id: "source-1" },
      generatedAt: "2026-04-08T00:00:00.000Z",
      fileCount: 1,
      snapshots: [],
    });

    const res = await GET(
      new NextRequest("http://localhost/api/evidence/sources/source-1/package?snapshotLimit=10"),
      { params: Promise.resolve({ sourceId: "source-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("evidence-package-source-1.json");
    expect(await res.json()).toEqual({
      source: { id: "source-1" },
      generatedAt: "2026-04-08T00:00:00.000Z",
      fileCount: 1,
      snapshots: [],
    });
    expect(buildEvidencePackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        sourceId: "source-1",
        snapshotLimit: 10,
      }),
    );
  });
});
