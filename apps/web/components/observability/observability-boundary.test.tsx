import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

const telemetryMocks = vi.hoisted(() => ({
  capturePageError: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentryMocks);
vi.mock("next/navigation", () => ({
  usePathname: () => "/map",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("./client-telemetry", () => telemetryMocks);

import { ObservabilityBoundary } from "./observability-boundary";

function Boom() {
  throw new Error("kaboom");
}

describe("ObservabilityBoundary", () => {
  it("captures page errors and renders the fallback", async () => {
    render(
      <ObservabilityBoundary>
        <Boom />
      </ObservabilityBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("The application encountered an unexpected error."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
      expect(telemetryMocks.capturePageError).toHaveBeenCalledTimes(1);
    });

    expect(telemetryMocks.capturePageError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "kaboom" }),
      expect.any(String),
    );
  });
});
