import { useEffect, useRef, useState } from 'react'
import {
  AGAIN_LABEL,
  BUTTON_LABEL,
  canRetry,
  canShowExample,
  DISCLOSURE,
  elapsedTickMs,
  EXAMPLE_BUTTON_LABEL,
  EXAMPLE_LABEL,
  failureLabel,
  figureRuns,
  formatElapsed,
  GENERATED_NOTE,
  INVITATION,
  MATURED_HINT,
  messageFor,
  PANEL_LABEL,
  RECORDED_EXAMPLE,
  ROLLOVER_NOTE,
  SENT_LABEL,
  sentLine,
  SLOW_NOTE,
  splitExplanation,
  statusAnnouncement,
  WAITING_LABEL,
} from '../ui/explanation'
import type { ExplainState, SentSummary } from '../ui/explanation'

export type { ExplainState, SentSummary }

/** The id the button points at through aria-describedby while the ladder is fully matured. */
export const MATURED_HINT_ID = 'explain-hint'

interface Props {
  state: ExplainState
  /** A valid, unmatured scenario with no request in flight: the button acts. */
  canExplain: boolean
  onExplain: () => void
  /** What a click sends; the wait shows it back. */
  sent: SentSummary
  /** Early in a visit and before any click: the idle button may play its cue. */
  cue: boolean
  /** Every maturity is before today: the API would answer 400, so the button is off. */
  matured: boolean
  /** Rollover is on in the form; the API explains the initial terms only. */
  rollover: boolean
  exampleShown: boolean
  onShowExample: () => void
}

