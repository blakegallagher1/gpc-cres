import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  legacyTriageGetMock,
  legacyTriagePostMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  legacyTriageGetMock: vi.fn(),
  legacyTriagePostMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
  },
}));

vi.mock("../triage/route", () => ({
  GET: legacyTriageGetMock,
  POST: legacyTriagePostMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

function buildTriagePayload() {
  return {
    schema_version: "1.0",
    generated_at: "2026-03-11T12:00:00.000Z",
    deal_id: DEAL_ID,
    decision: "ADVANCE",
    recommended_path: "REZONING",
    rationale: "The parcel clears initial screening.",
    risk_scores: {
      access: 3,
      drainage: 4,
      adjacency: 2,
      env: 3,
      utilities: 2,
      politics: 5,
    },
    disqualifiers: [],
    next_actions: [
      {
        title: "Order survey",
        description: "Confirm current site conditions.",
        pipeline_step: 2,
        due_in_days: 7,
      },
    ],
    assumptions: [
      {
        assumption: "Access can be improved through curb-cut approval.",
        impact: "Supports truck circulation.",
        sources: ["Planning staff call"],
      },
    ],
    sources_summary: ["Planning staff call"],
  };
}

describe("/api/deals/[id]/screen route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    dealFindFirstMock.mockReset();
    legacyTriageGetMock.mockReset();
    legacyTriagePostMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/screen`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(dealFindFirstMock).not.toHaveBeenCalled();
    expect(legacyTriageGetMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the deal is outside the auth org", async () => {
    dealFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/screen`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Deal not found" });
    expect(legacyTriageGetMock).not.toHaveBeenCalled();
  });

  it("blocks unsupported workflow templates during Phase 3", async () => {
    dealFindFirstMock.mockResolvedValue({
      id: DEAL_ID,
      workflowTemplateKey: "DISPOSITION",
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/screen`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("ENTITLEMENT_LAND workflow screening");
    expect(legacyTriageGetMock).not.toHaveBeenCalled();
  });

  it("wraps the legacy triage payload in the generalized screen response", async () => {
    dealFindFirstMock.mockResolvedValue({
      id: DEAL_ID,
      workflowTemplateKey: null,
    });
    legacyTriageGetMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run: {
            id: "run-1",
            status: "succeeded",
            startedAt: "2026-03-11T12:00:00.000Z",
            finishedAt: "2026-03-11T12:01:00.000Z",
          },
          triage: buildTriagePayload(),
          triageScore: 0.91,
          summary: "Advance to underwriting.",
          scorecard: null,
          routing: null,
          rerun: {
            reusedPreviousRun: true,
            reason: "cache_hit",
            sourceRunId: "run-0",
          },
          sources: [{ url: "https://example.com/source", title: "Source" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/screen`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(dealFindFirstMock).toHaveBeenCalledWith({
      where: { id: DEAL_ID, orgId: ORG_ID },
      select: {
        id: true,
        workflowTemplateKey: true,
        sku: true,
      },
    });
    expect(body.run).toEqual({
      id: "run-1",
      status: "succeeded",
      startedAt: "2026-03-11T12:00:00.000Z",
      finishedAt: "2026-03-11T12:01:00.000Z",
    });
    expect(body.screen.templateKey).toBe("ENTITLEMENT_LAND");
    expect(body.screen.screenStatus).toBe("succeeded");
    expect(body.triage.decision).toBe("ADVANCE");
    expect(body.summary).toBe("Advance to underwriting.");
    expect(body.sources).toEqual([
      { url: "https://example.com/source", title: "Source" },
    ]);
  });

  it("delegates POST to the legacy triage route and returns queued screens", async () => {
    dealFindFirstMock.mockResolvedValue({
      id: DEAL_ID,
      workflowTemplateKey: "ENTITLEMENT_LAND",
    });
    legacyTriagePostMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          run: {
            id: "run-2",
            status: "started",
            startedAt: "2026-03-11T12:05:00.000Z",
          },
          triage: null,
          triageStatus: "queued",
          message: "Queued for async execution.",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/screen`, {
      method: "POST",
      body: JSON.stringify({ workflowTemplateKey: "ENTITLEMENT_LAND" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(legacyTriagePostMock).toHaveBeenCalledTimes(1);
    expect(body.run).toEqual({
      id: "run-2",
      status: "started",
      startedAt: "2026-03-11T12:05:00.000Z",
      finishedAt: null,
    });
    expect(body.screen.templateKey).toBe("ENTITLEMENT_LAND");
    expect(body.screen.screenStatus).toBe("queued");
    expect(body.summary).toBe("Queued for async execution.");
  });
});
