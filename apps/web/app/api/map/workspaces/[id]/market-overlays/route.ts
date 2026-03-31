import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  MapWorkspaceService,
  MapWorkspaceServiceError,
} from "@gpc/server/services/map-workspace.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const mapWorkspaceService = new MapWorkspaceService();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const overlays = await mapWorkspaceService.getMarketOverlayContract(auth.orgId, id);
    return NextResponse.json({ overlays });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id].market-overlays", method: "GET" },
    });

    if (error instanceof MapWorkspaceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: "Failed to load market overlays" },
      { status: 500 },
    );
  }
}
