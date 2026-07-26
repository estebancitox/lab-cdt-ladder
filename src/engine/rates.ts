/**
 * E.A. → period rate over `days`, ACT/365 fixed: (1 + EA)^(days/365) − 1.
 * The 365 denominator is deliberate even for terms crossing Feb 29 — a 366-day
 * rung yields slightly more than one year of E.A. while its calendar maturity
 * counts real days (see addDays). Do not "fix" this to 366.
 */
export function periodRate(ea: number, days: number): number {
  return Math.pow(1 + ea, days / 365) - 1
}
