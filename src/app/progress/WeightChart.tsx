import { Area, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, formatDateFr } from '../../domain/shared'
import { formatKg } from '../../ui'
import type { WeightModel } from './progressModel'

// Couleurs : variables CSS des jetons (src/index.css), jamais de valeur en dur.
const INK = 'var(--color-ink)'
const INK_MUTED = 'var(--color-ink-muted)'
const EMBER = 'var(--color-ember)'
const EMBER_SOFT = 'var(--color-ember-soft)'
const SURFACE = 'var(--color-surface)'
const LINE = 'var(--color-line)'

const WEIGHT_CHART_HEIGHT = 120

/**
 * Courbe de la moyenne 7 j sur les 8 dernières semaines (carte poids de Progrès) : ligne ink, couloir de prise en
 * `ember-soft`, pesées en petits points, dernier point en ember. Pas d'axes (les repères de début, de fin et le
 * couloir sont écrits sous la courbe) ; l'infobulle donne la date et les valeurs. Affiche seulement : les données
 * viennent de `buildWeightModel`.
 */
export function WeightChart({ model, summary }: { model: WeightModel; summary: string }) {
  const trend = model.trend
  if (!trend) return null
  const hasBand = model.corridor !== null
  const data = trend.points.map((p) => ({
    ...p,
    band: p.low !== undefined && p.high !== undefined ? ([p.low, p.high] as [number, number]) : undefined,
  }))
  const values = trend.points
    .flatMap((p) => [p.avg, p.weight, ...(hasBand ? [p.low, p.high] : [])])
    .filter((v): v is number => v !== undefined)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(0.3, (hi - lo) * 0.12)
  const last = data[data.length - 1]
  const dateOf = (day: number) => formatDateFr(addDays(trend.firstDate, Math.round(day)))
  const nameOf = (key: string): string =>
    key === 'avg' ? 'Moyenne 7 j' : key === 'band' ? 'Couloir' : 'Pesée'

  return (
    <div role="img" aria-label={summary} style={{ height: WEIGHT_CHART_HEIGHT }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 6, bottom: 4, left: 6 }}>
          <XAxis dataKey="day" type="number" hide domain={[0, Math.max(trend.spanDays, 1)]} />
          <YAxis hide domain={[lo - pad, hi + pad]} />
          <Tooltip
            cursor={{ stroke: LINE }}
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: 'none',
              borderRadius: 16,
              color: INK,
              boxShadow: 'var(--shadow-float)',
              fontSize: 13,
            }}
            labelFormatter={(label) => dateOf(Number(label))}
            formatter={(value, name) => {
              const key = String(name)
              const text = Array.isArray(value)
                ? `${formatKg(Number(value[0]))} à ${formatKg(Number(value[1]))} kg`
                : `${formatKg(Number(value))} kg`
              return [text, nameOf(key)]
            }}
          />
          {hasBand && (
            <Area
              dataKey="band"
              stroke="none"
              fill={EMBER_SOFT}
              fillOpacity={0.7}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="weight"
            stroke="none"
            dot={{ r: 2.5, fill: INK_MUTED, stroke: 'none' }}
            activeDot={{ r: 4, fill: INK_MUTED, stroke: 'none' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke={INK}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: INK, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {last && (
            <ReferenceDot x={last.day} y={last.avg} r={4} fill={EMBER} stroke={SURFACE} strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
