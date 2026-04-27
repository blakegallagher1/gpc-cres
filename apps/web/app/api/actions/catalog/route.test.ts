import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTemplatesMock, resolveAuthMock } = vi.hoisted(() => ({
  listTemplatesMock: vi.fn(),
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server/workflows/workflow-orchestrator.service", () => ({
  listTemplates: listTemplatesMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/actions/catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
    listTemplatesMock.mockReturnValue([
      {
        key: "QUICK_SCREEN",
        label: "Quick screen",
        description: "Screen a matter",
        stepLabels: ["Hydrate", "Score"],
      },
      {
        key: "ACQUISITION_PATH",
        label: "Acquisition path",
        description: "Build a decision packet",
        stepLabels: ["Hydrate", "Gate", "Packet"],
      },
    ]);
  });

  it("returns typed chat actions for the authenticated org", async () => {
    const res = await GET(new NextRequest("http://localhost/api/actions/catalog"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actions).toHaveLength(2);
    expect(body.actions[0]).toMatchObject({
      id: "SCREEN_PARCEL",
      templateKey: "QUICK_SCREEN",
      workflow: { key: "QUICK_SCREEN", stepLabels: ["Hydrate", "Score"] },
    });
    expect(body.actions[1]).toMatchObject({
      id: "RUN_ACQUISITION_PATH",
      templateKey: "ACQUISITION_PATH",
    });
  });

  it("requires auth", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/actions/catalog"));

    expect(res.status).toBe(401);
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });
});
