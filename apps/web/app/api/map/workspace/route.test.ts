import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  authorizeApiRouteMock,
  getActiveWorkspaceMock,
  buildWorkspaceBridgeRecordMock,
  saveWorkspaceMock,
  isAppRouteLocalBypassEnabledMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  getActiveWorkspaceMock: vi.fn(),
  buildWorkspaceBridgeRecordMock: vi.fn(),
  saveWorkspaceMock: vi.fn(),
  isAppRouteLocalBypassEnabledMock: vi.fn(() => false),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server/services/map-workspace.service", () => ({
  MapWorkspaceContextSchema: z.object({}),
  MapWorkspaceUpsertSchema: z.object({
    workspaceId: z.string().nullable().optional(),
    polygon: z.array(z.array(z.tuple([z.number(), z.number()]))).nullable().optional(),
    selectedParcelIds: z.array(z.string()),
    trackedParcels: z.array(z.object({
      parcelId: z.string(),
      address: z.string(),
      lat: z.number(),
      lng: z.number(),
      note: z.string(),
      task: z.string(),
      status: z.enum(["to_analyze", "active", "blocked", "complete"]),
      createdAt: z.string(),
      updatedAt: z.string(),
    })),
    workspaceParcels: z.array(z.object({
      parcelId: z.string(),
      address: z.string(),
      owner: z.string().nullable().optional(),
      acreage: z.number().nullable().optional(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
      currentZoning: z.string().nullable().optional(),
      floodZone: z.string().nullable().optional(),
    })),
    aiOutputs: z.array(z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.string(),
      summary: z.string(),
      payload: z.record(z.string(), z.unknown()).optional().default({}),
    })).default([]),
    overlayState: z.record(z.string(), z.boolean()).default({}),
  }),
  MapWorkspaceService: class MapWorkspaceService {
    getActiveWorkspace = getActiveWorkspaceMock;
    buildWorkspaceBridgeRecord = buildWorkspaceBridgeRecordMock;
    saveWorkspace = saveWorkspaceMock;
  },
}));

vi.mock("@/lib/auth/localDevBypass", () => ({
  isAppRouteLocalBypassEnabled: isAppRouteLocalBypassEnabledMock,
}));

import { GET, PUT } from "./route";

const AUTH = {
  userId: "22222222-2222-4222-8222-222222222222",
  orgId: "11111111-1111-4111-8111-111111111111",
};

describe("/api/map/workspace route", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    getActiveWorkspaceMock.mockReset();
    buildWorkspaceBridgeRecordMock.mockReset();
    saveWorkspaceMock.mockReset();
    isAppRouteLocalBypassEnabledMock.mockReset();
    isAppRouteLocalBypassEnabledMock.mockReturnValue(false);
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: AUTH });
  });

  it("returns 401 on GET when unauthenticated", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });

    const response = await GET(new NextRequest("http://localhost/api/map/workspace"));

    expect(response.status).toBe(401);
  });

  it("returns the active workspace bridge record", async () => {
    getActiveWorkspaceMock.mockResolvedValue({ id: "workspace-1" });
    buildWorkspaceBridgeRecordMock.mockReturnValue({
      id: "workspace-1",
      trackedParcels: [],
    });

    const response = await GET(new NextRequest("http://localhost/api/map/workspace"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      workspace: { id: "workspace-1", trackedParcels: [] },
      syncState: "connected",
    });
    expect(getActiveWorkspaceMock).toHaveBeenCalledWith(
      AUTH.orgId,
      {},
    );
  });

  it("returns an empty workspace bridge payload when no active workspace exists", async () => {
    getActiveWorkspaceMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/map/workspace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: null,
      syncState: "empty",
    });
  });

  it("returns a degraded empty workspace when the load fails", async () => {
    getActiveWorkspaceMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(new NextRequest("http://localhost/api/map/workspace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: null,
      syncState: "degraded",
      error: "Failed to load map workspace",
    });
  });

  it("returns local bypass state when enabled and the workspace load fails", async () => {
    isAppRouteLocalBypassEnabledMock.mockReturnValue(true);
    getActiveWorkspaceMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(new NextRequest("http://localhost/api/map/workspace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspace: null,
      syncState: "local-bypass",
      error: "Failed to load map workspace",
    });
  });

  it("saves the shared workspace payload", async () => {
    saveWorkspaceMock.mockResolvedValue({ id: "workspace-1" });
    buildWorkspaceBridgeRecordMock.mockReturnValue({
      id: "workspace-1",
      trackedParcels: [],
    });

    const response = await PUT(
      new NextRequest("http://localhost/api/map/workspace", {
        method: "PUT",
        body: JSON.stringify({
          workspaceId: null,
          polygon: null,
          selectedParcelIds: ["parcel-1"],
          trackedParcels: [
            {
              parcelId: "parcel-1",
              address: "123 Main St",
              lat: 30.45,
              lng: -91.18,
              note: "Call broker",
              task: "Call broker",
              status: "active",
              createdAt: "2026-03-31T12:00:00.000Z",
              updatedAt: "2026-03-31T12:00:00.000Z",
            },
          ],
          workspaceParcels: [
            {
              parcelId: "parcel-1",
              address: "123 Main St",
              owner: "Riverfront Holdings LLC",
              acreage: 1.2,
              lat: 30.45,
              lng: -91.18,
              currentZoning: "C2",
              floodZone: "X",
            },
          ],
          aiOutputs: [],
          overlayState: { zoning: true },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(saveWorkspaceMock).toHaveBeenCalledWith(
      AUTH.orgId,
      AUTH.userId,
      expect.objectContaining({
        selectedParcelIds: ["parcel-1"],
        overlayState: { zoning: true },
      }),
    );
  });
});
