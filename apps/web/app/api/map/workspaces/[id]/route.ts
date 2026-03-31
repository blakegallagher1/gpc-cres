import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  MapWorkspaceService,
  MapWorkspaceServiceError,
  UpdateMapWorkspaceRequestSchema,
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
    const workspace = await mapWorkspaceService.getWorkspace(auth.orgId, id);
    return NextResponse.json({ workspace });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id]", method: "GET" },
    });

    if (error instanceof MapWorkspaceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: "Failed to load map workspace" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = UpdateMapWorkspaceRequestSchema.parse(await request.json());
    const { id } = await context.params;
    const workspace = await mapWorkspaceService.updateWorkspace({
      orgId: auth.orgId,
      userId: auth.userId,
      workspaceId: id,
      input: payload,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id]", method: "PATCH" },
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

    if (error instanceof MapWorkspaceServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: "Failed to save map workspace" },
      { status: 500 },
    );
  }
}
