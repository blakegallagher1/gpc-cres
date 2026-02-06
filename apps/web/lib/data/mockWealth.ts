// Mock data for Personal Wealth dashboard

export interface Entity {
  id: string;
  name: string;
  type: "LLC" | "Trust" | "Corp" | "Individual";
  parentId: string | null;
  ownershipPct: number;
  taxId?: string;
  state: string;
  associatedDealIds: string[];
}

export interface CashFlowItem {
  label: string;
  amount: number;
  type: "revenue" | "expense" | "subtotal" | "distribution";
}

export interface TaxAlert {
  id: string;
  type: "1031_exchange" | "cost_seg" | "oz_deadline" | "depreciation_recapture";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  deadline?: string;
  daysRemaining?: number;
  entityName: string;
  estimatedImpact?: number;
}

export interface DepreciationRow {
  propertyName: string;
  entityName: string;
  basis: number;
  method: string;
  yearPlaced: number;
  annualDeduction: number;
  accumulatedDepr: number;
  remainingBasis: number;
}

export interface Exchange1031 {
  id: string;
  propertyRelinquished: string;
  saleDate: string;
  salePrice: number;
  identificationDeadline: string;
  closingDeadline: string;
  status: "identification" | "closing" | "completed" | "expired";
  candidateProperties: string[];
  gain: number;
}

export const mockEntities: Entity[] = [
  {
    id: "e1",
    name: "Gallagher Holdings LLC",
    type: "LLC",
    parentId: null,
    ownershipPct: 100,
    taxId: "XX-XXX1234",
    state: "LA",
    associatedDealIds: [],
  },
  {
    id: "e2",
    name: "GPC Development I LLC",
    type: "LLC",
    parentId: "e1",
    ownershipPct: 100,
    taxId: "XX-XXX5678",
    state: "LA",
    associatedDealIds: ["d1", "d3"],
  },
  {
    id: "e3",
    name: "GPC Storage Holdings LLC",
    type: "LLC",
    parentId: "e1",
    ownershipPct: 100,
    taxId: "XX-XXX9012",
    state: "LA",
    associatedDealIds: ["d2", "d9"],
  },
  {
    id: "e4",
    name: "GPC Flex Properties LLC",
    type: "LLC",
    parentId: "e1",
    ownershipPct: 100,
    state: "LA",
    associatedDealIds: ["d5", "d8", "d10"],
  },
  {
    id: "e5",
    name: "Gallagher Family Trust",
    type: "Trust",
    parentId: null,
    ownershipPct: 100,
    state: "LA",
    associatedDealIds: [],
  },
  {
    id: "e6",
    name: "GPC Land Trust I",
    type: "Trust",
    parentId: "e5",
    ownershipPct: 100,
    state: "LA",
    associatedDealIds: ["d7"],
  },
  {
    id: "e7",
    name: "GPC Opportunity Zone LLC",
    type: "LLC",
    parentId: "e1",
    ownershipPct: 100,
    state: "LA",
    associatedDealIds: ["d4"],
  },
];

export const mockNetWorth = {
  total: 8_750_000,
  realEstate: 6_200_000,
  cash: 1_350_000,
  other: 1_200_000,
  lastPeriodTotal: 8_120_000,
  change: 630_000,
  changePct: 7.8,
};

export const mockCashFlow: CashFlowItem[] = [
  { label: "Gross Revenue", amount: 1_840_000, type: "revenue" },
  { label: "Operating Expenses", amount: -620_000, type: "expense" },
  { label: "Net Operating Income", amount: 1_220_000, type: "subtotal" },
  { label: "Debt Service", amount: -480_000, type: "expense" },
  { label: "Net Cash Flow", amount: 740_000, type: "subtotal" },
  { label: "Distributions", amount: -320_000, type: "distribution" },
  { label: "Retained Earnings", amount: 420_000, type: "subtotal" },
];

