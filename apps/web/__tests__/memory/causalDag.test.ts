import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CAUSAL_DOMAINS,
  CAUSAL_EDGES,
  buildAdjacencyList,
  getDownstreamPath,
  factTypeToDomain,
} from "@/lib/services/causalDag";

describe("CAUSAL_DOMAINS", () => {
  it("has 6 domains in correct order", () => {
    expect(CAUSAL_DOMAINS).toEqual([
      "tour",
      "rehab",
      "noi",
      "dscr",
      "lender_risk",
      "interest_rate",
    ]);
  });
});

describe("CAUSAL_EDGES", () => {
  it("has 5 edges forming a linear chain", () => {
    expect(CAUSAL_EDGES).toHaveLength(5);
    expect(CAUSAL_EDGES[0]).toEqual({ source: "tour", target: "rehab", impactCap: 0.30 });
    expect(CAUSAL_EDGES[4]).toEqual({ source: "lender_risk", target: "interest_rate", impactCap: 0.10 });
  });

  it("has decreasing impact caps", () => {
    for (let i = 1; i < CAUSAL_EDGES.length; i++) {
      expect(CAUSAL_EDGES[i].impactCap).toBeLessThan(CAUSAL_EDGES[i - 1].impactCap);
    }
  });
});

describe("buildAdjacencyList", () => {
  it("returns map with one outgoing edge per non-terminal domain", () => {
    const adj = buildAdjacencyList();
    expect(adj.get("tour")).toHaveLength(1);
    expect(adj.get("rehab")).toHaveLength(1);
    expect(adj.get("noi")).toHaveLength(1);
    expect(adj.get("dscr")).toHaveLength(1);
    expect(adj.get("lender_risk")).toHaveLength(1);
    expect(adj.has("interest_rate")).toBe(false); // terminal node
  });
});

describe("getDownstreamPath", () => {
  it("returns full path from tour (5 edges)", () => {
    const path = getDownstreamPath("tour");
    expect(path).toHaveLength(5);
    expect(path[0].source).toBe("tour");
    expect(path[4].target).toBe("interest_rate");
  });

  it("returns 2 edges from dscr", () => {
    const path = getDownstreamPath("dscr");
    expect(path).toHaveLength(2);
    expect(path[0].target).toBe("lender_risk");
    expect(path[1].target).toBe("interest_rate");
  });

  it("returns empty for terminal domain interest_rate", () => {
    const path = getDownstreamPath("interest_rate");
    expect(path).toHaveLength(0);
  });

  it("returns empty for unknown domain", () => {
    const path = getDownstreamPath("unknown");
    expect(path).toHaveLength(0);
  });
});

describe("factTypeToDomain", () => {
  it("maps tour_observation to tour", () => {
    expect(factTypeToDomain("tour_observation")).toBe("tour");
  });

  it("maps comp to noi", () => {
    expect(factTypeToDomain("comp")).toBe("noi");
  });

  it("maps lender_term to lender_risk", () => {
    expect(factTypeToDomain("lender_term")).toBe("lender_risk");
  });

  it("returns null for unmapped fact types", () => {
    expect(factTypeToDomain("correction")).toBeNull();
    expect(factTypeToDomain("unknown_type")).toBeNull();
  });
});