/** Peso amounts in the data face, so they read as the same figures as the readouts above. */
function Figures({ text }: { text: string }) {
  return (
    <>
      {figureRuns(text).map((run, i) =>
        run.figure ? (
          <span key={i} className="fig">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </>
  )
}

function ExplanationText({ text }: { text: string }) {
  return (
    <>
      {splitExplanation(text).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return <h3 key={i}>{block.text}</h3>
          case 'list':
            return (
              // Safari drops the list role from a list with no markers; the role restores it.
              <ul key={i} className="explanation-list" role="list">
                {block.items.map((item, j) => (
                  <li key={j}>
                    {item.label !== null && (
                      <>
                        <strong className="risk-label">{item.label}</strong>
                        {/* The label sits on its own line; the colon is kept for a reader who hears it. */}
                        <span className="visually-hidden">: </span>
                      </>
                    )}
                    <span className="risk-text">
                      <Figures text={item.text} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'paragraph':
            return (
              <p key={i} className="explanation-text">
                <Figures text={block.text} />
              </p>
            )
        }
      })}
    </>
  )
}

/**
 * The wait, from what the client itself knows: what it sent and how long ago.
 * The clock lives here so that ten ticks a second re-render this and nothing
 * above it. Its row is hidden from assistive technology, label and value
 * together, which hears the wait from the status line instead.
 */
function Waiting({ since, sent, slow }: { since: number; sent: SentSummary; slow: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  const [whole, setWhole] = useState(false)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setWhole(reduced)
    const tick = () => setElapsed(performance.now() - since)
    tick()
    const timer = window.setInterval(tick, elapsedTickMs(reduced))
    return () => window.clearInterval(timer)
  }, [since])
  return (
    <>
      <dl className="explanation-wire">
        <div>
          <dt>{SENT_LABEL}</dt>
          <dd>{sentLine(sent)}</dd>
        </div>
        <div aria-hidden="true">
          <dt>{WAITING_LABEL}</dt>
          <dd>{formatElapsed(elapsed, whole)}</dd>
        </div>
      </dl>
      {slow && <p className="notice">{SLOW_NOTE}</p>}
    </>
  )
}

/**
 * The narrative of the readouts above it, framed by the same corner brackets.
 * The button lives in its head, so the click and its answer share one frame
 * and the button is one element in one place through every state: focus never
 * moves. Any edit resets the panel to idle from App: an explanation of numbers
 * that no longer match the form is worse than none. The disclosure stays
 * visible until an explanation replaces it.
 */
export function ExplainPanel({
  state,
  canExplain,
  onExplain,
  sent,
  cue,
  matured,
  rollover,
  exampleShown,
  onShowExample,
}: Props) {
  const outcome = state.status === 'done' ? state.outcome : null
  const explanation = outcome?.kind === 'explanation' ? outcome.text : null
  const failure = outcome !== null && outcome.kind !== 'explanation' ? outcome : null
  const pending = state.status === 'pending'
  // The accent is on the button only while pressing it is the next thing to
  // do: at rest, and after a failure that another try can get past. During
  // the wait and after an answer it belongs to the frame; after a daily limit
  // or a refused scenario the same click would get the same reply.
  const primary = state.status === 'idle' || (failure !== null && canRetry(failure.kind))

  // The example replaces the button that asked for it, so focus follows it.
  const exampleRef = useRef<HTMLDivElement>(null)
  const exampleWasShown = useRef(exampleShown)
  useEffect(() => {
    if (exampleShown && !exampleWasShown.current) exampleRef.current?.focus()
    exampleWasShown.current = exampleShown
  }, [exampleShown])

  return (
    <section
      className="explanation"
      aria-labelledby="h-explain"
      data-state={state.status}
      data-outcome={outcome?.kind}
    >
      <div className="explanation-head">
        <p className="explanation-label" id="h-explain">
          {PANEL_LABEL}
        </p>
        {state.status === 'done' && explanation !== null && (
          <p className="explanation-meta">
            Answered in <span>{formatElapsed(state.elapsedMs)}</span>
          </p>
        )}
        <button
          type="button"
          className={primary ? 'btn-primary' : 'btn-ghost'}
          data-cue={cue && primary && canExplain ? '' : undefined}
          onClick={onExplain}
          aria-disabled={canExplain ? undefined : true}
          aria-describedby={matured ? MATURED_HINT_ID : undefined}
        >
          {explanation === null ? BUTTON_LABEL : AGAIN_LABEL}
        </button>
      </div>
      {/* Outside the busy region below, so the start of the wait is announced at once. */}
      <p className="visually-hidden" role="status">
        {statusAnnouncement(state)}
      </p>
      <div className="explanation-main" aria-busy={pending}>
        {rollover && <p className="notice">{ROLLOVER_NOTE}</p>}
        {state.status === 'idle' && !matured && <p className="explanation-invite">{INVITATION}</p>}
        {state.status === 'pending' && (
          <Waiting since={state.startedAt} sent={sent} slow={state.slow} />
        )}
        {explanation !== null && (
          <div className="explanation-body">
            <ExplanationText text={explanation} />
            <p className="explanation-note">{GENERATED_NOTE}</p>
          </div>
        )}
        {failure !== null && state.status === 'done' && (
          <div className="explanation-body">
            <p className="explanation-failure">{failureLabel(failure.kind)}</p>
            <p className="explanation-error">{messageFor(failure, state.receivedAt)}</p>
            {canShowExample(failure.kind) && !exampleShown && (
              <button type="button" className="btn-ghost" onClick={onShowExample}>
                {EXAMPLE_BUTTON_LABEL}
              </button>
            )}
            {exampleShown && (
              <div className="explanation-example" ref={exampleRef} tabIndex={-1}>
                <p className="notice">{EXAMPLE_LABEL}</p>
                <ExplanationText text={RECORDED_EXAMPLE.text} />
              </div>
            )}
          </div>
        )}
        {matured ? (
          <p className="notice" id={MATURED_HINT_ID}>
            {MATURED_HINT}
          </p>
        ) : (
          explanation === null && <p className="notice">{DISCLOSURE}</p>
        )}
      </div>
    </section>
  )
}
