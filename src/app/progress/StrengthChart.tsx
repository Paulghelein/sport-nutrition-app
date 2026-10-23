import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, formatDateFr } from '../../domain/shared/dates'
import { METRIC_LABEL, METRIC_UNIT } from './progressModel'
import type { StrengthChartPoint, StrengthMetric } from './progressModel'
import { formatDecimal } from '../../ui/kit/format'

// Couleurs : variables CSS des jetons (src/index.css), jamais de valeur en dur.
const EMBER = 'var(--color-ember)'
const INK_MUTED = 'var(--color-ink-muted)'
const LINE = 'var(--color-line)'

export function StrengthChart({
  points,
  metric,
  name,
}: {
  points: StrengthChartPoint[]
  metric: StrengthMetric
  name: string
}) {
  const unit = METRIC_UNIT[metric]
  const first = points[0]
  const span = points[points.length - 1]?.day ?? 0
  // Trois repères au plus (début, milieu, fin) : sans cela Recharts choisit des jours ronds qui se répètent en dates.
  const ticks =
    span === 0 ? [0] : span === 1 ? [0, 1] : span < 14 ? [0, span] : [0, Math.round(span / 2), span]
  const dateOf = (day: number) => formatDateFr(first ? addDays(first.date, Math.round(day)) : '')
  const summary = `Courbe ${METRIC_LABEL[metric].toLowerCase()} de ${name} : ${points.length} séance${points.length > 1 ? 's' : ''}, dernière valeur ${formatDecimal(points[points.length - 1]?.value ?? 0, 2)} ${unit}.`
  return (
    <div role="img" aria-label={summary} className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={LINE} vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, Math.max(span, 1)]}
            ticks={ticks}
            interval={0}
            tickFormatter={dateOf}
            tick={{ fill: INK_MUTED, fontSize: 12 }}
            stroke={LINE}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            tick={{ fill: INK_MUTED, fontSize: 12 }}
            stroke={LINE}
            width={44}
            domain={[0, (max: number) => Math.ceil(max * 1.1)]}
            allowDecimals={false}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: 'none',
              borderRadius: 16,
              color: 'var(--color-ink)',
              boxShadow: 'var(--shadow-float)',
              fontSize: 13,
            }}
            labelFormatter={(label) => dateOf(Number(label))}
            formatter={(value) => [`${formatDecimal(Number(value), 2)} ${unit}`, METRIC_LABEL[metric]]}
          />
          <Line
            dataKey="value"
            stroke={EMBER}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: EMBER, stroke: 'none' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
