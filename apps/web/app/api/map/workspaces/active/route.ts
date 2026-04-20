import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  MapWorkspaceService,
  parseMapWorkspaceContext,
} from "@gpc/server/services/map-workspace.service";

const mapWorkspaceService = new MapWorkspaceService();

function buildEmptyWorkspaceSnapshot() {
  return {
    status: {
      kind: "empty" as const,
      source: "empty" as const,
      title: "No active workspace",
      detail:
        "Select parcels or draw a geography to create a shared map workspace record.",
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
  };
}

function buildFallbackWorkspaceSnapshot(detail: string) {
  return {
    ...buildEmptyWorkspaceSnapshot(),
    status: {
      kind: "fallback" as const,
      source: "fallback" as const,
      title: "Workspace data unavailable",
      detail,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const auth = authorization.auth;

    const context = parseMapWorkspaceContext(request.nextUrl.searchParams);
    const workspace = await mapWorkspaceService.getActiveWorkspace(auth.orgId, context);

    if (!workspace) {
      return NextResponse.json(buildEmptyWorkspaceSnapshot());
    }

    return NextResponse.json(mapWorkspaceService.buildWorkspaceSnapshot(workspace));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.active", method: "GET" },
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
      buildFallbackWorkspaceSnapshot("Active workspace data is temporarily unavailable."),
    );
  }
}
