import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabase";

// GET /api/deals/artifacts/[artifactId]/download — download artifact via signed URL
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    const auth = await resolveAuth();
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

    // Generate a signed URL (5 minute expiry)
    const { data, error } = await supabaseAdmin.storage
      .from("deal-room-uploads")
      .createSignedUrl(artifact.storageObjectKey, 300);

    if (error || !data?.signedUrl) {
      console.error("Failed to create signed URL:", error);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(data.signedUrl, 302);
  } catch (error) {
    console.error("Error downloading artifact:", error);
    return NextResponse.json(
      { error: "Failed to download artifact" },
      { status: 500 }
    );
  }
}
