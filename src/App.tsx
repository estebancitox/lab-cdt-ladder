import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeScenario, dayNumber, formatCOP, formatDateShort, formatPercent } from './engine'
import type { ValidationIssue } from './engine'
import { Header } from './components/Header'
import { ScenarioForm } from './components/ScenarioForm'
import { SummaryReadouts } from './components/SummaryReadouts'
import { LadderChart } from './components/LadderChart'
import { ExposureChart, ExposureTable } from './components/ExposureChart'
import { ProjectionTable } from './components/ProjectionTable'
import { ScheduleTable } from './components/ScheduleTable'
import { Warnings } from './components/Warnings'
import { ExplainPanel } from './components/ExplainPanel'
import type { ExplainState, SentSummary } from './components/ExplainPanel'
import { explain } from './api/explain'
import { clearSavedForm, initialFormState, saveForm } from './state/persistence'
import { shareURL } from './state/urlCodec'
import {
  buildScenario,
  entityDisplayName,
  entitySoftIssues,
  fieldForPath,
  initialForm,
  MAX_ENTITIES,
  todayISO,
} from './ui/form'
import type { FormState } from './ui/form'
import { CUE_WINDOW_MS, SLOW_AFTER_MS } from './ui/explanation'
import { applyTheme, effectiveTheme, initThemeMeta } from './ui/theme'
import type { Theme } from './ui/theme'

// Development only: with a hash such as `#explain=ok`, src/dev/explainPreview
// answers the explain button from fixtures instead of the network. It loads
// with the page, so it reads the hash before Share, Reset or an edit rewrites
// the address. A production build drops this line, the branch that uses it
// and the module.
const explainPreview = import.meta.env.DEV ? import('./dev/explainPreview') : null

