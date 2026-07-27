import { dayNumber, formatCOP, formatDateShort, MONTHS_ES, parseISODate, toISODate } from '../engine'
import type { ISODate, RungProjection, RungResult } from '../engine'
import { useContainerWidth } from '../ui/useContainerWidth'

interface Props {
  rungs: RungResult[]
  startDate: ISODate
  today: ISODate
  /** Same order as rungs; when present, renewal chains extend each row. */
  projections?: RungProjection[]
}

// Approximate glyph advance of IBM Plex Mono at 11px (0.6 em).
const CHAR_W = 6.6
const M_LEFT = 34
const M_RIGHT = 12
const M_TOP = 22
const M_BOTTOM = 34
const ROW_H = 34
const BAR_H = 18

interface Tick {
  day: number
  label: string
}

function monthTicks(startDay: number, endDay: number, innerW: number): Tick[] {
  const all: Tick[] = []
  const start = new Date(startDay * 86_400_000)
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth() + 2 // first month boundary after the start
  if (m > 12) {
    m = 1
    y += 1
  }
  for (;;) {
    const day = dayNumber(toISODate({ y, m, d: 1 }))
    if (day > endDay) break
    all.push({ day, label: m === 1 ? `${MONTHS_ES[m - 1]} ${String(y).slice(2)}` : MONTHS_ES[m - 1] })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  const maxLabels = Math.max(2, Math.floor(innerW / 56))
  const step = Math.max(1, Math.ceil(all.length / maxLabels))
  return all.filter((_, i) => i % step === 0)
}

export function LadderChart({ rungs, startDate, today, projections }: Props) {
  const [ref, measured] = useContainerWidth<HTMLDivElement>()
  const width = Math.max(measured, 300)
  const height = M_TOP + rungs.length * ROW_H + M_BOTTOM
  const innerW = width - M_LEFT - M_RIGHT

  const projByRung = new Map((projections ?? []).map((p) => [p.rungId, p]))
  const chainEnd = (r: RungResult): ISODate =>
    projByRung.get(r.id)?.finalMaturity ?? r.maturityDate

  const d0 = dayNumber(startDate)
  const dEnd = Math.max(...rungs.map((r) => dayNumber(chainEnd(r))))
  const span = Math.max(dEnd - d0, 1) * 1.04
  const x = (day: number) => M_LEFT + ((day - d0) / span) * innerW

  const axisY = M_TOP + rungs.length * ROW_H + 8
  const ticks = monthTicks(d0, d0 + span, innerW)
  const todayDay = dayNumber(today)
  const showToday = todayDay >= d0 && todayDay <= d0 + span

  const first = rungs[0]
  const last = rungs[rungs.length - 1]
  const label =
    `Línea de tiempo de ${rungs.length} CDT desde ${formatDateShort(startDate)}. ` +
    `Primer vencimiento ${formatDateShort(first.maturityDate)}, último ${formatDateShort(last.maturityDate)}. ` +
    (projections && projections.length > 0
      ? `Incluye renovaciones proyectadas hasta ${formatDateShort(
          rungs.reduce((max, r) => (chainEnd(r) > max ? chainEnd(r) : max), first.maturityDate),
        )}. El detalle está en las tablas Calendario de vencimientos y Proyección de renovación.`
      : 'El detalle está en la tabla Calendario de vencimientos.')

  return (
    <div ref={ref} className="ladder-wrap">
      <svg
        className="ladder"
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* month grid + axis labels */}
        {ticks.map((t) => (
          <g key={t.day}>
            <line className="grid" x1={x(t.day)} y1={M_TOP} x2={x(t.day)} y2={axisY} />
            <text className="axis-label" x={x(t.day)} y={axisY + 18} textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}
        <line className="axis" x1={M_LEFT} y1={axisY} x2={width - M_RIGHT} y2={axisY} />

        {/* rungs */}
        {rungs.map((r, i) => {
          const yTop = M_TOP + i * ROW_H + (ROW_H - BAR_H) / 2
          const xStart = x(d0)
          const xEnd = x(dayNumber(r.maturityDate))
          const barW = xEnd - xStart
          const proj = projByRung.get(r.id)
          const labelDate = chainEnd(r)
          const chainX = x(dayNumber(labelDate))
          const { d, m, y } = parseISODate(labelDate)
          // Beyond a year, day+month alone would repeat identically across years.
          const dateLabel =
            dEnd - d0 > 366
              ? `${d} ${MONTHS_ES[m - 1]} ${String(y).slice(2)}`
              : `${d} ${MONTHS_ES[m - 1]}`
          const amountLabel = `${formatCOP(r.principal)} · ${r.days} d`
          const amountFits = barW > amountLabel.length * CHAR_W + 16
          const dateOutsideFits = chainX + 8 + dateLabel.length * CHAR_W < width - M_RIGHT
          return (
            <g key={r.id}>
              <text className="idx" x={M_LEFT - 10} y={yTop + BAR_H / 2 + 4} textAnchor="end">
                {String(i + 1).padStart(2, '0')}
              </text>
              <rect className="bar" x={xStart} y={yTop} width={barW} height={BAR_H} rx={1} />
              {proj?.cycles.map((c) => (
                <rect
                  key={c.index}
                  className={c.isStub ? 'bar-renewal bar-stub' : 'bar-renewal'}
                  x={x(dayNumber(c.startDate))}
                  y={yTop}
                  width={x(dayNumber(c.endDate)) - x(dayNumber(c.startDate))}
                  height={BAR_H}
                  rx={1}
                />
              ))}
              <rect className="m-tick" x={xEnd - 2} y={yTop - 3} width={2.5} height={BAR_H + 6} />
              {proj?.cycles.map((c) => (
                <rect
                  key={`t${c.index}`}
                  className="m-tick"
                  x={x(dayNumber(c.endDate)) - 2}
                  y={yTop - 3}
                  width={2.5}
                  height={BAR_H + 6}
                />
              ))}
              {amountFits && (
                <text className="bar-label" x={xStart + 8} y={yTop + BAR_H / 2 + 4}>
                  {amountLabel}
                </text>
              )}
              <text
                className={dateOutsideFits ? 'bar-date' : 'bar-date-in'}
                x={dateOutsideFits ? chainX + 8 : chainX - 8}
                y={yTop + BAR_H / 2 + 4}
                textAnchor={dateOutsideFits ? 'start' : 'end'}
              >
                {dateLabel}
              </text>
            </g>
          )
        })}

        {/* today line — plate ink, never accent */}
        {showToday && (
          <g>
            <line className="today-line" x1={x(todayDay)} y1={M_TOP - 6} x2={x(todayDay)} y2={axisY} />
            <text className="today-label" x={x(todayDay) + 5} y={M_TOP - 8}>
              hoy
            </text>
          </g>
        )}
      </svg>
      {projections && projections.length > 0 && (
        <p className="chart-legend">
          <span>
            <span className="sw sw-initial" aria-hidden="true" /> plazo inicial
          </span>
          <span>
            <span className="sw sw-renewal" aria-hidden="true" /> renovación proyectada
          </span>
          {projections.some((p) => p.hasStub) && (
            <span>
              <span className="sw sw-stub" aria-hidden="true" /> renovación parcial
            </span>
          )}
        </p>
      )}
    </div>
  )
}
