/** Date-only ISO string 'YYYY-MM-DD'. The engine never does Date millisecond math. */
export type ISODate = string

export interface FiscalParams {
  /** Retención en la fuente on interest, as a fraction (0.04 = 4 %). User-supplied, never current truth. */
  retencionRate: number
  /** Deposit-insurance ceiling per entity, integer COP. User-supplied, never current truth. */
  insuranceCeiling: number
}

export interface Entity {
  id: string
  name: string
}

export interface RungInput {
  id: string
  /** Integer COP. */
  principal: number
  /** Term in days, integer > 0. */
  days: number
  /** Effective annual rate as a fraction (0.135 = 13,5 % E.A.). */
  ea: number
  entityId: string
}

export interface ScenarioInput {
  startDate: ISODate
  rungs: RungInput[]
  entities: Entity[]
  fiscal: FiscalParams
}

export interface RungResult extends RungInput {
  periodRate: number
  /** Rounded COP — interest at maturity is a cash event. */
  grossInterest: number
  /** Rounded COP, computed on the rounded gross so each row reconciles by hand. */
  retencion: number
  /** grossInterest − retencion; integer by construction. */
  netInterest: number
  maturityDate: ISODate
}

export interface ScenarioTotals {
  principal: number
  grossInterest: number
  retencion: number
  netInterest: number
}

export interface ScenarioResult {
  /** Sorted by maturity date ascending. */
  rungs: RungResult[]
  /** Sums of the rounded per-rung values — always equals what the table shows. */
  totals: ScenarioTotals
  blendedEA: number
  nextMaturity: ISODate | null
}

export interface ValidationIssue {
  code: string
  path: string
  message: string
}
