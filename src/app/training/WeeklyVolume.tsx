import { useMemo } from 'react'
import { MUSCLE_GROUPS, volumeTargets, weeklyVolume } from '../../domain/training'
import { Card, ErrorNote, Section, muscleLabel } from '../../ui'
import { useEngineInput } from './useEngineInput'

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

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
      <Section title="Volume des 7 derniers jours">
        <ErrorNote>Impossible de calculer le volume de la semaine.</ErrorNote>
      </Section>
    )
  if (!data) return <div className="mt-8 h-64" aria-busy="true" />
  return (
    <Section title="Volume des 7 derniers jours">
      <Card>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((r) => {
            const pct = Math.min(100, (r.done / r.max) * 100)
            const minPct = (r.min / r.max) * 100
            const reached = r.done >= r.min
            return (
              <li key={r.group}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-medium">{muscleLabel(r.group)}</span>
                  <span className="text-sm tabular-nums text-zinc-400">
                    <span className="text-base font-semibold text-zinc-100">{nf.format(r.done)}</span> /{' '}
                    {r.min}–{r.max} séries
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${muscleLabel(r.group)}, séries sur 7 jours`}
                  aria-valuemin={0}
                  aria-valuemax={r.max}
                  aria-valuenow={Math.min(r.done, r.max)}
                  aria-valuetext={`${nf.format(r.done)} séries sur ${r.min} à ${r.max} visées`}
                  className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-hi"
                >
                  <div
                    className={`h-full rounded-full ${reached ? 'bg-emerald-400' : 'bg-orange-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-zinc-300/70" style={{ left: `${minPct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-sm text-zinc-400">
          Le trait marque le minimum visé. Un rowing compte aussi une demi-série pour les biceps.
        </p>
      </Card>
    </Section>
  )
}
