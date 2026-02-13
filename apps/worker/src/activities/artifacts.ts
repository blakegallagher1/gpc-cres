import { prisma } from "@entitlement-os/db";
import { renderArtifactFromSpec } from "@entitlement-os/artifacts";
import { buildArtifactObjectKey } from "@entitlement-os/shared";
import type { ArtifactType } from "@entitlement-os/shared";

/**
 * Generate an artifact (PDF/PPTX) for a deal.
 */
export async function generateArtifact(params: {
  dealId: string;
  artifactType: ArtifactType;
  orgId: string;
  runId?: string;
}): Promise<{ id: string; artifactType: ArtifactType; storageObjectKey: string }> {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: params.dealId },
    include: { parcels: true },
  });

  // Build a minimal ArtifactSpec for the renderer.
  const parcelSummary = deal.parcels
    .map(
      (p: {
        apn: string | null;
        id: string;
        address: string;
        currentZoning: string | null;
      }) =>
        `Parcel ${p.apn ?? p.id}: ${p.address}, zoning: ${p.currentZoning ?? "unknown"}`,
    )
    .join("\n");

  // Determine next version number for this deal + artifact type
  const latestArtifact = await prisma.artifact.findFirst({
    where: { dealId: params.dealId, artifactType: params.artifactType },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestArtifact?.version ?? 0) + 1;

  // Render artifact using the artifacts package
  const spec = {
    schema_version: "1.0" as const,
    artifact_type: params.artifactType as "TRIAGE_PDF",
    deal_id: deal.id,
    title: `${deal.name} - ${params.artifactType}`,
    sections: [
      {
        key: "deal_overview",
        heading: "Deal Overview",
        body_markdown: `**Deal:** ${deal.name}\n**SKU:** ${deal.sku}\n**Status:** ${deal.status}`,
      },
      {
        key: "parcels",
        heading: "Parcels",
        body_markdown: parcelSummary || "No parcels.",
      },
    ],
    sources_summary: [] as string[],
  };
  const rendered = await renderArtifactFromSpec(spec);

  const storageObjectKey = buildArtifactObjectKey({
    orgId: params.orgId,
    dealId: params.dealId,
    artifactType: params.artifactType,
    version: nextVersion,
    filename: rendered.filename,
  });

  // Store artifact record in DB
  const artifact = await prisma.artifact.create({
    data: {
      dealId: params.dealId,
      orgId: params.orgId,
      artifactType: params.artifactType,
      version: nextVersion,
      storageObjectKey,
      generatedByRunId: params.runId ?? "",
    },
  });

  return {
    id: artifact.id,
    artifactType: params.artifactType,
    storageObjectKey,
  };
}
