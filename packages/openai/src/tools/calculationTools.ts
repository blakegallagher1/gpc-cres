import { tool } from "@openai/agents";
import { z } from "zod";
import {
  calculate1031Deadlines,
  calculateCostSegregationEstimate,
  calculateDepreciationSchedule,
  summarizeDevelopmentBudget,
} from "@entitlement-os/shared";
import { rpc as propertyRpc } from "./propertyDbTools.js";

// ==================== FINANCE TOOLS ====================

export const calculate_proforma = tool({
  name: "calculate_proforma",
  description:
    "Calculate a development pro forma with levered/unlevered IRR, equity multiple, and cash-on-cash return",
  parameters: z.object({
    purchase_price: z.number().describe("Total purchase/acquisition price"),
    noi: z.number().describe("Net operating income (annual, stabilized)"),
    exit_cap_rate: z
      .number()
      .describe("Expected exit cap rate (e.g. 0.07 for 7%)"),
    hold_years: z.number().describe("Planned hold period in years"),
    loan_amount: z
      .number()
      .nullable()
      .describe("Loan amount (null for all-equity)"),
    interest_rate: z
      .number()
      .nullable()
      .describe("Annual interest rate (e.g. 0.065 for 6.5%)"),
    amortization_years: z
      .number()
      .nullable()
      .describe("Loan amortization period in years"),
  }),
  execute: async (params) => {
    const {
      purchase_price,
      noi,
      exit_cap_rate,
      hold_years,
      loan_amount,
      interest_rate,
      amortization_years,
    } = params;
    const equity = purchase_price - (loan_amount ?? 0);

    // Calculate annual debt service
    let annualDebtService = 0;
    if (loan_amount && interest_rate && amortization_years) {
      const monthlyRate = interest_rate / 12;
      const numPayments = amortization_years * 12;
      const monthlyPayment =
        loan_amount *
        ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1));
      annualDebtService = monthlyPayment * 12;
    }

    // Terminal NOI grows 2% annually
    const terminalNOI = noi * Math.pow(1.02, hold_years);
    const exitValue = terminalNOI / exit_cap_rate;

    // Build cash flows
    const leveredCFs: number[] = [-equity];
    const unleveredCFs: number[] = [-purchase_price];
    let totalLeveredCF = 0;

    for (let y = 1; y <= hold_years; y++) {
      const yearNOI = noi * Math.pow(1.02, y - 1);
      unleveredCFs.push(yearNOI);
      const leveredCF = yearNOI - annualDebtService;
      leveredCFs.push(leveredCF);
      totalLeveredCF += leveredCF;
    }

    // Add exit proceeds
    const loanBalance = loan_amount
      ? estimateRemainingBalance(
          loan_amount,
          interest_rate ?? 0,
          amortization_years ?? 30,
          hold_years,
        )
      : 0;
    leveredCFs[hold_years] += exitValue - loanBalance;
    unleveredCFs[hold_years] += exitValue;
    totalLeveredCF += exitValue - loanBalance;

    const leveredIRR = computeIRR(leveredCFs);
    const unleveredIRR = computeIRR(unleveredCFs);
    const equityMultiple = totalLeveredCF / equity;
    const avgCashOnCash =
      (leveredCFs.slice(1, -1).reduce((s, v) => s + v, 0) +
        (leveredCFs[hold_years] - exitValue + loanBalance)) /
      (hold_years * equity);

    return JSON.stringify({
      levered_irr: round(leveredIRR, 4),
      unlevered_irr: round(unleveredIRR, 4),
      equity_multiple: round(equityMultiple, 2),
      avg_cash_on_cash: round(avgCashOnCash, 4),
      equity_required: equity,
      annual_debt_service: round(annualDebtService, 0),
      exit_value: round(exitValue, 0),
    });
  },
});

