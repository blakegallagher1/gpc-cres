import { NextRequest, NextResponse } from "next/server";
import { DealArtifactNotFoundError, getArtifactForOrg } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/artifacts/[artifactId]/download — download artifact via signed URL
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { artifactId } = await params;
    const artifact = await getArtifactForOrg({
      artifactId,
      orgId: auth.orgId,
    });

    const { downloadUrl } = await getDownloadUrlFromGateway({
      auth: { orgId: auth.orgId, userId: auth.userId },
      id: artifact.id,
      type: "artifact",
    });

    return NextResponse.redirect(downloadUrl, 302);
  } catch (error) {
    if (error instanceof DealArtifactNotFoundError) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.artifacts.download", method: "GET" },
    });
    console.error("Error downloading artifact:", error);
    return NextResponse.json(
      { error: "Failed to download artifact" },
      { status: 500 }
    );
  }
}
