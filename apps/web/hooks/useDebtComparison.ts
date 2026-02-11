import { useMemo } from "react";
import { estimateRemainingBalance } from "@/hooks/useProFormaCalculations";

// ---------------------------------------------------------------------------
// Loan structure types
// ---------------------------------------------------------------------------

export type PrepaymentType = "none" | "yield_maintenance" | "defeasance" | "step_down";

export interface LoanStructure {
  id: string;
  name: string;
  /** fixed or floating */
  rateType: "fixed" | "floating";
  /** Annual interest rate in % (e.g., 6.5) */
  ratePct: number;
  /** Spread in bps above index for floating (e.g., 250 = 2.50%) */
  spreadBps: number;
  /** IO period in months */
  ioMonths: number;
  /** Amortization period in years */
  amortizationYears: number;
  /** Loan term in years */
  termYears: number;
  /** Origination fees in % (e.g., 1.0) */
  originationFeePct: number;
  /** Prepayment penalty structure */
  prepaymentType: PrepaymentType;
  /** Step-down schedule: penalty % for each year (e.g., [5, 4, 3, 2, 1]) */
  stepDownSchedule: number[];
}

// ---------------------------------------------------------------------------
// Loan analysis output
// ---------------------------------------------------------------------------

export interface YearlyDebtDetail {
  year: number;
  beginningBalance: number;
  annualDebtService: number;
  interestPortion: number;
  principalPortion: number;
  endingBalance: number;
  prepaymentPenalty: number;
  totalExitCost: number;
}

export interface LoanAnalysis {
  loan: LoanStructure;
  loanAmount: number;
  originationFees: number;
  effectiveRate: number;
  totalInterestCost: number;
  avgAnnualDebtService: number;
  ioDebtService: number;
  amortizingDebtService: number;
  yearlyDetails: YearlyDebtDetail[];
  totalCostAtHold: number;
  isOptimal: boolean;
}

