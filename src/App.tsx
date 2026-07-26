import { useEffect, useMemo, useState } from 'react'
import { computeScenario, formatCOP, formatPercent } from './engine'
import type { ValidationIssue } from './engine'
import { Header } from './components/Header'
import { ScenarioForm } from './components/ScenarioForm'
import { SummaryReadouts } from './components/SummaryReadouts'
import { LadderChart } from './components/LadderChart'
import { ExposureChart, ExposureTable } from './components/ExposureChart'
import { ScheduleTable } from './components/ScheduleTable'
import { Warnings } from './components/Warnings'
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
import { applyTheme, effectiveTheme, initThemeMeta } from './ui/theme'
import type { Theme } from './ui/theme'

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [theme, setTheme] = useState<Theme>(() => effectiveTheme())

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
        `Interés neto total ${formatCOP(result.totals.netInterest)}, ` +
          `tasa ponderada ${formatPercent(result.blendedEA)} efectiva anual.` +
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
          onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
          onEntityAdd={() =>
            setForm((f) => {
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
            setForm((f) => {
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
            setForm((f) => ({
              ...f,
              entities: f.entities.map((e) => (e.id === id ? { ...e, name } : e)),
            }))
          }
          onAllocate={(rungIndex, entityId) =>
            setForm((f) => {
              const allocation = [...f.allocation]
              allocation[rungIndex] = entityId
              return { ...f, allocation }
            })
          }
        />

        <section className="results" aria-labelledby="h-results">
          <h2 className="section-label" id="h-results">
            Escalera de vencimientos
          </h2>
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
          {result ? (
            <>
              <Warnings exposures={result.exposures} />
              <SummaryReadouts result={result} today={today} />
              <div className="plate">
                <LadderChart rungs={result.rungs} startDate={input.startDate} today={today} />
              </div>
              <div className="plate">
                <ExposureChart
                  exposures={result.exposures}
                  ceiling={input.fiscal.insuranceCeiling}
                />
              </div>
              <ExposureTable exposures={result.exposures} />
              <ScheduleTable
                result={result}
                entityNames={entityNames}
                showEntity={form.entities.length > 1}
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
