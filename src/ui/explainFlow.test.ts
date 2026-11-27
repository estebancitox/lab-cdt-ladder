import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEOUT_MS } from '../api/explain'
import type { ExplainOutcome } from '../api/explain'
import {
  canRetry,
  canShowExample,
  elapsedTickMs,
  failureLabel,
  figureRuns,
  formatElapsed,
  messageFor,
  PENDING_ANNOUNCEMENT,
  READY_ANNOUNCEMENT,
  RECORDED_EXAMPLE,
  sentLine,
  CUE_WINDOW_MS,
  SLOW_AFTER_MS,
  SLOW_NOTE,
  splitExplanation,
  statusAnnouncement,
} from './explanation'
import type { ExplainFailure, ExplainState } from './explanation'

/** U+00A0, built from its code so no invisible character sits in this file. */
const NBSP = String.fromCharCode(0xa0)
const RECEIVED_AT = new Date('2026-11-01T21:13:00Z')

const done = (outcome: ExplainOutcome): ExplainState => ({
  status: 'done',
  outcome,
  receivedAt: RECEIVED_AT,
  elapsedMs: 2_400,
})

const FAILURES: ExplainFailure[] = [
  { kind: 'limit', scope: 'ip', retryAfterSeconds: 10_020, text: 'x' },
  { kind: 'limit', scope: 'ip', retryAfterSeconds: null, text: 'x' },
  { kind: 'limit', scope: 'daily', retryAfterSeconds: 10_020, text: 'x' },
  { kind: 'throttled' },
  { kind: 'unavailable', text: 'I cannot explain this ladder right now: the service is unavailable.' },
  { kind: 'invalid', issue: "The as-of date is after the ladder's last maturity.", text: 'x' },
  { kind: 'network' },
]

describe('statusAnnouncement — the one line a screen reader hears per state', () => {
  it('is silent at rest', () => {
    expect(statusAnnouncement({ status: 'idle' })).toBe('')
  })

  it('announces the start of the wait', () => {
    expect(statusAnnouncement({ status: 'pending', startedAt: 0, slow: false })).toBe(
      PENDING_ANNOUNCEMENT,
    )
    expect(PENDING_ANNOUNCEMENT).toBe('Asking for the explanation.')
  })

  it('announces a wait that has turned long, with the sentence the panel shows', () => {
    expect(statusAnnouncement({ status: 'pending', startedAt: 0, slow: true })).toBe(SLOW_NOTE)
  })

  it('announces an answer as ready, without reading it out', () => {
    expect(statusAnnouncement(done({ kind: 'explanation', text: 'What happens and when' }))).toBe(
      READY_ANNOUNCEMENT,
    )
    expect(READY_ANNOUNCEMENT).toBe('Explanation ready.')
  })

  it('announces a failure with the sentence the panel shows for it', () => {
    for (const failure of FAILURES) {
      expect(statusAnnouncement(done(failure))).toBe(messageFor(failure, RECEIVED_AT))
    }
    expect(statusAnnouncement(done({ kind: 'network' }))).toBe(
      'The service could not be reached. Check your connection and try again.',
    )
  })
})

describe('figureRuns — peso amounts apart from the prose around them', () => {
  it('marks each amount of a rendered paragraph and leaves the rest as it was', () => {
    expect(
      figureRuns(`The ladder pays COP${NBSP}3,109,733 in interest after COP${NBSP}129,572 of withholding tax.`),
    ).toEqual([
      { figure: false, text: 'The ladder pays ' },
      { figure: true, text: `COP${NBSP}3,109,733` },
      { figure: false, text: ' in interest after ' },
      { figure: true, text: `COP${NBSP}129,572` },
      { figure: false, text: ' of withholding tax.' },
    ])
  })

  it('stops an amount before the comma or the full stop that follows it', () => {
    expect(figureRuns(`tax of COP${NBSP}357,375, then COP${NBSP}50,000,000.`)).toEqual([
      { figure: false, text: 'tax of ' },
      { figure: true, text: `COP${NBSP}357,375` },
      { figure: false, text: ', then ' },
      { figure: true, text: `COP${NBSP}50,000,000` },
      { figure: false, text: '.' },
    ])
  })

  it('reads an amount written with a plain space, or with no grouping, the same way', () => {
    expect(figureRuns('COP 0 and COP 5000000')).toEqual([
      { figure: true, text: 'COP 0' },
      { figure: false, text: ' and ' },
      { figure: true, text: 'COP 5000000' },
    ])
  })

  it('leaves text with no amount, a bare code, and a percentage as one plain run', () => {
    expect(figureRuns('Entidad A holds 63.89% of your total principal.')).toEqual([
      { figure: false, text: 'Entidad A holds 63.89% of your total principal.' },
    ])
    expect(figureRuns('COP is the currency code.')).toEqual([
      { figure: false, text: 'COP is the currency code.' },
    ])
    expect(figureRuns('')).toEqual([])
  })

  it('never changes a character: the runs of every block of the recorded example join back', () => {
    for (const block of splitExplanation(RECORDED_EXAMPLE.text)) {
      const texts =
        block.type === 'list' ? block.items.map((item) => item.text) : [block.text]
      for (const text of texts) {
        expect(figureRuns(text).map((run) => run.text).join('')).toBe(text)
      }
    }
  })
})

