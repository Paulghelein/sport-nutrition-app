import { useMemo } from 'react'
import { seedExercises } from '../../content'
import { loadProgressData } from '../../db'
import { nutritionTargets, targetWeight } from '../../domain/nutrition/targets'
import { dayActivities, weekDays } from '../../domain/progress/calendar'
import { regularity } from '../../domain/progress/regularity'
import type { LocalDate } from '../../types'
import { useLiveQuery } from '../../ui'
import { Card, WeekStrip } from '../../ui/kit'
import { buildExercisesById, profileWeekTarget } from '../progress/progressModel'
import { WEEK_CARD_MIN_H } from './layout'
import { CardError } from './SectionBoundary'
import { WeekSkeleton } from './Skeletons'

/** Carte « Ta semaine » : 7 cases heat + point nutrition, série en semaines, séances faites sur la cible. */
export function WeekCard({ today }: { today: LocalDate }) {
  const { data, error } = useLiveQuery(() => loadProgressData(today), [today])

  const model = useMemo(() => {
    if (!data?.profile) return undefined
    const profile = data.profile
    const days = weekDays(today)
    const from = days[0] ?? today
    const to = days[6] ?? today
    const activities = dayActivities({
      from,
      to,
      today,
      sessions: data.sessions,
      exercisesById: buildExercisesById(seedExercises, data.exerciseRows),
      foodLog: data.foodLog,
      targetsFor: (d) => {
        const w = targetWeight(data.weighIns, d)
        if (w === undefined) return null
        const t = nutritionTargets(profile, w, d)
        return { kcal: t.kcal, protein: t.protein }
      },
    })
    // Même seuil que la page Progrès : un profil à 2 séances/sem. peut aussi avoir une série.
    const weekTarget = profileWeekTarget(profile)
    return {
      days: activities.map((a) => ({ ...a, today: a.date === today })),
      streak: regularity(data.sessions, today, { weekTarget }).currentStreak,
      done: activities.reduce((n, a) => n + a.sessions, 0),
      planned: profile.weeklySessionsTarget,
    }
  }, [data, today])

  if (error && !data) return <CardError>Impossible de lire ta semaine. Réessaie dans un instant.</CardError>
  // Lecture faite mais pas de profil (onboarding incomplet) : un message plutôt qu'un squelette sans fin.
  if (data && !data.profile)
    return <CardError>Ton profil est introuvable : rouvre les Réglages pour le compléter.</CardError>
  if (!model) return <WeekSkeleton />

  return (
    <Card aria-label="Ta semaine" className={`flex flex-col gap-2.5 px-4 py-3.5 ${WEEK_CARD_MIN_H}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-body-strong">Ta semaine</h2>
        <p className="m-0 text-caption text-ink-muted">
          Série <b className="font-display font-bold tabular-nums text-ink">{model.streak} sem.</b>
          {' · '}
          <span className="font-display font-bold tabular-nums text-ink">
            {model.done}/{model.planned}
          </span>{' '}
          séances
        </p>
      </div>
      <WeekStrip days={model.days} />
    </Card>
  )
}
