import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const {
  resolveAuthMock,
  listWorkspacesMock,
  createWorkspaceMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  createWorkspaceMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server/services/map-workspace.service", () => ({
  CreateMapWorkspaceRequestSchema: z.object({
    name: z.string(),
    selectedParcelIds: z.array(z.string()).default([]),
    trackedParcels: z
      .array(
        z.object({
          parcelId: z.string(),
          status: z.enum(["to_analyze", "active", "blocked", "complete"]),
          task: z.string().nullable().optional(),
          note: z.string().nullable().optional(),
          updatedAt: z.string().optional(),
        }),
      )
      .default([]),
  }),
  MapWorkspaceServiceError: class MapWorkspaceServiceError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly statusCode: number,
    ) {
      super(message);
    }
  },
  MapWorkspaceService: class MapWorkspaceService {
    listWorkspaces = listWorkspacesMock;
    createWorkspace = createWorkspaceMock;
  },
}));

import { GET, POST } from "./route";

describe("/api/map/workspaces route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listWorkspacesMock.mockReset();
    createWorkspaceMock.mockReset();
    resolveAuthMock.mockResolvedValue({
      orgId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("lists workspaces for the authenticated org", async () => {
    listWorkspacesMock.mockResolvedValue({
      workspaces: [
        {
          id: "workspace-1",
          name: "Main Street assemblage",
        },
      ],
    });

    const response = await GET(new NextRequest("http://localhost/api/map/workspaces"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listWorkspacesMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(body.workspaces[0]?.name).toBe("Main Street assemblage");
  });

  it("creates a workspace record", async () => {
    createWorkspaceMock.mockResolvedValue({
      id: "workspace-1",
      name: "Main Street assemblage",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/map/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: "Main Street assemblage",
          selectedParcelIds: ["parcel-1", "parcel-2"],
          trackedParcels: [],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createWorkspaceMock).toHaveBeenCalledWith({
      orgId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      input: {
        name: "Main Street assemblage",
        selectedParcelIds: ["parcel-1", "parcel-2"],
        trackedParcels: [],
      },
    });
    expect(body.workspace.id).toBe("workspace-1");
  });
});
