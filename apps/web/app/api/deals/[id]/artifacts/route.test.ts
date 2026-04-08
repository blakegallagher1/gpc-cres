import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealArtifactsMock,
  generateDealArtifactMock,
  uploadArtifactToGatewayMock,
  DealArtifactRouteErrorMock,
} = vi.hoisted(() => {
  class DealArtifactRouteErrorMock extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    resolveAuthMock: vi.fn(),
    listDealArtifactsMock: vi.fn(),
    generateDealArtifactMock: vi.fn(),
    uploadArtifactToGatewayMock: vi.fn(),
    DealArtifactRouteErrorMock,
  };
});

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listDealArtifacts: listDealArtifactsMock,
  generateDealArtifact: generateDealArtifactMock,
  DealArtifactRouteError: DealArtifactRouteErrorMock,
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  uploadArtifactToGateway: uploadArtifactToGatewayMock,
}));

import { GET, POST } from "./route";

describe("GET /api/deals/[id]/artifacts", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealArtifactsMock.mockReset();
    generateDealArtifactMock.mockReset();
    uploadArtifactToGatewayMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/deals/deal-1/artifacts") as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealArtifactsMock).not.toHaveBeenCalled();
  });

  it("delegates GET to the package service", async () => {
    listDealArtifactsMock.mockResolvedValue({
      artifacts: [
        { id: "artifact-1", artifactType: "TRIAGE_PDF" },
        { id: "artifact-2", artifactType: "BUYER_TEASER_PDF" },
      ],
    });

    const res = await GET(new Request("http://localhost/api/deals/deal-1/artifacts") as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      artifacts: [
        { id: "artifact-1", artifactType: "TRIAGE_PDF" },
        { id: "artifact-2", artifactType: "BUYER_TEASER_PDF" },
      ],
    });
    expect(listDealArtifactsMock).toHaveBeenCalledWith(
      { userId: "user-1", orgId: "org-1" },
      "deal-1",
    );
  });
});

describe("POST /api/deals/[id]/artifacts", () => {
  beforeEach(() => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
  });

  it("returns 400 when artifactType is missing", async () => {
    generateDealArtifactMock.mockRejectedValue(
      new DealArtifactRouteErrorMock(400, "artifactType is required"),
    );

    const res = await POST(new Request("http://localhost/api/deals/deal-1/artifacts", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    }) as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "artifactType is required" });
  });

  it("delegates POST to the package service", async () => {
    generateDealArtifactMock.mockResolvedValue({
      artifact: { id: "artifact-1", artifactType: "TRIAGE_PDF" },
    });

    const res = await POST(new Request("http://localhost/api/deals/deal-1/artifacts", {
      method: "POST",
      body: JSON.stringify({ artifactType: "TRIAGE_PDF" }),
      headers: { "Content-Type": "application/json" },
    }) as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({
      artifact: { id: "artifact-1", artifactType: "TRIAGE_PDF" },
    });
    expect(generateDealArtifactMock).toHaveBeenCalledWith(
      { userId: "user-1", orgId: "org-1" },
      "deal-1",
      "TRIAGE_PDF",
      expect.objectContaining({ artifactType: "TRIAGE_PDF" }),
      expect.any(Function),
    );
  });
});
