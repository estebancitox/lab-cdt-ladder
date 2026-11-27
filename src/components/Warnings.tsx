import { formatCOP } from '../engine'
import type { EntityExposure } from '../engine'

interface Props {
  exposures: EntityExposure[]
  /** 'gross interest' without rollover, 'projected interest' with it. */
  interestLabel: string
}

/**
 * The one place signal orange is allowed to appear on the page ground:
 * ceiling-exceeded warnings are the warnings-that-matter.
 */
export function Warnings({ exposures, interestLabel }: Props) {
  const exceeded = exposures.filter((e) => e.exceeded)
  if (exceeded.length === 0) return null
  return (
    <div className="warnings">
      <p className="warnings-label">Ceiling exceeded</p>
      <ul>
        {exceeded.map((e) => (
          <li key={e.entityId}>
            <strong>{e.entityName}</strong>: exposure of {formatCOP(e.exposure)} (principal plus{' '}
            {interestLabel}) is above the ceiling of {formatCOP(e.ceiling)} by{' '}
            {formatCOP(e.excess)}. The excess is not covered by deposit insurance.
          </li>
        ))}
      </ul>
    </div>
  )
}
