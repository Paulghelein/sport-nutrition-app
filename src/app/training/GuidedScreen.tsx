// Mode guidé (SPEC §3.4) : une série à la fois, repos chronométré, état sauvegardé après chaque série.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ValidationError,
  abandonSession,
  completeSession,
  getActiveSession,
  getEquipment,
  getSession,
  getProfile,
  listExerciseStates,
  saveSessionProgress,
} from '../../db'
import {
  completeSessionPlan,
  currentStep,
  recordSet,
  replaceExercise,
  replacementCandidates,
  restAfter,
  sessionSteps,
  setAt,
  skipExercise,
  skipSet,
  undoSet,
} from '../../domain/training'
import type { Session, SessionCursor } from '../../types'
import type { RestPlan, SetInput } from '../../types/guided'
import { errorMessage } from '../../ui'
import { Button, Sheet, buttonClass } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { TRAINING_PATH } from '../routes'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { clockMs, describeStep, exerciseProgress, nextDetail } from './guidedInfo'
import type { StepInfo } from './guidedInfo'
import { FinishedView, RestView, SetView, WarmupView } from './guidedViews'
import type { NextUpInfo, TopProps } from './guidedViews'
import { doneText, lastLoadKg as findLastLoad } from './prescription'
import { TechniqueSheet } from './TechniqueSheet'
import { useEngineInput } from './useEngineInput'
import type { EngineBase } from './useEngineInput'
import { useWakeLock } from './useWakeLock'

const warmupKey = (id: string) => `forge:guided-warmup:${id}`

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string): void {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    // Sans importance : l'échauffement sera simplement réaffiché.
  }
}

function hasProgress(session: Session): boolean {
  return session.blocks.some((b) => b.exercises.some((e) => e.sets.some((s) => s.status !== undefined)))
}

function countSets(session: Session): { total: number; done: number; skipped: number } {
  let total = 0
  let done = 0
  let skipped = 0
  for (const b of session.blocks)
    for (const e of b.exercises)
      for (const s of e.sets) {
        total++
        if (s.status === 'done') done++
        else if (s.status === 'skipped') skipped++
      }
  return { total, done, skipped }
}

function withoutRest(session: Session): Session {
  const next = { ...session }
  delete next.restEndsAt
  return next
}

const restLabels: Record<RestPlan['kind'], string> = {
  set: 'Repos',
  transition: 'Enchaîne avec l’exercice suivant',
  round: 'Repos après le tour',
  block: 'Repos avant l’exercice suivant',
  none: 'Repos',
}

type Sheets =
  | null
  | 'confirm-leave'
  | 'menu'
  | 'quit'
  | 'help'
  | 'replace'
  | 'confirm-skip-exercise'
  | 'confirm-abandon'
  | 'confirm-finish'

type Step = ReturnType<typeof currentStep>

/** Dernière série faite ou passée avant la position courante : celle que « Corriger » rend et après laquelle un repos a été lancé. */
function previousHandled(session: Session, step: Step): SessionCursor | null {
  const steps = sessionSteps(session)
  const at = step.kind === 'set' ? steps.findIndex((c) => sameCursor(c, step.cursor)) : steps.length
  for (let i = (at < 0 ? steps.length : at) - 1; i >= 0; i--) {
    const c = steps[i] as SessionCursor
    if (setAt(session, c)?.status !== undefined) return c
  }
  return null
}

const menuButton =
  'focus-ring flex min-h-14 w-full items-center rounded-ds-md bg-canvas px-4 text-left text-headline text-ink active:opacity-70'

