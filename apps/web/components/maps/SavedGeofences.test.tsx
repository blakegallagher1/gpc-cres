import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedGeofences } from "./SavedGeofences";

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SavedGeofences", () => {
  const originalFetch = globalThis.fetch;
  const polygon = [
    [
      [-91.2, 30.4],
      [-91.2, 30.3],
      [-91.1, 30.3],
      [-91.1, 30.4],
      [-91.2, 30.4],
    ],
  ] as number[][][];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the saved geofence list with active polygon context", async () => {
    const fetchMock = vi.fn(async () =>
      makeJsonResponse({
        geofences: [
          {
            id: "geo-1",
            name: "Baton Rouge Core",
            coordinates: polygon,
            createdAt: "2026-03-21T12:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    const onApply = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <SavedGeofences currentPolygon={polygon} onApply={onApply} />,
    );

    expect(await screen.findByText("Baton Rouge Core")).toBeInTheDocument();
    expect(screen.getByText("Active polygon ready to save")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(polygon);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("shows a clear runtime message when geofences are unavailable", async () => {
    const fetchMock = vi.fn(async () =>
      makeJsonResponse({ error: "Internal server error" }, 500),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SavedGeofences currentPolygon={null} onApply={vi.fn()} />);

    expect(
      await screen.findByText(
        "Saved geofences are unavailable in this environment right now.",
      ),
    ).toBeInTheDocument();
  });
});
