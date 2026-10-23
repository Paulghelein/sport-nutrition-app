import { Check, Dumbbell, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getActiveSession } from '../../db'
import { sessionHeadline, volumeTargets, weeklyVolume } from '../../domain/training'
import type { LibraryExercise, Session, SessionDuration } from '../../types'
import { useLiveQuery } from '../../ui'
import { Card, EmptyState, ExerciseThumb, Segmented, buttonClass } from '../../ui/kit'
import { GUIDED_PATH, PREVIEW_PATH, SETTINGS_PATH, TRAINING_PATH } from '../routes'
import { DURATIONS, loadDuration, saveDuration } from '../training/durations'
import { planForDuration, previewBlocks } from '../training/previewPlan'
import { useEngineInput } from '../training/useEngineInput'
import { SESSION_CARD_MIN_H } from './layout'
import { CardError } from './SectionBoundary'
import { SessionSkeleton } from './Skeletons'

const MAX_THUMBS = 4
const DURATION_OPTIONS = DURATIONS.map((d) => ({ value: d, label: `${d} min` }))

function CardShell({ children }: { children: ReactNode }) {
  return (
    <Card
      aria-label="Séance du jour"
      padding="large"
      className={`flex flex-col gap-3.5 ${SESSION_CARD_MIN_H}`}
    >
      {children}
    </Card>
  )
}

function setProgress(session: Session): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const b of session.blocks)
    for (const e of b.exercises)
      for (const s of e.sets) {
        total++
        if (s.status !== undefined) done++
      }
  return { done, total }
}

function InProgress({ session }: { session: Session }) {
  const { done, total } = setProgress(session)
  return (
    <CardShell>
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase text-ink-muted">Séance du jour</span>
        <h2 className="m-0 font-display text-title">Séance en cours</h2>
        <p className="m-0 text-caption text-ink-muted">
          {done === 0
            ? 'Pas encore commencée.'
            : `${done} série${done > 1 ? 's' : ''} sur ${total} déjà faite${done > 1 ? 's' : ''} ou passée${done > 1 ? 's' : ''}.`}
        </p>
      </div>
      <Link to={GUIDED_PATH} className={`${buttonClass('primary', 'normal', true)} mt-auto min-h-[52px]`}>
        <Play size={20} strokeWidth={1.75} aria-hidden="true" />
        Reprendre
      </Link>
    </CardShell>
  )
}

function Thumbs({ exercises, total }: { exercises: readonly LibraryExercise[]; total: number }) {
  const shown = exercises.slice(0, MAX_THUMBS)
  const more = total - shown.length
  return (
    <div className="flex gap-2">
      <p className="sr-only">Exercices : {exercises.map((e) => e.name).join(', ')}.</p>
      {shown.map((e, i) => (
        <div key={`${e.id}-${i}`} aria-hidden="true">
          <ExerciseThumb primary={e.muscles.primary} size={48} background="canvas" />
        </div>
      ))}
      {more > 0 && (
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-sm bg-canvas font-display text-body-strong tabular-nums text-ink-muted"
        >
          +{more}
        </div>
      )}
    </div>
  )
}

function Proposed() {
  const { data, error } = useEngineInput()
  const [duration, setDuration] = useState<SessionDuration>(loadDuration)

  const result = useMemo(() => {
    if (!data) return undefined
    try {
      const generated = planForDuration(data, duration)
      // Aperçu modifié aujourd'hui pour cette durée : la carte montre la même séance.
      const plan = { ...generated, blocks: previewBlocks(generated, data.date) }
      const headline = sessionHeadline(
        plan,
        data.library,
        weeklyVolume(data.sessions, data.library, data.date),
        volumeTargets(data.settings, data.equipment),
      )
      const byId = new Map(data.library.map((e) => [e.id, e]))
      const exercises = plan.blocks
        .flatMap((b) => b.exercises)
        .flatMap((se) => {
          const ex = byId.get(se.exerciseId)
          return ex ? [ex] : []
        })
      const doneToday = data.sessions.filter((s) => s.status === 'done' && s.date === data.date).length
      return { headline, exercises, count: plan.blocks.flatMap((b) => b.exercises).length, doneToday }
    } catch (e) {
      console.error('Séance du jour impossible', e)
      return null
    }
  }, [data, duration])

  if (error || result === null) {
    return (
      <CardShell>
        <h2 className="m-0 font-display text-title">Séance du jour</h2>
        <p role="alert" className="m-0 text-body text-ink-muted">
          Impossible de préparer la séance. Vérifie ton profil et ton matériel.
        </p>
        <Link to={TRAINING_PATH} className={`${buttonClass('secondary', 'normal', true)} mt-auto`}>
          Ouvrir l’entraînement
        </Link>
      </CardShell>
    )
  }
  if (!result) return <SessionSkeleton />

  const { headline, exercises, count, doneToday } = result
  const change = (d: SessionDuration) => {
    setDuration(d)
    saveDuration(d)
  }
  return (
    <CardShell>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-label uppercase text-ink-muted">Séance du jour</span>
          {doneToday > 0 && (
            <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
              <Check size={14} strokeWidth={2} aria-hidden="true" />
              Déjà fait aujourd’hui : {doneToday} séance{doneToday > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <h2 className="m-0 font-display text-title">{headline.title}</h2>
        <p className="m-0 text-caption text-ink-muted">{headline.reason}</p>
      </div>
      {count > 0 ? (
        <Thumbs exercises={exercises} total={count} />
      ) : (
        <EmptyState compact icon={Dumbbell} title="Aucune séance possible">
          Vérifie ton matériel et tes préférences dans les Réglages.
        </EmptyState>
      )}
      <Segmented ariaLabel="Durée" options={DURATION_OPTIONS} value={duration} onChange={change} />
      {count > 0 ? (
        <Link
          to={`${PREVIEW_PATH}?duree=${duration}`}
          className={`${buttonClass('primary', 'normal', true)} mt-auto min-h-[52px]`}
        >
          <Play size={20} strokeWidth={1.75} aria-hidden="true" />
          Voir la séance · {count} exercice{count > 1 ? 's' : ''}
        </Link>
      ) : (
        <Link to={SETTINGS_PATH} className={`${buttonClass('secondary', 'normal', true)} mt-auto`}>
          Ouvrir les réglages
        </Link>
      )}
    </CardShell>
  )
}

/** Carte « Séance du jour » : séance en cours à reprendre, sinon la séance proposée pour la durée choisie. */
export function SessionCard() {
  const active = useLiveQuery(() => getActiveSession(), [])
  if (active.error && !active.data) {
    return <CardError>Impossible de lire ta séance. Réessaie dans un instant.</CardError>
  }
  if (active.loading && !active.data) return <SessionSkeleton />
  if (active.data) return <InProgress session={active.data} />
  return <Proposed />
}
