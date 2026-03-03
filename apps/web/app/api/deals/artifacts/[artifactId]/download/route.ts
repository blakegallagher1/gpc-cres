import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";

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

    const artifact = await prisma.artifact.findFirst({
      where: { id: artifactId, orgId: auth.orgId },
    });
    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const { downloadUrl } = await getDownloadUrlFromGateway({
      auth: { orgId: auth.orgId, userId: auth.userId },
      id: artifact.id,
      type: "artifact",
    });

    return NextResponse.redirect(downloadUrl, 302);
  } catch (error) {
    console.error("Error downloading artifact:", error);
    return NextResponse.json(
      { error: "Failed to download artifact" },
      { status: 500 }
    );
  }
}
