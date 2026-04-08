import { prisma } from "@entitlement-os/db";

import { DealAccessError } from "./deal-workspace.service";

type DealScope = {
  dealId: string;
  orgId: string;
};

type UploadScope = DealScope & {
  uploadId: string;
};

type CreateDealUploadRecordParams = DealScope & {
  uploadId: string;
  userId: string;
  kind: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageObjectKey: string;
};

export class DealUploadNotFoundError extends Error {
  constructor() {
    super("Upload not found");
    this.name = "DealUploadNotFoundError";
  }
}

export async function ensureDealUploadAccess({
  dealId,
  orgId,
}: DealScope): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }
}

export async function listUploadsForDeal(scope: DealScope) {
  await ensureDealUploadAccess(scope);

  return prisma.upload.findMany({
    where: { dealId: scope.dealId, orgId: scope.orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUploadRecordForDeal(
  params: CreateDealUploadRecordParams,
) {
  await ensureDealUploadAccess(params);

  return prisma.upload.create({
    data: {
      id: params.uploadId,
      orgId: params.orgId,
      dealId: params.dealId,
      kind: params.kind,
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      storageObjectKey: params.storageObjectKey,
      uploadedBy: params.userId,
    },
  });
}

export async function getUploadForDeal(scope: UploadScope) {
  const upload = await prisma.upload.findFirst({
    where: { id: scope.uploadId, dealId: scope.dealId, orgId: scope.orgId },
  });

  if (!upload) {
    throw new DealUploadNotFoundError();
  }

  return upload;
}

export async function deleteUploadRecordForDeal(scope: UploadScope) {
  const result = await prisma.upload.deleteMany({
    where: { id: scope.uploadId, dealId: scope.dealId, orgId: scope.orgId },
  });

  if (result.count === 0) {
    throw new DealUploadNotFoundError();
  }
}
