import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ExplainOutcome } from '../api/explain'
import {
  AGAIN_LABEL,
  BUTTON_LABEL,
  canRetry,
  canShowExample,
  DISCLOSURE,
  EXAMPLE_BUTTON_LABEL,
  EXAMPLE_LABEL,
  failureLabel,
  GENERATED_NOTE,
  INVITATION,
  MATURED_HINT,
  messageFor,
  PENDING_ANNOUNCEMENT,
  READY_ANNOUNCEMENT,
  RECORDED_EXAMPLE,
  ROLLOVER_NOTE,
  sentLine,
  SLOW_NOTE,
} from '../ui/explanation'
import type { ExplainFailure, ExplainState, SentSummary } from '../ui/explanation'
import { ExplainPanel, MATURED_HINT_ID } from './ExplainPanel'

/**
 * The panel rendered to markup on the server side of React: no DOM, so these
 * run in the same node environment, and in both time zones, as every other
 * test. What they cannot see is what a browser does with the markup: effects
 * (the clock's ticks, the focus that follows the example) and CSS.
 */

/** U+00A0, built from its code so no invisible character sits in this file. */
const NBSP = String.fromCharCode(0xa0)
const RECEIVED_AT = new Date('2026-11-01T21:13:00Z')
const SENT: SentSummary = { rungs: 2, institutions: 2, principal: 50_000_000, asOf: '2026-11-27' }

type Props = Parameters<typeof ExplainPanel>[0]

function render(state: ExplainState, overrides: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    createElement(ExplainPanel, {
      state,
      canExplain: state.status !== 'pending',
      onExplain: () => {},
      sent: SENT,
      cue: false,
      matured: false,
      rollover: false,
      exampleShown: false,
      onShowExample: () => {},
      ...overrides,
    }),
  )
}

const done = (outcome: ExplainOutcome): ExplainState => ({
  status: 'done',
  outcome,
  receivedAt: RECEIVED_AT,
  elapsedMs: 4_860,
})

