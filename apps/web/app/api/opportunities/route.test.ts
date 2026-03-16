import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const {
  resolveAuthMock,
  getOpportunitiesMock,
  markSeenBulkMock,
  dismissMatchBulkMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getOpportunitiesMock: vi.fn(),
  markSeenBulkMock: vi.fn(),
  dismissMatchBulkMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/saved-search.service", () => ({
  SavedSearchService: class MockSavedSearchService {
    getOpportunities = getOpportunitiesMock;
    markSeenBulk = markSeenBulkMock;
    dismissMatchBulk = dismissMatchBulkMock;
  },
}));

import { GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SEARCH_ID = "33333333-3333-4333-8333-333333333333";
const MATCH_ID = "44444444-4444-4444-8444-444444444444";

describe("/api/opportunities route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getOpportunitiesMock.mockReset();
    markSeenBulkMock.mockReset();
    dismissMatchBulkMock.mockReset();
    resolveAuthMock.mockResolvedValue({ orgId: ORG_ID, userId: USER_ID });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/opportunities");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getOpportunitiesMock).not.toHaveBeenCalled();
  });

  it("returns 400 when savedSearchId is not a valid UUID", async () => {
    const req = new NextRequest(
      "http://localhost/api/opportunities?savedSearchId=not-a-uuid",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "savedSearchId must be a valid UUID" });
    expect(getOpportunitiesMock).not.toHaveBeenCalled();
  });

  it("returns opportunity theses for the scoped user", async () => {
    getOpportunitiesMock.mockResolvedValue({
      opportunities: [
        {
          id: MATCH_ID,
          priorityScore: 92,
          feedbackSignal: "new",
          thesis: {
            summary: "123 Main St is a high-conviction infill site.",
            whyNow: "Recent pursued opportunities cluster in the same parish.",
            angle: "Immediate owner outreach.",
            nextBestAction: "Create deal and underwrite access constraints.",
            confidence: 0.84,
            keyRisks: ["Verify easements"],
            signals: ["Parish fit", "Acreage fit"],
          },
        },
      ],
      total: 1,
    });

    const req = new NextRequest(
      `http://localhost/api/opportunities?limit=15&offset=5&savedSearchId=${SEARCH_ID}`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getOpportunitiesMock).toHaveBeenCalledWith(
      ORG_ID,
      USER_ID,
      15,
      5,
      SEARCH_ID,
    );
    expect(body.total).toBe(1);
    expect(body.opportunities[0]?.priorityScore).toBe(92);
  });

  it("passes scoped service errors through on bulk update", async () => {
    markSeenBulkMock.mockRejectedValue(new AppError("Forbidden", "FORBIDDEN", 403));

    const req = new NextRequest("http://localhost/api/opportunities", {
      method: "PATCH",
      body: JSON.stringify({ action: "seen", ids: [MATCH_ID] }),
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("validates bulk payloads and updates seen matches", async () => {
    const badReq = new NextRequest("http://localhost/api/opportunities", {
      method: "PATCH",
      body: JSON.stringify({ action: "seen", ids: ["bad-id"] }),
    });
    const badRes = await PATCH(badReq);
    const badBody = await badRes.json();

    expect(badRes.status).toBe(400);
    expect(badBody.error).toContain("ids.0");

    markSeenBulkMock.mockResolvedValue({
      requested: 1,
      updated: 1,
      skipped: 0,
      ids: [MATCH_ID],
    });

    const req = new NextRequest("http://localhost/api/opportunities", {
      method: "PATCH",
      body: JSON.stringify({ action: "seen", ids: [MATCH_ID] }),
    });
    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(markSeenBulkMock).toHaveBeenCalledWith([MATCH_ID], ORG_ID, USER_ID);
    expect(body).toEqual({
      action: "seen",
      result: {
        requested: 1,
        updated: 1,
        skipped: 0,
        ids: [MATCH_ID],
      },
    });
  });
});
