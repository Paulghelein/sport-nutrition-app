import { Suspense, lazy, useState } from 'react'
import { formatDateFr } from '../../domain/shared/dates'
import { Card, ErrorBoundary, Section, levelLabel, patternLabel } from '../../ui'
import type { ProgressModel } from './progressModel'
import {
  METRIC_LABEL,
  METRIC_UNIT,
  formatNumber,
  lastMetricValue,
  recordLines,
  strengthChartData,
} from './progressModel'

const StrengthChart = lazy(() => import('./StrengthChart').then((m) => ({ default: m.StrengthChart })))

function ExerciseDetail({ id, row }: { id: string; row: ProgressModel['strength'][number] }) {
  const points = strengthChartData(row.strength, row.metric)
  const records = recordLines(row.strength)
  return (
    <div id={id} className="mt-2 rounded-xl border border-v1-line bg-v1-surface-hi/40 p-3">
      <p className="text-sm text-zinc-400">
        {METRIC_LABEL[row.metric]} ({METRIC_UNIT[row.metric]}) par séance
      </p>
      {points.length >= 2 ? (
        <ErrorBoundary>
          <Suspense fallback={<div className="h-52" aria-busy="true" />}>
            <StrengthChart points={points} metric={row.metric} name={row.name} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <p className="py-3 text-base text-zinc-300">
          {points.length === 1
            ? `Une seule séance pour l’instant : ${formatNumber(points[0]?.value ?? 0)} ${METRIC_UNIT[row.metric]}. La courbe apparaît à la deuxième.`
            : 'Pas de mesure à tracer pour cet exercice.'}
        </p>
      )}
      <h4 className="mt-2 mb-1 text-base font-semibold text-zinc-300">Records</h4>
      {records.length === 0 ? (
        <p className="text-sm text-zinc-400">Pas encore de record.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {records.map((r) => (
            <li key={r.label} className="flex justify-between gap-3 py-1 text-base">
              <span className="text-zinc-300">{r.label}</span>
              <span className="text-right">
                <span className="font-semibold tabular-nums">{r.text}</span>
                <span className="text-sm text-zinc-400"> · {formatDateFr(r.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StrengthSection({ model }: { model: Pick<ProgressModel, 'strength' | 'patterns'> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <Section title="Force">
      {model.strength.length === 0 ? (
        <Card>
          <p className="text-base text-zinc-300">
            Pas encore de séance terminée : tes exercices et tes records apparaîtront ici.
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {model.strength.map((row) => {
            const open = openId === row.exerciseId
            const lastValue = lastMetricValue(row.strength, row.metric)
            return (
              <li key={row.exerciseId}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`strength-${row.exerciseId}`}
                  onClick={() => setOpenId(open ? null : row.exerciseId)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-v1-line bg-v1-surface px-4 py-2 text-left active:bg-v1-surface-hi focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{row.name}</span>
                    <span className="block text-sm text-zinc-400">
                      {row.strength.points.length} séance{row.strength.points.length > 1 ? 's' : ''} ·
                      dernière le {formatDateFr(row.strength.lastPerformedOn)}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-bold tabular-nums">
                    {lastValue === undefined ? '' : `${formatNumber(lastValue)} ${METRIC_UNIT[row.metric]}`}
                  </span>
                </button>
                {open ? <ExerciseDetail id={`strength-${row.exerciseId}`} row={row} /> : null}
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="mt-6 mb-2 text-base font-semibold text-zinc-300">Niveau par mouvement</h3>
      <Card>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0">
          {model.patterns.map((p) => (
            <li key={p.pattern} className="flex min-h-9 items-center justify-between gap-2 text-base">
              <span className="text-zinc-300">{patternLabel(p.pattern)}</span>
              <span className="font-semibold">{levelLabel(p.level)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  )
}
