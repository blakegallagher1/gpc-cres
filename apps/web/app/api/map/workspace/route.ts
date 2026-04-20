import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  MapWorkspaceContextSchema,
  MapWorkspaceService,
  MapWorkspaceUpsertSchema,
} from "@gpc/server/services/map-workspace.service";
import { isAppRouteLocalBypassEnabled } from "@/lib/auth/localDevBypass";

const mapWorkspaceService = new MapWorkspaceService();

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const auth = authorization.auth;

    const workspace = await mapWorkspaceService.getActiveWorkspace(
      auth.orgId,
      MapWorkspaceContextSchema.parse({}),
    );

    if (!workspace) {
      return NextResponse.json({
        workspace: null,
        syncState: "empty" as const,
      });
    }

    return NextResponse.json({
      workspace: mapWorkspaceService.buildWorkspaceBridgeRecord(workspace),
      syncState: "connected" as const,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspace", method: "GET" },
    });
    return NextResponse.json({
      workspace: null,
      syncState: isAppRouteLocalBypassEnabled()
        ? ("local-bypass" as const)
        : ("degraded" as const),
      error: "Failed to load map workspace",
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const auth = authorization.auth;

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
