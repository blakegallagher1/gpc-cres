// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, redirectMock, dealsPageMock, fetchMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  dealsPageMock: vi.fn(() => <div>Deals client surface</div>),
  fetchMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./page-client", () => ({
  default: dealsPageMock,
}));

import DealsRoute from "./page";

describe("DealsRoute", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    dealsPageMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LOCAL_API_KEY = "test-local-api-key";
    process.env.LOCAL_API_URL = "https://api.test";
  });

  it("redirects to /login when no server session is available", async () => {
    authMock.mockResolvedValue(null);

    await expect(DealsRoute({})).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("uses the authenticated server session to load deals", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        orgId: "org-1",
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        deals: [
          {
            id: "deal-1",
            name: "Test Deal",
            status: "INTAKE",
          },
        ],
      }),
    });

    await DealsRoute({});

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/deals?org_id=org-1",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer test-local-api-key",
        }),
      }),
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
