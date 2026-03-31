import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  MapWorkspaceContextSchema,
  MapWorkspaceService,
  MapWorkspaceUpsertSchema,
} from "@gpc/server/services/map-workspace.service";

const mapWorkspaceService = new MapWorkspaceService();

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await mapWorkspaceService.getActiveWorkspace(
      auth.orgId,
      MapWorkspaceContextSchema.parse({}),
    );

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({
      workspace: mapWorkspaceService.buildWorkspaceBridgeRecord(workspace),
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspace", method: "GET" },
    });

    return NextResponse.json(
      { error: "Failed to load map workspace" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = MapWorkspaceUpsertSchema.parse(await request.json());
    const workspace = await mapWorkspaceService.saveWorkspace(
      auth.orgId,
      auth.userId,
      payload,
    );

    return NextResponse.json({
      workspace: mapWorkspaceService.buildWorkspaceBridgeRecord(workspace),
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspace", method: "PUT" },
    });

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to save map workspace" },
      { status: 500 },
    );
  }
}
