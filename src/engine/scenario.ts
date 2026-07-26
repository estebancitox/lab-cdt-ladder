import { addDays } from './dates'
import { entityExposures } from './exposure'
import { periodRate } from './rates'
import { roundCOP } from './money'
import type {
  DayCountBase,
  FiscalParams,
  ISODate,
  RungInput,
  RungResult,
  ScenarioInput,
  ScenarioResult,
} from './types'

export function computeRung(
  rung: RungInput,
  startDate: ISODate,
  fiscal: FiscalParams,
  dayCountBase: DayCountBase,
): RungResult {
  const rate = periodRate(rung.ea, rung.days, dayCountBase)
  // Interest at maturity is a cash event: rounded per rung, and retención is
  // computed on the rounded gross, so every table row reconciles by hand.
  const grossInterest = roundCOP(rung.principal * rate)
  if (!Number.isSafeInteger(grossInterest)) {
    throw new RangeError(
      `grossInterest exceeds safe integer precision: ${grossInterest} — pesos would be lost`,
    )
  }
  const retencion = roundCOP(grossInterest * fiscal.retencionRate)
  return {
    ...rung,
    periodRate: rate,
    grossInterest,
    retencion,
    netInterest: grossInterest - retencion,
    maturityDate: addDays(startDate, rung.days),
  }
}

/**
 * Blended E.A., weighted by principal × days. This is not a portfolio return:
 * it ignores reinvestment between maturities (that model arrives with rollover).
 */
export function blendedEA(
  rungs: ReadonlyArray<Pick<RungInput, 'principal' | 'days' | 'ea'>>,
): number {
  let weight = 0
  let acc = 0
  for (const r of rungs) {
    weight += r.principal * r.days
    acc += r.principal * r.days * r.ea
  }
  if (weight <= 0) {
    throw new RangeError('blendedEA requires at least one rung with positive principal and days')
  }
  return acc / weight
}

/** Expects input already accepted by validateScenario. */
export function computeScenario(input: ScenarioInput): ScenarioResult {
  const rungs = input.rungs
    .map((r) => computeRung(r, input.startDate, input.fiscal, input.dayCountBase))
    .sort((a, b) => (a.maturityDate < b.maturityDate ? -1 : a.maturityDate > b.maturityDate ? 1 : 0))
  const totals = rungs.reduce(
    (t, r) => ({
      principal: t.principal + r.principal,
      grossInterest: t.grossInterest + r.grossInterest,
      retencion: t.retencion + r.retencion,
      netInterest: t.netInterest + r.netInterest,
    }),
    { principal: 0, grossInterest: 0, retencion: 0, netInterest: 0 },
  )
  return {
    rungs,
    totals,
    blendedEA: blendedEA(input.rungs),
    nextMaturity: rungs.length > 0 ? rungs[0].maturityDate : null,
    exposures: entityExposures(input.entities, rungs, input.fiscal.insuranceCeiling),
  }
}