export default function App() {
  const [init] = useState(initialFormState)
  const [form, setForm] = useState<FormState>(init.form)
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme())
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const dirtyRef = useRef(false)
  const shareTimerRef = useRef<number | undefined>(undefined)

  const [explainState, setExplainState] = useState<ExplainState>({ status: 'idle' })
  const [exampleShown, setExampleShown] = useState(false)
  // The idle button's cue belongs to the start of a visit: it ends with the
  // first click or when its window closes, whichever comes first, for good.
  const [explainCue, setExplainCue] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setExplainCue(false), CUE_WINDOW_MS)
    return () => window.clearTimeout(t)
  }, [])
  // Bumped by every edit and every request: a reply whose number no longer
  // matches is for a scenario the form has left behind, and is dropped.
  const explainSeqRef = useRef(0)

  const clearExplanation = useCallback(() => {
    explainSeqRef.current += 1
    setExplainState((s) => (s.status === 'idle' ? s : { status: 'idle' }))
    setExampleShown(false)
  }, [])

  /**
   * Every user edit goes through here. It (a) enables autosave, so merely
   * opening someone's shared link never overwrites the reader's own saved
   * scenario, (b) detaches the URL from its ?s= snapshot — that param
   * outranks storage on load, so leaving it would revert these edits on the
   * next visit and then persist the stale snapshot over them — and (c) clears
   * the explanation, which described the numbers the edit is about to change.
   */
  const editForm = useCallback(
    (updater: (f: FormState) => FormState) => {
      dirtyRef.current = true
      if (location.search) history.replaceState(null, '', location.pathname)
      clearExplanation()
      setForm(updater)
    },
    [clearExplanation],
  )

  // Best-effort autosave, debounced so typing does not hammer storage.
  useEffect(() => {
    if (!dirtyRef.current) return
    const t = setTimeout(() => saveForm(form), 500)
    return () => clearTimeout(t)
  }, [form])

  useEffect(() => () => window.clearTimeout(shareTimerRef.current), [])

  useEffect(() => {
    initThemeMeta()
    // Follow system changes only while the user has not made an explicit choice.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(effectiveTheme())
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const today = todayISO()
  const { input, issues } = useMemo(() => buildScenario(form), [form])
  const result = useMemo(
    () => (issues.length === 0 && input.rungs.length > 0 ? computeScenario(input) : null),
    [issues, input],
  )

  const errors = useMemo(() => {
    const byField: Partial<Record<keyof FormState, ValidationIssue>> = {}
    for (const issue of issues) {
      const field = fieldForPath(issue.path)
      if (field && !byField[field]) byField[field] = issue
    }
    return byField
  }, [issues])
  const entityErrors = useMemo(() => entitySoftIssues(form), [form])

  // Debounced one-line summary for screen readers: announcing the whole
  // results section per keystroke would flood AT with dozens of changed cells.
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (!result) return
    const exceeded = result.exposures.filter((e) => e.exceeded).length
    const t = setTimeout(() => {
      setAnnouncement(
        `Total net interest ${result.projection ? 'of the initial terms ' : ''}` +
          `${formatCOP(result.totals.netInterest)}, ` +
          `blended rate ${formatPercent(result.blendedEA)} effective annual.` +
          (result.projection
            ? ` Projected value ${formatCOP(result.projection.totalFinalValue)} on ${formatDateShort(result.projection.finalMaturity)}.`
            : '') +
          (exceeded === 1
            ? ' One institution is above the deposit-insurance ceiling.'
            : exceeded > 1
              ? ` ${exceeded} institutions are above the deposit-insurance ceiling.`
              : ''),
      )
    }, 800)
    return () => clearTimeout(t)
  }, [result])

  const entityNames = useMemo(
    () => Object.fromEntries(form.entities.map((e, i) => [e.id, entityDisplayName(e.name, i)])),
    [form.entities],
  )

  const interestLabel = result?.projection ? 'projected interest' : 'gross interest'
  const horizonBeforeFinal = Boolean(
    input.rollover?.mode === 'horizon' &&
      result?.projection &&
      result.projection.finalMaturity > input.rollover.horizonDate,
  )

  // The API refuses an asOfDate after the last maturity (SPEC §2.1), so the
  // button stays off with a hint instead of sending a request that ends in a
  // 400. result.rungs is sorted by maturity: its last entry is the ladder's end.
  const lastMaturity =
    result && result.rungs.length > 0 ? result.rungs[result.rungs.length - 1].maturityDate : null
  const matured = lastMaturity !== null && dayNumber(today) > dayNumber(lastMaturity)
  const canExplain = result !== null && !matured && explainState.status !== 'pending'

  // What a click sends, for the panel to show back while it waits. Any edit
  // returns the panel to idle, so during a wait this is the request in flight.
  const sent = useMemo<SentSummary>(
    () => ({
      rungs: input.rungs.length,
      institutions: new Set(input.rungs.map((r) => r.entityId)).size,
      principal: input.rungs.reduce((sum, r) => sum + r.principal, 0),
      asOf: today,
    }),
    [input, today],
  )

  // One request per click, never retried: each spends about a cent on the
  // API's side and one of the reader's ten daily requests.
  const onExplain = async () => {
    if (!canExplain) return
    // Resolved before the panel starts to wait: if the development preview
    // cannot load, the click fails here and nothing is left pending.
    const options =
      import.meta.env.DEV && explainPreview ? (await explainPreview).previewOptions() : {}
    const seq = ++explainSeqRef.current
    const startedAt = performance.now()
    setExplainCue(false)
    setExplainState({ status: 'pending', startedAt, slow: false })
    setExampleShown(false)
    // Marks the wait as long once it is. A reply or an edit that came first
    // has already replaced this pending state, and the update finds nothing.
    window.setTimeout(() => {
      setExplainState((s) =>
        s.status === 'pending' && s.startedAt === startedAt ? { ...s, slow: true } : s,
      )
    }, SLOW_AFTER_MS)
    const outcome = await explain(input, today, options)
    if (seq !== explainSeqRef.current) return
    setExplainState({
      status: 'done',
      outcome,
      receivedAt: new Date(),
      elapsedMs: performance.now() - startedAt,
    })
  }

  const onShare = async () => {
    const url = shareURL(form)
    // The address bar always ends up holding the shared URL, so even a failed
    // clipboard write leaves the user one copy-from-address-bar away.
    history.replaceState(null, '', url)
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // Insecure context or denied permission: fall back to a scratch textarea,
      // restoring focus so a keyboard user does not land back on <body>.
      const previous = document.activeElement as HTMLElement | null
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.readOnly = true
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch {
        ok = false
      }
      previous?.focus()
    }
    setShareState(ok ? 'copied' : 'failed')
    window.clearTimeout(shareTimerRef.current)
    shareTimerRef.current = window.setTimeout(() => setShareState('idle'), 2500)
  }

  const onReset = () => {
    if (!window.confirm('Reset all parameters? The saved scenario is deleted.')) {
      return
    }
    // Cleared, not re-saved: the next autosave stays disabled until the user
    // edits, so a later visit rebuilds the defaults against that day's date.
    dirtyRef.current = false
    clearSavedForm()
    clearExplanation()
    history.replaceState(null, '', location.pathname)
    setForm(initialForm())
  }

  return (
    <>
      <h1 className="visually-hidden">CDT ladder calculator</h1>
      <Header
        theme={theme}
        onToggle={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          applyTheme(next)
          setTheme(next)
        }}
      />
      <main>
        <ScenarioForm
          form={form}
          errors={errors}
          entityErrors={entityErrors}
          onChange={(field, value) => editForm((f) => ({ ...f, [field]: value }))}
          onEntityAdd={() =>
            editForm((f) => {
              if (f.entities.length >= MAX_ENTITIES) return f
              // Letter follows the monotonic sequence, never the list length:
              // add/remove/add must not mint a duplicate default name.
              const letter = String.fromCharCode(65 + ((f.nextEntitySeq - 1) % 26))
              return {
                ...f,
                entities: [...f.entities, { id: `e${f.nextEntitySeq}`, name: `Institution ${letter}` }],
                nextEntitySeq: f.nextEntitySeq + 1,
              }
            })
          }
          onEntityRemove={(id) =>
            editForm((f) => {
              if (f.entities.length <= 1) return f
              const entities = f.entities.filter((e) => e.id !== id)
              return {
                ...f,
                entities,
                allocation: f.allocation.map((a) => (a === id ? entities[0].id : a)),
              }
            })
          }
          onEntityRename={(id, name) =>
            editForm((f) => ({
              ...f,
              entities: f.entities.map((e) => (e.id === id ? { ...e, name } : e)),
            }))
          }
          onAllocate={(rungIndex, entityId) =>
            editForm((f) => {
              const allocation = [...f.allocation]
              allocation[rungIndex] = entityId
              return { ...f, allocation }
            })
          }
        />

        <section className="results" aria-labelledby="h-results">
          <div className="results-head">
            <h2 className="section-label" id="h-results">
              Maturity ladder
            </h2>
            <div className="actions">
              <button type="button" className="btn-ghost" onClick={onReset}>
                Reset
              </button>
              <button type="button" className="btn-ghost" onClick={onShare}>
                {shareState === 'copied' ? 'Link copied' : 'Share'}
              </button>
            </div>
          </div>
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
          <p className="visually-hidden" role="status">
            {shareState === 'copied'
              ? 'Link copied to the clipboard.'
              : shareState === 'failed'
                ? 'Copying failed; the URL in the address bar already holds this scenario.'
                : ''}
          </p>
          {shareState === 'failed' && (
            <p className="notice">
              Copying failed. The URL in the address bar already holds this scenario.
            </p>
          )}
          {/* Visible from first paint, so no live region: it would never fire. */}
          {init.urlWasBad && (
            <p className="notice">
              {init.source === 'storage'
                ? 'The link could not be read; your saved scenario is shown.'
                : 'The link could not be read; the starting values are shown.'}
            </p>
          )}
          {result ? (
            <>
              <Warnings exposures={result.exposures} interestLabel={interestLabel} />
              <SummaryReadouts
                result={result}
                today={today}
                horizonBeforeFinal={horizonBeforeFinal}
              />
              <ExplainPanel
                state={explainState}
                canExplain={canExplain}
                onExplain={onExplain}
                sent={sent}
                cue={explainCue}
                matured={matured}
                rollover={input.rollover !== undefined}
                exampleShown={exampleShown}
                onShowExample={() => setExampleShown(true)}
              />
              <div className="plate">
                <LadderChart
                  rungs={result.rungs}
                  startDate={input.startDate}
                  today={today}
                  projections={result.projection?.perRung}
                />
              </div>
              <div className="plate">
                <ExposureChart
                  exposures={result.exposures}
                  ceiling={input.fiscal.insuranceCeiling}
                  interestLabel={interestLabel}
                />
              </div>
              <ExposureTable
                exposures={result.exposures}
                interestLabel={interestLabel}
                projected={Boolean(result.projection)}
              />
              {result.projection && <ProjectionTable projection={result.projection} />}
              <ScheduleTable
                result={result}
                entityNames={entityNames}
                showEntity={form.entities.length > 1}
                projected={Boolean(result.projection)}
              />
            </>
          ) : (
            <p className="empty-state" role="status">
              Fix the marked fields to see the ladder and its schedule.
            </p>
          )}
        </section>
      </main>
      <footer>
        <p className="disclaimer">
          A modeling tool for CDTs (Colombian term deposits), not financial advice. Every parameter
          is set by the person using it: check the current withholding rate and deposit-insurance
          coverage. CDTs held at cooperatives are covered by Fogacoop, not Fogafín: check the
          current ceiling of each fund.
        </p>
        <p className="colophon">
          © 2026 Sergio Esteban Torres · IBM Plex Mono ·{' '}
          React 18 + Vite ·{' '}
          <a href="https://github.com/estebancitox/lab-cdt-ladder">
            source <span aria-hidden="true">↗</span>
          </a>
        </p>
      </footer>
    </>
  )
}
