export interface CausalEdge {
  source: string;
  target: string;
  impactCap: number;
}

export const CAUSAL_DOMAINS = [
  "tour",
  "rehab",
  "noi",
  "dscr",
  "lender_risk",
  "interest_rate",
] as const;

export type CausalDomain = (typeof CAUSAL_DOMAINS)[number];

export const CAUSAL_EDGES: CausalEdge[] = [
  { source: "tour", target: "rehab", impactCap: 0.3 },
  { source: "rehab", target: "noi", impactCap: 0.25 },
  { source: "noi", target: "dscr", impactCap: 0.2 },
  { source: "dscr", target: "lender_risk", impactCap: 0.15 },
  { source: "lender_risk", target: "interest_rate", impactCap: 0.1 },
];

export function buildAdjacencyList(): Map<string, CausalEdge[]> {
  const adjacency = new Map<string, CausalEdge[]>();
  for (const edge of CAUSAL_EDGES) {
    const existing = adjacency.get(edge.source) ?? [];
    existing.push(edge);
    adjacency.set(edge.source, existing);
  }
  return adjacency;
}

export function getDownstreamPath(sourceDomain: string): CausalEdge[] {
  const adjacency = buildAdjacencyList();
  const path: CausalEdge[] = [];
  let current = sourceDomain;

  while (true) {
    const edges = adjacency.get(current);
    if (!edges || edges.length === 0) break;
    const edge = edges[0];
    path.push(edge);
    current = edge.target;
  }

  return path;
}

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
