import { prisma, type Prisma } from "@entitlement-os/db";

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

const evidenceSnapshotSelect = {
  id: true,
  retrievedAt: true,
  contentHash: true,
  runId: true,
  contentType: true,
  storageObjectKey: true,
  textExtractObjectKey: true,
} satisfies Prisma.EvidenceSnapshotSelect;

const evidenceSourceSelect = {
  id: true,
  url: true,
  domain: true,
  title: true,
  isOfficial: true,
  firstSeenAt: true,
  _count: { select: { evidenceSnapshots: true } },
  evidenceSnapshots: {
    orderBy: { retrievedAt: "desc" },
    select: evidenceSnapshotSelect,
  },
} satisfies Prisma.EvidenceSourceSelect;

const singleSnapshotSelect = {
  id: true,
  contentType: true,
  storageObjectKey: true,
  textExtractObjectKey: true,
} satisfies Prisma.EvidenceSnapshotSelect;

type DownloadKind = "snapshot" | "text";
type DownloadResolverKind = "evidence_snapshot" | "evidence_extract";

export type EvidenceDownloadResolver = (params: {
  snapshotId: string;
  type: DownloadResolverKind;
}) => Promise<string | null>;

export class EvidenceDeliveryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceDeliveryNotFoundError";
  }
}

export function parseEvidenceLimit(value: string | null, fallback: number): number {
  if (value == null || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), 120));
}

export function parseEvidenceDownloadKind(value: string | null): DownloadKind {
  if (value === "text" || value === "snapshot") return value;
  return "snapshot";
}

export async function buildEvidencePackage(params: {
  orgId: string;
  sourceId: string;
  snapshotLimit: number;
  resolveDownloadUrl: EvidenceDownloadResolver;
}) {
  const source = (await prisma.evidenceSource.findFirst({
    where: { id: params.sourceId, orgId: params.orgId },
    select: {
      ...evidenceSourceSelect,
      evidenceSnapshots: {
        orderBy: { retrievedAt: "desc" },
        take: params.snapshotLimit,
        select: evidenceSnapshotSelect,
      },
    },
  })) as EvidenceSourceRecord | null;

  if (!source) {
    throw new EvidenceDeliveryNotFoundError("Evidence source not found");
  }

  const snapshots = await Promise.all(
    source.evidenceSnapshots.map(async (snapshot) => {
      const snapshotUrl = await params.resolveDownloadUrl({
        snapshotId: snapshot.id,
        type: "evidence_snapshot",
      });
      const textUrl = snapshot.textExtractObjectKey
        ? await params.resolveDownloadUrl({
            snapshotId: snapshot.id,
            type: "evidence_extract",
          })
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
                  filename: deriveFilename(
                    snapshot.textExtractObjectKey ?? `${snapshot.id}-text.txt`,
                  ),
                  contentType: "text/plain; charset=utf-8",
                  url: textUrl,
                },
              ]
            : []),
        ],
      };
    }),
  );

  return {
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
    fileCount: snapshots.reduce((count, item) => count + item.files.length, 0),
    snapshots,
  };
}

export async function buildEvidenceSnapshotDownload(params: {
  orgId: string;
  snapshotId: string;
  kind: DownloadKind;
  resolveDownloadUrl: EvidenceDownloadResolver;
}) {
  const snapshot = await prisma.evidenceSnapshot.findFirst({
    where: { id: params.snapshotId, orgId: params.orgId },
    select: singleSnapshotSelect,
  });

  if (!snapshot) {
    throw new EvidenceDeliveryNotFoundError("Snapshot not found");
  }

  const objectKey =
    params.kind === "text" ? snapshot.textExtractObjectKey : snapshot.storageObjectKey;

  if (!objectKey) {
    throw new EvidenceDeliveryNotFoundError(
      params.kind === "text"
        ? "No text extract file available for this snapshot"
        : "No snapshot file available for this snapshot",
    );
  }

  const type: DownloadResolverKind =
    params.kind === "text" ? "evidence_extract" : "evidence_snapshot";
  const url = await params.resolveDownloadUrl({
    snapshotId: params.snapshotId,
    type,
  });

  return {
    url,
    filename:
      params.kind === "text"
        ? buildFilename(snapshot.textExtractObjectKey ?? "text-extract.txt", `${snapshot.id}.txt`)
        : buildFilename(snapshot.storageObjectKey ?? `${snapshot.id}.bin`, `${snapshot.id}.bin`),
    contentType:
      params.kind === "text" ? "text/plain; charset=utf-8" : snapshot.contentType,
    snapshotId: snapshot.id,
    variant: params.kind,
  };
}

function deriveFilename(objectKey: string): string {
  if (!objectKey.includes("/")) return objectKey;
  return objectKey.split("/").at(-1) ?? objectKey;
}

function buildFilename(url: string, fallback: string): string {
  const tail = url.includes("/") ? url.split("/").at(-1) ?? fallback : fallback;
  return tail.replaceAll("?", "_").replaceAll("#", "_");
}
