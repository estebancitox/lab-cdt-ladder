import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { entityDisplayName, formatCapitalInput, initialForm, MAX_ENTITIES, MAX_RUNGS } from '../ui/form'
import type { EntityDraft, FormState } from '../ui/form'
import type { ValidationIssue } from '../engine'

interface Props {
  form: FormState
  errors: Partial<Record<keyof FormState, ValidationIssue>>
  entityErrors: Record<number, ValidationIssue>
  onChange: (field: keyof FormState, value: string) => void
  onEntityAdd: () => void
  onEntityRemove: (id: string) => void
  onEntityRename: (id: string, name: string) => void
  onAllocate: (rungIndex: number, entityId: string) => void
}

interface FieldProps {
  id: keyof FormState
  label: string
  hint?: string
  error?: ValidationIssue
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode
}

function Field({ id, label, hint, error, children }: FieldProps) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  const describedBy = ids.length > 0 ? ids.join(' ') : undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(describedBy, Boolean(error))}
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error" id={`${id}-error`}>
          {error.message}
        </p>
      )}
    </div>
  )
}

function EntityList({
  entities,
  entityErrors,
  onEntityAdd,
  onEntityRemove,
  onEntityRename,
}: {
  entities: EntityDraft[]
  entityErrors: Record<number, ValidationIssue>
  onEntityAdd: () => void
  onEntityRemove: (id: string) => void
  onEntityRename: (id: string, name: string) => void
}) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const atMax = entities.length >= MAX_ENTITIES

  // The clicked row unmounts with its button; without this, focus falls to
  // <body> and a keyboard user restarts from the top of the document.
  const removeWithFocus = (id: string, index: number) => {
    const target = entities[index - 1]?.id ?? entities[index + 1]?.id ?? null
    onEntityRemove(id)
    requestAnimationFrame(() => {
      if (target && inputRefs.current.has(target)) inputRefs.current.get(target)!.focus()
      else addBtnRef.current?.focus()
    })
  }

  return (
    <fieldset>
      <legend>Entidades</legend>
      {entities.map((e, i) => {
        const error = entityErrors[i]
        return (
          <div className="field" key={e.id}>
            <div className="entity-row">
              <label className="visually-hidden" htmlFor={`entity-${e.id}`}>
                Nombre de la entidad {i + 1}
              </label>
              <input
                id={`entity-${e.id}`}
                ref={(el) => {
                  if (el) inputRefs.current.set(e.id, el)
                  else inputRefs.current.delete(e.id)
                }}
                value={e.name}
                // Matches MAX_ENTITY_NAME: a name the serializer would have to
                // truncate could no longer be loaded back from a link.
                maxLength={60}
                autoComplete="off"
                onChange={(ev) => onEntityRename(e.id, ev.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `entity-${e.id}-error` : undefined}
              />
              <button
                type="button"
                className="btn-remove"
                onClick={() => removeWithFocus(e.id, i)}
                disabled={entities.length <= 1}
                aria-label={`Quitar ${e.name.trim() || `entidad ${i + 1}`}`}
              >
                ×
              </button>
            </div>
            {error && (
              <p className="error" id={`entity-${e.id}-error`}>
                {error.message}
              </p>
            )}
          </div>
        )
      })}
      {/* aria-disabled, not disabled: a button that disables itself under
          focus at the boundary drops keyboard focus to <body>. */}
      <button
        type="button"
        className="btn-ghost"
        ref={addBtnRef}
        aria-disabled={atMax || undefined}
        onClick={() => {
          if (!atMax) onEntityAdd()
        }}
      >
        Agregar entidad
      </button>
    </fieldset>
  )
}

function AllocationList({
  form,
  onAllocate,
}: {
  form: FormState
  onAllocate: (rungIndex: number, entityId: string) => void
}) {
  const count = /^\d+$/.test(form.rungCount.trim()) ? Number(form.rungCount.trim()) : 0
  if (form.entities.length < 2 || count < 1 || count > MAX_RUNGS) return null
  const entityIds = new Set(form.entities.map((e) => e.id))
  const valueFor = (i: number) => {
    const id = form.allocation[i]
    return id && entityIds.has(id) ? id : form.entities[0].id
  }
  return (
    <fieldset>
      <legend>Asignación de peldaños</legend>
      {Array.from({ length: count }, (_, i) => (
        <div className="alloc-row" key={i}>
          <label className="alloc-label" htmlFor={`alloc-${i}`}>
            Peldaño {String(i + 1).padStart(2, '0')}
          </label>
          <select
            id={`alloc-${i}`}
            value={valueFor(i)}
            onChange={(ev) => onAllocate(i, ev.target.value)}
          >
            {form.entities.map((e, j) => (
              <option key={e.id} value={e.id}>
                {entityDisplayName(e.name, j)}
              </option>
            ))}
          </select>
        </div>
      ))}
    </fieldset>
  )
}

