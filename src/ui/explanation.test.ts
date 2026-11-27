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
/** U+00A0, built from its code so no invisible character sits in this file. */
const NBSP = String.fromCharCode(0xa0)

describe('splitExplanation — SPEC §4 plain text into blocks', () => {
  it('splits the recorded example into heading, three paragraphs, heading, paragraph', () => {
    const blocks = splitExplanation(RECORDED_EXAMPLE.text)
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'paragraph',
      'heading',
      'paragraph',
    ])
    expect(blocks[0]).toEqual({ type: 'heading', text: 'What happens and when' })
    expect(blocks[4]).toEqual({ type: 'heading', text: 'Risks' })
    expect(blocks[5]).toEqual({ type: 'paragraph', text: 'No risks to flag with this data.' })
    expect(
      (blocks[1] as { text: string }).text.startsWith(`Your ladder holds COP${NBSP}50,000,000`),
    ).toBe(true)
    expect((blocks[3] as { text: string }).text).toBe(
      `The ladder pays COP${NBSP}3,109,733 in interest after COP${NBSP}129,572 of withholding tax.`,
    )
  })

  it('renders the space between "COP" and a digit as a no-break space, and leaves every other space alone', () => {
    expect(
      splitExplanation(
        'Pays COP 3,109,733 of COP 50,000,000; COP5, COP x and ESCOP 7 stay.\n- Concentration: COP 1 in COP two',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        text: `Pays COP${NBSP}3,109,733 of COP${NBSP}50,000,000; COP5, COP x and ESCOP 7 stay.`,
      },
      { type: 'list', items: [{ label: 'Concentration', text: `COP${NBSP}1 in COP two` }] },
    ])
    expect(RECORDED_EXAMPLE.text).toContain('COP 50,000,000')
    expect(RECORDED_EXAMPLE.text).not.toContain(NBSP)
  })

  it('groups consecutive "- " lines into one list and ignores surrounding blank lines', () => {
    const text =
      '\n\nWhat happens and when\n\nA paragraph.\n\nRisks\n\n' +
      '- Deposit-insurance ceiling: one sentence.\n- Concentration: another sentence.\n- Rate difference: the third.\n\n\n'
    expect(splitExplanation(text)).toEqual([
      { type: 'heading', text: 'What happens and when' },
      { type: 'paragraph', text: 'A paragraph.' },
      { type: 'heading', text: 'Risks' },
      {
        type: 'list',
        items: [
          { label: 'Deposit-insurance ceiling', text: 'one sentence.' },
          { label: 'Concentration', text: 'another sentence.' },
          { label: 'Rate difference', text: 'the third.' },
        ],
      },
    ])
  })

  it('splits off each of the four §4 risk labels when the item opens with it and a colon', () => {
    expect(
      splitExplanation(
        '- Deposit-insurance ceiling:   Banco A is above the ceiling.\n- Concentration: 70% in one institution.\n' +
          '- Clustered maturities: rungs 1 and 2.\n- Rate difference:',
      ),
    ).toEqual([
      {
        type: 'list',
        items: [
          { label: 'Deposit-insurance ceiling', text: 'Banco A is above the ceiling.' },
          { label: 'Concentration', text: '70% in one institution.' },
          { label: 'Clustered maturities', text: 'rungs 1 and 2.' },
          { label: 'Rate difference', text: '' },
        ],
      },
    ])
  })

  it('keeps an item whole when its label is not one of the four, has no colon, or is not at the start', () => {
    expect(
      splitExplanation(
        '- Something else: a sentence.\n- Concentration high in one institution.\n' +
          '- A note on Deposit-insurance ceiling: x.\n- deposit-insurance ceiling: y.',
      ),
    ).toEqual([
      {
        type: 'list',
        items: [
          { label: null, text: 'Something else: a sentence.' },
          { label: null, text: 'Concentration high in one institution.' },
          { label: null, text: 'A note on Deposit-insurance ceiling: x.' },
          { label: null, text: 'deposit-insurance ceiling: y.' },
        ],
      },
    ])
  })

  it('no longer recognises the headers and labels of the Spanish v1 contract', () => {
    expect(splitExplanation('Riesgos\n\n- Tope del seguro: una frase.')).toEqual([
      { type: 'paragraph', text: 'Riesgos' },
      { type: 'list', items: [{ label: null, text: 'Tope del seguro: una frase.' }] },
    ])
  })

  it('joins the lines of one paragraph and starts a new list after a paragraph', () => {
    expect(splitExplanation('line one\nline two\n- a\ntext\n- b')).toEqual([
      { type: 'paragraph', text: 'line one line two' },
      { type: 'list', items: [{ label: null, text: 'a' }] },
      { type: 'paragraph', text: 'text' },
      { type: 'list', items: [{ label: null, text: 'b' }] },
    ])
  })

  it('recognises a bolded header and bullet marks the way SPEC §11.1 and §11.6 do, keeping the item text as sent', () => {
    expect(
      splitExplanation(
        '**Risks**\n\n- **Deposit-insurance ceiling:** a.\n• Concentration: b.\n•Rate difference: c.',
      ),
    ).toEqual([
      { type: 'heading', text: 'Risks' },
      {
        type: 'list',
        items: [
          { label: null, text: '**Deposit-insurance ceiling:** a.' },
          { label: 'Concentration', text: 'b.' },
          { label: 'Rate difference', text: 'c.' },
        ],
      },
    ])
  })

  it('keeps a lone marker and a "---" rule as paragraphs', () => {
    expect(splitExplanation('-\n\n---\n\n•\n\n- real')).toEqual([
      { type: 'paragraph', text: '-' },
      { type: 'paragraph', text: '---' },
      { type: 'paragraph', text: '•' },
      { type: 'list', items: [{ label: null, text: 'real' }] },
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
      `You have used all of the explanations available today from your connection. They are available again at ${at}.`,
    )
  })

  it('limit/ip without retry-after stops after the first sentence', () => {
    expect(
      messageFor({ kind: 'limit', scope: 'ip', retryAfterSeconds: null, text: 'x' }, RECEIVED_AT),
    ).toBe('You have used all of the explanations available today from your connection.')
  })

  it('limit/daily with retry-after names the local hour', () => {
    expect(
      messageFor(
        { kind: 'limit', scope: 'daily', retryAfterSeconds: TO_MIDNIGHT_UTC, text: 'x' },
        RECEIVED_AT,
      ),
    ).toBe(
      `The demo has reached its limit of explanations for today. It is available again at ${at}.`,
    )
  })

  it('limit/daily without retry-after says tomorrow', () => {
    expect(
      messageFor({ kind: 'limit', scope: 'daily', retryAfterSeconds: null, text: 'x' }, RECEIVED_AT),
    ).toBe('The demo has reached its limit of explanations for today. Come back tomorrow.')
  })

  it('invalid names the issue when there is one, and shows the fixed text alone otherwise', () => {
    expect(
      messageFor(
        { kind: 'invalid', issue: 'The term cannot exceed 3,650 days.', text: 'Fixed.' },
        RECEIVED_AT,
      ),
    ).toBe('This scenario cannot be explained: The term cannot exceed 3,650 days.')
    expect(messageFor({ kind: 'invalid', issue: null, text: 'Fixed.' }, RECEIVED_AT)).toBe('Fixed.')
  })

  it('throttled, unavailable and network', () => {
    expect(messageFor({ kind: 'throttled' }, RECEIVED_AT)).toBe('The service is paused right now.')
    expect(messageFor({ kind: 'unavailable', text: 'Fixed text of the API.' }, RECEIVED_AT)).toBe(
      'Fixed text of the API.',
    )
    expect(messageFor({ kind: 'network' }, RECEIVED_AT)).toBe(
      'The service could not be reached. Check your connection and try again.',
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
