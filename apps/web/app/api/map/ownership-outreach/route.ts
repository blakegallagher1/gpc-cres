import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  MapWorkspaceContextSchema,
  MapWorkspaceService,
  parseMapWorkspaceContext,
} from "@gpc/server/services/map-workspace.service";

const mapWorkspaceService = new MapWorkspaceService();

async function resolveContext(request: NextRequest) {
  if (request.method === "GET") {
    return parseMapWorkspaceContext(request.nextUrl.searchParams);
  }
  return MapWorkspaceContextSchema.parse(await request.json());
}

async function handleRequest(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveContext(request);
  const workspace = await mapWorkspaceService.getActiveWorkspace(auth.orgId, context);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json(
    mapWorkspaceService.buildOwnershipSnapshot(workspace, context),
  );
}

export async function GET(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.ownership_outreach", method: "GET" },
    });

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to load ownership and outreach workspace" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.ownership_outreach", method: "POST" },
    });

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to load ownership and outreach workspace" },
      { status: 500 },
    );
  }
}
