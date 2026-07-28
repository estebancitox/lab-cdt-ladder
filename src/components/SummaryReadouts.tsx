import { dayNumber, formatCOP, formatDateShort, formatPercent } from '../engine'
import type { ISODate, ScenarioResult } from '../engine'

interface Props {
  result: ScenarioResult
  today: ISODate
  /** True when the requested horizon falls before the last real maturity. */
  horizonBeforeFinal: boolean
}

export function SummaryReadouts({ result, today, horizonBeforeFinal }: Props) {
  const projection = result.projection
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
        {/* With a projection alongside, say which basis this figure uses —
            the totals cover the initial terms only, never the renewals. */}
        <dd className="hint">
          {projection
            ? 'solo plazos iniciales, después de retención'
            : 'después de retención en la fuente'}
        </dd>
      </div>
      {projection && (
        <div className="dataline">
          <dt>Valor proyectado</dt>
          <dd className="value">{formatCOP(projection.totalFinalValue)}</dd>
          <dd className="hint">
            {horizonBeforeFinal
              ? `al ${formatDateShort(projection.finalMaturity)} — tu horizonte cae antes del último vencimiento`
              : `al ${formatDateShort(projection.finalMaturity)}`}
          </dd>
        </div>
      )}
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