export const calculate_debt_sizing = tool({
  name: "calculate_debt_sizing",
  description:
    "Size the maximum loan based on DSCR constraint and calculate key debt metrics",
  parameters: z.object({
    noi: z.number().describe("Annual net operating income"),
    dscr_target: z
      .number()
      .describe("Target debt service coverage ratio (e.g. 1.25)"),
    interest_rate: z
      .number()
      .describe("Annual interest rate (e.g. 0.065 for 6.5%)"),
    amortization_years: z
      .number()
      .describe("Loan amortization period in years"),
  }),
  execute: async (params) => {
    const { noi, dscr_target, interest_rate, amortization_years } = params;

    const maxAnnualDS = noi / dscr_target;
    const monthlyRate = interest_rate / 12;
    const numPayments = amortization_years * 12;
    const maxMonthlyPayment = maxAnnualDS / 12;

    const maxLoan =
      maxMonthlyPayment *
      ((Math.pow(1 + monthlyRate, numPayments) - 1) /
        (monthlyRate * Math.pow(1 + monthlyRate, numPayments)));
    const debtYield = noi / maxLoan;

    return JSON.stringify({
      max_loan: round(maxLoan, 0),
      annual_debt_service: round(maxAnnualDS, 0),
      monthly_debt_service: round(maxAnnualDS / 12, 0),
      debt_yield: round(debtYield, 4),
      dscr: dscr_target,
    });
  },
});

export const calculate_development_budget = tool({
  name: "calculate_development_budget",
  description:
    "Calculate a development budget from explicit line items and contingency percentages",
  parameters: z.object({
    line_items: z
      .array(
        z.object({
          name: z.string().min(1).describe("Line item name"),
          category: z
            .enum(["hard", "soft", "other"])
            .describe("Line item category"),
          amount: z.number().nonnegative().describe("Line item amount in USD"),
        }),
      )
      .describe("Development budget line items"),
    contingencies: z
      .object({
        hard_cost_contingency_pct: z
          .number()
          .nullable()
          .describe("Hard cost contingency percent"),
        soft_cost_contingency_pct: z
          .number()
          .nullable()
          .describe("Soft cost contingency percent"),
        other_cost_contingency_pct: z
          .number()
          .nullable()
          .describe("Other cost contingency percent"),
      })
      .describe("Contingency percentages by category"),
  }),
  execute: async (params) => {
    const summary = summarizeDevelopmentBudget({
      lineItems: params.line_items.map((lineItem) => ({
        name: lineItem.name,
        category: lineItem.category,
        amount: lineItem.amount,
      })),
      contingencies: {
        hardCostContingencyPct: params.contingencies.hard_cost_contingency_pct ?? 0,
        softCostContingencyPct: params.contingencies.soft_cost_contingency_pct ?? 0,
        otherCostContingencyPct: params.contingencies.other_cost_contingency_pct ?? 0,
      },
    });

    return JSON.stringify({
      line_items: params.line_items,
      contingencies: {
        hard_cost_contingency_pct:
          params.contingencies.hard_cost_contingency_pct ?? 0,
        soft_cost_contingency_pct:
          params.contingencies.soft_cost_contingency_pct ?? 0,
        other_cost_contingency_pct:
          params.contingencies.other_cost_contingency_pct ?? 0,
      },
      hard_costs: round(summary.hardCosts, 0),
      soft_costs: round(summary.softCosts, 0),
      other_costs: round(summary.otherCosts, 0),
      subtotal: round(summary.lineItemsTotal, 0),
      total_contingency: round(summary.totalContingency, 0),
      total_dev_cost: round(summary.totalBudget, 0),
    });
  },
});

// ==================== DESIGN TOOLS ====================

