import { prisma } from "@entitlement-os/db";

export async function userHasHealthAccess(userId: string): Promise<boolean> {
  const membership = await prisma.orgMembership.findFirst({
    where: { userId },
    select: { orgId: true },
  });

  return Boolean(membership?.orgId);
}
