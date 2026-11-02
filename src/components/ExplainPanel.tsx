import type { ExplainOutcome } from '../api/explain'
import {
  canShowExample,
  DISCLOSURE,
  EXAMPLE_BUTTON_LABEL,
  EXAMPLE_LABEL,
  GENERATED_NOTE,
  MATURED_HINT,
  messageFor,
  PANEL_LABEL,
  PENDING,
  RECORDED_EXAMPLE,
  ROLLOVER_NOTE,
  splitExplanation,
} from '../ui/explanation'

export type ExplainState =
  | { status: 'idle' }
  | { status: 'pending' }
  /** `receivedAt` anchors the reset-hour label of a 429 to the moment it arrived. */
  | { status: 'done'; outcome: ExplainOutcome; receivedAt: Date }

/** The id the head's button points at through aria-describedby while the ladder is fully matured. */
export const MATURED_HINT_ID = 'explain-hint'

interface Props {
  state: ExplainState
  /** Every maturity is before today: the API would answer 400, so the button is off. */
  matured: boolean
  /** Rollover is on in the form; the API explains the initial terms only. */
  rollover: boolean
  exampleShown: boolean
  onShowExample: () => void
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
              <ul key={i} className="explanation-list">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )
          case 'paragraph':
            return (
              <p key={i} className="explanation-text">
                {block.text}
              </p>
            )
        }
      })}
    </>
  )
}

/**
 * The narrative of the readouts above it. Any edit resets it to idle from
 * App: an explanation of numbers that no longer match the form is worse than
 * none. The disclosure stays visible until an explanation replaces it.
 */
export function ExplainPanel({ state, matured, rollover, exampleShown, onShowExample }: Props) {
  const outcome = state.status === 'done' ? state.outcome : null
  const explanation = outcome?.kind === 'explanation' ? outcome.text : null
  const failure = outcome !== null && outcome.kind !== 'explanation' ? outcome : null
  return (
    <section
      className="explanation"
      aria-labelledby="h-explain"
      aria-busy={state.status === 'pending'}
    >
      <p className="explanation-label" id="h-explain">
        {PANEL_LABEL}
      </p>
      {rollover && <p className="notice">{ROLLOVER_NOTE}</p>}
      {matured ? (
        <p className="notice" id={MATURED_HINT_ID}>
          {MATURED_HINT}
        </p>
      ) : (
        explanation === null && <p className="notice">{DISCLOSURE}</p>
      )}
      {state.status === 'pending' && <p className="explanation-pending">{PENDING}</p>}
      {explanation !== null && (
        <>
          <ExplanationText text={explanation} />
          <p className="notice">{GENERATED_NOTE}</p>
        </>
      )}
      {failure !== null && state.status === 'done' && (
        <>
          <p className="explanation-error">{messageFor(failure, state.receivedAt)}</p>
          {canShowExample(failure.kind) && !exampleShown && (
            <button type="button" className="btn-ghost" onClick={onShowExample}>
              {EXAMPLE_BUTTON_LABEL}
            </button>
          )}
          {exampleShown && (
            <>
              <p className="notice">{EXAMPLE_LABEL}</p>
              <ExplanationText text={RECORDED_EXAMPLE.text} />
            </>
          )}
        </>
      )}
    </section>
  )
}
