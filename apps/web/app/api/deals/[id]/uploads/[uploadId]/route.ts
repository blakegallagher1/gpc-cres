import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";

// GET /api/deals/[id]/uploads/[uploadId] - get signed download URL
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, uploadId } = await params;

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId: id, orgId: auth.orgId },
    });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("deal-room-uploads")
      .createSignedUrl(upload.storageObjectKey, 300);

    if (error || !data?.signedUrl) {
      console.error("Signed URL error:", error);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Error getting upload URL:", error);
    return NextResponse.json(
      { error: "Failed to get upload URL" },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[id]/uploads/[uploadId] - delete an upload
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, uploadId } = await params;

    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId: id, orgId: auth.orgId },
    });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    await supabaseAdmin.storage
      .from("deal-room-uploads")
      .remove([upload.storageObjectKey]);

    await prisma.upload.delete({ where: { id: uploadId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting upload:", error);
    return NextResponse.json(
      { error: "Failed to delete upload" },
      { status: 500 }
    );
  }
}