export const mockCapitalAllocation = [
  { label: "Active Development", value: 2_400_000, pct: 27.4, color: "#3b82f6" },
  { label: "Stabilized Holdings", value: 3_800_000, pct: 43.4, color: "#22c55e" },
  { label: "Cash Reserves", value: 1_350_000, pct: 15.4, color: "#6366f1" },
  { label: "Other Investments", value: 1_200_000, pct: 13.7, color: "#f59e0b" },
];

export const mockTaxAlerts: TaxAlert[] = [
  {
    id: "t1",
    type: "1031_exchange",
    title: "1031 Exchange - Identification Period Closing",
    description:
      "Burbank Dr Storage Depot sale proceeds must have replacement property identified within 45 days.",
    severity: "critical",
    deadline: "2026-03-15T00:00:00Z",
    daysRemaining: 38,
    entityName: "GPC Storage Holdings LLC",
    estimatedImpact: 85_000,
  },
  {
    id: "t2",
    type: "cost_seg",
    title: "Cost Segregation Study Candidate",
    description:
      "Plank Rd Flex Suites recently approved - eligible for cost segregation study to accelerate depreciation.",
    severity: "info",
    entityName: "GPC Flex Properties LLC",
    estimatedImpact: 120_000,
  },
  {
    id: "t3",
    type: "oz_deadline",
    title: "Opportunity Zone Investment Deadline",
    description:
      "Walker South Industrial is in an OZ. Capital gains must be invested by year-end to qualify for deferral.",
    severity: "warning",
    deadline: "2026-12-31T00:00:00Z",
    daysRemaining: 329,
    entityName: "GPC Opportunity Zone LLC",
    estimatedImpact: 65_000,
  },
  {
    id: "t4",
    type: "depreciation_recapture",
    title: "Depreciation Recapture Exposure",
    description:
      "Prairieville Flex Center exit triggers $210K in depreciation recapture at 25% rate.",
    severity: "warning",
    entityName: "GPC Flex Properties LLC",
    estimatedImpact: 52_500,
  },
];

export const mockDepreciation: DepreciationRow[] = [
  {
    propertyName: "Airline Hwy Flex Park",
    entityName: "GPC Development I LLC",
    basis: 680_000,
    method: "MACRS 39-yr",
    yearPlaced: 2025,
    annualDeduction: 17_436,
    accumulatedDepr: 17_436,
    remainingBasis: 662_564,
  },
  {
    propertyName: "Plank Rd Flex Suites",
    entityName: "GPC Flex Properties LLC",
    basis: 740_000,
    method: "MACRS 39-yr",
    yearPlaced: 2026,
    annualDeduction: 18_974,
    accumulatedDepr: 0,
    remainingBasis: 740_000,
  },
  {
    propertyName: "Greenwell Springs Truck Terminal",
    entityName: "GPC Development I LLC",
    basis: 520_000,
    method: "MACRS 15-yr",
    yearPlaced: 2025,
    annualDeduction: 34_667,
    accumulatedDepr: 34_667,
    remainingBasis: 485_333,
  },
  {
    propertyName: "Gonzales Commerce Park",
    entityName: "GPC Flex Properties LLC",
    basis: 550_000,
    method: "MACRS 39-yr",
    yearPlaced: 2024,
    annualDeduction: 14_103,
    accumulatedDepr: 28_205,
    remainingBasis: 521_795,
  },
];

export const mock1031Exchanges: Exchange1031[] = [
  {
    id: "x1",
    propertyRelinquished: "Burbank Dr Storage Depot",
    saleDate: "2026-01-30T00:00:00Z",
    salePrice: 290_000,
    identificationDeadline: "2026-03-15T00:00:00Z",
    closingDeadline: "2026-07-29T00:00:00Z",
    status: "identification",
    candidateProperties: [
      "Hoo Shoo Too Rd Storage Expansion",
      "Airline Hwy Storage Lot B",
    ],
    gain: 145_000,
  },
];
