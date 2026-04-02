import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  MapWorkspaceService,
  parseMapWorkspaceContext,
} from "@gpc/server/services/map-workspace.service";

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

    const context = parseMapWorkspaceContext(request.nextUrl.searchParams);
    const workspace = await mapWorkspaceService.getActiveWorkspace(auth.orgId, context);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
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
      { error: "Failed to load active map workspace" },
      { status: 500 },
    );
  }
}
