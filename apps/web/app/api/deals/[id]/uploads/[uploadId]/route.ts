import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getDownloadUrlFromGateway,
  deleteObjectFromGateway,
} from "@/lib/storage/gatewayStorage";

// GET /api/deals/[id]/uploads/[uploadId] - get signed download URL
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const auth = await resolveAuth(request);
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

    const { downloadUrl } = await getDownloadUrlFromGateway({
      auth: { orgId: auth.orgId, userId: auth.userId },
      id: upload.id,
      type: "upload",
    });

    return NextResponse.json({ url: downloadUrl });
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  try {
    const auth = await resolveAuth(request);
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

    await deleteObjectFromGateway(upload.storageObjectKey, {
      orgId: auth.orgId,
      userId: auth.userId,
    });

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
