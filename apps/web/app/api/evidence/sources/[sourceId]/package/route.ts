import { NextRequest, NextResponse } from "next/server";
import {
  buildEvidencePackage,
  EvidenceDeliveryNotFoundError,
  parseEvidenceLimit,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getDownloadUrlFromGateway } from "@/lib/storage/gatewayStorage";
import * as Sentry from "@sentry/nextjs";

function buildErrorPayload(message: string) {
  return { error: message };
}

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
    const snapshotLimit = parseEvidenceLimit(
      request.nextUrl.searchParams.get("snapshotLimit"),
      25,
    );

    const payload = await buildEvidencePackage({
      orgId: auth.orgId,
      sourceId,
      snapshotLimit,
      resolveDownloadUrl: async ({ snapshotId, type }) => {
        try {
          const { downloadUrl } = await getDownloadUrlFromGateway({
            auth: { orgId: auth.orgId, userId: auth.userId },
            id: snapshotId,
            type,
          });
          return downloadUrl;
        } catch {
          return null;
        }
      },
    });

    return NextResponse.json(payload, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="evidence-package-${payload.source.id}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof EvidenceDeliveryNotFoundError) {
      return NextResponse.json(buildErrorPayload(error.message), { status: 404 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.evidence.sources.package", method: "GET" },
    });
    console.error("Error generating evidence package:", error);
    return NextResponse.json({ error: "Failed to generate evidence package" }, { status: 500 });
  }
}
