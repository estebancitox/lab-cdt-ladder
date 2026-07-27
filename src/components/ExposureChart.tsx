import { formatCOP } from '../engine'
import type { EntityExposure } from '../engine'
import { useContainerWidth } from '../ui/useContainerWidth'

interface Props {
  exposures: EntityExposure[]
  ceiling: number
  /** 'interés bruto' without rollover, 'interés proyectado' with it. */
  interestLabel: string
}

// Approximate glyph advance of IBM Plex Mono at 11px.
const CHAR_W = 6.6
const M_LEFT = 8
const M_RIGHT = 12
const M_TOP = 24
const ROW_LABEL = 16
const BAR_H = 18
const ROW_GAP = 14
const ROW_H = ROW_LABEL + BAR_H + ROW_GAP
const M_BOTTOM = 6

export function ExposureChart({ exposures, ceiling, interestLabel }: Props) {
  const [ref, measured] = useContainerWidth<HTMLDivElement>()
  const width = Math.max(measured, 300)
  const height = M_TOP + exposures.length * ROW_H + M_BOTTOM
  const innerW = width - M_LEFT - M_RIGHT

  const maxValue = Math.max(ceiling, ...exposures.map((e) => e.exposure)) * 1.06 || 1
  const x = (v: number) => M_LEFT + (v / maxValue) * innerW

  const exceededCount = exposures.filter((e) => e.exceeded).length
  const n = exposures.length
  const status =
    n === 1
      ? exceededCount === 1
        ? 'La entidad lo supera. '
        : 'La entidad está dentro del tope. '
      : exceededCount === 0
        ? `Ninguna de las ${n} entidades lo supera. `
        : `${exceededCount} de ${n} entidades lo ${exceededCount === 1 ? 'supera' : 'superan'}. `
  const label =
    `Exposición por entidad frente al tope del seguro de depósitos, ${formatCOP(ceiling)}. ` +
    status +
    'El detalle está en la tabla Exposición por entidad.'

  return (
    <div ref={ref} className="ladder-wrap">
      <svg
        className="ladder exposure"
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* ceiling line — plate ink, dashed; the excess itself carries the signal color.
            Label flips to the left of the line when it would clip at the right edge. */}
        <line className="today-line" x1={x(ceiling)} y1={M_TOP - 12} x2={x(ceiling)} y2={height - M_BOTTOM} />
        {(() => {
          const text = `tope ${formatCOP(ceiling)}`
          const fitsRight = x(ceiling) + 5 + text.length * CHAR_W < width - M_RIGHT
          return (
            <text
              className="today-label"
              x={fitsRight ? x(ceiling) + 5 : x(ceiling) - 5}
              y={M_TOP - 14}
              textAnchor={fitsRight ? 'start' : 'end'}
            >
              {text}
            </text>
          )
        })()}

        {exposures.map((e, i) => {
          const yLabel = M_TOP + i * ROW_H + 11
          const yBar = M_TOP + i * ROW_H + ROW_LABEL
          const xP = x(e.principal)
          const xE = x(e.exposure)
          const amount = formatCOP(e.exposure)
          const amountOutsideFits = xE + 8 + amount.length * CHAR_W < width - M_RIGHT
          return (
            <g key={e.entityId}>
              <text className="idx" x={M_LEFT} y={yLabel}>
                {e.entityName}
              </text>
              <rect className="bar" x={M_LEFT} y={yBar} width={xP - M_LEFT} height={BAR_H} />
              <rect
                className="seg-interest"
                x={xP}
                y={yBar}
                width={Math.max(xE - xP, 0)}
                height={BAR_H}
              />
              {e.exceeded && (
                <rect
                  className="seg-excess"
                  x={x(ceiling)}
                  y={yBar - 2}
                  width={Math.max(xE - x(ceiling), 1.5)}
                  height={BAR_H + 4}
                />
              )}
              {/* Outside: plate-ink, or signal when exceeded. Inside the bar it sits
                  on steel or on the signal overlay — dark plate text works on both. */}
              <text
                className={
                  amountOutsideFits ? (e.exceeded ? 'amount-excess' : 'bar-date') : 'bar-label'
                }
                x={amountOutsideFits ? xE + 8 : xE - 8}
                y={yBar + BAR_H / 2 + 4}
                textAnchor={amountOutsideFits ? 'start' : 'end'}
              >
                {amount}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="chart-legend">
        <span>
          <span className="sw sw-principal" aria-hidden="true" /> capital
        </span>
        <span>
          <span className="sw sw-interest" aria-hidden="true" /> {interestLabel}
        </span>
        <span>
          <span className="sw sw-excess" aria-hidden="true" /> supera el tope
        </span>
      </p>
    </div>
  )
}

export function ExposureTable({
  exposures,
  interestLabel,
  projected,
}: {
  exposures: EntityExposure[]
  interestLabel: string
  projected: boolean
}) {
  return (
    <div className="table-scroll">
      <table className="schedule">
        <caption>
          Exposición por entidad ({projected ? 'saldo máximo proyectado' : 'al vencimiento'})
        </caption>
        <thead>
          <tr>
            <th scope="col">Entidad</th>
            <th scope="col" className="num">
              Capital
            </th>
            <th scope="col" className="num">
              {interestLabel.charAt(0).toUpperCase() + interestLabel.slice(1)}
            </th>
            <th scope="col" className="num">
              Exposición
            </th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {exposures.map((e) => (
            <tr key={e.entityId}>
              <th scope="row">{e.entityName}</th>
              <td className="num">{formatCOP(e.principal)}</td>
              <td className="num">{formatCOP(e.interest)}</td>
              <td className="num">{formatCOP(e.exposure)}</td>
              <td>{e.exceeded ? `supera el tope en ${formatCOP(e.excess)}` : 'dentro del tope'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
