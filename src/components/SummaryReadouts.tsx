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
        <dt>Blended rate</dt>
        <dd className="value">{formatPercent(result.blendedEA)} E.A.</dd>
        <dd className="hint">weighted by principal × days</dd>
      </div>
      <div className="dataline">
        {/* With a projection alongside, "total" must not attach to the smaller
            of two totals — the label itself carries the scope. */}
        <dt>{projection ? 'Net interest (initial terms)' : 'Total net interest'}</dt>
        <dd className="value">{formatCOP(result.totals.netInterest)}</dd>
        <dd className="hint">after withholding tax</dd>
      </div>
      {projection && (
        <div className="dataline">
          <dt>Projected value</dt>
          <dd className="value">{formatCOP(projection.totalFinalValue)}</dd>
          <dd className="hint">
            {horizonBeforeFinal
              ? `on ${formatDateShort(projection.finalMaturity)} — your horizon falls before the last maturity`
              : `on ${formatDateShort(projection.finalMaturity)}`}
          </dd>
        </div>
      )}
      <div className="dataline">
        <dt>Next maturity</dt>
        <dd className="value">{next ? formatDateShort(next) : '—'}</dd>
        <dd className="hint">
          {daysToNext === null
            ? 'no rungs'
            : daysToNext === 0
              ? 'today'
              : daysToNext === 1
                ? 'in 1 day'
                : daysToNext > 1
                  ? `in ${daysToNext} days`
                  : 'already matured'}
        </dd>
      </div>
    </dl>
  )
}
