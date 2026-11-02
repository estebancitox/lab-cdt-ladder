import { describe, expect, it } from 'vitest'
import {
  canShowExample,
  messageFor,
  RECORDED_EXAMPLE,
  resetTimeLabel,
  splitExplanation,
} from './explanation'

/** 2026-11-01 21:13 UTC; 10 020 s later is the next 00:00 UTC, 19:00 in Bogotá. */
const RECEIVED_AT = new Date('2026-11-01T21:13:00Z')
const TO_MIDNIGHT_UTC = 10_020

describe('splitExplanation — SPEC §4 plain text into blocks', () => {
  it('splits the recorded example into heading, paragraph, paragraph, heading, paragraph', () => {
    const blocks = splitExplanation(RECORDED_EXAMPLE.text)
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'heading',
      'paragraph',
    ])
    expect(blocks[0]).toEqual({ type: 'heading', text: 'Qué pasa y cuándo' })
    expect(blocks[3]).toEqual({ type: 'heading', text: 'Riesgos' })
    expect(blocks[4]).toEqual({ type: 'paragraph', text: 'Sin riesgos para señalar con estos datos.' })
    expect((blocks[1] as { text: string }).text.startsWith('Tu escalera tiene $ 50.000.000')).toBe(true)
  })

  it('groups consecutive "- " lines into one list and ignores surrounding blank lines', () => {
    const text =
      '\n\nQué pasa y cuándo\n\nUn párrafo.\n\nRiesgos\n\n' +
      '- Tope del seguro: una frase.\n- Concentración: otra frase.\n- Diferencia de tasa: la tercera.\n\n\n'
    expect(splitExplanation(text)).toEqual([
      { type: 'heading', text: 'Qué pasa y cuándo' },
      { type: 'paragraph', text: 'Un párrafo.' },
      { type: 'heading', text: 'Riesgos' },
      {
        type: 'list',
        items: [
          'Tope del seguro: una frase.',
          'Concentración: otra frase.',
          'Diferencia de tasa: la tercera.',
        ],
      },
    ])
  })

  it('joins the lines of one paragraph and starts a new list after a paragraph', () => {
    expect(splitExplanation('línea uno\nlínea dos\n- a\ntexto\n- b')).toEqual([
      { type: 'paragraph', text: 'línea uno línea dos' },
      { type: 'list', items: ['a'] },
      { type: 'paragraph', text: 'texto' },
      { type: 'list', items: ['b'] },
    ])
  })

  it('recognises a bolded header and bullet marks the way SPEC §11.1 and §11.6 do, keeping the item text as sent', () => {
    expect(splitExplanation('**Riesgos**\n\n- **Tope del seguro:** a.\n• Concentración: b.\n•Diferencia de tasa: c.')).toEqual([
      { type: 'heading', text: 'Riesgos' },
      {
        type: 'list',
        items: ['**Tope del seguro:** a.', 'Concentración: b.', 'Diferencia de tasa: c.'],
      },
    ])
  })

  it('returns no blocks for blank text', () => {
    expect(splitExplanation('')).toEqual([])
    expect(splitExplanation('\n \n')).toEqual([])
  })
})

describe("resetTimeLabel — the reader's local time of the next 00:00 UTC", () => {
  it('is 19:00 in Bogotá, 00:00 in UTC, 01:00 in Madrid', () => {
    expect(resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT, 'America/Bogota')).toBe('19:00')
    expect(resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT, 'UTC')).toBe('00:00')
    expect(resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT, 'Europe/Madrid')).toBe('01:00')
  })

  it("without a zone it uses the process's, which the CI runs as Bogotá and as UTC", () => {
    const label = resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT)
    expect(label).toMatch(/^\d{2}:\d{2}$/)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(label).toBe(resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT, zone))
  })
})

describe('messageFor — the copy per failure', () => {
  const at = resetTimeLabel(TO_MIDNIGHT_UTC, RECEIVED_AT)

  it('limit/ip with retry-after names the local hour', () => {
    expect(
      messageFor(
        { kind: 'limit', scope: 'ip', retryAfterSeconds: TO_MIDNIGHT_UTC, text: 'x' },
        RECEIVED_AT,
      ),
    ).toBe(
      `Ya usaste todas las explicaciones de hoy desde tu conexión. Vuelven a estar disponibles a las ${at}.`,
    )
  })

  it('limit/ip without retry-after stops after the first sentence', () => {
    expect(
      messageFor({ kind: 'limit', scope: 'ip', retryAfterSeconds: null, text: 'x' }, RECEIVED_AT),
    ).toBe('Ya usaste todas las explicaciones de hoy desde tu conexión.')
  })

  it('limit/daily with retry-after names the local hour', () => {
    expect(
      messageFor(
        { kind: 'limit', scope: 'daily', retryAfterSeconds: TO_MIDNIGHT_UTC, text: 'x' },
        RECEIVED_AT,
      ),
    ).toBe(`La demo alcanzó su tope de explicaciones de hoy. Vuelve a estar disponible a las ${at}.`)
  })

  it('limit/daily without retry-after says tomorrow', () => {
    expect(
      messageFor({ kind: 'limit', scope: 'daily', retryAfterSeconds: null, text: 'x' }, RECEIVED_AT),
    ).toBe('La demo alcanzó su tope de explicaciones de hoy. Vuelve mañana.')
  })

  it('invalid names the issue when there is one, and shows the fixed text alone otherwise', () => {
    expect(
      messageFor(
        { kind: 'invalid', issue: 'El plazo no puede superar 3.650 días.', text: 'Fijo.' },
        RECEIVED_AT,
      ),
    ).toBe('Este escenario no se puede explicar: El plazo no puede superar 3.650 días.')
    expect(messageFor({ kind: 'invalid', issue: null, text: 'Fijo.' }, RECEIVED_AT)).toBe('Fijo.')
  })

  it('throttled, unavailable and network', () => {
    expect(messageFor({ kind: 'throttled' }, RECEIVED_AT)).toBe(
      'El servicio está pausado en este momento.',
    )
    expect(messageFor({ kind: 'unavailable', text: 'Texto fijo del API.' }, RECEIVED_AT)).toBe(
      'Texto fijo del API.',
    )
    expect(messageFor({ kind: 'network' }, RECEIVED_AT)).toBe(
      'No se pudo contactar el servicio. Revisa tu conexión e inténtalo de nuevo.',
    )
  })
})

describe('canShowExample', () => {
  it('offers the recorded example only when the service gave no answer', () => {
    expect(canShowExample('limit')).toBe(true)
    expect(canShowExample('throttled')).toBe(true)
    expect(canShowExample('unavailable')).toBe(true)
    expect(canShowExample('network')).toBe(true)
    expect(canShowExample('invalid')).toBe(false)
  })
})
