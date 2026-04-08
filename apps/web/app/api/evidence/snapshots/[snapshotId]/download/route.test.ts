import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, buildEvidenceSnapshotDownloadMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  buildEvidenceSnapshotDownloadMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  getDownloadUrlFromGateway: vi.fn(),
}));

vi.mock("@gpc/server", () => ({
  buildEvidenceSnapshotDownload: buildEvidenceSnapshotDownloadMock,
  EvidenceDeliveryNotFoundError: class EvidenceDeliveryNotFoundError extends Error {},
  parseEvidenceDownloadKind: (value: string | null) =>
    value === "text" || value === "snapshot" ? value : "snapshot",
}));

import { GET } from "./route";

describe("GET /api/evidence/snapshots/[snapshotId]/download", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    buildEvidenceSnapshotDownloadMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/evidence/snapshots/snap-1/download"),
      { params: Promise.resolve({ snapshotId: "snap-1" }) },
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(buildEvidenceSnapshotDownloadMock).not.toHaveBeenCalled();
  });

  it("returns the package-managed download payload", async () => {
    resolveAuthMock.mockResolvedValue({
      orgId: "org-1",
      userId: "user-1",
    });
    buildEvidenceSnapshotDownloadMock.mockResolvedValue({
      url: "https://download.test/snap-1",
      filename: "snap-1.bin",
      contentType: "application/pdf",
      snapshotId: "snap-1",
      variant: "snapshot",
    });

    const res = await GET(
      new NextRequest("http://localhost/api/evidence/snapshots/snap-1/download?kind=snapshot"),
      { params: Promise.resolve({ snapshotId: "snap-1" }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://download.test/snap-1",
      filename: "snap-1.bin",
      contentType: "application/pdf",
      snapshotId: "snap-1",
      variant: "snapshot",
    });
    expect(buildEvidenceSnapshotDownloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        snapshotId: "snap-1",
        kind: "snapshot",
      }),
    );
  });
});
