import type {
  BaseFinancialModelAssumptions,
  FinancialModelAssumptions,
  StressScenarioBundle,
  StressScenarioDefinition,
  StressScenarioId,
} from "@/stores/financialModelStore";

export type ScenarioMetricSnapshot = {
  leveredIRR: number | null;
  equityMultiple: number;
};

export type ScenarioRunResult = {
  scenario: StressScenarioDefinition;
  metrics: ScenarioMetricSnapshot;
};

const PREDEFINED_SCENARIOS: Array<{
  id: StressScenarioId;
  name: string;
  defaultProbabilityPct: number;
}> = [
  { id: "base", name: "Base", defaultProbabilityPct: 35 },
  { id: "upside", name: "Upside", defaultProbabilityPct: 15 },
  { id: "downside", name: "Downside", defaultProbabilityPct: 20 },
  { id: "rate_shock_200bps", name: "Rate Shock +200bps", defaultProbabilityPct: 10 },
  { id: "recession", name: "Recession", defaultProbabilityPct: 10 },
  { id: "tenant_loss", name: "Tenant Loss", defaultProbabilityPct: 10 },
];

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number): number {
  return Math.max(min, value);
}

export function toBaseAssumptions(
  assumptions: FinancialModelAssumptions,
): BaseFinancialModelAssumptions {
  return {
    acquisition: { ...assumptions.acquisition },
    income: { ...assumptions.income },
    expenses: { ...assumptions.expenses },
    financing: { ...assumptions.financing },
    exit: { ...assumptions.exit },
    buildableSf: assumptions.buildableSf,
  };
}

function buildScenarioAssumptions(
  base: BaseFinancialModelAssumptions,
  scenarioId: StressScenarioId,
): BaseFinancialModelAssumptions {
  const scenario: BaseFinancialModelAssumptions = {
    acquisition: { ...base.acquisition },
    income: { ...base.income },
    expenses: { ...base.expenses },
    financing: { ...base.financing },
    exit: { ...base.exit },
    buildableSf: base.buildableSf,
  };

  if (scenarioId === "upside") {
    scenario.income.rentPerSf = round(base.income.rentPerSf * 1.08, 4);
    scenario.income.vacancyPct = round(clamp(base.income.vacancyPct - 2, 0), 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct + 1, 4);
    scenario.expenses.opexPerSf = round(clamp(base.expenses.opexPerSf * 0.97, 0), 4);
    scenario.exit.exitCapRate = round(clamp(base.exit.exitCapRate - 0.5, 0.1), 4);
    return scenario;
  }

  if (scenarioId === "downside") {
    scenario.income.rentPerSf = round(clamp(base.income.rentPerSf * 0.93, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 3, 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct - 1, 4);
    scenario.expenses.opexPerSf = round(base.expenses.opexPerSf * 1.05, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 0.5, 4);
    return scenario;
  }

  if (scenarioId === "rate_shock_200bps") {
    scenario.financing.interestRate = round(base.financing.interestRate + 2, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 0.25, 4);
    return scenario;
  }

  if (scenarioId === "recession") {
    scenario.income.rentPerSf = round(clamp(base.income.rentPerSf * 0.85, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 7, 4);
    scenario.income.rentGrowthPct = round(base.income.rentGrowthPct - 2, 4);
    scenario.expenses.opexPerSf = round(base.expenses.opexPerSf * 1.08, 4);
    scenario.exit.exitCapRate = round(base.exit.exitCapRate + 1, 4);
    return scenario;
  }

  if (scenarioId === "tenant_loss") {
    scenario.income.rentPerSf = round(clamp(base.income.rentPerSf * 0.9, 0), 4);
    scenario.income.vacancyPct = round(base.income.vacancyPct + 15, 4);
    scenario.income.otherIncome = round(clamp(base.income.otherIncome * 0.85, 0), 4);
    return scenario;
  }

  return scenario;
}

function toBundleWithProbabilities(
  base: BaseFinancialModelAssumptions,
  existing?: StressScenarioBundle,
): StressScenarioBundle {
  const existingProbabilities = new Map<StressScenarioId, number>();
  if (existing?.scenarios) {
    for (const scenario of existing.scenarios) {
      existingProbabilities.set(scenario.id, scenario.probabilityPct);
    }
  }

  const scenarios: StressScenarioDefinition[] = PREDEFINED_SCENARIOS.map((entry) => ({
    id: entry.id,
    name: entry.name,
    probabilityPct: existingProbabilities.get(entry.id) ?? entry.defaultProbabilityPct,
    assumptions: buildScenarioAssumptions(base, entry.id),
  }));

  return {
    version: 1,
    scenarios,
  };
}

export function withStressScenarioBundle(
  assumptions: FinancialModelAssumptions,
): FinancialModelAssumptions {
  const base = toBaseAssumptions(assumptions);
  const stressScenarioBundle = toBundleWithProbabilities(base, assumptions.stressScenarioBundle);
  return {
    ...base,
    stressScenarioBundle,
  };
}

export function computeProbabilityWeightedMetrics(
  scenarioRuns: ScenarioRunResult[],
): {
  expectedLeveredIRR: number | null;
  expectedEquityMultiple: number | null;
} {
  if (scenarioRuns.length === 0) {
    return {
      expectedLeveredIRR: null,
      expectedEquityMultiple: null,
    };
  }

  let totalWeight = 0;
  let weightedEquityMultiple = 0;
  let irrWeight = 0;
  let weightedIrr = 0;

  for (const run of scenarioRuns) {
    const weight = run.scenario.probabilityPct;
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    totalWeight += weight;
    weightedEquityMultiple += run.metrics.equityMultiple * weight;
    if (run.metrics.leveredIRR !== null) {
      irrWeight += weight;
      weightedIrr += run.metrics.leveredIRR * weight;
    }
  }

  return {
    expectedLeveredIRR: irrWeight > 0 ? weightedIrr / irrWeight : null,
    expectedEquityMultiple: totalWeight > 0 ? weightedEquityMultiple / totalWeight : null,
  };
}

