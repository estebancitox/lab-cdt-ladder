import { dayNumber, formatCOP, formatDateShort, formatPercent } from '../engine'
import type { ISODate, ScenarioResult } from '../engine'

interface Props {
  result: ScenarioResult
  today: ISODate
}

export function SummaryReadouts({ result, today }: Props) {
  const next = result.nextMaturity
  const daysToNext = next ? dayNumber(next) - dayNumber(today) : null
  return (
    <dl className="readouts">
      <div className="dataline">
        <dt>Tasa ponderada</dt>
        <dd className="value">{formatPercent(result.blendedEA)} E.A.</dd>
        <dd className="hint">ponderada por capital × días</dd>
      </div>
      <div className="dataline">
        <dt>Interés neto total</dt>
        <dd className="value">{formatCOP(result.totals.netInterest)}</dd>
        <dd className="hint">después de retención en la fuente</dd>
      </div>
      <div className="dataline">
        <dt>Próximo vencimiento</dt>
        <dd className="value">{next ? formatDateShort(next) : '—'}</dd>
        <dd className="hint">
          {daysToNext === null
            ? 'sin peldaños'
            : daysToNext === 0
              ? 'hoy'
              : daysToNext === 1
                ? 'en 1 día'
                : daysToNext > 1
                  ? `en ${daysToNext} días`
                  : 'ya venció'}
        </dd>
      </div>
    </dl>
  )
}
