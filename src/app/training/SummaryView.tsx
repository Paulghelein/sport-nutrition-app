import { Star } from 'lucide-react'
import { MUSCLE_GROUPS } from '../../domain/training'
import type { PersonalRecord, SessionSummary } from '../../types/guided'
import { muscleLabel } from '../../ui'
import { Card, StatTile, cx, formatDecimal, withUnit } from '../../ui/kit'
import { Section } from './parts'
import { formatSeconds, kgText } from './format'

function recordText(r: PersonalRecord, name: string): string {
  const at = r.loadKg !== undefined ? ` à ${kgText(r.loadKg)} kg` : ''
  switch (r.kind) {
    case 'load':
      return `${name} : charge max ${kgText(r.value)} kg (avant : ${kgText(r.previous)} kg)`
    case 'reps':
      // Série en temps fixe : le record porte sur la fenêtre (« 24 reps en 45 s »).
      if (r.windowSec !== undefined)
        return `${name} : ${r.value} reps en ${r.windowSec} s${at} (avant : ${r.previous})`
      return `${name} : ${r.value} répétitions${at} (avant : ${r.previous})`
    case 'duration':
      return `${name} : ${formatSeconds(r.value)} tenues${at} (avant : ${formatSeconds(r.previous)})`
    case 'tonnage':
      return `${name} : tonnage ${kgText(Math.round(r.value))} kg (avant : ${kgText(Math.round(r.previous))} kg)`
  }
}

/** Bilan chiffré d'une séance : durée, séries, répétitions, tonnage, records, volume par groupe, exercices. */
export function SummaryView({
  summary,
  names,
  plannedMin,
}: {
  summary: SessionSummary
  names: ReadonlyMap<string, string>
  plannedMin: number
}) {
  const name = (id: string) => names.get(id) ?? id
  const volume = MUSCLE_GROUPS.filter((g) => summary.volume[g] > 0).sort(
    (a, b) => summary.volume[b] - summary.volume[a],
  )
  const maxVolume = Math.max(1, ...volume.map((g) => summary.volume[g]))
  return (
    <>
      <Card padding="none" className="mt-1 grid grid-cols-2 divide-x divide-line py-3.5">
        <div className="flex flex-col gap-3.5">
          <StatTile size="lg" label="Durée" value={withUnit(summary.actualMin ?? plannedMin, 'min')} />
          <StatTile size="lg" label="Répétitions" value={String(summary.totalReps)} />
        </div>
        <div className="flex flex-col gap-3.5">
          <StatTile
            size="lg"
            label="Séries faites"
            value={
              <>
                {summary.setsDone}
                {summary.setsSkipped > 0 ? (
                  <span className="text-caption font-medium text-ink-muted">
                    {` + ${summary.setsSkipped} passée${summary.setsSkipped > 1 ? 's' : ''}`}
                  </span>
                ) : null}
              </>
            }
          />
          <StatTile
            size="lg"
            label="Tonnage"
            value={summary.tonnageKg > 0 ? withUnit(kgText(Math.round(summary.tonnageKg)), 'kg') : '—'}
          />
        </div>
      </Card>

      {summary.records.length > 0 ? (
        <Section title="Records battus">
          <Card padding="large" className="bg-ember-soft">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {summary.records.map((r, i) => (
                <li key={i} className="flex gap-2 text-body-strong">
                  <Star
                    size={18}
                    strokeWidth={1.75}
                    fill="currentColor"
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-ember-ink"
                  />
                  <span>{recordText(r, name(r.exerciseId))}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      {volume.length > 0 ? (
        <Section title="Volume par groupe">
          <Card padding="large">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {volume.map((g) => (
                <li key={g}>
                  <div className="flex items-baseline justify-between text-body">
                    <span>{muscleLabel(g)}</span>
                    <span className="font-display font-bold tabular-nums">
                      {formatDecimal(summary.volume[g])} séries
                    </span>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cx('h-full rounded-full bg-ember')}
                      style={{ width: `${Math.round((summary.volume[g] / maxVolume) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Exercices">
        <Card padding="none" className="px-4 py-1">
          <ul className="m-0 flex list-none flex-col p-0">
            {summary.exercises.map((e) => (
              <li key={e.exerciseId} className="border-t border-line py-3 first:border-t-0">
                <p className="m-0 text-headline">{name(e.exerciseId)}</p>
                <p className="m-0 text-caption text-ink-muted">
                  {e.setsDone === 0
                    ? 'Passé'
                    : [
                        `${e.setsDone} série${e.setsDone > 1 ? 's' : ''}`,
                        e.totalReps > 0 ? `${e.totalReps} reps` : null,
                        e.totalDurationSec > 0 ? formatSeconds(e.totalDurationSec) : null,
                        e.topLoadKg !== undefined ? `jusqu’à ${kgText(e.topLoadKg)} kg` : null,
                        e.setsSkipped > 0 ? `${e.setsSkipped} passée${e.setsSkipped > 1 ? 's' : ''}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </>
  )
}
