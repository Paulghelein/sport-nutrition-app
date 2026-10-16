import { Suspense, lazy, useMemo, useState } from 'react'
import { seedExercises } from '../../content'
import { loadCalendarData } from '../../db'
import { dayActivities, weekDays } from '../../domain/progress/calendar'
import { regularity } from '../../domain/progress/regularity'
import type { LocalDate } from '../../types'
import { useLiveQuery } from '../../ui'
import { Card, WeekStrip } from '../../ui/kit'
import { makeTargetsFor, toStripDays } from '../progress/calendarModel'
import { DELETED_EXERCISE_NAME, buildExercisesById, profileWeekTarget } from '../progress/progressModel'
import { WEEK_CARD_MIN_H } from './layout'
import { CardError } from './SectionBoundary'
import { WeekSkeleton } from './Skeletons'

// Résumé du jour à la demande : feuille et calcul du résumé ne sont chargés qu'au premier toucher.
const DayDetail = lazy(() => import('../progress/DayDetail').then((m) => ({ default: m.DayDetail })))

/**
 * Carte « Ta semaine » : 7 cases heat + point nutrition, série en semaines, séances faites sur la cible.
 * Chaque jour est un bouton : il ouvre son résumé. Lecture ciblée (`loadCalendarData`) : seul le journal alimentaire
 * est borné (7 jours de la semaine) ; profil, pesées, séances et exercices sont lus en entier (records, série de
 * régularité et objectif du jour en dépendent), mais ni réglages, ni mensurations, ni états de progression.
 */
export function WeekCard({ today }: { today: LocalDate }) {
  const days = useMemo(() => weekDays(today), [today])
  const { data, error } = useLiveQuery(() => loadCalendarData(days[0] ?? today, today), [today, days])
  const [selected, setSelected] = useState<LocalDate | null>(null)

  const model = useMemo(() => {
    if (!data?.profile) return undefined
    const profile = data.profile
    const exercisesById = buildExercisesById(seedExercises, data.exerciseRows)
    const targetsFor = makeTargetsFor(profile, data.weighIns)
    const activities = dayActivities({
      from: days[0] ?? today,
      to: days[6] ?? today,
      today,
      sessions: data.sessions,
      exercisesById,
      foodLog: data.foodLog,
      targetsFor,
    })
    // Même seuil que la page Progrès : un profil à 2 séances/sem. peut aussi avoir une série.
    const weekTarget = profileWeekTarget(profile)
    return {
      days: toStripDays(activities, today),
      streak: regularity(data.sessions, today, { weekTarget }).currentStreak,
      done: activities.reduce((n, a) => n + a.sessions, 0),
      planned: profile.weeklySessionsTarget,
      dayInput: { today, sessions: data.sessions, exercisesById, foodLog: data.foodLog, targetsFor },
      nameOf: (id: string) => exercisesById.get(id)?.name ?? DELETED_EXERCISE_NAME,
    }
  }, [data, today, days])

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
      <WeekStrip days={model.days} selectedDate={selected} onSelectDay={setSelected} />
      {selected !== null && (
        <Suspense fallback={null}>
          <DayDetail
            date={selected}
            minDate={days[0] ?? selected}
            input={model.dayInput}
            nameOf={model.nameOf}
            onSelect={setSelected}
            onClose={() => setSelected(null)}
          />
        </Suspense>
      )}
    </Card>
  )
}
