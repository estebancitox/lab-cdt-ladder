import { formatCOP, formatDateShort } from '../engine'
import type { ProjectionSummary } from '../engine'

interface Props {
  projection: ProjectionSummary
}

export function ProjectionTable({ projection }: Props) {
  return (
    <div className="table-scroll">
      <table className="schedule">
        <caption>Proyección de renovación (misma tasa E.A.)</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span className="visually-hidden">Peldaño</span>
            </th>
            <th scope="col" className="num">
              Renovaciones
            </th>
            <th scope="col">Vencimiento final</th>
            <th scope="col" className="num">
              Interés neto acumulado
            </th>
            <th scope="col" className="num">
              Valor final
            </th>
          </tr>
        </thead>
        <tbody>
          {projection.perRung.map((p, i) => (
            <tr key={p.rungId}>
              <th scope="row">{String(i + 1).padStart(2, '0')}</th>
              <td className="num">
                {p.cycles.length}
                {p.hasStub ? ' (última parcial)' : ''}
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
