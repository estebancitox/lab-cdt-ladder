import { formatCOP } from '../engine'
import type { EntityExposure } from '../engine'

interface Props {
  exposures: EntityExposure[]
}

/**
 * The one place signal orange is allowed to appear on the page ground:
 * ceiling-exceeded warnings are the warnings-that-matter.
 */
export function Warnings({ exposures }: Props) {
  const exceeded = exposures.filter((e) => e.exceeded)
  if (exceeded.length === 0) return null
  return (
    <div className="warnings">
      <p className="warnings-label">Tope superado</p>
      <ul>
        {exceeded.map((e) => (
          <li key={e.entityId}>
            <strong>{e.entityName}</strong>: la exposición de {formatCOP(e.exposure)} (capital más
            interés bruto) supera el tope de {formatCOP(e.ceiling)} en {formatCOP(e.excess)}. El
            excedente no está cubierto por el seguro de depósitos.
          </li>
        ))}
      </ul>
    </div>
  )
}
