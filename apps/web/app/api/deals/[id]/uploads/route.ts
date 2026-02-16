import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { buildUploadObjectKey } from "@entitlement-os/shared";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { randomUUID } from "crypto";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import * as Sentry from "@sentry/nextjs";

// GET /api/deals/[id]/uploads - list uploads for a deal
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const uploads = await prisma.upload.findMany({
      where: { dealId: id, orgId: auth.orgId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Error fetching uploads:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/uploads", method: "GET" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to fetch uploads" },
      { status: 500 }
    );
  }
}

// POST /api/deals/[id]/uploads - upload a file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const kind = (formData.get("kind") as string) || "other";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    const uploadId = randomUUID();
    const now = new Date();
    const storageObjectKey = buildUploadObjectKey({
      orgId: auth.orgId,
      dealId: id,
      kind,
      uploadedAt: now,
      uploadId,
      filename: file.name,
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabaseAdmin.storage
      .from("deal-room-uploads")
      .upload(storageObjectKey, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (storageError && storageError.message === "Bucket not found") {
      const bucketCreateError = await supabaseAdmin.storage.createBucket("deal-room-uploads", {
        public: false,
      });

      if (bucketCreateError.error) {
        Sentry.captureException(bucketCreateError.error, {
          tags: {
            route: "/api/deals/[id]/uploads",
            method: "POST",
            stage: "bucket-create",
          },
        });
        await Sentry.flush(5000);
        console.error("Storage bucket create error:", bucketCreateError.error);
        return NextResponse.json(
          { error: "Failed to upload file to storage" },
          { status: 500 }
        );
      }

      const retry = await supabaseAdmin.storage.from("deal-room-uploads").upload(
        storageObjectKey,
        buffer,
        {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        },
      );

      if (retry.error) {
        Sentry.captureException(retry.error, {
          tags: {
            route: "/api/deals/[id]/uploads",
            method: "POST",
            stage: "storage-upload-retry",
          },
        });
        await Sentry.flush(5000);
        console.error("Storage upload error:", retry.error);
        return NextResponse.json(
          { error: "Failed to upload file to storage" },
          { status: 500 }
        );
      }
    } else if (storageError) {
      Sentry.captureException(storageError, {
        tags: {
          route: "/api/deals/[id]/uploads",
          method: "POST",
          stage: "storage-upload",
        },
      });
      await Sentry.flush(5000);
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 }
      );
    }

    const upload = await prisma.upload.create({
      data: {
        id: uploadId,
        orgId: auth.orgId,
        dealId: id,
        kind,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageObjectKey,
        uploadedBy: auth.userId,
      },
    });

    // Dispatch upload.created event for auto-classification (#6)
    dispatchEvent({
      type: "upload.created",
      dealId: id,
      uploadId: upload.id,
      orgId: auth.orgId,
    }).catch((error) => {
      captureAutomationDispatchError(error, {
        handler: "api.deals.uploads.create",
        eventType: "upload.created",
        dealId: id,
        orgId: auth.orgId,
      });
    });

    return NextResponse.json({ upload }, { status: 201 });
  } catch (error) {
    console.error("Error uploading file:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]/uploads", method: "POST" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
