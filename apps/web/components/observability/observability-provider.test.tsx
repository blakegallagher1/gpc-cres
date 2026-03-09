import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  pathname: "/map",
  search: "search=baton+rouge",
  session: {
    data: {
      user: {
        id: "user-1",
        email: "blake@gallagherpropco.com",
        orgId: "org-1",
      },
    },
  },
};

const sentryMocks = vi.hoisted(() => ({
  setUser: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const telemetryState = vi.hoisted(() => ({
  viewIdCounter: 0,
}));

const telemetryMocks = vi.hoisted(() => ({
  createViewId: vi.fn(() => `view-${++telemetryState.viewIdCounter}`),
  installGlobalBrowserTelemetry: vi.fn(() => vi.fn()),
  recordNavigationEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => state.session,
}));

vi.mock("@sentry/nextjs", () => sentryMocks);
vi.mock("./client-telemetry", () => telemetryMocks);

import { ObservabilityProvider } from "./observability-provider";

describe("ObservabilityProvider", () => {
  beforeEach(() => {
    state.pathname = "/map";
    state.search = "search=baton+rouge";
    state.session = {
      data: {
        user: {
          id: "user-1",
          email: "blake@gallagherpropco.com",
          orgId: "org-1",
        },
      },
    };
    sentryMocks.setUser.mockReset();
    sentryMocks.setTag.mockReset();
    sentryMocks.addBreadcrumb.mockReset();
    telemetryState.viewIdCounter = 0;
    telemetryMocks.createViewId.mockClear();
    telemetryMocks.installGlobalBrowserTelemetry.mockReset();
    telemetryMocks.installGlobalBrowserTelemetry.mockReturnValue(vi.fn());
    telemetryMocks.recordNavigationEvent.mockReset();
    telemetryMocks.recordNavigationEvent.mockResolvedValue(undefined);
  });

  it("installs telemetry and records authenticated navigations", async () => {
    render(
      <ObservabilityProvider>
        <div>child</div>
      </ObservabilityProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.installGlobalBrowserTelemetry).toHaveBeenCalledTimes(1);
    });

    expect(sentryMocks.setUser).toHaveBeenCalledWith({
      id: "user-1",
      email: "blake@gallagherpropco.com",
    });
    expect(sentryMocks.setTag).toHaveBeenCalledWith("orgId", "org-1");
    expect(sentryMocks.setTag).toHaveBeenCalledWith("route", "/map?search=baton+rouge");
    expect(sentryMocks.addBreadcrumb).toHaveBeenCalledWith({
      category: "navigation",
      level: "info",
      data: {
        from: null,
        to: "/map?search=baton+rouge",
      },
    });

    await waitFor(() => {
      expect(telemetryMocks.recordNavigationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "/map?search=baton+rouge",
          viewId: "view-1",
          userId: "user-1",
          userEmail: "blake@gallagherpropco.com",
          orgId: "org-1",
        }),
        null,
      );
    });
  });

  it("rotates view ids and records route changes", async () => {
    const { rerender } = render(
      <ObservabilityProvider>
        <div>child</div>
      </ObservabilityProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.recordNavigationEvent).toHaveBeenCalledTimes(1);
    });

    state.pathname = "/deals";
    state.search = "tab=active";

    rerender(
      <ObservabilityProvider>
        <div>child</div>
      </ObservabilityProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.recordNavigationEvent).toHaveBeenCalledTimes(2);
    });

    expect(telemetryMocks.recordNavigationEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: "/deals?tab=active",
        viewId: "view-2",
      }),
      "/map?search=baton+rouge",
    );
  });

  it("skips navigation ingestion when no org is present", async () => {
    state.session = {
      data: {
        user: {
          id: "user-1",
          email: "blake@gallagherpropco.com",
          orgId: null,
        },
      },
    };

    render(
      <ObservabilityProvider>
        <div>child</div>
      </ObservabilityProvider>,
    );

    await waitFor(() => {
      expect(telemetryMocks.installGlobalBrowserTelemetry).toHaveBeenCalledTimes(1);
    });

    expect(telemetryMocks.recordNavigationEvent).not.toHaveBeenCalled();
    expect(sentryMocks.setTag).toHaveBeenCalledWith("orgId", "anonymous");
  });
});
