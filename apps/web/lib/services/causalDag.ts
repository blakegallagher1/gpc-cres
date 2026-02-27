import "server-only";

/**
 * Causal DAG definition for cross-domain memory propagation.
 *
 * Directed acyclic graph: tour → rehab → noi → dscr → lender_risk → interest_rate
 *
 * Each edge has an impact_cap that limits how much a change in the source
 * domain can affect the target domain.  This prevents cascading overreaction.
 */

export interface CausalEdge {
  source: string;
  target: string;
  impactCap: number;
}

/**
 * The allowed domains and their causal relationships.
 * Order matters: earlier domains can cause effects in later domains only.
 */
export const CAUSAL_DOMAINS = [
  "tour",
  "rehab",
  "noi",
  "dscr",
  "lender_risk",
  "interest_rate",
] as const;

export type CausalDomain = (typeof CAUSAL_DOMAINS)[number];

/**
 * Causal edges with impact caps.
 * impact_cap represents the maximum absolute delta that can propagate
 * through this edge (fraction of 1.0 confidence scale).
 */
export const CAUSAL_EDGES: CausalEdge[] = [
  { source: "tour", target: "rehab", impactCap: 0.30 },
  { source: "rehab", target: "noi", impactCap: 0.25 },
  { source: "noi", target: "dscr", impactCap: 0.20 },
  { source: "dscr", target: "lender_risk", impactCap: 0.15 },
  { source: "lender_risk", target: "interest_rate", impactCap: 0.10 },
];

/**
 * Build adjacency list from edges for traversal.
 */
export function buildAdjacencyList(): Map<string, CausalEdge[]> {
  const adj = new Map<string, CausalEdge[]>();
  for (const edge of CAUSAL_EDGES) {
    const existing = adj.get(edge.source) ?? [];
    existing.push(edge);
    adj.set(edge.source, existing);
  }
  return adj;
}

/**
 * Get the downstream path from a source domain.
 * Returns edges in topological order from source to furthest reachable domain.
 */
export function getDownstreamPath(sourceDomain: string): CausalEdge[] {
  const adj = buildAdjacencyList();
  const path: CausalEdge[] = [];
  let current = sourceDomain;

  while (true) {
    const edges = adj.get(current);
    if (!edges || edges.length === 0) break;
    const edge = edges[0]; // DAG is linear, single downstream edge per domain
    path.push(edge);
    current = edge.target;
  }

  return path;
}

/**
 * Map a factType to its causal domain.
 */
export function factTypeToDomain(factType: string): CausalDomain | null {
  const mapping: Record<string, CausalDomain> = {
    tour_observation: "tour",
    rehab_estimate: "rehab",
    comp: "noi",
    projection: "noi",
    lender_term: "lender_risk",
    interest_rate_update: "interest_rate",
  };
  return mapping[factType] ?? null;
}
