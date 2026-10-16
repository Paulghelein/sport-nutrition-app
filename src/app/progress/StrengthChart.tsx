import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, formatDateFr } from '../../domain/shared/dates'
import { METRIC_LABEL, METRIC_UNIT, formatNumber } from './progressModel'
import type { StrengthChartPoint, StrengthMetric } from './progressModel'

const ORANGE = '#fb923c'
const ZINC = '#a1a1aa'

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
  const dateOf = (day: number) => formatDateFr(first ? addDays(first.date, Math.round(day)) : '')
  const summary = `Courbe ${METRIC_LABEL[metric].toLowerCase()} de ${name} : ${points.length} séance${points.length > 1 ? 's' : ''}, dernière valeur ${formatNumber(points[points.length - 1]?.value ?? 0)} ${unit}.`
  return (
    <div role="img" aria-label={summary} className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#2c2c38" vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, Math.max(span, 1)]}
            tickFormatter={dateOf}
            tick={{ fill: ZINC, fontSize: 12 }}
            stroke="#2c2c38"
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            tick={{ fill: ZINC, fontSize: 12 }}
            stroke="#2c2c38"
            width={44}
            domain={[0, (max: number) => Math.ceil(max * 1.1)]}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#1e1e27',
              border: '1px solid #2c2c38',
              borderRadius: 12,
              color: '#f4f4f5',
            }}
            labelFormatter={(label) => dateOf(Number(label))}
            formatter={(value) => [`${formatNumber(Number(value))} ${unit}`, METRIC_LABEL[metric]]}
          />
          <Line
            dataKey="value"
            stroke={ORANGE}
            strokeWidth={3}
            dot={{ r: 4, fill: ORANGE, stroke: 'none' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
