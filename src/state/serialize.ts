import { initialForm, MAX_ENTITIES, MAX_RUNGS } from '../ui/form'
import type { FormState, RolloverMode } from '../ui/form'

/**
 * Versioned, strictly-validated (de)serialization shared by the URL codec and
 * localStorage. Decoding never throws and never trusts input: anything that
 * fails a check returns null and the caller falls back.
 */

const VERSION = 1
const ENTITY_ID_RE = /^e\d{1,6}$/
/** Must match the input's maxLength: the serializer may never emit what the
 *  deserializer would reject, or a saved scenario becomes unloadable. */
export const MAX_ENTITY_NAME = 60
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MODES: RolloverMode[] = ['off', 'cycles', 'horizon']

export interface SerializedForm {
  v: number
  capital: string
  rungCount: string
  spacingDays: string
  ea: string
  dayCountBase: string
  retencion: string
  ceiling: string
  startDate: string
  entities: Array<[string, string]>
  allocation: string[]
  rolloverMode: RolloverMode
  rolloverCycles: string
  rolloverHorizon: string
}

export function serializeForm(form: FormState): SerializedForm {
  return {
    v: VERSION,
    capital: form.capital,
    rungCount: form.rungCount,
    spacingDays: form.spacingDays,
    ea: form.ea,
    dayCountBase: form.dayCountBase,
    retencion: form.retencion,
    ceiling: form.ceiling,
    startDate: form.startDate,
    entities: form.entities.map((e) => [e.id, e.name.slice(0, MAX_ENTITY_NAME)]),
    allocation: form.allocation.slice(0, MAX_RUNGS),
    rolloverMode: form.rolloverMode,
    rolloverCycles: form.rolloverCycles,
    rolloverHorizon: form.rolloverHorizon,
  }
}

function str(v: unknown, maxLen: number): string | null {
  return typeof v === 'string' && v.length <= maxLen ? v : null
}

export function deserializeForm(data: unknown): FormState | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (d.v !== VERSION) return null

  const capital = str(d.capital, 20)
  const rungCount = str(d.rungCount, 4)
  const spacingDays = str(d.spacingDays, 6)
  const ea = str(d.ea, 10)
  const dayCountBase = str(d.dayCountBase, 3)
  const retencion = str(d.retencion, 10)
  const ceiling = str(d.ceiling, 20)
  const startDate = str(d.startDate, 10)
  const rolloverCycles = str(d.rolloverCycles, 4)
  const rolloverHorizon = str(d.rolloverHorizon, 10)
  if (
    capital === null ||
    rungCount === null ||
    spacingDays === null ||
    ea === null ||
    dayCountBase === null ||
    retencion === null ||
    ceiling === null ||
    startDate === null ||
    rolloverCycles === null ||
    rolloverHorizon === null
  ) {
    return null
  }
  if (!DATE_RE.test(startDate)) return null
  if (rolloverHorizon !== '' && !DATE_RE.test(rolloverHorizon)) return null
  if (!MODES.includes(d.rolloverMode as RolloverMode)) return null

  if (!Array.isArray(d.entities) || d.entities.length < 1 || d.entities.length > MAX_ENTITIES) {
    return null
  }
  const entities: Array<{ id: string; name: string }> = []
  for (const pair of d.entities) {
    if (!Array.isArray(pair) || pair.length !== 2) return null
    const [id, name] = pair
    if (typeof id !== 'string' || !ENTITY_ID_RE.test(id)) return null
    if (typeof name !== 'string' || name.length > MAX_ENTITY_NAME) return null
    entities.push({ id, name })
  }
  if (new Set(entities.map((e) => e.id)).size !== entities.length) return null

  if (!Array.isArray(d.allocation) || d.allocation.length > MAX_RUNGS) return null
  const allocation: string[] = []
  for (const a of d.allocation) {
    if (typeof a !== 'string' || a.length > 8) return null
    allocation.push(a)
  }

  const nextEntitySeq =
    Math.max(0, ...entities.map((e) => Number.parseInt(e.id.slice(1), 10))) + 1

  const base = initialForm()
  return {
    ...base,
    capital,
    rungCount,
    spacingDays,
    ea,
    dayCountBase,
    retencion,
    ceiling,
    startDate,
    entities,
    allocation,
    nextEntitySeq,
    rolloverMode: d.rolloverMode as RolloverMode,
    rolloverCycles,
    rolloverHorizon: rolloverHorizon === '' ? base.rolloverHorizon : rolloverHorizon,
  }
}
