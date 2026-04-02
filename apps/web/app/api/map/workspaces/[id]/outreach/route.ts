import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  CreateMapWorkspaceOutreachLogRequestSchema,
  MapWorkspaceService,
  MapWorkspaceServiceError,
} from "@gpc/server/services/map-workspace.service";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";

const mapWorkspaceService = new MapWorkspaceService();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const auth = authorization.auth;

    const payload = CreateMapWorkspaceOutreachLogRequestSchema.parse(await request.json());
    const { id } = await context.params;
    const ownership = await mapWorkspaceService.createOutreachLog({
      orgId: auth.orgId,
      workspaceId: id,
      input: payload,
    });

    return NextResponse.json({ ownership }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.workspaces.[id].outreach", method: "POST" },
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
      { error: "Failed to log outreach activity" },
      { status: 500 },
    );
  }
}
