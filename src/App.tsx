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
import { ExplainPanel, MATURED_HINT_ID } from './components/ExplainPanel'
import type { ExplainState } from './components/ExplainPanel'
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
import { BUTTON_LABEL, messageFor, READY_ANNOUNCEMENT } from './ui/explanation'
import { applyTheme, effectiveTheme, initThemeMeta } from './ui/theme'
import type { Theme } from './ui/theme'

export default function App() {
  const [init] = useState(initialFormState)
  const [form, setForm] = useState<FormState>(init.form)
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme())
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const dirtyRef = useRef(false)
  const shareTimerRef = useRef<number | undefined>(undefined)

  const [explainState, setExplainState] = useState<ExplainState>({ status: 'idle' })
  const [exampleShown, setExampleShown] = useState(false)
  const [explainAnnouncement, setExplainAnnouncement] = useState('')
  // Bumped by every edit and every request: a reply whose number no longer
  // matches is for a scenario the form has left behind, and is dropped.
  const explainSeqRef = useRef(0)

  const clearExplanation = useCallback(() => {
    explainSeqRef.current += 1
    setExplainState((s) => (s.status === 'idle' ? s : { status: 'idle' }))
    setExampleShown(false)
    setExplainAnnouncement('')
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
        `Interés neto total ${result.projection ? 'de los plazos iniciales ' : ''}` +
          `${formatCOP(result.totals.netInterest)}, ` +
          `tasa ponderada ${formatPercent(result.blendedEA)} efectiva anual.` +
          (result.projection
            ? ` Valor proyectado ${formatCOP(result.projection.totalFinalValue)} al ${formatDateShort(result.projection.finalMaturity)}.`
            : '') +
          (exceeded === 1
            ? ' Una entidad supera el tope del seguro.'
            : exceeded > 1
              ? ` ${exceeded} entidades superan el tope del seguro.`
              : ''),
      )
    }, 800)
    return () => clearTimeout(t)
  }, [result])

  const entityNames = useMemo(
    () => Object.fromEntries(form.entities.map((e, i) => [e.id, entityDisplayName(e.name, i)])),
    [form.entities],
  )

  const interestLabel = result?.projection ? 'interés proyectado' : 'interés bruto'
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

  // One request per click, never retried: each spends about a cent on the
  // API's side and one of the reader's ten daily requests.
  const onExplain = async () => {
    if (!canExplain) return
    const seq = ++explainSeqRef.current
    setExplainState({ status: 'pending' })
    setExampleShown(false)
    setExplainAnnouncement('')
    const outcome = await explain(input, today)
    if (seq !== explainSeqRef.current) return
    const receivedAt = new Date()
    setExplainState({ status: 'done', outcome, receivedAt })
    setExplainAnnouncement(
      outcome.kind === 'explanation' ? READY_ANNOUNCEMENT : messageFor(outcome, receivedAt),
    )
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
    if (!window.confirm('¿Restablecer todos los parámetros? Se borra el escenario guardado.')) {
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
      <h1 className="visually-hidden">Calculadora de escalera de CDT</h1>
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
                entities: [...f.entities, { id: `e${f.nextEntitySeq}`, name: `Entidad ${letter}` }],
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
              Escalera de vencimientos
            </h2>
            <div className="actions">
              <button type="button" className="btn-ghost" onClick={onReset}>
                Restablecer
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={onExplain}
                aria-disabled={canExplain ? undefined : true}
                aria-describedby={matured ? MATURED_HINT_ID : undefined}
              >
                {BUTTON_LABEL}
              </button>
              <button type="button" className="btn-primary" onClick={onShare}>
                {shareState === 'copied' ? 'Enlace copiado' : 'Compartir'}
              </button>
            </div>
          </div>
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
          <p className="visually-hidden" role="status">
            {shareState === 'copied'
              ? 'Enlace copiado al portapapeles.'
              : shareState === 'failed'
                ? 'No se pudo copiar; la URL en la barra de direcciones ya contiene este escenario.'
                : ''}
          </p>
          <p className="visually-hidden" role="status">
            {explainAnnouncement}
          </p>
          {shareState === 'failed' && (
            <p className="notice">
              No se pudo copiar. La URL en la barra de direcciones ya contiene este escenario.
            </p>
          )}
          {/* Visible from first paint, so no live region: it would never fire. */}
          {init.urlWasBad && (
            <p className="notice">
              {init.source === 'storage'
                ? 'El enlace no se pudo leer; se muestra tu escenario guardado.'
                : 'El enlace no se pudo leer; se muestran los valores iniciales.'}
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
              Corrige los campos marcados para ver la escalera y su calendario.
            </p>
          )}
        </section>
      </main>
      <footer>
        <p className="disclaimer">
          Herramienta de modelado, no es asesoría financiera. Todos los parámetros son definidos
          por quien la usa: verifica la tarifa de retención y la cobertura del seguro de depósitos
          vigentes. Los CDT en cooperativas los cubre Fogacoop, no Fogafín: verifica el tope
          vigente de cada fondo.
        </p>
        <p className="colophon">
          © 2026 Sergio Esteban Torres · IBM Plex Mono ·{' '}
          React 18 + Vite ·{' '}
          <a href="https://github.com/estebancitox/lab-cdt-ladder">
            fuente <span aria-hidden="true">↗</span>
          </a>
        </p>
      </footer>
    </>
  )
}