export const calculate_site_capacity = tool({
  name: "calculate_site_capacity",
  description:
    "Calculate site development capacity including buildable area, parking, and impervious coverage",
  parameters: z.object({
    acreage: z.number().describe("Site acreage"),
    lot_coverage_pct: z
      .number()
      .nullable()
      .describe("Maximum lot coverage % (default varies by use)"),
    parking_ratio: z
      .number()
      .nullable()
      .describe("Parking spaces per 1000 SF (default varies by use)"),
    proposed_use: z
      .string()
      .describe(
        "Proposed use: SMALL_BAY_FLEX, OUTDOOR_STORAGE, or TRUCK_PARKING",
      ),
    setback_ft: z
      .number()
      .nullable()
      .describe("Average setback in feet (default 25)"),
  }),
  execute: async (params) => {
    const { acreage, lot_coverage_pct, parking_ratio, proposed_use, setback_ft } =
      params;

    const grossSF = acreage * 43560;
    const setback = setback_ft ?? 25;
    const perimeterFt = 4 * Math.sqrt(grossSF);
    const setbackArea = perimeterFt * setback;
    const netBuildableSF = Math.max(grossSF - setbackArea, 0);

    const coverageDefaults: Record<string, number> = {
      SMALL_BAY_FLEX: 45,
      OUTDOOR_STORAGE: 80,
      TRUCK_PARKING: 85,
    };
    const parkingDefaults: Record<string, number> = {
      SMALL_BAY_FLEX: 3.0,
      OUTDOOR_STORAGE: 0.5,
      TRUCK_PARKING: 0.2,
    };

    const coverage = lot_coverage_pct ?? coverageDefaults[proposed_use] ?? 40;
    const maxBuildingSF = netBuildableSF * (coverage / 100);
    const ratio = parking_ratio ?? parkingDefaults[proposed_use] ?? 2.0;
    const parkingSpaces = Math.floor((maxBuildingSF / 1000) * ratio);
    const parkingAreaSF = parkingSpaces * 350;
    const imperviousCoveragePct =
      ((maxBuildingSF + parkingAreaSF) / grossSF) * 100;

    return JSON.stringify({
      gross_sf: round(grossSF, 0),
      net_buildable_sf: round(netBuildableSF, 0),
      max_building_sf: round(maxBuildingSF, 0),
      parking_spaces: parkingSpaces,
      impervious_coverage_pct: round(
        Math.min(imperviousCoveragePct, 100),
        1,
      ),
    });
  },
});

export const estimate_construction_cost = tool({
  name: "estimate_construction_cost",
  description:
    "Estimate construction costs by category for a development project",
  parameters: z.object({
    buildable_sf: z.number().describe("Total buildable square footage"),
    proposed_use: z
      .string()
      .describe(
        "Proposed use: SMALL_BAY_FLEX, OUTDOOR_STORAGE, or TRUCK_PARKING",
      ),
    quality_level: z
      .string()
      .nullable()
      .describe(
        "Construction quality: standard, premium, or value (default standard)",
      ),
  }),
  execute: async (params) => {
    const { buildable_sf, proposed_use, quality_level } = params;

    const qualityMultiplier: Record<string, number> = {
      value: 0.8,
      standard: 1.0,
      premium: 1.3,
    };
    const mult = qualityMultiplier[quality_level ?? "standard"] ?? 1.0;

    const baseCosts: Record<string, Record<string, number>> = {
      SMALL_BAY_FLEX: {
        sitework: 8,
        foundation: 12,
        structure: 25,
        exterior: 15,
        mep: 18,
        finishes: 7,
      },
      OUTDOOR_STORAGE: { sitework: 6, grading: 4, fencing: 3, lighting: 2 },
      TRUCK_PARKING: {
        sitework: 4,
        grading: 3,
        paving: 5,
        striping: 1,
        lighting: 2,
      },
    };

    const costs = baseCosts[proposed_use] ?? baseCosts.SMALL_BAY_FLEX;
    const breakdown: Record<string, number> = {};
    let totalHard = 0;

    for (const [category, costPerSF] of Object.entries(costs)) {
      const cost = buildable_sf * costPerSF * mult;
      breakdown[category] = round(cost, 0);
      totalHard += cost;
    }

    const softCost = totalHard * 0.2;
    const totalProjectCost = totalHard + softCost;

    return JSON.stringify({
      cost_per_sf: round(totalHard / buildable_sf, 2),
      total_hard_cost: round(totalHard, 0),
      total_soft_cost: round(softCost, 0),
      total_project_cost: round(totalProjectCost, 0),
      breakdown_by_category: breakdown,
    });
  },
});

// ==================== OPERATIONS TOOLS ====================

