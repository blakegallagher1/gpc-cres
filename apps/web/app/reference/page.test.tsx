import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, useSWRMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useSWRMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams("tab=jurisdictions"),
}));

vi.mock("swr", () => ({
  default: useSWRMock,
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => children,
}));

import ReferencePage, { referenceFetcher } from "./page";

describe("ReferencePage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    replaceMock.mockReset();
    useSWRMock.mockReset();
    useSWRMock.mockImplementation((url: string) => {
      if (url === "/api/evidence?includeSnapshots=false") {
        return {
          data: { sources: [] },
          error: undefined,
        };
      }

      if (url === "/api/jurisdictions") {
        return {
          data: undefined,
          error: new Error("Failed to fetch jurisdictions"),
        };
      }

      return {
        data: undefined,
        error: undefined,
      };
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws on non-OK fetch responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Failed to fetch jurisdictions" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      referenceFetcher<{ jurisdictions: unknown[] }>("/api/jurisdictions"),
    ).rejects.toThrow("Failed to fetch jurisdictions");
  });

  it("renders an explicit jurisdictions error state instead of the empty fallback", () => {
    render(<ReferencePage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load jurisdictions.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to fetch jurisdictions",
    );
    expect(screen.queryByText("No jurisdictions found.")).not.toBeInTheDocument();
  });
});
