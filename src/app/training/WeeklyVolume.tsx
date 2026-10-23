import { useMemo } from 'react'
import { MUSCLE_GROUPS, volumeTargets, weeklyVolume } from '../../domain/training'
import { muscleLabel } from '../../ui'
import { Card, SectionSkeleton } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { formatDecimal } from '../../ui/kit/format'
import { Section } from './parts'
import { useEngineInput } from './useEngineInput'

const TITLE = 'Volume des 7 derniers jours'

/** Séries faites sur 7 jours glissants face à la cible (groupes sans cible propre masqués). */
export default function WeeklyVolume() {
  const { data, error } = useEngineInput()
  const rows = useMemo(() => {
    if (!data) return []
    const vol = weeklyVolume(data.sessions, data.library, data.date)
    const targets = volumeTargets(data.settings, data.equipment)
    return MUSCLE_GROUPS.filter((g) => targets[g][1] > 0).map((g) => ({
      group: g,
      done: vol[g],
      min: targets[g][0],
      max: targets[g][1],
    }))
  }, [data])

  if (error)
    return (
      <Section title={TITLE}>
        <Note tone="error">Impossible de calculer le volume de la semaine.</Note>
      </Section>
    )
  if (!data) return <SectionSkeleton />
  return (
    <Section title={TITLE}>
      <Card padding="large">
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {rows.map((r) => {
            const pct = Math.min(100, (r.done / r.max) * 100)
            const minPct = (r.min / r.max) * 100
            const reached = r.done >= r.min
            return (
              <li key={r.group}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-strong">{muscleLabel(r.group)}</span>
                  <span className="text-caption tabular-nums text-ink-muted">
                    <span className="font-display text-body-strong text-ink">{formatDecimal(r.done)}</span> /{' '}
                    {r.min}–{r.max} séries{reached ? ' · atteint' : ''}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${muscleLabel(r.group)}, séries sur 7 jours`}
                  aria-valuemin={0}
                  aria-valuemax={r.max}
                  aria-valuenow={Math.min(r.done, r.max)}
                  aria-valuetext={`${formatDecimal(r.done)} séries sur ${r.min} à ${r.max} visées`}
                  className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-sunken"
                >
                  <div
                    className={`h-full rounded-full ${reached ? 'bg-good' : 'bg-ember'}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${minPct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <p className="m-0 mt-3 text-caption text-ink-muted">
          Le trait marque le minimum visé. Un rowing compte aussi une demi-série pour les biceps.
        </p>
      </Card>
    </Section>
  )
}
