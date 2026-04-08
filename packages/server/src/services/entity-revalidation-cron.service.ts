import { prisma } from "@entitlement-os/db";
import { detectCollisions, persistCollisionAlerts } from "./entity-collision-detector.service";

export async function runEntityRevalidationCron(): Promise<{
  success: true;
  orgsProcessed: number;
  summary: Array<{
    orgId: string;
    collisionsFound: number;
    alertsCreated: number;
  }>;
}> {
  const orgs = await prisma.org.findMany({ select: { id: true } });
  const summary: Array<{
    orgId: string;
    collisionsFound: number;
    alertsCreated: number;
  }> = [];

  for (const org of orgs) {
    const collisions = await detectCollisions(org.id);
    const created = await persistCollisionAlerts(org.id, collisions);
    summary.push({
      orgId: org.id,
      collisionsFound: collisions.length,
      alertsCreated: created,
    });
  }

  return {
    success: true,
    orgsProcessed: orgs.length,
    summary,
  };
}
