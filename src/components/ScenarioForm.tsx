import type { ReactNode } from 'react'
import { formatCapitalInput } from '../ui/form'
import type { FormState } from '../ui/form'
import type { ValidationIssue } from '../engine'

interface Props {
  form: FormState
  errors: Partial<Record<keyof FormState, ValidationIssue>>
  onChange: (field: keyof FormState, value: string) => void
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

export function ScenarioForm({ form, errors, onChange }: Props) {
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

        <Field id="rungCount" label="Número de peldaños" error={errors.rungCount}>
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
          label="Espaciado entre vencimientos (días)"
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
      </fieldset>

      <fieldset>
        <legend>Parámetros fiscales</legend>

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
      </fieldset>
    </form>
  )
}
