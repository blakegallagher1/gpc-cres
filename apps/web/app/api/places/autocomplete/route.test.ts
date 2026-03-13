import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchMock,
  getGatewayConfigMock,
  getCloudflareAccessHeadersFromEnvMock,
  resolveAuthMock,
  validateAddressMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getGatewayConfigMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
  resolveAuthMock: vi.fn(),
  validateAddressMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/gateway-proxy", () => ({
  getGatewayConfig: getGatewayConfigMock,
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

vi.mock("@/lib/server/googleMapsValidation", () => ({
  validateAddress: validateAddressMock,
}));

vi.stubGlobal("fetch", fetchMock);

import { GET } from "./route";

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("GET /api/places/autocomplete", () => {
  const originalGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    getGatewayConfigMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    validateAddressMock.mockReset();

    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    getGatewayConfigMock.mockReturnValue(null);
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({});
  });

  afterEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalGoogleMapsApiKey;
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/places/autocomplete?q=7618");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(validateAddressMock).not.toHaveBeenCalled();
  });

  it("returns empty suggestions for short queries without hitting upstreams", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });

    const req = new NextRequest("http://localhost/api/places/autocomplete?q=7");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ suggestions: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(validateAddressMock).not.toHaveBeenCalled();
  });

  it("enriches the top Google result with validation metadata when validation succeeds", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });
    getGatewayConfigMock.mockReturnValue({
      url: "https://gateway.test",
      key: "gateway-key",
    });
    fetchMock.mockImplementation((input: string | URL) => {
      const url = String(input);

      if (url.includes("places.googleapis.com/v1/places:autocomplete")) {
        return Promise.resolve(
          makeJsonResponse({
            suggestions: [
              {
                placePrediction: {
                  placeId: "google-place-1",
                  text: {
                    text: "7618 Copperfield Ct, Baton Rouge, LA 70809",
                  },
                },
              },
            ],
          }),
        );
      }

      if (url === "https://gateway.test/tools/parcels.search") {
        return Promise.resolve(
          makeJsonResponse({
            rows: [
              {
                parcel_id: "parcel-1",
                address: "7620 Copperfield Ct, Baton Rouge, LA 70809",
                zoning_type: "C2",
              },
            ],
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    validateAddressMock.mockResolvedValue({
      formattedAddress: "7618 Copperfield Court, Baton Rouge, LA 70809, USA",
      latitude: 30.41,
      longitude: -91.08,
      validationGranularity: "PREMISE",
      isValid: true,
      uspsData: {
        standardizedAddress:
          "7618 Copperfield Court, Baton Rouge, LA 70809-0000",
        dpvConfirmation: "Y",
      },
    });

    const req = new NextRequest(
      "http://localhost/api/places/autocomplete?q=7618%20Copperfield",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(body).toEqual({
      suggestions: [
        {
          description: "7618 Copperfield Ct, Baton Rouge, LA 70809",
          formattedAddress: "7618 Copperfield Court, Baton Rouge, LA 70809, USA",
          placeId: "google-place-1",
          source: "google",
          validated: true,
        },
        {
          description: "7620 Copperfield Ct, Baton Rouge, LA 70809 (C2)",
          placeId: "parcel-1",
          source: "parcel_db",
        },
      ],
    });
    expect(validateAddressMock).toHaveBeenCalledWith(
      "7618 Copperfield Ct, Baton Rouge, LA 70809",
      "test-google-key",
    );
  });

  it("marks the top Google result as unvalidated when address validation returns a non-premise result", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: "google-place-1",
              text: {
                text: "123 Main St, Baton Rouge, LA 70802",
              },
            },
          },
        ],
      }),
    );
    validateAddressMock.mockResolvedValue({
      formattedAddress: "123 Main Street, Baton Rouge, LA 70802, USA",
      latitude: 30.45,
      longitude: -91.15,
      validationGranularity: "ROUTE",
      isValid: false,
      uspsData: null,
    });

    const req = new NextRequest("http://localhost/api/places/autocomplete?q=123%20Main");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      suggestions: [
        {
          description: "123 Main St, Baton Rouge, LA 70802",
          formattedAddress: "123 Main Street, Baton Rouge, LA 70802, USA",
          placeId: "google-place-1",
          source: "google",
          validated: false,
        },
      ],
    });
  });

  it("returns without validation metadata when address validation loses the 2s race", async () => {
    vi.useFakeTimers();
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        suggestions: [
          {
            placePrediction: {
              placeId: "google-place-1",
              text: {
                text: "123 Main St, Baton Rouge, LA 70802",
              },
            },
          },
        ],
      }),
    );
    validateAddressMock.mockReturnValue(new Promise(() => {}));

    const req = new NextRequest("http://localhost/api/places/autocomplete?q=123%20Main");
    const responsePromise = GET(req);

    await vi.advanceTimersByTimeAsync(2_000);
    const res = await responsePromise;
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      suggestions: [
        {
          description: "123 Main St, Baton Rouge, LA 70802",
          placeId: "google-place-1",
          source: "google",
        },
      ],
    });
  });
});
