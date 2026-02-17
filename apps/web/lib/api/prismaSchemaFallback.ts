export const PRISMA_SCHEMA_DRIFT_ERROR_CODES = new Set(["P2021", "P2022"]);

export type PrismaLikeError = {
  code?: string;
  message?: string;
};

const SCHEMA_DRIFT_MESSAGE_PATTERNS = [
  /does not exist/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
];

export function isSchemaDriftError(error: unknown): boolean {
  const candidate = error as PrismaLikeError;

  if (candidate?.code && PRISMA_SCHEMA_DRIFT_ERROR_CODES.has(candidate.code)) {
    return true;
  }

  if (typeof candidate?.message !== "string") {
    return false;
  }

  return SCHEMA_DRIFT_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(candidate.message ?? "")
  );
}

export const EMPTY_PORTFOLIO_RESPONSE = {
  deals: [],
  metrics: {
    totalDeals: 0,
    totalAcreage: 0,
    avgTriageScore: null,
    byStatus: {},
    bySku: {},
    byJurisdiction: {},
  },
};

export const EMPTY_PORTFOLIO_ANALYTICS_RESPONSE = {
  totalDeals: 0,
  activeDeals: 0,
  totalAcreage: 0,
  totalEquityDeployed: 0,
  weightedAvgIRR: null,
  weightedAvgCapRate: null,
  avgTriageScore: null,
  byStatus: {},
  bySku: {},
  byJurisdiction: {},
};

export const EMPTY_CONCENTRATION_RESPONSE = {
  geographic: [],
  sku: [],
  vintageYear: [],
  riskTier: [],
  lender: [],
  hhi: {
    parish: { value: 0, band: "green", top3: [] },
    sku: { value: 0, band: "green", top3: [] },
    lender: { value: 0, band: "green", top3: [] },
    hasAlert: false,
  },
};

export const EMPTY_DEBT_MATURITY_RESPONSE = {
  totalPortfolioDebt: 0,
  debtMaturing12Months: 0,
  debtMaturing12MonthsPct: 0,
  alert: false,
  quarters: [],
};
