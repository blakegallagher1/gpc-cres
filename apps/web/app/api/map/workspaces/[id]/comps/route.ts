import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  MapWorkspaceCompQuerySchema,
  MapWorkspaceService,
  MapWorkspaceServiceError,
} from "@gpc/server/services/map-workspace.service";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";

const mapWorkspaceService = new MapWorkspaceService();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const auth = authorization.auth;

    const { searchParams } = new URL(request.url);
    const query = MapWorkspaceCompQuerySchema.parse({
      landUse: searchParams.get("landUse"),
      maxAgeMonths: searchParams.get("maxAgeMonths"),
    });

    const { id } = await context.params;
    const intelligence = await mapWorkspaceService.getCompIntelligence(
      auth.orgId,
      id,
      query,
    );

    return NextResponse.json({ intelligence });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id].comps", method: "GET" },
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
      { error: "Failed to load comp intelligence" },
      { status: 500 },
    );
  }
}
