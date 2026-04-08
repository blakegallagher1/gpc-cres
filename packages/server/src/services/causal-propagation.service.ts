import { prisma } from "@entitlement-os/db";

import { factTypeToDomain, getDownstreamPath } from "./causal-dag.service";

export interface PropagationStep {
  sourceDomain: string;
  targetDomain: string;
  impactDelta: number;
  impactCap: number;
  clampedDelta: number;
}

export interface PropagationResult {
  originEventId: string;
  sourceDomain: string;
  steps: PropagationStep[];
  traceIds: string[];
}

export async function propagateCausalImpact(
  orgId: string,
  entityId: string,
  originEventId: string,
  factType: string,
  impactDelta: number,
): Promise<PropagationResult> {
  const sourceDomain = factTypeToDomain(factType);
  if (!sourceDomain) {
    return { originEventId, sourceDomain: factType, steps: [], traceIds: [] };
  }

  const edges = getDownstreamPath(sourceDomain);
  if (edges.length === 0) {
    return { originEventId, sourceDomain, steps: [], traceIds: [] };
  }

  const steps: PropagationStep[] = [];
  const propagationPath: string[] = [];
  const traceDataArray: Array<{
    orgId: string;
    entityId: string;
    originEventId: string;
    sourceDomain: string;
    targetDomain: string;
    impactDelta: number;
    impactCap: number;
    clampedDelta: number;
    propagationPath: string[];
  }> = [];
  let currentDelta = Math.abs(impactDelta);

  for (const edge of edges) {
    const clampedDelta = Math.min(currentDelta, edge.impactCap);
    steps.push({
      sourceDomain: edge.source,
      targetDomain: edge.target,
      impactDelta: currentDelta,
      impactCap: edge.impactCap,
      clampedDelta,
    });
    propagationPath.push(`${edge.source}→${edge.target}`);
    traceDataArray.push({
      orgId,
      entityId,
      originEventId,
      sourceDomain: edge.source,
      targetDomain: edge.target,
      impactDelta: currentDelta,
      impactCap: edge.impactCap,
      clampedDelta,
      propagationPath: [...propagationPath],
    });

    currentDelta = clampedDelta * 0.8;
    if (currentDelta < 0.01) break;
  }

  const traceIds: string[] = [];
  if (traceDataArray.length > 0) {
    const created = await prisma.causalImpactTrace.createManyAndReturn({
      data: traceDataArray,
      select: { id: true },
    });
    traceIds.push(...created.map((row) => row.id));
  }

  return { originEventId, sourceDomain, steps, traceIds };
}

export async function getCausalTraces(
  orgId: string,
  entityId: string,
  limit = 50,
): Promise<
  Array<{
    id: string;
    originEventId: string;
    sourceDomain: string;
    targetDomain: string;
    impactDelta: number;
    clampedDelta: number;
    propagationPath: unknown;
    createdAt: Date;
  }>
> {
  return prisma.causalImpactTrace.findMany({
    where: { orgId, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
