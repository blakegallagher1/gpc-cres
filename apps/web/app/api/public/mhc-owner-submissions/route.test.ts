import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  queryRawMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  queryRawMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

describe("POST /api/public/mhc-owner-submissions", () => {
  beforeEach(() => {
    vi.resetModules();
    checkRateLimitMock.mockReset();
    queryRawMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
  });

  function buildRequest(body: unknown, headers?: Record<string, string>) {
    return new Request("http://localhost/api/public/mhc-owner-submissions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.24",
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 201 and normalized success payload", async () => {
    queryRawMock.mockResolvedValue([
      { id: "sub_123", created_at: new Date("2026-03-21T00:00:00.000Z") },
    ]);

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+1 (225) 555-1234",
        locationAddress1: "123 Oak Street",
        locationCity: "Baton Rouge",
        locationState: "la",
        locationPostalCode: "70801",
        notes: "Interested in selling.",
        website: "",
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      submissionId: "sub_123",
      receivedAt: "2026-03-21T00:00:00.000Z",
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when validation fails", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        firstName: "",
        lastName: "Lovelace",
        email: "not-an-email",
        phone: "123",
        locationAddress1: "",
        locationCity: "",
        locationState: "louisiana",
        locationPostalCode: "foo",
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    checkRateLimitMock.mockReturnValue(false);

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+1 (225) 555-1234",
        locationAddress1: "123 Oak Street",
        locationCity: "Baton Rouge",
        locationState: "LA",
        locationPostalCode: "70801",
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(429);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("rejects honeypot submissions", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+1 (225) 555-1234",
        locationAddress1: "123 Oak Street",
        locationCity: "Baton Rouge",
        locationState: "LA",
        locationPostalCode: "70801",
        website: "https://spam.invalid",
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("BOT_DETECTED");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns 500 when persistence fails", async () => {
    queryRawMock.mockRejectedValue(new Error("db offline"));

    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+1 (225) 555-1234",
        locationAddress1: "123 Oak Street",
        locationCity: "Baton Rouge",
        locationState: "LA",
        locationPostalCode: "70801",
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
