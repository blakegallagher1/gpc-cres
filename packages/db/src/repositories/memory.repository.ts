import { prisma } from "../index.js";

export async function findVerifiedMemoryById(params: {
  id: string;
  orgId: string;
}) {
  return prisma.memoryVerified.findFirst({
    where: { id: params.id, orgId: params.orgId },
  });
}

export async function deleteVerifiedMemoryById(params: {
  id: string;
  orgId: string;
}): Promise<number> {
  const result = await prisma.memoryVerified.deleteMany({
    where: { id: params.id, orgId: params.orgId },
  });
  return result.count;
}
