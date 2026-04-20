import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  getActiveWorkspaceMock,
  buildWorkspaceSnapshotMock,
  parseMapWorkspaceContextMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  getActiveWorkspaceMock: vi.fn(),
  buildWorkspaceSnapshotMock: vi.fn(),
  parseMapWorkspaceContextMock: vi.fn(() => ({ parcelIds: [], polygon: null })),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/services/map-workspace.service", () => ({
  parseMapWorkspaceContext: parseMapWorkspaceContextMock,
  MapWorkspaceService: class MapWorkspaceService {
    getActiveWorkspace = getActiveWorkspaceMock;
    buildWorkspaceSnapshot = buildWorkspaceSnapshotMock;
  },
}));

import { GET } from "./route";

const AUTH = {
  userId: "22222222-2222-4222-8222-222222222222",
  orgId: "11111111-1111-4111-8111-111111111111",
};

describe("GET /api/map/workspaces/active", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    getActiveWorkspaceMock.mockReset();
    buildWorkspaceSnapshotMock.mockReset();
    parseMapWorkspaceContextMock.mockReset();
    parseMapWorkspaceContextMock.mockReturnValue({ parcelIds: [], polygon: null });
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: AUTH });
  });

  it("returns 401 when unauthorized", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces/active"));

    expect(response.status).toBe(401);
  });

  it("returns the active workspace snapshot when available", async () => {
    getActiveWorkspaceMock.mockResolvedValue({ id: "workspace-1" });
    buildWorkspaceSnapshotMock.mockReturnValue({
      status: {
        kind: "ready",
        source: "api",
        title: "Shared workspace connected",
        detail: "Selections are persisted.",
      },
      recordId: "workspace-1",
      name: "Workspace",
      selectedCount: 2,
      trackedCount: 1,
      geofenceCount: 1,
      noteCount: 1,
      taskCount: 1,
      compCount: 0,
      aiInsightCount: 0,
      lastUpdatedLabel: "Today",
    });

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces/active"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      recordId: "workspace-1",
      selectedCount: 2,
      trackedCount: 1,
    });
  });

  it("returns an empty snapshot when no active workspace exists", async () => {
    getActiveWorkspaceMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces/active"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: {
        kind: "empty",
        source: "empty",
        title: "No active workspace",
        detail: "Select parcels or draw a geography to create a shared map workspace record.",
      },
      recordId: null,
      name: "Map workspace draft",
      selectedCount: 0,
      trackedCount: 0,
      geofenceCount: 0,
      noteCount: 0,
      taskCount: 0,
      compCount: 0,
      aiInsightCount: 0,
      lastUpdatedLabel: "Not saved",
    });
  });

  it("returns a fallback snapshot when workspace loading fails", async () => {
    getActiveWorkspaceMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces/active"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: {
        kind: "fallback",
        source: "fallback",
        title: "Workspace data unavailable",
        detail: "Active workspace data is temporarily unavailable.",
      },
      recordId: null,
      name: "Map workspace draft",
      selectedCount: 0,
      trackedCount: 0,
      geofenceCount: 0,
      noteCount: 0,
      taskCount: 0,
      compCount: 0,
      aiInsightCount: 0,
      lastUpdatedLabel: "Not saved",
    });
  });
});