export const create_milestone_schedule = tool({
  name: "create_milestone_schedule",
  description:
    "Generate a milestone schedule for a development project based on use type and current stage",
  parameters: z.object({
    proposed_use: z
      .string()
      .describe(
        "Proposed use: SMALL_BAY_FLEX, OUTDOOR_STORAGE, or TRUCK_PARKING",
      ),
    current_stage: z.string().describe("Current deal status stage"),
  }),
  execute: async (params) => {
    const { proposed_use, current_stage } = params;

    const milestones = [
      {
        name: "Site Due Diligence",
        duration_days: 30,
        dependencies: [],
        typical_start_offset_days: 0,
      },
      {
        name: "Environmental Assessment",
        duration_days: 45,
        dependencies: ["Site Due Diligence"],
        typical_start_offset_days: 15,
      },
      {
        name: "Zoning/Entitlement Application",
        duration_days: 14,
        dependencies: ["Site Due Diligence"],
        typical_start_offset_days: 30,
      },
      {
        name: "Public Hearing",
        duration_days: 60,
        dependencies: ["Zoning/Entitlement Application"],
        typical_start_offset_days: 44,
      },
      {
        name: "Engineering & Design",
        duration_days: 60,
        dependencies: ["Public Hearing"],
        typical_start_offset_days: 104,
      },
      {
        name: "Permitting",
        duration_days: 30,
        dependencies: ["Engineering & Design"],
        typical_start_offset_days: 164,
      },
      {
        name: "Site Preparation",
        duration_days: proposed_use === "OUTDOOR_STORAGE" ? 30 : 45,
        dependencies: ["Permitting"],
        typical_start_offset_days: 194,
      },
      {
        name: "Construction",
        duration_days:
          proposed_use === "SMALL_BAY_FLEX"
            ? 180
            : proposed_use === "OUTDOOR_STORAGE"
              ? 60
              : 45,
        dependencies: ["Site Preparation"],
        typical_start_offset_days:
          proposed_use === "SMALL_BAY_FLEX" ? 239 : 224,
      },
      {
        name: "Final Inspection & CO",
        duration_days: 14,
        dependencies: ["Construction"],
        typical_start_offset_days:
          proposed_use === "SMALL_BAY_FLEX" ? 419 : 284,
      },
    ];

    const stageOrder = [
      "INTAKE",
      "TRIAGE_DONE",
      "PREAPP",
      "CONCEPT",
      "NEIGHBORS",
      "SUBMITTED",
      "HEARING",
      "APPROVED",
    ];
    const currentIdx = stageOrder.indexOf(current_stage);

    const remaining =
      currentIdx >= 5
        ? milestones.slice(4)
        : currentIdx >= 3
          ? milestones.slice(2)
          : milestones;

    return JSON.stringify({ milestones: remaining, proposed_use, current_stage });
  },
});

export const estimate_project_timeline = tool({
  name: "estimate_project_timeline",
  description:
    "Estimate months to project completion and identify critical path items",
  parameters: z.object({
    current_stage: z.string().describe("Current deal status stage"),
    tasks_remaining: z
      .number()
      .nullable()
      .describe("Number of pending tasks"),
    has_entitlement_approval: z
      .boolean()
      .nullable()
      .describe("Whether entitlements are approved"),
  }),
  execute: async (params) => {
    const { current_stage, tasks_remaining, has_entitlement_approval } = params;

    const monthsByStage: Record<string, number> = {
      INTAKE: 18,
      TRIAGE_DONE: 16,
      PREAPP: 14,
      CONCEPT: 12,
      NEIGHBORS: 10,
      SUBMITTED: 8,
      HEARING: 6,
      APPROVED: 4,
      EXIT_MARKETED: 2,
      EXITED: 0,
    };

    let months = monthsByStage[current_stage] ?? 12;
    if (has_entitlement_approval) months = Math.min(months, 4);

    const criticalPath = [];
    const riskFactors = [];

    if (
      !has_entitlement_approval &&
      [
        "INTAKE",
        "TRIAGE_DONE",
        "PREAPP",
        "CONCEPT",
        "NEIGHBORS",
        "SUBMITTED",
      ].includes(current_stage)
    ) {
      criticalPath.push("Entitlement approval");
      riskFactors.push("Entitlement denial or conditions");
    }
    if (current_stage === "HEARING") {
      criticalPath.push("Hearing outcome");
      riskFactors.push("Unfavorable hearing result");
    }
    criticalPath.push("Construction timeline");
    riskFactors.push("Weather delays", "Supply chain disruptions");

    if ((tasks_remaining ?? 0) > 10) {
      riskFactors.push("High number of pending tasks may cause delays");
    }

    return JSON.stringify({
      estimated_months_to_completion: months,
      critical_path_items: criticalPath,
      risk_factors: riskFactors,
    });
  },
});