// ---------------------------------------------------------------------------
// Pure calculation
// ---------------------------------------------------------------------------

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  amortYears: number
): number {
  if (principal <= 0 || annualRate <= 0 || amortYears <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numPayments = amortYears * 12;
  return (
    principal *
    ((monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1))
  );
}

function calcPrepaymentPenalty(
  loan: LoanStructure,
  balance: number,
  exitYear: number,
  annualRate: number,
  remainingTermYears: number
): number {
  switch (loan.prepaymentType) {
    case "none":
      return 0;

    case "yield_maintenance": {
      // Simplified: present value of rate differential over remaining term
      // Assumes treasury rate ~2% below contract rate (simplified proxy)
      const treasuryProxy = Math.max(annualRate - 0.02, 0.01);
      const rateDiff = annualRate - treasuryProxy;
      const remaining = Math.max(remainingTermYears, 0);
      if (remaining <= 0 || rateDiff <= 0) return 0;
      // PV of differential payments
      let pv = 0;
      for (let m = 1; m <= remaining * 12; m++) {
        pv += (balance * rateDiff / 12) / Math.pow(1 + treasuryProxy / 12, m);
      }
      return Math.max(pv, balance * 0.01); // Floor at 1% of balance
    }

    case "defeasance": {
      // Typically similar cost to yield maintenance, slightly higher
      const remaining = Math.max(remainingTermYears, 0);
      if (remaining <= 0) return 0;
      // Approximate: 1-3% of balance depending on remaining term
      const pctOfBalance = Math.min(remaining * 0.005 + 0.01, 0.05);
      return balance * pctOfBalance;
    }

    case "step_down": {
      const schedule = loan.stepDownSchedule;
      if (exitYear <= 0 || exitYear > schedule.length) return 0;
      const penaltyPct = schedule[exitYear - 1] ?? 0;
      return balance * (penaltyPct / 100);
    }

    default:
      return 0;
  }
}

export function analyzeLoan(
  loan: LoanStructure,
  loanAmount: number,
  holdYears: number
): LoanAnalysis {
  const rate = loan.ratePct / 100;
  const originationFees = loanAmount * (loan.originationFeePct / 100);
  const ioYears = loan.ioMonths / 12;

  // Debt service calculations
  const ioAnnualDS = loanAmount * rate;
  const monthlyAmort = calcMonthlyPayment(loanAmount, rate, loan.amortizationYears);
  const amortAnnualDS = monthlyAmort * 12;

  // Year-by-year analysis
  const maxYears = Math.max(holdYears, loan.termYears, 10);
  const yearlyDetails: YearlyDebtDetail[] = [];
  let totalInterest = 0;
  let totalDS = 0;
  let balance = loanAmount;

  for (let y = 1; y <= maxYears; y++) {
    const isIO = y <= ioYears;
    const annualDS = isIO ? ioAnnualDS : amortAnnualDS;
    const interestForYear = balance * rate;
    const principalForYear = isIO ? 0 : Math.min(annualDS - interestForYear, balance);
    const endingBalance = Math.max(balance - principalForYear, 0);

    totalInterest += interestForYear;
    totalDS += annualDS;

    // Prepayment penalty at this exit year
    const remainingTerm = loan.termYears - y;
    const prepayPenalty = calcPrepaymentPenalty(
      loan,
      endingBalance,
      y,
      rate,
      remainingTerm
    );

    // Total exit cost = remaining balance + prepayment penalty + cumulative interest + fees
    const totalExitCost = totalInterest + originationFees + prepayPenalty;

    yearlyDetails.push({
      year: y,
      beginningBalance: round(balance, 0),
      annualDebtService: round(annualDS, 0),
      interestPortion: round(interestForYear, 0),
      principalPortion: round(principalForYear, 0),
      endingBalance: round(endingBalance, 0),
      prepaymentPenalty: round(prepayPenalty, 0),
      totalExitCost: round(totalExitCost, 0),
    });

    balance = endingBalance;
  }

  // Metrics at expected hold period
  const holdDetail = yearlyDetails[holdYears - 1];
  const totalCostAtHold = holdDetail?.totalExitCost ?? 0;

  // Average annual DS over hold period
  const avgAnnualDS = holdYears > 0 ? totalDS / Math.min(holdYears, maxYears) : 0;

  // Effective all-in rate: (total interest + fees over hold) / (avg balance * hold years)
  const avgBalance = yearlyDetails
    .slice(0, holdYears)
    .reduce((sum, d) => sum + (d.beginningBalance + d.endingBalance) / 2, 0) / holdYears;
  const totalCostOverHold = yearlyDetails
    .slice(0, holdYears)
    .reduce((sum, d) => sum + d.interestPortion, 0) + originationFees;
  const effectiveRate = avgBalance > 0 && holdYears > 0
    ? totalCostOverHold / (avgBalance * holdYears)
    : rate;

  return {
    loan,
    loanAmount: round(loanAmount, 0),
    originationFees: round(originationFees, 0),
    effectiveRate: round(effectiveRate, 4),
    totalInterestCost: round(
      yearlyDetails.slice(0, holdYears).reduce((s, d) => s + d.interestPortion, 0),
      0
    ),
    avgAnnualDebtService: round(avgAnnualDS, 0),
    ioDebtService: round(ioAnnualDS, 0),
    amortizingDebtService: round(amortAnnualDS, 0),
    yearlyDetails,
    totalCostAtHold,
    isOptimal: false, // set externally
  };
}

export function analyzeLoans(
  loans: LoanStructure[],
  loanAmount: number,
  holdYears: number
): LoanAnalysis[] {
  const analyses = loans.map((loan) => analyzeLoan(loan, loanAmount, holdYears));

  // Mark optimal (lowest total cost at hold)
  if (analyses.length > 0) {
    let minCost = Infinity;
    let minIdx = 0;
    analyses.forEach((a, i) => {
      if (a.totalCostAtHold < minCost) {
        minCost = a.totalCostAtHold;
        minIdx = i;
      }
    });
    analyses[minIdx].isOptimal = true;
  }

  return analyses;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDebtComparison(
  loans: LoanStructure[],
  loanAmount: number,
  holdYears: number
): LoanAnalysis[] {
  return useMemo(
    () => analyzeLoans(loans, loanAmount, holdYears),
    [loans, loanAmount, holdYears]
  );
}
