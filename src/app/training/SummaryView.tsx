import { MUSCLE_GROUPS } from '../../domain/training'
import type { PersonalRecord, SessionSummary } from '../../types/guided'
import { Card, Section, muscleLabel } from '../../ui'
import { formatSeconds, kgText } from './format'

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-v1-line bg-v1-surface p-4">
      <p className="m-0 text-sm text-zinc-400">{label}</p>
      <p className="m-0 mt-1 text-4xl font-bold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-xl font-semibold text-zinc-400">{unit}</span> : null}
      </p>
    </div>
  )
}

function recordText(r: PersonalRecord, name: string): string {
  const at = r.loadKg !== undefined ? ` à ${kgText(r.loadKg)} kg` : ''
  switch (r.kind) {
    case 'load':
      return `${name} : charge max ${kgText(r.value)} kg (avant : ${kgText(r.previous)} kg)`
    case 'reps':
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
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Durée" value={String(summary.actualMin ?? plannedMin)} unit="min" />
        <Stat
          label="Séries faites"
          value={String(summary.setsDone)}
          unit={
            summary.setsSkipped > 0
              ? `+ ${summary.setsSkipped} passée${summary.setsSkipped > 1 ? 's' : ''}`
              : undefined
          }
        />
        <Stat label="Répétitions" value={String(summary.totalReps)} />
        <Stat
          label="Tonnage"
          value={summary.tonnageKg > 0 ? kgText(Math.round(summary.tonnageKg)) : '—'}
          unit={summary.tonnageKg > 0 ? 'kg' : undefined}
        />
      </div>

      {summary.records.length > 0 ? (
        <Section title="Records battus">
          <div className="rounded-2xl border border-orange-400/60 bg-orange-400/10 p-4">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {summary.records.map((r, i) => (
                <li key={i} className="flex gap-2 text-lg font-semibold text-orange-100">
                  <span aria-hidden="true">★</span>
                  <span>{recordText(r, name(r.exerciseId))}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      {volume.length > 0 ? (
        <Section title="Volume par groupe">
          <Card>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {volume.map((g) => (
                <li key={g}>
                  <div className="flex items-baseline justify-between text-base">
                    <span>{muscleLabel(g)}</span>
                    <span className="font-semibold tabular-nums">
                      {summary.volume[g].toLocaleString('fr-FR', { maximumFractionDigits: 1 })} séries
                    </span>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-v1-surface-hi">
                    <div
                      className="h-full rounded-full bg-orange-400"
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
        <Card>
          <ul className="m-0 flex list-none flex-col divide-y divide-v1-line p-0">
            {summary.exercises.map((e) => (
              <li key={e.exerciseId} className="py-3 first:pt-0 last:pb-0">
                <p className="m-0 text-lg font-semibold">{name(e.exerciseId)}</p>
                <p className="m-0 text-base text-zinc-300">
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
