import { parseISODate, splitCapital, toISODate, validateScenario } from '../engine'
import type { DayCountBase, ISODate, ScenarioInput, ValidationIssue } from '../engine'

export interface FormState {
  capital: string
  rungCount: string
  spacingDays: string
  ea: string
  dayCountBase: string
  retencion: string
  startDate: string
}

/** The user's local calendar day — UI concern only; the engine never asks the clock. */
export function todayISO(): ISODate {
  const now = new Date()
  return toISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

export function initialForm(): FormState {
  return {
    capital: '50.000.000',
    rungCount: '4',
    spacingDays: '90',
    ea: '10',
    dayCountBase: '360',
    retencion: '4',
    startDate: todayISO(),
  }
}

const groupFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/**
 * Group a digits-only string with es-CO dots as the user types. Capped at 12
 * digits: the worst legal case (12 digits × E.A. 100 % × 3650 days) still
 * yields a safe-integer gross; 13+ digits would silently lose pesos.
 */
export function formatCapitalInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12)
  return digits === '' ? '' : groupFormatter.format(Number(digits))
}

function parseCapital(s: string): number | null {
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

const ENTITY_ID = 'e1'

/**
 * Parse the M1 form into a ScenarioInput. Field-level issues carry `form.*`
 * paths so the UI can anchor messages; the engine's validateScenario runs on
 * top as the source of truth for range semantics.
 */
export function buildScenario(form: FormState): ParsedForm {
  const issues: ValidationIssue[] = []

  const capital = parseCapital(form.capital)
  if (capital === null || !Number.isSafeInteger(capital) || capital <= 0) {
    issues.push({
      code: 'capital_invalid',
      path: 'form.capital',
      message: 'Escribe el capital total en pesos, mayor que cero.',
    })
  }

  const count = parseIntStrict(form.rungCount)
  if (count === null || count < 1 || count > 12) {
    issues.push({
      code: 'count_invalid',
      path: 'form.rungCount',
      message: 'Entre 1 y 12 peldaños.',
    })
  }

  const spacing = parseIntStrict(form.spacingDays)
  if (spacing === null || spacing < 1) {
    issues.push({
      code: 'spacing_invalid',
      path: 'form.spacingDays',
      message: 'El espaciado debe ser un número entero de días, mayor que cero.',
    })
  } else if (count !== null && count >= 1 && count <= 12 && spacing * count > 3650) {
    issues.push({
      code: 'spacing_too_long',
      path: 'form.spacingDays',
      message: 'El último vencimiento no puede pasar de 10 años.',
    })
  }

  const eaPct = parsePercent(form.ea)
  if (eaPct === null || eaPct < 0 || eaPct > 100) {
    issues.push({
      code: 'ea_invalid',
      path: 'form.ea',
      message: 'La tasa E.A. debe estar entre 0 % y 100 %.',
    })
  }

  const dayCountBase: DayCountBase | null =
    form.dayCountBase === '360' ? 360 : form.dayCountBase === '365' ? 365 : null
  if (dayCountBase === null) {
    issues.push({
      code: 'base_invalid',
      path: 'form.dayCountBase',
      message: 'La base de liquidación debe ser 360 o 365.',
    })
  }

  const retencionPct = parsePercent(form.retencion)
  if (retencionPct === null || retencionPct < 0 || retencionPct >= 100) {
    issues.push({
      code: 'retencion_invalid',
      path: 'form.retencion',
      message: 'La retención debe ser de 0 % o más y menor que 100 %.',
    })
  }

  let startDate = form.startDate
  try {
    parseISODate(startDate)
  } catch {
    issues.push({
      code: 'start_date_invalid',
      path: 'form.startDate',
      message: 'La fecha de inicio no es válida.',
    })
    startDate = todayISO()
  }

  if (issues.length > 0) {
    return {
      input: {
        startDate,
        rungs: [],
        entities: [{ id: ENTITY_ID, name: 'Entidad' }],
        fiscal: { retencionRate: 0, insuranceCeiling: 0 },
        dayCountBase: dayCountBase ?? 360,
      },
      issues,
    }
  }

  const amounts = splitCapital(capital!, count!)
  const input: ScenarioInput = {
    startDate,
    rungs: amounts.map((principal, i) => ({
      id: `r${i + 1}`,
      principal,
      days: spacing! * (i + 1),
      ea: eaPct! / 100,
      entityId: ENTITY_ID,
    })),
    entities: [{ id: ENTITY_ID, name: 'Entidad' }],
    // insuranceCeiling stays 0 until M2 introduces the editable, labeled field.
    fiscal: { retencionRate: retencionPct! / 100, insuranceCeiling: 0 },
    dayCountBase: dayCountBase!,
  }
  return { input, issues: validateScenario(input) }
}

/** Map engine/form issue paths to the M1 form field that should show them. */
export function fieldForPath(path: string): keyof FormState | null {
  if (path === 'form.capital' || path.endsWith('.principal')) return 'capital'
  if (path === 'form.rungCount' || path === 'rungs') return 'rungCount'
  if (path === 'form.spacingDays' || path.endsWith('.days')) return 'spacingDays'
  if (path === 'form.ea' || path.endsWith('.ea')) return 'ea'
  if (path === 'form.dayCountBase' || path === 'dayCountBase') return 'dayCountBase'
  if (path === 'form.retencion' || path === 'fiscal.retencionRate') return 'retencion'
  if (path === 'form.startDate' || path === 'startDate') return 'startDate'
  return null
}
