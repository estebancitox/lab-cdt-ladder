import { formatCOP, formatDateShort } from '../engine'
import type { ScenarioResult } from '../engine'

interface Props {
  result: ScenarioResult
}

export function ScheduleTable({ result }: Props) {
  return (
    <div className="table-scroll">
      <table className="schedule">
        <caption>Calendario de vencimientos</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span className="visually-hidden">Peldaño</span>
            </th>
            <th scope="col">Vence</th>
            <th scope="col" className="num">
              Plazo
            </th>
            <th scope="col" className="num">
              Monto
            </th>
            <th scope="col" className="num">
              Interés bruto
            </th>
            <th scope="col" className="num">
              Retención
            </th>
            <th scope="col" className="num">
              Interés neto
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rungs.map((r, i) => (
            <tr key={r.id}>
              <th scope="row">{String(i + 1).padStart(2, '0')}</th>
              <td>{formatDateShort(r.maturityDate)}</td>
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
            <th scope="row" colSpan={3}>
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
