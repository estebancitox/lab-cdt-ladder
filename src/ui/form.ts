import { addDays, dayNumber, parseISODate, splitCapital, toISODate, validateScenario } from '../engine'
import type {
  DayCountBase,
  ISODate,
  RolloverConfig,
  ScenarioInput,
  ValidationIssue,
} from '../engine'

export interface EntityDraft {
  id: string
  name: string
}

export const MAX_ENTITIES = 6
export const MAX_RUNGS = 12

/** Blank names never block the math — they render under a generic fallback. */
export function entityDisplayName(name: string, index: number): string {
  return name.trim() || `Institution ${index + 1}`
}

export type RolloverMode = 'off' | 'cycles' | 'horizon'

export interface FormState {
  capital: string
  rungCount: string
  spacingDays: string
  ea: string
  dayCountBase: string
  retencion: string
  ceiling: string
  startDate: string
  entities: EntityDraft[]
  /** entityId per rung index; missing or stale entries fall back to the first entity. */
  allocation: string[]
  nextEntitySeq: number
  rolloverMode: RolloverMode
  rolloverCycles: string
  rolloverHorizon: string
}

/** The user's local calendar day — UI concern only; the engine never asks the clock. */
export function todayISO(): ISODate {
  const now = new Date()
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

export function initialForm(): FormState {
  return {
    // Under the default 50M insurance ceiling with room for interest: the
    // pristine first paint must not open on a CEILING EXCEEDED alarm about
    // parameters the user has not chosen yet.
    capital: '40,000,000',
    // 1, not a pre-built ladder: people hold one CDT and decide at maturity.
    // The rung-count hint explains what raising it does.
    rungCount: '1',
    spacingDays: '90',
    ea: '10',
    dayCountBase: '360',
    retencion: '4',
    // Editable default, labeled "Check the current coverage" in the UI —
    // never presented as current truth.
    ceiling: '50,000,000',
    startDate: todayISO(),
    entities: [{ id: 'e1', name: 'Institution A' }],
    allocation: [],
    nextEntitySeq: 2,
    rolloverMode: 'off',
    rolloverCycles: '4',
    rolloverHorizon: addDays(todayISO(), 730),
  }
}

const groupFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/**
 * Group a digits-only string with en-US commas as the user types. Capped at 12
 * digits: the worst legal case (12 digits × E.A. 100 % × 3650 days) still
 * yields a safe-integer gross; 13+ digits would silently lose pesos.
 */
export function formatCapitalInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  return digits === '' ? '' : groupFormatter.format(Number(digits))
}