// ==================== TAX TOOLS ====================

export const calculate_depreciation_schedule = tool({
  name: "calculate_depreciation_schedule",
  description:
    "Calculate MACRS depreciation schedule for a commercial property",
  parameters: z.object({
    cost_basis: z
      .number()
      .describe("Depreciable cost basis (exclude land value)"),
    property_type: z
      .string()
      .describe(
        "Property type: commercial_building, land_improvements, personal_property, or equipment",
      ),
    placed_in_service_year: z.number().describe("Year placed in service"),
  }),
  execute: async (params) => {
    const { cost_basis, property_type, placed_in_service_year } = params;
    const scheduleResult = calculateDepreciationSchedule({
      costBasis: cost_basis,
      propertyType:
        property_type === "commercial_building" ||
        property_type === "land_improvements" ||
        property_type === "personal_property" ||
        property_type === "equipment"
          ? property_type
          : "commercial_building",
      placedInServiceYear: placed_in_service_year,
      projectionYears: 10,
    });

    return JSON.stringify({
      schedule: scheduleResult.schedule.map((entry) => ({
        year: entry.year,
        deduction: entry.deduction,
        accumulated: entry.accumulated,
        remaining_basis: entry.remainingBasis,
      })),
      method: scheduleResult.method,
      recovery_period_years: scheduleResult.recoveryPeriodYears,
      total_depreciable_basis: scheduleResult.totalDepreciableBasis,
      typical_annual_deduction: scheduleResult.typicalAnnualDeduction,
    });
  },
});

export const calculate_cost_segregation_estimate = tool({
  name: "calculate_cost_segregation_estimate",
  description:
    "Estimate benefits of a cost segregation study for accelerated depreciation",
  parameters: z.object({
    total_basis: z
      .number()
      .describe("Total depreciable basis of the property"),
    property_type: z
      .string()
      .describe(
        "Property type: SMALL_BAY_FLEX, OUTDOOR_STORAGE, or TRUCK_PARKING",
      ),
  }),
  execute: async (params) => {
    const { total_basis, property_type } = params;
    const estimate = calculateCostSegregationEstimate({
      totalBasis: total_basis,
      propertyType:
        property_type === "SMALL_BAY_FLEX" ||
        property_type === "OUTDOOR_STORAGE" ||
        property_type === "TRUCK_PARKING"
          ? property_type
          : "SMALL_BAY_FLEX",
    });

    return JSON.stringify({
      personal_property_pct: estimate.personalPropertyPct,
      land_improvements_pct: estimate.landImprovementsPct,
      building_pct: estimate.buildingPct,
      estimated_first_year_deduction: estimate.estimatedFirstYearDeduction,
      without_cost_seg_first_year: estimate.withoutCostSegFirstYear,
      estimated_npv_benefit: estimate.estimatedNpvBenefit,
    });
  },
});

export const calculate_1031_deadlines = tool({
  name: "calculate_1031_deadlines",
  description:
    "Calculate IRC 1031 exchange deadlines from a property sale close date",
  parameters: z.object({
    sale_close_date: z
      .string()
      .describe("Sale closing date in ISO format (YYYY-MM-DD)"),
  }),
  execute: async (params) => {
    const { sale_close_date } = params;
    const deadlines = calculate1031Deadlines({
      saleCloseDate: sale_close_date,
    });

    return JSON.stringify({
      sale_close_date: deadlines.saleCloseDate,
      identification_deadline: deadlines.identificationDeadline,
      closing_deadline: deadlines.closingDeadline,
      days_remaining_identification: deadlines.daysRemainingIdentification,
      days_remaining_closing: deadlines.daysRemainingClosing,
      is_identification_expired: deadlines.isIdentificationExpired,
      is_closing_expired: deadlines.isClosingExpired,
    });
  },
});

// ==================== MARKET INTEL TOOLS ====================

