import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  MapWorkspaceService,
  parseMapWorkspaceContext,
} from "@gpc/server/services/map-workspace.service";

const mapWorkspaceService = new MapWorkspaceService();

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = parseMapWorkspaceContext(request.nextUrl.searchParams);
    const workspace = await mapWorkspaceService.getActiveWorkspace(auth.orgId, context);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json(mapWorkspaceService.buildMarketOverlaySnapshot(workspace));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.market_overlays", method: "GET" },
    });

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to load market overlays" },
      { status: 500 },
    );
  }
}