function parseCOPDigits(s: string): number | null {
  const digits = s.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

function parseIntStrict(s: string): number | null {
  const t = s.trim()
  if (!/^\d+$/.test(t)) return null
  return Number(t)
}

/** Accepts '13,5' or '13.5'; returns the percent as typed (13.5), not a fraction. */
function parsePercent(s: string): number | null {
  const t = s.trim().replace(/[%\s  ]/g, '').replace(',', '.')
  if (t === '' || !/^\d+(\.\d*)?$/.test(t)) return null
  return Number.parseFloat(t)
}

export interface ParsedForm {
  input: ScenarioInput
  issues: ValidationIssue[]
}

/**
 * Parse the form into a ScenarioInput. Field-level issues carry `form.*`
 * paths so the UI can anchor messages; the engine's validateScenario runs on
 * top as the source of truth for range semantics.
 */
export function buildScenario(form: FormState): ParsedForm {
  const issues: ValidationIssue[] = []

  const capital = parseCOPDigits(form.capital)
  if (capital === null || !Number.isSafeInteger(capital) || capital <= 0) {
    issues.push({
      code: 'capital_invalid',
      path: 'form.capital',
      message: 'Enter the total principal in pesos, greater than zero.',
    })
  }

  const count = parseIntStrict(form.rungCount)
  if (count === null || count < 1 || count > MAX_RUNGS) {
    issues.push({
      code: 'count_invalid',
      path: 'form.rungCount',
      message: `Between 1 and ${MAX_RUNGS} rungs.`,
    })
  }

  const spacing = parseIntStrict(form.spacingDays)
  if (spacing === null || spacing < 1) {
    issues.push({
      code: 'spacing_invalid',
      path: 'form.spacingDays',
      message: 'The days between maturities must be a whole number, greater than zero.',
    })
  } else if (count !== null && count >= 1 && count <= MAX_RUNGS && spacing * count > 3650) {
    issues.push({
      code: 'spacing_too_long',
      path: 'form.spacingDays',
      message: 'The last maturity cannot be more than 10 years after the start date.',
    })
  }

  const eaPct = parsePercent(form.ea)
  if (eaPct === null || eaPct < 0 || eaPct > 100) {
    issues.push({
      code: 'ea_invalid',
      path: 'form.ea',
      message: 'The E.A. rate must be between 0% and 100%.',
    })
  }

  const dayCountBase: DayCountBase | null =
    form.dayCountBase === '360' ? 360 : form.dayCountBase === '365' ? 365 : null
  if (dayCountBase === null) {
    issues.push({
      code: 'base_invalid',
      path: 'form.dayCountBase',
      message: 'The day-count basis must be 360 or 365.',
    })
  }

  const retencionPct = parsePercent(form.retencion)
  if (retencionPct === null || retencionPct < 0 || retencionPct >= 100) {
    issues.push({
      code: 'retencion_invalid',
      path: 'form.retencion',
      message: 'The withholding tax must be 0% or more and less than 100%.',
    })
  }

  const ceiling = parseCOPDigits(form.ceiling)
  if (ceiling === null || !Number.isSafeInteger(ceiling) || ceiling < 0) {
    issues.push({
      code: 'ceiling_invalid',
      path: 'form.ceiling',
      message: 'Enter the deposit-insurance ceiling in pesos, zero or greater.',
    })
  }

  let startDate = form.startDate
  try {
    parseISODate(startDate)
  } catch {
    issues.push({
      code: 'start_date_invalid',
      path: 'form.startDate',
      message: 'The start date is not valid.',
    })
    startDate = todayISO()
  }

  let rollover: RolloverConfig | undefined
  if (form.rolloverMode === 'cycles') {
    const cycles = parseIntStrict(form.rolloverCycles)
    if (cycles === null || cycles < 1 || cycles > 36) {
      issues.push({
        code: 'rollover_cycles_invalid',
        path: 'form.rolloverCycles',
        message: 'Between 1 and 36 renewals.',
      })
    } else {
      // Same 20-year ceiling the horizon mode enforces: 36 renewals of a long
      // rung would otherwise project centuries and squash the chart.
      const longestTerm = spacing !== null && count !== null ? spacing * count : null
      if (longestTerm !== null && longestTerm * (1 + cycles) > 7300) {
        issues.push({
          code: 'rollover_cycles_too_far',
          path: 'form.rolloverCycles',
          message: 'The projection cannot go beyond 20 years: reduce the renewals or the term.',
        })
      } else {
        rollover = { mode: 'cycles', cycles }
      }
    }
  } else if (form.rolloverMode === 'horizon') {
    let horizonOk = false
    try {
      parseISODate(form.rolloverHorizon)
      horizonOk = true
    } catch {
      issues.push({
        code: 'rollover_horizon_invalid',
        path: 'form.rolloverHorizon',
        message: 'The horizon date is not valid.',
      })
    }
    if (horizonOk) {
      if (form.rolloverHorizon <= startDate) {
        issues.push({
          code: 'rollover_horizon_before_start',
          path: 'form.rolloverHorizon',
          message: 'The horizon must be after the start date.',
        })
      } else if (form.rolloverHorizon > addDays(startDate, 7300)) {
        issues.push({
          code: 'rollover_horizon_too_far',
          path: 'form.rolloverHorizon',
          message: 'The projection cannot go beyond 20 years.',
        })
      } else if (
        spacing !== null &&
        spacing >= 1 &&
        (dayNumber(form.rolloverHorizon) - dayNumber(startDate)) / spacing > 120
      ) {
        // The shortest rung renews every `spacing` days; cap the cycle count.
        issues.push({
          code: 'rollover_too_many_cycles',
          path: 'form.rolloverHorizon',
          message:
            'Too many renewals for that horizon: bring it closer or raise the days between maturities.',
        })
      } else {
        rollover = { mode: 'horizon', horizonDate: form.rolloverHorizon }
      }
    }
  }

  const rawEntities =
    form.entities.length > 0 ? form.entities : [{ id: 'e1', name: 'Institution A' }]
  const entities = rawEntities.map((e, i) => ({ id: e.id, name: entityDisplayName(e.name, i) }))

  if (issues.length > 0) {
    return {
      input: {
        startDate,
        rungs: [],
        entities,
        fiscal: { retencionRate: 0, insuranceCeiling: 0 },
        dayCountBase: dayCountBase ?? 360,
        rollover: undefined,
      },
      issues,
    }
  }

  const entityIds = new Set(entities.map((e) => e.id))
  const entityFor = (i: number): string => {
    const id = form.allocation[i]
    return id && entityIds.has(id) ? id : entities[0].id
  }

  const amounts = splitCapital(capital!, count!)
  const input: ScenarioInput = {
    startDate,
    rungs: amounts.map((principal, i) => ({
      id: `r${i + 1}`,
      principal,
      days: spacing! * (i + 1),
      ea: eaPct! / 100,
      entityId: entityFor(i),
    })),
    entities,
    fiscal: { retencionRate: retencionPct! / 100, insuranceCeiling: ceiling! },
    dayCountBase: dayCountBase!,
    rollover,
  }
  return { input, issues: validateScenario(input) }
}

/** Map engine/form issue paths to the form field that should show them. */
export function fieldForPath(path: string): keyof FormState | null {
  if (path === 'form.capital' || path.endsWith('.principal')) return 'capital'
  if (path === 'form.rungCount' || path === 'rungs') return 'rungCount'
  if (path === 'form.spacingDays' || path.endsWith('.days')) return 'spacingDays'
  if (path === 'form.ea' || path.endsWith('.ea')) return 'ea'
  if (path === 'form.dayCountBase' || path === 'dayCountBase') return 'dayCountBase'
  if (path === 'form.retencion' || path === 'fiscal.retencionRate') return 'retencion'
  if (path === 'form.ceiling' || path === 'fiscal.insuranceCeiling') return 'ceiling'
  if (path === 'form.startDate' || path === 'startDate') return 'startDate'
  if (path === 'form.rolloverCycles' || path === 'rollover.cycles') return 'rolloverCycles'
  if (path === 'form.rolloverHorizon' || path === 'rollover.horizonDate') return 'rolloverHorizon'
  return null
}

/**
 * Non-blocking per-entity name issues, keyed by list index. Shown inline but
 * never unmounting the results: a name is a label, not an input to the math.
 * Duplicates matter because the insurance ceiling is evaluated per entity —
 * two rows for one real institution would silently split the exposure.
 */
export function entitySoftIssues(form: FormState): Record<number, ValidationIssue> {
  const out: Record<number, ValidationIssue> = {}
  const seen = new Set<string>()
  form.entities.forEach((e, i) => {
    const trimmed = e.name.trim()
    if (trimmed === '') {
      out[i] = {
        code: 'entity_name_empty',
        path: `entities[${i}].name`,
        message: 'Give the institution a name.',
      }
      return
    }
    const key = trimmed.toLocaleLowerCase('es')
    if (seen.has(key)) {
      out[i] = {
        code: 'entity_name_duplicate',
        path: `entities[${i}].name`,
        message:
          'Another institution has the same name. The deposit-insurance ceiling is evaluated per institution: if they are the same one, keep a single entry.',
      }
    } else {
      seen.add(key)
    }
  })
  return out
}
