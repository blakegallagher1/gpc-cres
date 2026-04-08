import { NextRequest, NextResponse } from "next/server";
import {
  buildEvidenceSnapshotDownload,
  EvidenceDeliveryNotFoundError,
  parseEvidenceDownloadKind,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";
import * as Sentry from "@sentry/nextjs";

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
    const payload = await buildEvidenceSnapshotDownload({
      orgId: auth.orgId,
      snapshotId,
      kind: parseEvidenceDownloadKind(request.nextUrl.searchParams.get("kind")),
      resolveDownloadUrl: async ({ snapshotId: id, type }) => {
        const { downloadUrl } = await getDownloadUrlFromGateway({
          auth: { orgId: auth.orgId, userId: auth.userId },
          id,
          type,
        });
        return downloadUrl;
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof EvidenceDeliveryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.evidence.snapshots.download", method: "GET" },
    });
    console.error("Error generating evidence download URL:", error);
    return NextResponse.json({ error: "Failed to download snapshot" }, { status: 500 });
  }
}
