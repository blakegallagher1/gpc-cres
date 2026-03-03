import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";

type SnapshotRecord = {
  id: string;
  retrievedAt: Date;
  contentType: string;
  contentHash: string;
  runId: string | null;
  storageObjectKey: string;
  textExtractObjectKey: string | null;
};

type EvidenceSourceRecord = {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  isOfficial: boolean;
  firstSeenAt: Date;
  _count: { evidenceSnapshots: number };
  evidenceSnapshots: SnapshotRecord[];
};

function parseLimit(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), 120));
}

async function getEvidenceDownloadUrl(
  auth: { orgId: string; userId: string },
  snapshotId: string,
  type: "evidence_snapshot" | "evidence_extract"
): Promise<string | null> {
  try {
    const { downloadUrl } = await getDownloadUrlFromGateway({ auth, id: snapshotId, type });
    return downloadUrl;
  } catch {
    return null;
  }
}

function deriveFilename(objectKey: string): string {
  if (!objectKey.includes("/")) return objectKey;
  return objectKey.split("/").at(-1) ?? objectKey;
}

function buildErrorPayload(message: string) {
  return {
    error: message,
  };
}

// GET /api/evidence/sources/[sourceId]/package - export package manifest of snapshot assets
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sourceId } = await params;
    const limit = parseLimit(request.nextUrl.searchParams.get("snapshotLimit"), 25);

    const source = await prisma.evidenceSource.findFirst({
      where: { id: sourceId, orgId: auth.orgId },
      include: {
        _count: { select: { evidenceSnapshots: true } },
        evidenceSnapshots: {
          orderBy: { retrievedAt: "desc" },
          take: limit,
          select: {
            id: true,
            retrievedAt: true,
            contentHash: true,
            runId: true,
            contentType: true,
            storageObjectKey: true,
            textExtractObjectKey: true,
          },
        },
      },
    });

    if (!source) {
      return NextResponse.json(buildErrorPayload("Evidence source not found"), { status: 404 });
    }

    const authPayload = { orgId: auth.orgId, userId: auth.userId };
    const signedFileRows = await Promise.all(
      (source.evidenceSnapshots as EvidenceSourceRecord["evidenceSnapshots"]).map(async (snapshot) => {
        const snapshotUrl = await getEvidenceDownloadUrl(authPayload, snapshot.id, "evidence_snapshot");
        const textUrl = snapshot.textExtractObjectKey
          ? await getEvidenceDownloadUrl(authPayload, snapshot.id, "evidence_extract")
          : null;

        return {
          snapshotId: snapshot.id,
          retrievedAt: snapshot.retrievedAt.toISOString(),
          contentHash: snapshot.contentHash,
          runId: snapshot.runId,
          httpStatus: 200,
          files: [
            {
              kind: "snapshot",
              filename: deriveFilename(snapshot.storageObjectKey),
              contentType: snapshot.contentType,
              url: snapshotUrl,
            },
            ...(textUrl
              ? [
                  {
                    kind: "text-extract",
                    filename: deriveFilename(snapshot.textExtractObjectKey ?? `${snapshot.id}-text.txt`),
                    contentType: "text/plain; charset=utf-8",
                    url: textUrl,
                  },
                ]
              : []),
          ],
        };
      }),
    );

    const payload = {
      source: {
        id: source.id,
        url: source.url,
        domain: source.domain,
        title: source.title,
        isOfficial: source.isOfficial,
        firstSeenAt: source.firstSeenAt.toISOString(),
        snapshotCount: source._count.evidenceSnapshots,
      },
      generatedAt: new Date().toISOString(),
      fileCount: signedFileRows.reduce((count, item) => count + item.files.length, 0),
      snapshots: signedFileRows,
    };

    const fileName = `evidence-package-${source.id}.json`;
    return NextResponse.json(payload, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating evidence package:", error);
    return NextResponse.json({ error: "Failed to generate evidence package" }, { status: 500 });
  }
}
