import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";
import * as Sentry from "@sentry/nextjs";

type DownloadVariant = "snapshot" | "text";

function parseVariant(value: string | null): DownloadVariant {
  if (value === "text" || value === "snapshot") return value;
  return "snapshot";
}

function buildFilename(url: string, fallback: string) {
  const tail = url.includes("/") ? url.split("/").at(-1) ?? fallback : fallback;
  return tail.replaceAll("?", "_").replaceAll("#", "_");
}

// GET /api/evidence/snapshots/[snapshotId]/download?kind=snapshot|text
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { snapshotId } = await params;
    const variant = parseVariant(request.nextUrl.searchParams.get("kind"));

    const snapshot = await prisma.evidenceSnapshot.findFirst({
      where: { id: snapshotId, orgId: auth.orgId },
      select: {
        id: true,
        contentType: true,
        storageObjectKey: true,
        textExtractObjectKey: true,
      },
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const key =
      variant === "text" ? snapshot.textExtractObjectKey : snapshot.storageObjectKey;
    if (!key) {
      const variantLabel = variant === "text" ? "text extract" : "snapshot";
      return NextResponse.json(
        { error: `No ${variantLabel} file available for this snapshot` },
        { status: 404 },
      );
    }

    const downloadType = variant === "text" ? "evidence_extract" : "evidence_snapshot";
    const { downloadUrl } = await getDownloadUrlFromGateway({
      auth: { orgId: auth.orgId, userId: auth.userId },
      id: snapshotId,
      type: downloadType,
    });

    const filename =
      variant === "text"
        ? buildFilename(snapshot.textExtractObjectKey ?? "text-extract.txt", `${snapshot.id}.txt`)
        : buildFilename(snapshot.storageObjectKey ?? `${snapshot.id}.bin`, `${snapshot.id}.bin`);

    return NextResponse.json({
      url: downloadUrl,
      filename,
      contentType: variant === "text" ? "text/plain; charset=utf-8" : snapshot.contentType,
      snapshotId: snapshot.id,
      variant,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.evidence.snapshots.download", method: "GET" },
    });
    console.error("Error generating evidence download URL:", error);
    return NextResponse.json({ error: "Failed to download snapshot" }, { status: 500 });
  }
}
