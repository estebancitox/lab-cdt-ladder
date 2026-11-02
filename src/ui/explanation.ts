import type { ExplainOutcome } from '../api/explain'

/**
 * Everything the explanation panel says, and the two pure transformations it
 * relies on: the reset-hour label of a 429 and the split of the API's plain
 * text into blocks. No React here, so both can run under the two-zone CI.
 */

export const BUTTON_LABEL = 'Explícame esta escalera'
export const PANEL_LABEL = 'Explicación'
export const EXAMPLE_BUTTON_LABEL = 'Ver un ejemplo'
export const DISCLOSURE =
  'Al pedir la explicación, el escenario se envía a un servicio en AWS que consulta un modelo de lenguaje.'
export const ROLLOVER_NOTE = 'La explicación cubre los plazos iniciales, no las renovaciones.'
export const MATURED_HINT =
  'Todos los vencimientos ya pasaron: el servicio solo explica escaleras con vencimientos pendientes.'
export const PENDING = 'Pensando… tarda unos segundos'
export const GENERATED_NOTE =
  'Texto generado por un modelo y verificado contra las cifras de la escalera. No es asesoría financiera.'
export const READY_ANNOUNCEMENT = 'Explicación lista.'
export const EXAMPLE_LABEL =
  'Ejemplo grabado el 29 de octubre de 2026 para una escalera de ejemplo de 3 peldaños; no corresponde a tu escenario.'

export type ExplainFailure = Exclude<ExplainOutcome, { kind: 'explanation' }>

/**
 * The §8.2 counters reset at 00:00 UTC; `retry-after` counts the seconds to
 * it. The label is that instant in the reader's own zone (19:00 in Bogotá),
 * so it is computed, never hard-coded. `timeZone` exists for the tests; the
 * panel leaves it unset and gets the browser's zone.
 */
export function resetTimeLabel(
  retryAfterSeconds: number,
  receivedAt: Date,
  timeZone?: string,
): string {
  const at = new Date(receivedAt.getTime() + retryAfterSeconds * 1000)
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at)
}

export function messageFor(failure: ExplainFailure, receivedAt: Date): string {
  switch (failure.kind) {
    case 'limit': {
      const at =
        failure.retryAfterSeconds === null
          ? null
          : resetTimeLabel(failure.retryAfterSeconds, receivedAt)
      if (failure.scope === 'ip') {
        return (
          'Ya usaste todas las explicaciones de hoy desde tu conexión.' +
          (at === null ? '' : ` Vuelven a estar disponibles a las ${at}.`)
        )
      }
      return (
        'La demo alcanzó su tope de explicaciones de hoy.' +
        (at === null ? ' Vuelve mañana.' : ` Vuelve a estar disponible a las ${at}.`)
      )
    }
    case 'throttled':
      return 'El servicio está pausado en este momento.'
    case 'unavailable':
      return failure.text
    case 'invalid':
      // Without an issue to name, the API's own sentence stands alone: prefixing
      // it would read "no se puede explicar: No puedo explicar…".
      return failure.issue === null
        ? failure.text
        : `Este escenario no se puede explicar: ${failure.issue}`
    case 'network':
      return 'No se pudo contactar el servicio. Revisa tu conexión e inténtalo de nuevo.'
  }
}

/** The recorded example stands in only when the service itself gave no answer. */
export function canShowExample(kind: ExplainFailure['kind']): boolean {
  return kind === 'limit' || kind === 'throttled' || kind === 'unavailable' || kind === 'network'
}

export type ExplanationBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

/** SPEC §4: the two section headers, verbatim, on their own lines. */
const HEADERS = new Set(['Qué pasa y cuándo', 'Riesgos'])
/**
 * SPEC §11.6 accepts either marker, with or without a space after it. A lone
 * marker, or a "---" rule, is not a bullet and stays a paragraph.
 */
const BULLET = /^(?:-(?!-)|•)\s*(?=\S)/

/**
 * SPEC §4 plain text → blocks. A header line becomes a heading, consecutive
 * bullet lines one list, and every other run of lines a paragraph; blank
 * lines separate. Headers and bullets are recognised the way the API's own
 * verification reads them (SPEC §11.1 drops `*` and `_` because a model
 * sometimes bolds a label; §11.6 accepts `-` or `•`). A recognised header
 * renders as its canonical §4 text, the one departure from "as sent": the
 * text of a paragraph or an item is shown exactly as the API sent it.
 */
export function splitExplanation(text: string): ExplanationBlock[] {
  const blocks: ExplanationBlock[] = []
  let paragraph: string[] = []
  let list: string[] | null = null
  const closeParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      closeParagraph()
      list = null
      continue
    }
    const unmarked = line.replace(/[*_]/g, '').trim()
    if (HEADERS.has(unmarked)) {
      closeParagraph()
      list = null
      blocks.push({ type: 'heading', text: unmarked })
      continue
    }
    if (BULLET.test(line)) {
      closeParagraph()
      if (list === null) {
        list = []
        blocks.push({ type: 'list', items: list })
      }
      list.push(line.replace(BULLET, '').trim())
      continue
    }
    list = null
    paragraph.push(line)
  }
  closeParagraph()
  return blocks
}

/**
 * Run 1 of case `healthy-3-rung` in lab-cdt-ladder-api's stored evaluation run
 * 2026-10-29T23-18-30Z, copied byte for byte from its results.json. Its input:
 * three rungs of 16 666 667 / 16 666 667 / 16 666 666 pesos at 13,5 % E.A.
 * over 90 / 180 / 270 days from 2027-01-04 on base 365, retención 4 %,
 * ceiling 50 000 000, one entity per rung.
 */
export const RECORDED_EXAMPLE = {
  text: "Qué pasa y cuándo\n\nTu escalera tiene $ 50.000.000 de capital repartidos en 3 peldaños y 3 entidades, con una tasa promedio de 13,5%. El peldaño 1, en Banco Andino, vence el 4 de abril de 2027. El peldaño 2, en Cooperativa Ñame & Café, vence el 3 de julio de 2027. El peldaño 3, en Entidad B, vence el 1 de octubre de 2027.\n\nEl próximo vencimiento está a 90 días de hoy. La escalera paga $ 3.109.733 de interés neto, después de una retención de $ 129.572.\n\nRiesgos\n\nSin riesgos para señalar con estos datos.",
} as const
