/**
 * Financial calculation utilities for CRE analysis.
 *
 * Ported from legacy/python/tools/financial_calcs.py (FinancialCalculator class).
 */

/**
 * Net Present Value.
 *
 * @param rate - Discount rate as decimal
 * @param cashflows - Array of cash flows (index 0 = time 0)
 */
export function calculateNPV(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cf, idx) => sum + cf / Math.pow(1 + rate, idx), 0);
}

/**
 * Internal Rate of Return using bisection method.
 *
 * Returns null if IRR cannot be computed (e.g. all positive or all negative
 * cash flows, or no sign change in the search interval).
 *
 * Ported from Python `_irr()` which uses bisection over [-0.9999, 10.0].
 *
 * @param cashflows - Array of cash flows (negative = outflows, positive = inflows)
 * @param guess - Optional initial guess (unused; kept for API compat)
 */
export function calculateIRR(cashflows: number[], _guess?: number): number | null {
  if (cashflows.length === 0) return null;

  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!(hasPositive && hasNegative)) return null;

  let low = -0.9999;
  let high = 10.0;
  let npvLow = calculateNPV(low, cashflows);
  const npvHigh = calculateNPV(high, cashflows);

  if (npvLow === 0) return low;
  if (npvHigh === 0) return high;
  if (npvLow * npvHigh > 0) return null;

  let mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    const npvMid = calculateNPV(mid, cashflows);
    if (Math.abs(npvMid) < 1e-6) return mid;

    if (npvLow * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }
  return mid;
}

/**
 * Debt Service Coverage Ratio.
 *
 * @param noi - Net Operating Income
 * @param debtService - Annual debt service
 * @returns DSCR (Infinity if debtService is 0)
 */
export function calculateDSCR(noi: number, debtService: number): number {
  if (debtService === 0) return Infinity;
  return noi / debtService;
}

/**
 * Capitalization Rate.
 *
 * @param noi - Net Operating Income
 * @param value - Property value / price
 * @returns Cap rate as decimal (e.g. 0.08 = 8%)
 */
export function calculateCapRate(noi: number, value: number): number {
  if (value === 0) return 0;
  return noi / value;
}

/**
 * Debt Yield.
 *
 * @param noi - Net Operating Income
 * @param loanAmount - Loan amount
 */
export function calculateDebtYield(noi: number, loanAmount: number): number {
  if (loanAmount === 0) return 0;
  return noi / loanAmount;
}

/**
 * Loan-to-Value ratio.
 *
 * @param loanAmount - Loan amount
 * @param propertyValue - Property value
 */
export function calculateLTV(loanAmount: number, propertyValue: number): number {
  if (propertyValue === 0) return 0;
  return loanAmount / propertyValue;
}

/**
 * Cash-on-Cash return.
 *
 * @param annualCashFlow - Annual pre-tax cash flow
 * @param equityInvested - Total equity invested
 */
export function calculateCashOnCash(annualCashFlow: number, equityInvested: number): number {
  if (equityInvested === 0) return 0;
  return annualCashFlow / equityInvested;
}

/**
 * Equity multiple.
 *
 * @param totalDistributions - Total cash returned to investors
 * @param totalEquity - Total equity invested
 */
export function calculateEquityMultiple(totalDistributions: number, totalEquity: number): number {
  if (totalEquity === 0) return 0;
  return totalDistributions / totalEquity;
}

/**
 * Monthly mortgage payment.
 *
 * @param principal - Loan principal
 * @param annualRate - Annual interest rate as decimal
 * @param years - Loan term in years
 * @returns Monthly payment amount
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  years: number,
): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;

  if (monthlyRate === 0) return principal / numPayments;

  const payment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  return Math.round(payment * 100) / 100;
}

/**
 * Property value from NOI and cap rate (income approach).
 *
 * @param noi - Net Operating Income
 * @param capRate - Capitalization rate as decimal
 */
export function calculatePropertyValue(noi: number, capRate: number): number {
  if (capRate === 0) return 0;
  return Math.round((noi / capRate) * 100) / 100;
}
