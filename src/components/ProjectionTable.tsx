import { formatCOP, formatDateShort } from '../engine'
import type { ProjectionSummary } from '../engine'

interface Props {
  projection: ProjectionSummary
}

export function ProjectionTable({ projection }: Props) {
  return (
    <div className="table-scroll">
      <table className="schedule">
        <caption>Renewal projection (same E.A. rate)</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span className="visually-hidden">Rung</span>
            </th>
            <th scope="col" className="num">
              Renewals
            </th>
            <th scope="col">Final maturity</th>
            <th scope="col" className="num">
              Cumulative net interest
            </th>
            <th scope="col" className="num">
              Final value
            </th>
          </tr>
        </thead>
        <tbody>
          {projection.perRung.map((p, i) => (
            <tr key={p.rungId}>
              <th scope="row">{String(i + 1).padStart(2, '0')}</th>
              <td className="num">
                {p.cycles.length}
                {p.hasStub ? ' (last one partial)' : ''}
              </td>
              <td>{formatDateShort(p.finalMaturity)}</td>
              <td className="num">{formatCOP(p.cumulativeNet)}</td>
              <td className="num">{formatCOP(p.finalValue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td className="num">{formatCOP(projection.totalCumulativeNet)}</td>
            <td className="num">{formatCOP(projection.totalFinalValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