export const search_comparable_sales = tool({
  name: "search_comparable_sales",
  description:
    "Search for comparable property sales in the Louisiana Property Database",
  parameters: z.object({
    address: z
      .string()
      .describe("Subject property address to search around"),
    radius_miles: z
      .number()
      .nullable()
      .describe("Search radius in miles (default 5)"),
    proposed_use: z
      .string()
      .nullable()
      .describe("Filter by use type if available"),
    parish: z.string().nullable().describe("Parish name to search in"),
  }),
  execute: async (params) => {
    const { address, proposed_use, parish } = params;
    const normalizedAddress = address
      .replace(/[''`,.#]/g, "")
      .replace(/\\s+/g, " ")
      .trim();
    const normalizedParish = parish ? parish.trim() : null;

    const result = await propertyRpc("api_search_parcels", {
      search_text: normalizedAddress,
      ...(proposed_use ? { proposed_use } : {}),
      parish: parish ? normalizedParish : null,
      limit_rows: 20,
    });

    const parcels = Array.isArray(result) ? result : [];
    const comparableParcels = parcels as Array<Record<string, unknown>>;
    const comparables = comparableParcels.map((p) => ({
      address: p.site_address ?? p.address ?? "Unknown",
      acreage: p.acreage ? Number(p.acreage) : null,
      sale_price: p.sale_price ? Number(p.sale_price) : null,
      price_per_acre:
        p.acreage && p.sale_price
          ? round(Number(p.sale_price) / Number(p.acreage), 0)
          : null,
      sale_date: p.sale_date ?? null,
      use_type: p.use_code ?? p.land_use ?? null,
      parcel_id: p.id ?? null,
    }));

    return JSON.stringify({
      comparables,
      search_address: address,
      result_count: comparables.length,
    });
  },
});

export const calculate_market_metrics = tool({
  name: "calculate_market_metrics",
  description:
    "Calculate market metrics from an array of comparable sales data",
  parameters: z.object({
    comparables: z
      .array(
        z.object({
          sale_price: z.number().nullable(),
          acreage: z.number().nullable(),
        }),
      )
      .describe(
        "Array of comparable sale objects with sale_price and acreage",
      ),
    subject_acreage: z
      .number()
      .nullable()
      .describe("Subject property acreage for implied value"),
  }),
  execute: async (params) => {
    const { comparables, subject_acreage } = params;

    const withPricePerAcre = comparables
      .filter((c) => c.sale_price && c.acreage && c.acreage > 0)
      .map((c) => ({ ...c, price_per_acre: c.sale_price! / c.acreage! }));

    if (withPricePerAcre.length === 0) {
      return JSON.stringify({
        error: "No valid comparables with price and acreage data",
      });
    }

    const prices = withPricePerAcre
      .map((c) => c.price_per_acre)
      .sort((a, b) => a - b);
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    const median =
      prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)];

    const impliedValue = subject_acreage
      ? {
          low: round(prices[0] * subject_acreage, 0),
          mid: round(median * subject_acreage, 0),
          high: round(prices[prices.length - 1] * subject_acreage, 0),
        }
      : null;

    return JSON.stringify({
      avg_price_per_acre: round(avg, 0),
      median_price_per_acre: round(median, 0),
      price_range: {
        low: round(prices[0], 0),
        high: round(prices[prices.length - 1], 0),
      },
      implied_value_range: impliedValue,
      sample_size: withPricePerAcre.length,
    });
  },
});

// ==================== HELPER FUNCTIONS ====================

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function computeIRR(
  cashflows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 0.0001,
): number {
  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      dnpv -= (t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < tolerance) return rate;
    if (dnpv === 0) break;
    rate -= npv / dnpv;
  }
  return rate;
}

function estimateRemainingBalance(
  principal: number,
  annualRate: number,
  amortYears: number,
  yearsElapsed: number,
): number {
  const monthlyRate = annualRate / 12;
  const totalPayments = amortYears * 12;
  const paymentsMade = yearsElapsed * 12;
  const monthlyPayment =
    principal *
    ((monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) /
      (Math.pow(1 + monthlyRate, totalPayments) - 1));
  const balance =
    principal * Math.pow(1 + monthlyRate, paymentsMade) -
    (monthlyPayment * (Math.pow(1 + monthlyRate, paymentsMade) - 1)) /
      monthlyRate;
  return Math.max(balance, 0);
}
