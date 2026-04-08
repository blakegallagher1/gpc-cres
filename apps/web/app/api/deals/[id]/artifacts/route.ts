import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { DealArtifactRouteError, generateDealArtifact, listDealArtifacts } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { uploadArtifactToGateway } from "@/lib/storage/gatewayStorage";

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof DealArtifactRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const artifactType = typeof body.artifactType === "string" ? body.artifactType : "";

    const data = await generateDealArtifact(
      auth,
      id,
      artifactType,
      body,
      (artifactAuth, input) =>
        uploadArtifactToGateway({
          auth: {
            orgId: artifactAuth.orgId,
            userId: artifactAuth.userId,
          },
          dealId: input.dealId,
          artifactType: input.artifactType,
          version: input.version,
          filename: input.filename,
          contentType: input.contentType,
          bytes: input.bytes,
          generatedByRunId: input.generatedByRunId,
        }),
    );

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.artifacts", method: "POST" },
    });
    return toErrorResponse(error, "Failed to generate artifact");
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const data = await listDealArtifacts(auth, id);
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals.artifacts", method: "GET" },
    });
    return toErrorResponse(error, "Failed to fetch artifacts");
  }
}