export function ScenarioForm({
  form,
  errors,
  entityErrors,
  onChange,
  onEntityAdd,
  onEntityRemove,
  onEntityRename,
  onAllocate,
}: Props) {
  // Advanced settings collapse. Open at mount when any of them differs from
  // its default, so a shared or restored scenario never hides an active
  // setting; forced open whenever one of them carries a validation error.
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    const base = initialForm()
    return (
      form.startDate !== base.startDate ||
      form.dayCountBase !== base.dayCountBase ||
      form.retencion !== base.retencion ||
      form.ceiling !== base.ceiling
    )
  })
  const advancedError = Boolean(
    errors.startDate || errors.dayCountBase || errors.retencion || errors.ceiling,
  )
  useEffect(() => {
    if (advancedError) setAdvancedOpen(true)
  }, [advancedError])

  return (
    <form aria-labelledby="h-params" onSubmit={(e) => e.preventDefault()}>
      <h2 className="section-label" id="h-params">
        Parámetros
      </h2>

      <fieldset>
        <legend>Escalera</legend>

        <Field id="capital" label="Capital total (COP)" error={errors.capital}>
          {(describedBy, invalid) => (
            <input
              id="capital"
              inputMode="numeric"
              autoComplete="off"
              value={form.capital}
              onChange={(e) => onChange('capital', formatCapitalInput(e.target.value))}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>

        <Field
          id="rungCount"
          label="Número de peldaños"
          hint="Más de 1 divide el capital en peldaños que vencen escalonados: la liquidez y la oportunidad de tomar la tasa vigente llegan por partes, no todas a la vez. Reparte el riesgo de reinversión; no aumenta el rendimiento."
          error={errors.rungCount}
        >
          {(describedBy, invalid) => (
            <input
              id="rungCount"
              inputMode="numeric"
              autoComplete="off"
              value={form.rungCount}
              onChange={(e) => onChange('rungCount', e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>

        <Field
          id="spacingDays"
          label="Días entre vencimientos"
          hint="Cada peldaño vence este número de días después del anterior."
          error={errors.spacingDays}
        >
          {(describedBy, invalid) => (
            <input
              id="spacingDays"
              inputMode="numeric"
              autoComplete="off"
              value={form.spacingDays}
              onChange={(e) => onChange('spacingDays', e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>

        <Field
          id="ea"
          label="Tasa E.A. (%)"
          hint="El valor inicial es un ejemplo — la herramienta no consulta tasas de mercado; usa la que te ofrezca la entidad."
          error={errors.ea}
        >
          {(describedBy, invalid) => (
            <input
              id="ea"
              inputMode="decimal"
              autoComplete="off"
              value={form.ea}
              onChange={(e) => onChange('ea', e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      </fieldset>

      <EntityList
        entities={form.entities}
        entityErrors={entityErrors}
        onEntityAdd={onEntityAdd}
        onEntityRemove={onEntityRemove}
        onEntityRename={onEntityRename}
      />

      <AllocationList form={form} onAllocate={onAllocate} />

      <fieldset>
        <legend>Renovación (proyección)</legend>

        <Field
          id="rolloverMode"
          label="Renovar al vencimiento"
          hint="Reinvierte capital más interés neto a la misma tasa. Las renovaciones reales se pactan a la tasa vigente."
        >
          {(describedBy) => (
            <select
              id="rolloverMode"
              value={form.rolloverMode}
              onChange={(e) => onChange('rolloverMode', e.target.value)}
              aria-describedby={describedBy}
            >
              <option value="off">Sin renovación</option>
              <option value="cycles">Número de renovaciones</option>
              <option value="horizon">Hasta una fecha</option>
            </select>
          )}
        </Field>

        {form.rolloverMode === 'cycles' && (
          <Field id="rolloverCycles" label="Renovaciones" error={errors.rolloverCycles}>
            {(describedBy, invalid) => (
              <input
                id="rolloverCycles"
                inputMode="numeric"
                autoComplete="off"
                value={form.rolloverCycles}
                onChange={(e) => onChange('rolloverCycles', e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
        )}

        {form.rolloverMode === 'horizon' && (
          <Field
            id="rolloverHorizon"
            label="Horizonte"
            hint="Si cae a mitad de un plazo, el último tramo se proyecta a prorrata de la misma tasa; un CDT real no se pacta por menos de 30 días."
            error={errors.rolloverHorizon}
          >
            {(describedBy, invalid) => (
              <input
                id="rolloverHorizon"
                type="date"
                value={form.rolloverHorizon}
                onChange={(e) => onChange('rolloverHorizon', e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
        )}
      </fieldset>

      <details
        className="advanced"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Ajustes avanzados</summary>
        <div className="advanced-body">
          <Field id="startDate" label="Fecha de inicio" error={errors.startDate}>
            {(describedBy, invalid) => (
              <input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => onChange('startDate', e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>

          <fieldset>
            <legend>Liquidación, retención y seguro</legend>

            <Field
              id="dayCountBase"
              label="Base de liquidación"
              hint="Aparece en tu constancia como 'Base liquidación'. Varía según la entidad: cópiala de tu constancia."
              error={errors.dayCountBase}
            >
              {(describedBy, invalid) => (
                <select
                  id="dayCountBase"
                  value={form.dayCountBase}
                  onChange={(e) => onChange('dayCountBase', e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                >
                  <option value="360">360 comercial</option>
                  <option value="365">365</option>
                </select>
              )}
            </Field>

            <Field
              id="retencion"
              label="Retención en la fuente (%)"
              hint="Sobre los intereses. Verifica la tarifa vigente."
              error={errors.retencion}
            >
              {(describedBy, invalid) => (
                <input
                  id="retencion"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.retencion}
                  onChange={(e) => onChange('retencion', e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>

            <Field
              id="ceiling"
              label="Tope del seguro de depósitos (COP)"
              hint="Por depositante y por entidad (bancos: Fogafín; cooperativas: Fogacoop). Verifica la cobertura vigente."
              error={errors.ceiling}
            >
              {(describedBy, invalid) => (
                <input
                  id="ceiling"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.ceiling}
                  onChange={(e) => onChange('ceiling', formatCapitalInput(e.target.value))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
          </fieldset>
        </div>
      </details>
    </form>
  )
}
