import { describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@entitlement-os/shared", () => ({
  aggregateRentRoll: vi.fn(),
  summarizeDevelopmentBudget: vi.fn(() => ({ totalBudget: 0 })),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {},
}));

import {
  analyze_comparable_sales,
  analyze_title_commitment,
  estimate_phase_ii_scope,
  generate_zoning_compliance_checklist,
  optimize_debt_structure,
  recommend_entitlement_path,
} from "./dealTools";

describe("Phase D tool set", () => {
  it("recommend_entitlement_path returns ranked alternatives", async () => {
    const raw = await (
      recommend_entitlement_path as unknown as {
        execute: (input: {
          jurisdiction_id: string | null;
          sku: string;
          proposed_use: string;
          site_constraints: string[] | null;
          risk_tolerance: "conservative" | "moderate" | "aggressive";
        }) => Promise<string>;
      }
    ).execute({
      jurisdiction_id: "ebr",
      sku: "OUTDOOR_STORAGE",
      proposed_use: "Outdoor Storage",
      site_constraints: ["floodplain", "access easement"],
      risk_tolerance: "moderate",
    });

    const parsed = JSON.parse(raw) as {
      recommended_path: { path: string; approval_probability: number };
      alternatives_ranked: Array<{ path: string }>;
      risk_flags: string[];
    };

    expect(parsed.recommended_path.path).toBeTruthy();
    expect(parsed.recommended_path.approval_probability).toBeGreaterThan(0);
    expect(parsed.alternatives_ranked.length).toBeGreaterThan(0);
    expect(parsed.risk_flags.length).toBeGreaterThan(0);
  });

  it("analyze_comparable_sales returns valuation band + offer", async () => {
    const raw = await (
      analyze_comparable_sales as unknown as {
        execute: (input: {
          parcel_address: string;
          acreage: number;
          sku_type: string;
          comps: Array<{ address: string; salePrice: number; acreage: number; saleDate: string }>;
        }) => Promise<string>;
      }
    ).execute({
      parcel_address: "123 Main St",
      acreage: 4.2,
      sku_type: "SMALL_BAY_FLEX",
      comps: [
        { address: "A", salePrice: 1_500_000, acreage: 5, saleDate: "2025-01-10" },
        { address: "B", salePrice: 1_050_000, acreage: 3.5, saleDate: "2024-10-11" },
        { address: "C", salePrice: 1_980_000, acreage: 6.8, saleDate: "2023-12-05" },
      ],
    });

    const parsed = JSON.parse(raw) as {
      adjusted_comps: Array<{ adjusted_price_per_acre: number }>;
      valuation_range: { low: number; mid: number; high: number };
      recommended_offer_price: number;
    };

    expect(parsed.adjusted_comps).toHaveLength(3);
    expect(parsed.valuation_range.high).toBeGreaterThanOrEqual(parsed.valuation_range.low);
    expect(parsed.recommended_offer_price).toBeGreaterThan(0);
  });

  it("optimize_debt_structure returns conservative/moderate/aggressive profiles", async () => {
    const raw = await (
      optimize_debt_structure as unknown as {
        execute: (input: {
          purchase_price: number;
          noi: number;
          available_equity: number;
          risk_tolerance: "conservative" | "moderate" | "aggressive";
          debt_options: Array<{
            lenderType: string;
            maxLoan: number;
            interestRate: number;
            term: number;
            dscrRequired: number;
          }>;
        }) => Promise<string>;
      }
    ).execute({
      purchase_price: 2_000_000,
      noi: 260_000,
      available_equity: 900_000,
      risk_tolerance: "aggressive",
      debt_options: [
        { lenderType: "bank", maxLoan: 1_200_000, interestRate: 6.8, term: 25, dscrRequired: 1.2 },
        { lenderType: "credit_union", maxLoan: 1_050_000, interestRate: 6.2, term: 20, dscrRequired: 1.25 },
        { lenderType: "debt_fund", maxLoan: 1_450_000, interestRate: 8.1, term: 10, dscrRequired: 1.05 },
      ],
    });

    const parsed = JSON.parse(raw) as {
      ranked_structures: Array<{ profile: string; recommended: boolean; dscr: number }>;
    };

    expect(parsed.ranked_structures.map((row) => row.profile)).toEqual(
      expect.arrayContaining(["conservative", "moderate", "aggressive"]),
    );
    expect(parsed.ranked_structures.some((row) => row.recommended)).toBe(true);
    expect(parsed.ranked_structures.every((row) => row.dscr > 0)).toBe(true);
  });

  it("estimate_phase_ii_scope returns cost + probability outputs", async () => {
    const raw = await (
      estimate_phase_ii_scope as unknown as {
        execute: (input: {
          phase_i_recs: string[];
          site_acreage: number;
          groundwater_depth: number | null;
        }) => Promise<string>;
      }
    ).execute({
      phase_i_recs: ["Former UST location", "Potential solvent release near dry cleaner"],
      site_acreage: 6.5,
      groundwater_depth: 9,
    });

    const parsed = JSON.parse(raw) as {
      phase_ii_cost_range: { low: number; mid: number; high: number };
      probability_remediation_required: number;
    };

    expect(parsed.phase_ii_cost_range.mid).toBeGreaterThan(parsed.phase_ii_cost_range.low);
    expect(parsed.phase_ii_cost_range.high).toBeGreaterThan(parsed.phase_ii_cost_range.mid);
    expect(parsed.probability_remediation_required).toBeGreaterThan(0);
  });

  it("analyze_title_commitment returns exception/lien analysis", async () => {
    const raw = await (
      analyze_title_commitment as unknown as {
        execute: (input: { title_commitment_text: string; deal_type: string }) => Promise<string>;
      }
    ).execute({
      title_commitment_text: [
        "Schedule B Exception 4: Utility easement along south line",
        "Tax lien recorded in amount of $25,000",
        "Mortgage lien filed by regional bank",
      ].join("\n"),
      deal_type: "raw land",
    });

    const parsed = JSON.parse(raw) as {
      categorized_exceptions: Array<{ item: string }>;
      liens: Array<{ severity: string }>;
      title_insurance_cost_estimate: number;
    };

    expect(parsed.categorized_exceptions.length).toBeGreaterThan(0);
    expect(parsed.liens.length).toBeGreaterThan(0);
    expect(parsed.title_insurance_cost_estimate).toBeGreaterThan(0);
  });

  it("generate_zoning_compliance_checklist returns matrix + variance totals", async () => {
    const raw = await (
      generate_zoning_compliance_checklist as unknown as {
        execute: (input: {
          jurisdiction_id: string | null;
          sku: string;
          current_zoning: string | null;
          site_constraints: {
            acreage: number | null;
            proposed_height: number | null;
            parking_spaces: number | null;
            far: number | null;
          };
        }) => Promise<string>;
      }
    ).execute({
      jurisdiction_id: "ebr",
      sku: "TRUCK_PARKING",
      current_zoning: "C-2",
      site_constraints: {
        acreage: 2.2,
        proposed_height: 72,
        parking_spaces: 6,
        far: 1.8,
      },
    });

    const parsed = JSON.parse(raw) as {
      compliance_matrix: Array<{ item: string; variance_needed: boolean }>;
      total_variance_count: number;
      estimated_variance_cost: number;
    };

    expect(parsed.compliance_matrix.length).toBeGreaterThan(0);
    expect(parsed.total_variance_count).toBeGreaterThanOrEqual(0);
    expect(parsed.estimated_variance_cost).toBeGreaterThanOrEqual(0);
  });
});