function Run({ initial, engine }: { initial: Session; engine: EngineBase }) {
  const navigate = useNavigate()
  useWakeLock()

  const [session, setSession] = useState<Session>(() => {
    // Repos déjà terminé à la reprise : on repart directement sur la série.
    const end = initial.restEndsAt === undefined ? 0 : Date.parse(initial.restEndsAt)
    return end > Date.now() ? initial : withoutRest(initial)
  })
  const sessionRef = useRef(session)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const locked = useRef(false)
  const finishing = useRef(false)
  const [warmupDone, setWarmupDone] = useState(() => hasProgress(initial) || readFlag(warmupKey(initial.id)))
  const [restTotal, setRestTotal] = useState(() => {
    const end = initial.restEndsAt === undefined ? 0 : Date.parse(initial.restEndsAt)
    return Math.max(1, Math.ceil((end - Date.now()) / 1000))
  })
  // Type du repos : recalculé à la reprise d'après la dernière série faite.
  const [restKind, setRestKind] = useState<RestPlan['kind']>(() => {
    const c = previousHandled(initial, currentStep(initial))
    return c === null ? 'set' : restAfter(initial, c, engine.library).kind
  })
  const [sheet, setSheet] = useState<Sheets>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(engine.library.map((e) => [e.id, e])), [engine.library])

  const queueSave = (): Promise<void> => {
    const p = chain.current.then(async () => {
      try {
        await saveSessionProgress(sessionRef.current)
        setSaveError(null)
      } catch (e) {
        setSaveError(errorMessage(e, 'Impossible d’enregistrer la séance sur ce téléphone.'))
      }
    })
    chain.current = p
    return p
  }

  /** Applique une nouvelle version de la séance (affichage immédiat) puis l'enregistre. */
  const commit = (next: Session) => {
    sessionRef.current = next
    setSession(next)
    void queueSave()
  }

  const step = currentStep(session)
  const info: StepInfo | null =
    step.kind === 'set' ? describeStep(session.blocks, step.cursor, byId, engine.states) : null
  const counts = countSets(session)
  const restEnd = session.restEndsAt === undefined ? null : Date.parse(session.restEndsAt)

  const previous = previousHandled(session, step)

  const top: TopProps = {
    onQuit: () => setSheet('quit'),
    onMenu: () => setSheet('menu'),
    banner: saveError ? (
      <Note tone="error">
        <p className="m-0">{saveError} Ta saisie est conservée à l’écran.</p>
        <button
          type="button"
          className="focus-ring mt-1 min-h-11 text-body-strong text-ember-ink underline"
          onClick={() => void queueSave()}
        >
          Réessayer
        </button>
      </Note>
    ) : undefined,
    progress: exerciseProgress(session.blocks, step.kind === 'set' ? step.cursor : null),
    startedAt: session.startedAt,
  }

  const validate = (input: SetInput) => {
    if (locked.current || finishing.current || step.kind !== 'set') return
    locked.current = true
    setTimeout(() => (locked.current = false), 450)
    let next = recordSet(sessionRef.current, step.cursor, input)
    const rest = restAfter(next, step.cursor, engine.library)
    if (rest.kind !== 'none' && rest.seconds > 0) {
      next = { ...next, restEndsAt: new Date(clockMs() + rest.seconds * 1000).toISOString() }
      setRestTotal(rest.seconds)
    } else {
      next = withoutRest(next)
    }
    setRestKind(rest.kind)
    commit(next)
  }

  const adjustRest = (delta: number) => {
    const cur = sessionRef.current
    if (cur.restEndsAt === undefined) return
    // Repos déjà fini : on repart de maintenant, pas d'une heure passée.
    const end = Math.max(clockMs(), Date.parse(cur.restEndsAt)) + delta * 1000
    if (delta > 0) setRestTotal((t) => t + delta)
    commit({ ...cur, restEndsAt: new Date(end).toISOString() })
  }

  const endRest = () => commit(withoutRest(sessionRef.current))

  const undo = () => {
    if (previous === null) return
    setSheet(null)
    commit(withoutRest(undoSet(sessionRef.current, previous)))
  }

  const finish = async () => {
    if (finishing.current) return
    finishing.current = true
    setBusy(true)
    setFinishError(null)
    try {
      await chain.current
      const [states, equipment, profile] = await Promise.all([
        listExerciseStates(),
        getEquipment(),
        getProfile(),
      ])
      if (!profile) throw new ValidationError('Profil introuvable.')
      const completion = completeSessionPlan({
        session: sessionRef.current,
        library: engine.library,
        states,
        equipment,
        profileLevel: profile.level,
        now: new Date().toISOString(),
      })
      const done = await completeSession(completion)
      navigate(`${TRAINING_PATH}/recap/${done.id}`, { replace: true })
    } catch (e) {
      // Déjà terminée ailleurs (autre onglet, double appui) : on relit la base plutôt que de deviner d'après le message.
      const stored = await getSession(session.id).catch(() => undefined)
      if (stored?.status === 'done') {
        navigate(`${TRAINING_PATH}/recap/${session.id}`, { replace: true })
        return
      }
      const message =
        stored?.status === 'abandoned'
          ? 'Cette séance a été abandonnée : elle ne peut plus être terminée.'
          : errorMessage(e, 'Impossible de terminer la séance. Réessaie.')
      // Depuis « Terminer maintenant » (menu), l'écran de fin n'est pas affiché : on passe par le bandeau.
      if (currentStep(sessionRef.current).kind === 'set') setSaveError(message)
      else setFinishError(message)
      finishing.current = false
      setBusy(false)
    }
  }

  const abandon = async () => {
    setBusy(true)
    try {
      await abandonSession(session.id)
      navigate(TRAINING_PATH, { replace: true })
    } catch (e) {
      setSheet(null)
      setBusy(false)
      setSaveError(errorMessage(e, 'Impossible d’abandonner la séance. Réessaie.'))
    }
  }

  /** Pause : on s'assure que la dernière série est écrite ; sinon on prévient avant de quitter. */
  const pause = async () => {
    setBusy(true)
    await chain.current
    try {
      await saveSessionProgress(sessionRef.current)
      navigate(TRAINING_PATH)
    } catch (e) {
      setBusy(false)
      setSaveError(errorMessage(e, 'Impossible d’enregistrer la séance sur ce téléphone.'))
      setSheet('confirm-leave')
    }
  }

  const nextUp = (): NextUpInfo | null => {
    if (!info) return null
    return {
      name: info.exercise?.name ?? info.se.exerciseId,
      setLabel: `Série ${info.cursor.set + 1} sur ${info.se.sets.length}`,
      detail: nextDetail(info),
    }
  }

  /** Rappel de la série qui vient d'être validée, affiché pendant le repos. */
  const recap = (): string | null => {
    if (previous === null) return null
    const set = setAt(session, previous)
    if (set?.status !== 'done') return null
    const se = session.blocks[previous.block]?.exercises[previous.exercise]
    const ex = se ? byId.get(se.exerciseId) : undefined
    return `Série ${previous.set + 1} validée : ${doneText(set, ex)}`
  }

  let body: ReactNode
  if (!warmupDone && !hasProgress(session) && restEnd === null) {
    body = (
      <WarmupView
        top={{ ...top, onMenu: undefined }}
        warmup={session.warmup}
        minutes={session.warmupMin}
        onStart={() => {
          writeFlag(warmupKey(session.id))
          setWarmupDone(true)
        }}
      />
    )
  } else if (restEnd !== null) {
    body = (
      <RestView
        top={top}
        endsAt={restEnd}
        totalSec={restTotal}
        label={restLabels[restKind]}
        recap={recap()}
        next={nextUp()}
        onAdjust={adjustRest}
        onEnd={endRest}
      />
    )
  } else if (info) {
    body = (
      <SetView
        key={`${info.cursor.block}-${info.cursor.exercise}-${info.cursor.set}-${info.se.exerciseId}`}
        top={top}
        info={info}
        equipment={engine.equipment}
        position={{ current: top.progress?.current ?? 1, total: top.progress?.fractions.length ?? 1 }}
        lastLoadKg={findLastLoad(engine.sessions, info.se.exerciseId)}
        onValidate={validate}
        onHelp={() => setSheet('help')}
      />
    )
  } else {
    body = (
      <FinishedView
        top={top}
        done={counts.done}
        skipped={counts.skipped}
        busy={busy}
        error={finishError ? <Note tone="error">{finishError}</Note> : null}
        onFinish={() => void finish()}
      />
    )
  }

  const currentExerciseId = info?.se.exerciseId
  const candidates = useMemo(() => {
    if (sheet !== 'replace' || currentExerciseId === undefined) return []
    const ids = session.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))
    return replacementCandidates(currentExerciseId, { ...engine, durationMin: session.durationMin }, ids)
  }, [sheet, currentExerciseId, engine, session.blocks, session.durationMin])

  return (
    <>
      {body}
      {busy && sheet === null ? (
        <div
          aria-busy="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-inverse/60 text-headline text-on-inverse"
        >
          <span role="status">Enregistrement…</span>
        </div>
      ) : null}

      {sheet === 'menu' ? (
        <Sheet title="Options" onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-2">
            {info ? (
              <>
                {restEnd === null ? (
                  <button
                    type="button"
                    className={menuButton}
                    onClick={() => {
                      setSheet(null)
                      commit(skipSet(sessionRef.current, info.cursor))
                    }}
                  >
                    Passer la série
                  </button>
                ) : null}
                <button
                  type="button"
                  className={menuButton}
                  onClick={() => setSheet('confirm-skip-exercise')}
                >
                  Passer l’exercice
                </button>
                <button type="button" className={menuButton} onClick={() => setSheet('replace')}>
                  Remplacer l’exercice
                </button>
                {info.exercise ? (
                  <button type="button" className={menuButton} onClick={() => setSheet('help')}>
                    Comment faire ?
                  </button>
                ) : null}
              </>
            ) : null}
            {previous !== null ? (
              <button type="button" className={menuButton} onClick={undo}>
                Corriger la série précédente
              </button>
            ) : null}
            {counts.done > 0 && info ? (
              <button type="button" className={menuButton} onClick={() => setSheet('confirm-finish')}>
                Terminer la séance maintenant
              </button>
            ) : null}
            <Button variant="secondary" fullWidth onClick={() => setSheet(null)}>
              Fermer
            </Button>
          </div>
        </Sheet>
      ) : null}

      {sheet === 'quit' ? (
        <Sheet title="Quitter la séance" onClose={() => setSheet(null)}>
          <p className="m-0 text-body text-ink-muted">
            En pause, la séance reste en cours : tu la reprends plus tard exactement là où tu t’es arrêté.
          </p>
          <div className="flex flex-col gap-2">
            <Button fullWidth size="session" onClick={() => void pause()}>
              Mettre en pause
            </Button>
            <Button variant="danger" fullWidth onClick={() => setSheet('confirm-abandon')}>
              Abandonner la séance
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setSheet(null)}>
              Continuer la séance
            </Button>
          </div>
        </Sheet>
      ) : null}

      {sheet === 'confirm-leave' ? (
        <ConfirmSheet
          title="Quitter sans enregistrer ?"
          message="Les dernières séries n’ont pas pu être enregistrées sur ce téléphone. Si tu quittes maintenant, elles seront perdues."
          confirmLabel="Quitter quand même"
          onConfirm={() => navigate(TRAINING_PATH)}
          onCancel={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'confirm-abandon' ? (
        <ConfirmSheet
          title="Abandonner la séance ?"
          message="Les séries déjà faites ne compteront pas dans ton volume ni dans ta progression."
          confirmLabel="Abandonner"
          busy={busy}
          onConfirm={() => void abandon()}
          onCancel={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'confirm-skip-exercise' && info ? (
        <ConfirmSheet
          title="Passer l’exercice ?"
          message={`Les séries restantes de « ${info.exercise?.name ?? info.se.exerciseId} » seront passées.`}
          confirmLabel="Passer l’exercice"
          onConfirm={() => {
            setSheet(null)
            commit(skipExercise(sessionRef.current, info.cursor.block, info.cursor.exercise))
          }}
          onCancel={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'confirm-finish' ? (
        <ConfirmSheet
          title="Terminer maintenant ?"
          message="Les séries restantes seront passées et la séance sera enregistrée."
          confirmLabel="Terminer la séance"
          danger={false}
          busy={busy}
          onConfirm={() => {
            setSheet(null)
            void finish()
          }}
          onCancel={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'help' && info?.exercise ? (
        <TechniqueSheet exercise={info.exercise} onClose={() => setSheet(null)} />
      ) : null}

      {sheet === 'replace' && info ? (
        <ExercisePickerSheet
          title="Remplacer l’exercice"
          candidates={candidates}
          emptyText="Aucun autre exercice possible avec ton matériel et ton niveau."
          onClose={() => setSheet(null)}
          onPick={(ex) => {
            setSheet(null)
            const state = engine.states.find((s) => s.exerciseId === ex.id)
            commit(
              replaceExercise(sessionRef.current, info.cursor.block, info.cursor.exercise, ex, {
                state,
                equipment: engine.equipment,
                deload: session.deload,
              }),
            )
          }}
        />
      ) : null}
    </>
  )
}

function sameCursor(a: SessionCursor, b: SessionCursor): boolean {
  return a.block === b.block && a.exercise === b.exercise && a.set === b.set
}

export default function GuidedScreen() {
  const engine = useEngineInput()
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; session: Session | undefined } | { status: 'error' }
  >({
    status: 'loading',
  })
  useEffect(() => {
    let cancelled = false
    getActiveSession().then(
      (session) => {
        if (!cancelled) setState({ status: 'ready', session })
      },
      () => {
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const wrapper = 'ds-session flex min-h-0 flex-1 flex-col'
  if (state.status === 'error' || engine.error) {
    return (
      <div className={`${wrapper} justify-center p-6`}>
        <Note tone="error">Impossible de lire la séance. Ferme l’app puis rouvre-la.</Note>
      </div>
    )
  }
  if (state.status === 'loading' || !engine.data) return <div className={wrapper} aria-busy="true" />
  if (!state.session) {
    return (
      <div
        className={`${wrapper} justify-center gap-4 p-6`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
      >
        <h1 className="m-0 font-display text-display-l">Aucune séance en cours</h1>
        <p className="m-0 text-body text-on-inverse-muted">Prépare une séance depuis l’écran Entraînement.</p>
        <Link to={TRAINING_PATH} className={buttonClass('primary', 'session', true)}>
          Aller à Entraînement
        </Link>
      </div>
    )
  }
  return <Run initial={state.session} engine={engine.data} />
}
