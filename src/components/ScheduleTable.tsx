import { formatCOP, formatDateShort } from '../engine'
import type { ScenarioResult } from '../engine'

interface Props {
  result: ScenarioResult
  /** id → name; the Institution column renders only when more than one entity exists. */
  entityNames: Record<string, string>
  showEntity: boolean
  /** With a projection above it, say these figures cover the initial terms. */
  projected: boolean
}

export function ScheduleTable({ result, entityNames, showEntity, projected }: Props) {
  return (
    <div className="table-scroll">
      <table className="schedule">
        <caption>Maturity schedule{projected ? ' (initial terms)' : ''}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span className="visually-hidden">Rung</span>
            </th>
            <th scope="col">Matures</th>
            {showEntity && <th scope="col">Institution</th>}
            <th scope="col" className="num">
              Term
            </th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col" className="num">
              Gross interest
            </th>
            <th scope="col" className="num">
              Withholding
            </th>
            <th scope="col" className="num">
              Net interest
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rungs.map((r, i) => (
            <tr key={r.id}>
              <th scope="row">{String(i + 1).padStart(2, '0')}</th>
              <td>{formatDateShort(r.maturityDate)}</td>
              {showEntity && <td>{entityNames[r.entityId] ?? r.entityId}</td>}
              <td className="num">{r.days} d</td>
              <td className="num">{formatCOP(r.principal)}</td>
              <td className="num">{formatCOP(r.grossInterest)}</td>
              <td className="num">{formatCOP(r.retencion)}</td>
              <td className="num">{formatCOP(r.netInterest)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={showEntity ? 4 : 3}>
              Total
            </th>
            <td className="num">{formatCOP(result.totals.principal)}</td>
            <td className="num">{formatCOP(result.totals.grossInterest)}</td>
            <td className="num">{formatCOP(result.totals.retencion)}</td>
            <td className="num">{formatCOP(result.totals.netInterest)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