describe('formatElapsed — the readout of the wait', () => {
  it('shows tenths, floored: never a time that has not passed yet', () => {
    expect(formatElapsed(0)).toBe('0.0 s')
    expect(formatElapsed(99)).toBe('0.0 s')
    expect(formatElapsed(3_449)).toBe('3.4 s')
    expect(formatElapsed(3_999)).toBe('3.9 s')
    expect(formatElapsed(12_345)).toBe('12.3 s')
  })

  it('shows whole seconds when asked, and nothing below zero', () => {
    expect(formatElapsed(3_999, true)).toBe('3 s')
    expect(formatElapsed(30_000, true)).toBe('30 s')
    expect(formatElapsed(-5)).toBe('0.0 s')
  })
})

describe('elapsedTickMs — reduced motion', () => {
  it('ticks ten times a second, and once a second with motion reduced', () => {
    expect(elapsedTickMs(false)).toBe(100)
    expect(elapsedTickMs(true)).toBe(1000)
  })
})

describe('sentLine — what the request described, shown back during the wait', () => {
  it('names the rungs, the institutions that hold them, the principal and the as-of date', () => {
    expect(sentLine({ rungs: 2, institutions: 2, principal: 50_000_000, asOf: '2026-11-27' })).toBe(
      `2 rungs at 2 institutions · COP${NBSP}50,000,000 · as of 27 Nov 2026`,
    )
  })

  it('uses the singular for one', () => {
    expect(sentLine({ rungs: 1, institutions: 1, principal: 40_000_000, asOf: '2027-01-04' })).toBe(
      `1 rung at 1 institution · COP${NBSP}40,000,000 · as of 4 Jan 2027`,
    )
  })
})

describe('failureLabel and canRetry — what happened, and whether the same click can help', () => {
  it('labels each kind of failure', () => {
    expect(failureLabel('limit')).toBe('Daily limit reached')
    expect(failureLabel('throttled')).toBe('Service paused')
    expect(failureLabel('unavailable')).toBe('Service unavailable')
    expect(failureLabel('invalid')).toBe('Scenario not accepted')
    expect(failureLabel('network')).toBe('Service not reached')
  })

  it('a daily limit and a refused scenario are not worth the same click again', () => {
    expect(canRetry('limit')).toBe(false)
    expect(canRetry('invalid')).toBe(false)
    expect(canRetry('throttled')).toBe(true)
    expect(canRetry('unavailable')).toBe(true)
    expect(canRetry('network')).toBe(true)
  })

  it('every failure the same click can get past also offers the recorded example', () => {
    for (const { kind } of FAILURES) {
      if (canRetry(kind)) expect(canShowExample(kind)).toBe(true)
    }
  })
})

describe('the constants of the wait and of the cue', () => {
  it("the slow note's threshold is 8 s, and its text names the client's own cutoff", () => {
    expect(SLOW_AFTER_MS).toBe(8_000)
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000)
    expect(SLOW_NOTE).toBe('Longer than usual. The request is dropped after 30 seconds.')
  })

  it("the cue's window is 37 s", () => {
    expect(CUE_WINDOW_MS).toBe(37_000)
  })
})
