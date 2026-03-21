import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { checkRateLimitMock, recordObservabilityEventMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  recordObservabilityEventMock: vi.fn(),
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/server/observability", () => ({
  recordObservabilityEvent: recordObservabilityEventMock,
}));

describe("POST /api/seller-submissions", () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    recordObservabilityEventMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
  });

  it("returns success for a valid payload", async () => {
    const req = new NextRequest("http://localhost/api/seller-submissions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({
        name: "Jane Seller",
        email: "jane@example.com",
        propertyAddress: "123 Main St, Baton Rouge, LA",
        details: "Off-market opportunity.",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(checkRateLimitMock).toHaveBeenCalledWith("seller-submissions:1.2.3.4", 5, 60);
  });

  it("returns validation failure when required fields are missing", async () => {
    const req = new NextRequest("http://localhost/api/seller-submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "missing-name@example.com",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid payload");
  });

  it("rejects honeypot payloads", async () => {
    const req = new NextRequest("http://localhost/api/seller-submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Bot",
        email: "bot@example.com",
        propertyAddress: "1 spam lane",
        company: "I am a bot",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Rejected" });
    expect(recordObservabilityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "seller_submission_rejected" }),
    );
  });

  it("returns 429 when the IP exceeds route rate limit", async () => {
    checkRateLimitMock.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/seller-submissions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({
        name: "Jane Seller",
        email: "jane@example.com",
        propertyAddress: "123 Main St, Baton Rouge, LA",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "Too many requests" });
  });
});
