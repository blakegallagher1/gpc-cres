import "server-only";

import { prisma } from "@entitlement-os/db";
import { getDownstreamPath, factTypeToDomain } from "./causalDag";
import type { CausalEdge } from "./causalDag";

/**
 * Causal propagation engine.
 *
 * When a memory write occurs in a causal domain, propagate its impact
 * downstream through the DAG, clamping deltas at each edge's impactCap.
 *
 * Single-origin constraint: each propagation traces back to exactly one
 * originating event. This prevents circular amplification.
 */

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

/**
 * Propagate a causal impact from a source domain through the DAG.
 *
 * @param orgId - Org scope
 * @param entityId - Entity the memory belongs to
 * @param originEventId - The event that triggered propagation
 * @param factType - The fact type of the originating memory write
 * @param impactDelta - The initial impact magnitude (0-1 scale)
 */
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
  let currentDelta = Math.abs(impactDelta);

  // Collect trace payloads during the loop — no DB calls here.
  // propagationPath is cumulative, so it must be captured per-step.
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
  const propagationPath: string[] = [];

  for (const edge of edges) {
    const clampedDelta = Math.min(currentDelta, edge.impactCap);

    const step: PropagationStep = {
      sourceDomain: edge.source,
      targetDomain: edge.target,
      impactDelta: currentDelta,
      impactCap: edge.impactCap,
      clampedDelta,
    };
    steps.push(step);
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

    // Attenuate: the clamped delta becomes the input for the next edge
    currentDelta = clampedDelta * 0.8; // 20% attenuation per hop

    if (currentDelta < 0.01) break; // Below noise floor, stop propagating
  }

  // Persist all trace records in a single batch insert and recover the generated IDs
  const traceIds: string[] = [];
  if (traceDataArray.length > 0) {
    const created = await prisma.causalImpactTrace.createManyAndReturn({
      data: traceDataArray,
      select: { id: true },
    });
    traceIds.push(...created.map((r) => r.id));
  }

  return { originEventId, sourceDomain, steps, traceIds };
}

/**
 * Get all causal traces for an entity, ordered by creation time.
 */
export async function getCausalTraces(
  orgId: string,
  entityId: string,
  limit = 50,
): Promise<Array<{
  id: string;
  originEventId: string;
  sourceDomain: string;
  targetDomain: string;
  impactDelta: number;
  clampedDelta: number;
  propagationPath: unknown;
  createdAt: Date;
}>> {
  return prisma.causalImpactTrace.findMany({
    where: { orgId, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