/** React escapes text; the assertions below compare what a reader gets. */
function unescape(html: string): string {
  return html
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

/** The text of the live region, or null when the markup has none. */
function status(html: string): string | null {
  const m = /<p class="visually-hidden" role="status">([\s\S]*?)<\/p>/.exec(html)
  return m === null ? null : unescape(m[1])
}

/** The opening tag and the label of the button in the panel's head. */
function headButton(html: string): { tag: string; label: string } {
  const head = /<div class="explanation-head">([\s\S]*?)<\/div>/.exec(html)
  if (head === null) throw new Error('the panel has no head')
  const buttons = [...head[1].matchAll(/(<button[^>]*>)([\s\S]*?)<\/button>/g)]
  expect(buttons).toHaveLength(1)
  return { tag: buttons[0][1], label: unescape(buttons[0][2]) }
}

const FAILURES: ExplainFailure[] = [
  { kind: 'limit', scope: 'ip', retryAfterSeconds: 10_020, text: 'x' },
  { kind: 'limit', scope: 'ip', retryAfterSeconds: null, text: 'x' },
  { kind: 'limit', scope: 'daily', retryAfterSeconds: 10_020, text: 'x' },
  { kind: 'limit', scope: 'daily', retryAfterSeconds: null, text: 'x' },
  { kind: 'throttled' },
  { kind: 'unavailable', text: 'I cannot explain this ladder right now: the service is unavailable.' },
  { kind: 'invalid', issue: "The as-of date is after the ladder's last maturity.", text: 'x' },
  { kind: 'invalid', issue: null, text: 'I cannot explain this ladder: the data received is not valid.' },
  { kind: 'network' },
]

const IDLE: ExplainState = { status: 'idle' }
const PENDING: ExplainState = { status: 'pending', startedAt: 0, slow: false }
const PENDING_LONG: ExplainState = { status: 'pending', startedAt: 0, slow: true }
const ANSWERED = done({ kind: 'explanation', text: RECORDED_EXAMPLE.text })

describe('ExplainPanel — the screen-reader status line', () => {
  it('is in the page from the start, empty, so that a later change is announced', () => {
    expect(status(render(IDLE))).toBe('')
  })

  it('announces the start of the wait', () => {
    expect(status(render(PENDING))).toBe(PENDING_ANNOUNCEMENT)
  })

  it('announces a wait that has turned long, which the panel also shows', () => {
    const html = render(PENDING_LONG)
    expect(status(html)).toBe(SLOW_NOTE)
    expect(html).toContain(`<p class="notice">${SLOW_NOTE}</p>`)
    expect(render(PENDING)).not.toContain(SLOW_NOTE)
  })

  it('announces the answer as ready', () => {
    expect(status(render(ANSWERED))).toBe(READY_ANNOUNCEMENT)
  })

  it('announces each kind of failure with the sentence the panel shows', () => {
    for (const failure of FAILURES) {
      const html = render(done(failure))
      const message = messageFor(failure, RECEIVED_AT)
      expect(status(html)).toBe(message)
      expect(unescape(html)).toContain(`<p class="explanation-error">${message}</p>`)
    }
  })

  it('sits outside the busy region, which could hold its announcement back', () => {
    const html = render(PENDING)
    expect(/<section[^>]*>/.exec(html)?.[0]).not.toContain('aria-busy')
    const statusAt = html.indexOf('role="status"')
    const busyAt = html.indexOf('aria-busy="true"')
    expect(statusAt).toBeGreaterThan(-1)
    expect(busyAt).toBeGreaterThan(statusAt)
    // The status line is closed before the busy region opens: a sibling, not a child.
    expect(html.indexOf('</p>', statusAt)).toBeLessThan(busyAt)
  })
})

describe('ExplainPanel — one button, in the head, through every state', () => {
  it('at rest it is the primary action, with the invitation and the disclosure under it', () => {
    const html = render(IDLE)
    const button = headButton(html)
    expect(button.label).toBe(BUTTON_LABEL)
    expect(button.tag).toContain('class="btn-primary"')
    expect(button.tag).not.toContain('aria-disabled')
    expect(html).toContain('data-state="idle"')
    expect(html).not.toContain('data-outcome')
    expect(html).toContain(INVITATION)
    expect(html).toContain(DISCLOSURE)
  })

  it('during the wait it stays in place, inert and without the accent', () => {
    const html = render(PENDING)
    const button = headButton(html)
    expect(button.label).toBe(BUTTON_LABEL)
    expect(button.tag).toContain('class="btn-ghost"')
    expect(button.tag).toContain('aria-disabled="true"')
    expect(html).toContain('data-state="pending"')
  })

  it('after an answer it says what a second click does, and gives up the accent', () => {
    const button = headButton(render(ANSWERED))
    expect(button.label).toBe(AGAIN_LABEL)
    expect(button.tag).toContain('class="btn-ghost"')
    expect(button.tag).not.toContain('aria-disabled')
  })

  it('after a failure it is primary again only when the same click could get past it', () => {
    for (const failure of FAILURES) {
      const html = render(done(failure))
      const button = headButton(html)
      expect(button.label).toBe(BUTTON_LABEL)
      expect(button.tag).toContain(canRetry(failure.kind) ? 'class="btn-primary"' : 'class="btn-ghost"')
      expect(button.tag).not.toContain('aria-disabled')
      expect(html).toContain(`data-outcome="${failure.kind}"`)
    }
  })

  it('with every maturity passed it is off and points at the hint that says why', () => {
    const html = render(IDLE, { matured: true, canExplain: false })
    const button = headButton(html)
    expect(button.tag).toContain('aria-disabled="true"')
    expect(button.tag).toContain(`aria-describedby="${MATURED_HINT_ID}"`)
    expect(html).toContain(`<p class="notice" id="${MATURED_HINT_ID}">${MATURED_HINT}</p>`)
    expect(html).not.toContain(INVITATION)
    expect(html).not.toContain(DISCLOSURE)
  })

  it('carries the idle cue only while it is at rest, usable and not yet pressed', () => {
    expect(headButton(render(IDLE, { cue: true })).tag).toContain('data-cue')
    expect(headButton(render(IDLE, { cue: false })).tag).not.toContain('data-cue')
    expect(headButton(render(PENDING, { cue: true })).tag).not.toContain('data-cue')
    expect(headButton(render(ANSWERED, { cue: true })).tag).not.toContain('data-cue')
    expect(
      headButton(render(IDLE, { cue: true, matured: true, canExplain: false })).tag,
    ).not.toContain('data-cue')
  })
})

describe('ExplainPanel — the wait', () => {
  it('shows what was sent, and a clock whose label and value are both hidden from assistive technology', () => {
    const html = render(PENDING)
    expect(html).toContain(`<div><dt>Sent</dt><dd>${sentLine(SENT)}</dd></div>`)
    expect(html).toContain('<div aria-hidden="true"><dt>Waiting</dt><dd>0.0 s</dd></div>')
    expect(html).toContain(DISCLOSURE)
    expect(html).not.toContain(INVITATION)
  })
})

describe('ExplainPanel — the answer', () => {
  it('renders the two sections, with every peso amount in the data face', () => {
    const html = render(ANSWERED)
    expect(html).toContain('<h3>What happens and when</h3>')
    expect(html).toContain('<h3>Risks</h3>')
    expect(html).toContain(`<span class="fig">COP${NBSP}50,000,000</span>`)
    expect(html).toContain(`<span class="fig">COP${NBSP}3,109,733</span>`)
    expect(html).toContain(`<span class="fig">COP${NBSP}129,572</span>`)
    expect(html.match(/<span class="fig">/g)).toHaveLength(3)
  })

  it('says how long the reply took, with the unit outside the uppercase label', () => {
    expect(render(ANSWERED)).toContain('Answered in <span>4.8 s</span>')
  })

  it('closes with the note on where the text comes from, in place of the disclosure', () => {
    const text = unescape(render(ANSWERED))
    expect(text).toContain(`<p class="explanation-note">${GENERATED_NOTE}</p>`)
    expect(text).not.toContain(DISCLOSURE)
  })

  it('sets a risk as a label, a colon for a listener, and its sentence', () => {
    const html = render(
      done({
        kind: 'explanation',
        text: 'Risks\n\n- Concentration: Entidad A holds 63.89% of your total principal, with COP 46,000,000 placed there.',
      }),
    )
    expect(html).toContain('<ul class="explanation-list" role="list">')
    expect(html).toContain(
      '<li><strong class="risk-label">Concentration</strong>' +
        '<span class="visually-hidden">: </span>' +
        '<span class="risk-text">Entidad A holds 63.89% of your total principal, with ' +
        `<span class="fig">COP${NBSP}46,000,000</span> placed there.</span></li>`,
    )
  })
})

describe('ExplainPanel — a failure', () => {
  it('names what happened above the sentence, and keeps the disclosure', () => {
    for (const failure of FAILURES) {
      const html = render(done(failure))
      expect(html).toContain(`<p class="explanation-failure">${failureLabel(failure.kind)}</p>`)
      expect(html).toContain(DISCLOSURE)
    }
  })

  it('offers the recorded example only when the service itself gave no answer', () => {
    for (const failure of FAILURES) {
      const offered = render(done(failure)).includes(`>${EXAMPLE_BUTTON_LABEL}</button>`)
      expect(offered).toBe(canShowExample(failure.kind))
    }
  })

  it('shows the example in place of its button, labelled, in a block that can take focus', () => {
    const html = render(done({ kind: 'network' }), { exampleShown: true })
    expect(html).not.toContain(`>${EXAMPLE_BUTTON_LABEL}</button>`)
    expect(html).toContain(
      `<div class="explanation-example" tabindex="-1"><p class="notice">${EXAMPLE_LABEL}</p>`,
    )
    expect(html).toContain('<h3>What happens and when</h3>')
  })
})

describe('ExplainPanel — rollover', () => {
  it('says that the explanation covers the initial terms', () => {
    expect(render(IDLE, { rollover: true })).toContain(`<p class="notice">${ROLLOVER_NOTE}</p>`)
    expect(render(IDLE)).not.toContain(ROLLOVER_NOTE)
  })
})
