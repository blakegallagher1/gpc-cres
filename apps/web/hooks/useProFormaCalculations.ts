import { useMemo } from "react";
import type { FinancialModelAssumptions } from "@/stores/financialModelStore";

// ---------------------------------------------------------------------------
// Core financial math — wraps the same logic from calculationTools.ts
// These are pure functions extracted so the UI never needs to import the
// agent SDK. The math is identical to calculate_proforma / calculate_debt_sizing.
// ---------------------------------------------------------------------------

function computeIRR(
  cashflows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 0.0001
): number | null {
  if (cashflows.length === 0) return null;
  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!(hasPositive && hasNegative)) return null;

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
  yearsElapsed: number
): number {
  const monthlyRate = annualRate / 12;
  const totalPayments = amortYears * 12;
  const paymentsMade = yearsElapsed * 12;
  if (monthlyRate === 0) {
    return Math.max(principal - (principal / totalPayments) * paymentsMade, 0);
  }
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

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AnnualCashFlow {
  year: number;
  noi: number;
  debtService: number;
  leveredCashFlow: number;
  cumulativeCashFlow: number;
  cashOnCash: number;
}

export interface AcquisitionBasis {
  purchasePrice: number;
  closingCosts: number;
  loanFees: number;
  totalBasis: number;
  loanAmount: number;
  equityRequired: number;
}

export interface ExitAnalysis {
  exitNoi: number;
  salePrice: number;
  dispositionCosts: number;
  loanPayoff: number;
  netProceeds: number;
  profit: number;
}

export interface ProFormaResults {
  acquisitionBasis: AcquisitionBasis;
  annualCashFlows: AnnualCashFlow[];
  exitAnalysis: ExitAnalysis;
  leveredIRR: number | null;
  unleveredIRR: number | null;
  equityMultiple: number;
  cashOnCashYear1: number;
  netProfit: number;
  goingInCapRate: number;
  annualDebtService: number;
  dscr: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProFormaCalculations(
  assumptions: FinancialModelAssumptions
): ProFormaResults {
  return useMemo(() => {
    const { acquisition, income, expenses, financing, exit, buildableSf } =
      assumptions;

    // --- Acquisition Basis ---
    const closingCosts =
      acquisition.purchasePrice * (acquisition.closingCostsPct / 100);
    const loanAmount =
      acquisition.purchasePrice * (financing.ltvPct / 100);
    const loanFees = loanAmount * (financing.loanFeePct / 100);
    const totalBasis = acquisition.purchasePrice + closingCosts + loanFees;
    const equityRequired = totalBasis - loanAmount;

    const acquisitionBasis: AcquisitionBasis = {
      purchasePrice: acquisition.purchasePrice,
      closingCosts: round(closingCosts, 0),
      loanFees: round(loanFees, 0),
      totalBasis: round(totalBasis, 0),
      loanAmount: round(loanAmount, 0),
      equityRequired: round(equityRequired, 0),
    };

    // --- Income & NOI ---
    const grossPotentialRent = buildableSf * income.rentPerSf;
    const effectiveGrossIncome =
      grossPotentialRent * (1 - income.vacancyPct / 100) + income.otherIncome;

    const totalOpex =
      buildableSf * expenses.opexPerSf +
      effectiveGrossIncome * (expenses.managementFeePct / 100) +
      buildableSf * expenses.capexReserves +
      buildableSf * expenses.insurance +
      buildableSf * expenses.taxes;

    const baseNoi = effectiveGrossIncome - totalOpex;

    // --- Debt Service ---
    const rate = financing.interestRate / 100;
    let annualDebtService = 0;
    if (loanAmount > 0 && rate > 0 && financing.amortizationYears > 0) {
      const monthlyRate = rate / 12;
      const numPayments = financing.amortizationYears * 12;
      const monthlyPayment =
        loanAmount *
        ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1));
      annualDebtService = monthlyPayment * 12;
    }
    const ioAnnualDebtService = loanAmount * rate;

    // Going-in cap rate
    const goingInCapRate =
      acquisition.purchasePrice > 0
        ? baseNoi / acquisition.purchasePrice
        : 0;

    // DSCR
    const dscr =
      annualDebtService > 0 ? baseNoi / annualDebtService : Infinity;

    // --- Annual Cash Flows ---
    const holdYears = Math.max(1, Math.min(exit.holdYears, 30));
    const leveredCFs: number[] = [-equityRequired];
    const unleveredCFs: number[] = [-totalBasis];
    const annualCashFlows: AnnualCashFlow[] = [];
    let cumulativeCF = 0;

    for (let y = 1; y <= holdYears; y++) {
      const growthFactor = Math.pow(1 + income.rentGrowthPct / 100, y - 1);
      const yearGrossRent = grossPotentialRent * growthFactor;
      const yearEgi =
        yearGrossRent * (1 - income.vacancyPct / 100) +
        income.otherIncome * growthFactor;

      // Expenses grow at 2% annually
      const yearOpex = totalOpex * Math.pow(1.02, y - 1);
      const yearNoi = yearEgi - yearOpex;

      // IO period: interest only; otherwise full amortizing
      const yearDS =
        y <= financing.ioPeriodYears ? ioAnnualDebtService : annualDebtService;

      const leveredCF = yearNoi - yearDS;
      cumulativeCF += leveredCF;

      leveredCFs.push(leveredCF);
      unleveredCFs.push(yearNoi);

      annualCashFlows.push({
        year: y,
        noi: round(yearNoi, 0),
        debtService: round(yearDS, 0),
        leveredCashFlow: round(leveredCF, 0),
        cumulativeCashFlow: round(cumulativeCF, 0),
        cashOnCash: equityRequired > 0 ? round(leveredCF / equityRequired, 4) : 0,
      });
    }

    // --- Exit Analysis ---
    const exitGrowthFactor = Math.pow(
      1 + income.rentGrowthPct / 100,
      holdYears
    );
    const exitNoi =
      (grossPotentialRent * exitGrowthFactor * (1 - income.vacancyPct / 100) +
        income.otherIncome * exitGrowthFactor) -
      totalOpex * Math.pow(1.02, holdYears);

    const salePrice =
      exit.exitCapRate > 0 ? exitNoi / (exit.exitCapRate / 100) : 0;
    const dispositionCosts = salePrice * (exit.dispositionCostsPct / 100);
    const loanPayoff =
      loanAmount > 0
        ? estimateRemainingBalance(
            loanAmount,
            rate,
            financing.amortizationYears,
            holdYears
          )
        : 0;
    const netProceeds = salePrice - dispositionCosts - loanPayoff;

    const exitAnalysis: ExitAnalysis = {
      exitNoi: round(exitNoi, 0),
      salePrice: round(salePrice, 0),
      dispositionCosts: round(dispositionCosts, 0),
      loanPayoff: round(loanPayoff, 0),
      netProceeds: round(netProceeds, 0),
      profit: round(netProceeds + cumulativeCF - equityRequired, 0),
    };

    // Add exit proceeds to terminal year for IRR
    leveredCFs[holdYears] += netProceeds;
    unleveredCFs[holdYears] += salePrice - dispositionCosts;

    // --- Return Metrics ---
    const leveredIRR = computeIRR(leveredCFs);
    const unleveredIRR = computeIRR(unleveredCFs);

    const totalLeveredReturn = cumulativeCF + netProceeds;
    const equityMultiple =
      equityRequired > 0 ? totalLeveredReturn / equityRequired : 0;

    const cashOnCashYear1 =
      annualCashFlows.length > 0 ? annualCashFlows[0].cashOnCash : 0;

    const netProfit = totalLeveredReturn - equityRequired;

    return {
      acquisitionBasis,
      annualCashFlows,
      exitAnalysis,
      leveredIRR,
      unleveredIRR,
      equityMultiple: round(equityMultiple, 2),
      cashOnCashYear1,
      netProfit: round(netProfit, 0),
      goingInCapRate: round(goingInCapRate, 4),
      annualDebtService: round(annualDebtService, 0),
      dscr: round(dscr === Infinity ? 999 : dscr, 2),
    };
  }, [assumptions]);
}
