/**
 * lib/calculator.ts
 *
 * FD/savings maturity-value math, used by HomeCalculator (the calculator
 * embedded directly on the homepage, since there is no separate /calculator
 * page).
 *
 * Calculation model (deliberately simple and stated up front to the user,
 * since exact compounding conventions differ bank to bank):
 *   - "At maturity" / no fixed payout frequency: the AER (if known, else
 *     the nominal rate as a fallback) is compounded once per year over the
 *     deposit's term: MaturityValue = Principal * (1 + AER/100)^years.
 *   - A fixed payout frequency (monthly/quarterly/semi-annually/annually):
 *     each payout is Principal * nominalRate/100 / paymentsPerYear, and the
 *     total shown is the principal plus all payouts received over the term
 *     (i.e. the payouts are assumed withdrawn, not reinvested).
 */

export const PAYMENTS_PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  "semi-annually": 2,
  annually: 1,
};

export function formatLkr(value: number): string {
  return value.toLocaleString("en-LK", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export interface CalculationResult {
  maturityValue: number;
  totalInterest: number;
}

/** Compute (maturityValue, totalInterest) for a given rate/AER/tenure/payment combination. */
export function calculate(
  principal: number,
  nominalRate: number,
  aer: number | null,
  tenureMonths: number,
  payment: string | null
): CalculationResult {
  const years = tenureMonths / 12;

  if (payment && payment in PAYMENTS_PER_YEAR) {
    const paymentsPerYear = PAYMENTS_PER_YEAR[payment];
    const periodicPayout = (principal * nominalRate) / 100 / paymentsPerYear;
    const totalInterest = periodicPayout * paymentsPerYear * years;
    return { maturityValue: principal + totalInterest, totalInterest };
  }

  const effectiveRate = aer ?? nominalRate;
  const maturityValue = principal * Math.pow(1 + effectiveRate / 100, years);
  return { maturityValue, totalInterest: maturityValue - principal };
}
