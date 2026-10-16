import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, formatDateFr } from '../../domain/shared'
import { formatKg } from '../../ui'
import type { WeightModel } from './progressModel'

const ORANGE = '#fb923c'
const ZINC = '#a1a1aa'
const GREEN = '#34d399'

/** Quatre repères de date régulièrement espacés (jours depuis la première pesée). */
function ticksFor(span: number): number[] {
  if (span <= 0) return [0]
  const count = Math.min(4, span + 1)
  const ticks = Array.from({ length: count }, (_, i) => Math.round((span * i) / (count - 1)))
  return [...new Set(ticks)]
}

/** Affiche seulement : les données viennent de `buildWeightModel`. */
export function WeightChart({ model }: { model: WeightModel }) {
  const { chart: data, firstDate, corridor } = model
  if (!firstDate) return null
  const span = data[data.length - 1]?.day ?? 0
  const dateOf = (day: number) => formatDateFr(addDays(firstDate, Math.round(day)))
  const summary = `Courbe de poids : ${data.length} pesée${data.length > 1 ? 's' : ''}, de ${formatKg(Math.min(...data.map((d) => d.weight)))} à ${formatKg(Math.max(...data.map((d) => d.weight)))} kg.`

  return (
    <div role="img" aria-label={summary} className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#2c2c38" vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, Math.max(span, 1)]}
            ticks={ticksFor(span)}
            tickFormatter={dateOf}
            tick={{ fill: ZINC, fontSize: 12 }}
            stroke="#2c2c38"
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
            tick={{ fill: ZINC, fontSize: 12 }}
            stroke="#2c2c38"
            width={44}
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
            formatter={(value, name) => [
              `${formatKg(Number(value))} kg`,
              name === 'avg'
                ? 'Moyenne 7 j'
                : name === 'low'
                  ? 'Couloir bas'
                  : name === 'high'
                    ? 'Couloir haut'
                    : 'Pesée',
            ]}
          />
          {corridor ? (
            <>
              <Line
                dataKey="low"
                stroke={GREEN}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="high"
                stroke={GREEN}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </>
          ) : null}
          <Line
            type="monotone"
            dataKey="avg"
            stroke={ORANGE}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="weight"
            stroke="none"
            dot={{ r: 4, fill: ZINC, stroke: 'none' }}
            activeDot={{ r: 6, fill: '#f4f4f5' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
