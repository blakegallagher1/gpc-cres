import {
  deleteVerifiedMemoryById,
  findVerifiedMemoryById,
} from "@entitlement-os/db";

export async function deleteVerifiedMemory(params: {
  id: string;
  orgId: string;
}): Promise<boolean> {
  const existing = await findVerifiedMemoryById(params);
  if (!existing) {
    return false;
  }

  await deleteVerifiedMemoryById(params);
  return true;
}
