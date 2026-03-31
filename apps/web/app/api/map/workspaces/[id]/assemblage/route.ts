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
    const assemblage = await mapWorkspaceService.getAssemblageAnalysis(auth.orgId, id);
    return NextResponse.json({ assemblage });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id].assemblage", method: "GET" },
    });

    if (error instanceof MapWorkspaceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: "Failed to analyze assemblage" },
      { status: 500 },
    );
  }
}
