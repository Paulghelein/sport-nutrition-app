import { ChevronDown, LineChart } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'
import { formatDateFr } from '../../domain/shared/dates'
import { ErrorBoundary, levelLabel, patternLabel } from '../../ui'
import { Card, EmptyState, Skeleton, SkeletonGroup, formatDecimal } from '../../ui/kit'
import { Note, ScreenSection } from './parts'
import type { ProgressModel } from './progressModel'
import {
  METRIC_LABEL,
  METRIC_UNIT,
  lastMetricValue,
  recordLines,
  strengthChartData,
  timedMaxText,
} from './progressModel'

const StrengthChart = lazy(() => import('./StrengthChart').then((m) => ({ default: m.StrengthChart })))

function ExerciseDetail({ id, row }: { id: string; row: ProgressModel['strength'][number] }) {
  const points = strengthChartData(row.strength, row.metric)
  const records = recordLines(row.strength)
  const timed = row.timedMax
  return (
    <div id={id} className="flex flex-col gap-2 pb-3">
      <p className="m-0 text-caption text-ink-muted">
        {METRIC_LABEL[row.metric]} ({METRIC_UNIT[row.metric]}) par séance
      </p>
      {points.length >= 2 ? (
        <ErrorBoundary>
          <Suspense
            fallback={
              <SkeletonGroup>
                <Skeleton className="h-52" />
              </SkeletonGroup>
            }
          >
            <StrengthChart points={points} metric={row.metric} name={row.name} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Note>
          {points.length === 1
            ? `Une seule séance pour l’instant : ${formatDecimal(points[0]?.value ?? 0, 2)} ${METRIC_UNIT[row.metric]}. La courbe apparaît à la deuxième.`
            : 'Pas de mesure à tracer pour cet exercice.'}
        </Note>
      )}
      <h4 className="m-0 mt-1 text-label uppercase text-ink-muted">Records</h4>
      {records.length === 0 && timed.length === 0 ? (
        <Note className="text-caption">Pas encore de record.</Note>
      ) : (
        <ul className="m-0 list-none p-0">
          {records.map((r) => (
            <li key={r.label} className="flex justify-between gap-3 py-1 text-body">
              <span className="text-ink-muted">{r.label}</span>
              <span className="text-right">
                <span className="font-display font-bold tabular-nums">{r.text}</span>
                <span className="text-caption text-ink-muted"> · {formatDateFr(r.date)}</span>
              </span>
            </li>
          ))}
          {timed.map((r) => (
            <li
              key={`${r.windowSec}|${r.loadKg ?? ''}`}
              className="flex justify-between gap-3 py-1 text-body"
            >
              <span className="text-ink-muted">Max en {r.windowSec} s </span>
              <span className="text-right">
                <span className="font-display font-bold tabular-nums">{timedMaxText(r)}</span>
                <span className="text-caption text-ink-muted"> · {formatDateFr(r.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Force par exercice (courbe et records au toucher). */
export function StrengthSection({ model }: { model: Pick<ProgressModel, 'strength'> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <>
      <ScreenSection title="Force">
        {model.strength.length === 0 ? (
          <Card padding="none" className="px-[18px] py-4">
            <EmptyState compact icon={LineChart} title="Pas encore de séance terminée">
              Tes exercices et tes records apparaîtront ici.
            </EmptyState>
          </Card>
        ) : (
          <Card padding="none" className="px-4 py-1.5">
            <ul className="m-0 list-none p-0">
              {model.strength.map((row) => {
                const open = openId === row.exerciseId
                const lastValue = lastMetricValue(row.strength, row.metric)
                return (
                  <li key={row.exerciseId} className="border-t border-line first:border-t-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`strength-${row.exerciseId}`}
                      onClick={() => setOpenId(open ? null : row.exerciseId)}
                      className="focus-ring flex min-h-14 w-full items-center justify-between gap-3 rounded-sm py-2 text-left text-ink active:opacity-70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-headline">{row.name}</span>
                        <span className="block text-caption text-ink-muted">
                          {row.strength.points.length} séance{row.strength.points.length > 1 ? 's' : ''} ·
                          dernière le {formatDateFr(row.strength.lastPerformedOn)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="font-display text-base font-bold tabular-nums">
                          {lastValue === undefined
                            ? ''
                            : `${formatDecimal(lastValue, 2)} ${METRIC_UNIT[row.metric]}`}
                        </span>
                        <ChevronDown
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className={`text-ink-faint transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                        />
                      </span>
                    </button>
                    {open ? <ExerciseDetail id={`strength-${row.exerciseId}`} row={row} /> : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </ScreenSection>
    </>
  )
}

/** Niveau atteint par schéma de mouvement. */
export function PatternsSection({ patterns }: { patterns: ProgressModel['patterns'] }) {
  return (
    <ScreenSection title="Niveau par mouvement">
      <Card padding="none" className="px-4 py-2">
        <ul className="m-0 grid list-none grid-cols-1 gap-x-4 p-0">
          {patterns.map((p) => (
            <li
              key={p.pattern}
              className="flex min-h-10 items-center justify-between gap-2 border-t border-line text-body first:border-t-0"
            >
              <span className="text-ink-muted">{patternLabel(p.pattern)}</span>
              <span className="font-semibold">{levelLabel(p.level)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </ScreenSection>
  )
}
