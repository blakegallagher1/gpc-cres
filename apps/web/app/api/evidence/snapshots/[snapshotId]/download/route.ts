import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";

type DownloadVariant = "snapshot" | "text";

type EvidenceSnapshotDownload = {
  id: string;
  contentType: string;
  storageObjectKey: string | null;
  textExtractObjectKey: string | null;
};

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
    const auth = await resolveAuth();
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

    const { data, error } = await supabaseAdmin.storage
      .from("evidence")
      .createSignedUrl(key, 120);

    if (error || !data?.signedUrl) {
      console.error("Failed to create snapshot download URL:", error);
      return NextResponse.json(
        { error: "Failed to generate download URL" },
        { status: 500 },
      );
    }

    const filename =
      variant === "text"
        ? buildFilename(snapshot.textExtractObjectKey ?? "text-extract.txt", `${snapshot.id}.txt`)
        : buildFilename(snapshot.storageObjectKey ?? `${snapshot.id}.bin`, `${snapshot.id}.bin`);

    return NextResponse.json({
      url: data.signedUrl,
      filename,
      contentType: variant === "text" ? "text/plain; charset=utf-8" : snapshot.contentType,
      snapshotId: snapshot.id,
      variant,
    });
  } catch (error) {
    console.error("Error generating evidence download URL:", error);
    return NextResponse.json({ error: "Failed to download snapshot" }, { status: 500 });
  }
}
