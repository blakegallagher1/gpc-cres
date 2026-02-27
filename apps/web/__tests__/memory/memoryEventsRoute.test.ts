import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, recordEventMock, getEventStatsMock } = vi.hoisted(
  () => ({
    resolveAuthMock: vi.fn(),
    recordEventMock: vi.fn(),
    getEventStatsMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/memoryEventService", () => ({
  getMemoryEventService: () => ({
    recordEvent: recordEventMock,
    getEventStats: getEventStatsMock,
  }),
}));

vi.mock("server-only", () => ({}));

import { POST, GET } from "@/app/api/memory/events/route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/memory/events", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    recordEventMock.mockReset();
    getEventStatsMock.mockReset();
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/memory/events", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("returns 400 on invalid body", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

      const req = new NextRequest("http://localhost/api/memory/events", {
        method: "POST",
        body: JSON.stringify({ invalid: true }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("returns 201 on valid body with address", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      recordEventMock.mockResolvedValue({
        id: "event-1",
        orgId: ORG_ID,
        entityId: "entity-1",
        sourceType: "agent",
        factType: "zoning",
        status: "attempted",
      });

      const req = new NextRequest("http://localhost/api/memory/events", {
        method: "POST",
        body: JSON.stringify({
          address: "123 Main St",
          sourceType: "agent",
          factType: "zoning",
          payloadJson: { zone: "M1" },
          status: "attempted",
        }),
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe("event-1");
      expect(recordEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          sourceType: "agent",
          factType: "zoning",
        }),
      );
    });

    it("returns 400 when neither entityId nor address provided", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

      const req = new NextRequest("http://localhost/api/memory/events", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "agent",
          factType: "zoning",
          payloadJson: { zone: "M1" },
          status: "attempted",
        }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/memory/events");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    it("returns stats scoped by orgId", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      getEventStatsMock.mockResolvedValue({
        total: 10,
        byStatus: [],
        byFactType: [],
        bySourceType: [],
        recentEvents: [],
        days: 7,
      });

      const req = new NextRequest(
        "http://localhost/api/memory/events?days=7",
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(10);
      expect(getEventStatsMock).toHaveBeenCalledWith(ORG_ID, 7);
    });
  });
});
