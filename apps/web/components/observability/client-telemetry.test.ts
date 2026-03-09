import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

const sentryMocks = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);

import {
  __resetClientTelemetryForTests,
  installGlobalBrowserTelemetry,
} from "./client-telemetry";

describe("client telemetry", () => {
  beforeEach(() => {
    __resetClientTelemetryForTests();
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    document.title = "Telemetry Test";
  });

  it("captures failed fetches and posts telemetry", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/observability/events")) {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
      }

      return new Response("bad", {
        status: 500,
        headers: {
          "x-request-id": "req-1",
          "x-correlation-id": "corr-1",
        },
      });
    });

    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const cleanup = installGlobalBrowserTelemetry(() => ({
      route: "/map",
      viewId: "view-1",
      userId: "user-1",
      userEmail: "blake@gallagherpropco.com",
      orgId: "org-1",
    }));

    await window.fetch("/api/parcels");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const telemetryCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return url.includes("/api/observability/events");
    });

    expect(sentryMocks.addBreadcrumb).toHaveBeenCalledWith({
      category: "fetch",
      level: "error",
      type: "http",
      data: {
        method: "GET",
        statusCode: 500,
        url: "/api/parcels",
      },
    });
    expect(telemetryCall).toBeDefined();
    expect(telemetryCall?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    });
    expect(JSON.parse(String(telemetryCall?.[1]?.body))).toMatchObject({
      events: [
        {
          kind: "fetch_failure",
          route: "/map",
          viewId: "view-1",
          statusCode: 500,
          requestId: "req-1",
          correlationId: "corr-1",
          url: "/api/parcels",
          method: "GET",
        },
      ],
    });

    cleanup();
  });

  it("captures browser errors and posts telemetry", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/observability/events")) {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
      }

      return new Response("ok", { status: 200 });
    });

    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const cleanup = installGlobalBrowserTelemetry(() => ({
      route: "/deals",
      viewId: "view-9",
      userId: "user-1",
      userEmail: "blake@gallagherpropco.com",
      orgId: "org-1",
    }));

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "browser boom",
        error: new Error("browser boom"),
        filename: "bundle.js",
        lineno: 14,
        colno: 7,
      }),
    );

    await waitFor(() => {
      expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      events: [
        {
          kind: "browser_error",
          route: "/deals",
          viewId: "view-9",
          message: "browser boom",
        },
      ],
    });

    cleanup();
  });
});
