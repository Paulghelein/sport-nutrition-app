// Vues du mode séance (plein écran, fond sombre) : échauffement, série, repos, fin. Aucune règle métier : la logique est
// dans src/domain/training, l'orchestration (état, sauvegarde) dans GuidedScreen.tsx. Le type de la série affichée
// vient toujours de `stepType` (setTypeOf), jamais de la présence de `targetDurationSec`.
import { CircleHelp, MoreHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { nextLoadDown, nextLoadUp } from '../../domain/training'
import type { Equipment, Feeling } from '../../types'
import type { SetInput } from '../../types/guided'
import { ExerciseThumb, buttonClass, cx } from '../../ui/kit'
import { RestTimer } from '../../ui/kit/RestTimer'
import { SessionProgress, SetDots } from '../../ui/kit/SessionProgress'
import { SetPanel } from '../../ui/kit/SetPanel'
import { alertEnd, unlockAudio } from './alerts'
import { formatSeconds, kgText, tempoText } from './format'
import {
  defaultDuration,
  defaultReps,
  dotStates,
  loadSummary,
  stepType,
  stepWindow,
  timedMaxRecord,
} from './guidedInfo'
import type { StepInfo } from './guidedInfo'
import { rangeText } from './prescription'
import { useNow } from './useNow'

// ---------------------------------------------------------------------------------------------------------------
// Cadre : barre du haut (quitter, avancement par exercice, chrono, options), zone défilante, actions en bas

export interface TopProps {
  onQuit: () => void
  onMenu?: () => void
  /** Avancement de chaque exercice (0 à 1) et exercice courant (à partir de 1) ; `null` : pas de barre. */
  progress: { fractions: number[]; current: number } | null
  /** Début de la séance (ISO) pour le chrono total. */
  startedAt?: string
  /** Bandeau (erreur d'enregistrement) affiché au-dessus de la barre du haut. */
  banner?: ReactNode
}

const ICON_BUTTON =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-on-inverse/10 text-on-inverse active:bg-on-inverse/20'

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Durée écoulée depuis le début de la séance. Silencieuse pour les lecteurs d'écran (`role="timer"`). */
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const now = useNow(true, 1000)
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start)) return null
  return (
    <span
      role="timer"
      aria-label="Durée de la séance"
      className="font-display text-body font-bold tabular-nums text-on-inverse-muted"
    >
      {mmss((now - start) / 1000)}
    </span>
  )
}

export function Screen({
  top,
  footer,
  children,
}: {
  top: TopProps
  footer?: ReactNode
  children: ReactNode
}) {
  const p = top.progress
  return (
    <div
      className="ds-session flex min-h-0 flex-1 flex-col"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {top.banner ? <div className="px-4 pb-2">{top.banner}</div> : null}
      <header className="flex items-center gap-3 px-4">
        <button type="button" aria-label="Quitter la séance" onClick={top.onQuit} className={ICON_BUTTON}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {p ? (
          <SessionProgress fractions={p.fractions} current={p.current} className="flex-1" />
        ) : (
          <span className="flex-1" />
        )}
        {top.startedAt ? <ElapsedClock startedAt={top.startedAt} /> : null}
        {top.onMenu ? (
          <button type="button" aria-label="Options" onClick={top.onMenu} className={ICON_BUTTON}>
            <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain px-4 py-4">
        {children}
      </div>
      {footer ? (
        <div className="px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          {footer}
        </div>
      ) : (
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      )}
    </div>
  )
}

/** Titre de vue qui prend le focus à l'apparition (lecteur d'écran : on annonce la nouvelle série). */
function FocusHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h1 ref={ref} tabIndex={-1} className={`m-0 outline-none ${className}`}>
      {children}
    </h1>
  )
}

const caption = 'text-label uppercase text-on-inverse-muted'
const sessionButton = (variant: 'primary' | 'inverse') => buttonClass(variant, 'session', true)

// ---------------------------------------------------------------------------------------------------------------
// Échauffement

export function WarmupView({
  top,
  warmup,
  minutes,
  onStart,
}: {
  top: TopProps
  warmup: string[]
  minutes: number | undefined
  onStart: () => void
}) {
  return (
    <Screen
      top={top}
      footer={
        <button
          type="button"
          className={sessionButton('primary')}
          onClick={() => {
            unlockAudio()
            onStart()
          }}
        >
          C’est parti
        </button>
      }
    >
      <FocusHeading className="font-display text-display-l">Échauffement</FocusHeading>
      {minutes ? <p className="m-0 text-body text-on-inverse-muted">environ {minutes} min</p> : null}
      <ol className="m-0 flex list-decimal flex-col gap-4 pl-6 text-lead">
        {warmup.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ol>
      <p className="m-0 text-body text-on-inverse-muted">
        Pas de hâte : 5 minutes d’échauffement évitent les blessures. Appuie sur « C’est parti » quand tu es
        prêt.
      </p>
    </Screen>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Série

const feelings: { value: Feeling; label: string; primary?: boolean }[] = [
  { value: 'easy', label: 'Facile' },
  { value: 'ok', label: 'Correct', primary: true },
  { value: 'hard', label: 'Dur' },
]

function FeelingButtons({ onPick }: { onPick: (feeling: Feeling) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-center text-caption font-semibold text-on-inverse-muted">
        Valide la série : c’était comment ?
      </p>
      <div role="group" aria-label="Valider la série avec ton ressenti" className="grid grid-cols-3 gap-2">
        {feelings.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onPick(f.value)}
            className={buttonClass(f.primary ? 'primary' : 'inverse', 'session', true)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const clockText = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`

export function SetView({
  top,
  info,
  equipment,
  position,
  lastLoadKg,
  onValidate,
  onHelp,
}: {
  top: TopProps
  info: StepInfo
  equipment: Equipment
  /** Exercice courant et nombre d'exercices (« Exercice 2 sur 5 »). */
  position: { current: number; total: number }
  /** Dernière charge utilisée sur cet exercice (séance terminée), pour « +1 kg depuis la dernière fois ». */
  lastLoadKg: number | undefined
  onValidate: (input: SetInput) => void
  onHelp: () => void
}) {
  const type = stepType(info)
  const windowSec = stepWindow(info)
  const [reps, setReps] = useState(() => defaultReps(info))
  const [duration, setDuration] = useState(() => defaultDuration(info))
  const [load, setLoad] = useState<number | undefined>(info.set.loadKg)
  // Chronomètre (durée tenue ou fenêtre d'une série en temps fixe) : départ, puis valeur figée à l'arrêt.
  const [started, setStarted] = useState<number | null>(null)
  const [frozen, setFrozen] = useState<number | null>(null)
  const running = started !== null && frozen === null
  const now = useNow(running, 200)
  const elapsed = frozen ?? (started === null ? 0 : Math.max(0, Math.floor((now - started) / 1000)))
  const target = type === 'time' ? info.set.targetDurationSec : windowSec
  const finished = type === 'timedMax' && target !== undefined && running && elapsed >= target
  const alerted = useRef(false)
  useEffect(() => {
    if (running && target !== undefined && elapsed >= target && !alerted.current) {
      alerted.current = true
      alertEnd()
    }
  }, [running, elapsed, target])
  // Temps fixe : « prêt » → « en cours » → saisie des répétitions faites (fin de fenêtre ou arrêt manuel).
  const phase: 'ready' | 'running' | 'entry' =
    type !== 'timedMax'
      ? 'entry'
      : frozen !== null || finished
        ? 'entry'
        : started !== null
          ? 'running'
          : 'ready'

  const kb = equipment.kettlebell
  const loadUp = load === undefined ? null : nextLoadUp(load, kb.stepKg, kb)
  const loadDown = load === undefined ? null : nextLoadDown(load, kb.stepKg, kb)
  const summary = loadSummary(info)
  const ex = info.exercise
  const superset = info.block.kind === 'superset'
  const finisher = info.block.kind === 'finisher'
  const n = info.se.sets.length
  const side = ex?.unilateral ? ' par côté' : ''

  const previousReps = (() => {
    for (let i = info.cursor.set - 1; i >= 0; i--) {
      const s = info.se.sets[i]
      if (s?.status === 'done' && s.actualReps !== undefined) return { set: i + 1, reps: s.actualReps }
    }
    return null
  })()

  const start = () => {
    unlockAudio()
    alerted.current = false
    setFrozen(null)
    setStarted(Date.now())
  }
  const stop = () => {
    unlockAudio()
    setDuration(elapsed)
    setFrozen(elapsed)
  }

  const validate = (feeling: Feeling) => {
    unlockAudio()
    const input: SetInput = { feeling }
    if (type === 'time') input.durationSec = running ? elapsed : duration
    else input.reps = reps
    if (load !== undefined) input.loadKg = load
    onValidate(input)
  }

  // --- Panneau de charge
  const increase =
    load !== undefined && lastLoadKg !== undefined ? Math.round((load - lastLoadKg) * 100) / 100 : 0
  const loadHint =
    load === undefined
      ? summary.note
      : lastLoadKg === undefined
        ? 'Première fois avec cette charge'
        : increase > 0
          ? `+${kgText(increase)} kg depuis la dernière fois`
          : increase < 0
            ? `${kgText(increase).replace('-', '−')} kg depuis la dernière fois`
            : 'Même charge que la dernière fois'
  const loadPanel =
    load !== undefined ? (
      <SetPanel
        label="Charge"
        value={kgText(load)}
        unit="kg"
        hint={loadHint}
        hintTone={increase > 0 ? 'accent' : 'muted'}
        steps={{
          onDecrease: () => loadDown !== null && setLoad(loadDown),
          onIncrease: () => loadUp !== null && setLoad(loadUp),
          decreaseLabel: 'Moins un palier de charge',
          increaseLabel: 'Plus un palier de charge',
          canDecrease: loadDown !== null,
          canIncrease: loadUp !== null,
        }}
        className="flex-1"
      />
    ) : (
      <SetPanel label="Charge" value={summary.big} valueSize="l" hint={summary.note} className="flex-1" />
    )

  // --- Panneau de saisie (selon le type de la série)
  let entryPanel: ReactNode
  let aboveFooter: ReactNode = null
  if (type === 'time') {
    entryPanel = (
      <SetPanel
        label="Durée"
        groupLabel={running ? 'Chronomètre de la série' : 'Durée tenue'}
        timer={running}
        value={running ? clockText(elapsed) : String(duration)}
        unit={running ? undefined : 's'}
        hint={
          running
            ? target !== undefined
              ? `Objectif ${clockText(target)}`
              : undefined
            : `Objectif ${formatSeconds(info.set.targetDurationSec ?? defaultDuration(info))}${side}`
        }
        steps={
          running
            ? undefined
            : {
                onDecrease: () => setDuration((d) => Math.max(0, d - 5)),
                onIncrease: () => setDuration((d) => Math.min(600, d + 5)),
                decreaseLabel: '5 secondes de moins',
                increaseLabel: '5 secondes de plus',
                canDecrease: duration > 0,
                canIncrease: duration < 600,
              }
        }
        className="flex-1"
      />
    )
    aboveFooter = (
      <button
        type="button"
        className={sessionButton(running ? 'primary' : 'inverse')}
        onClick={() => (running ? stop() : start())}
      >
        {running ? 'Arrêter le chrono' : 'Lancer le chrono'}
      </button>
    )
  } else if (type === 'timedMax' && phase !== 'entry') {
    entryPanel = (
      <SetPanel
        label="Temps"
        groupLabel="Compte à rebours de la série"
        timer
        value={clockText(Math.max(0, (windowSec ?? 0) - elapsed))}
        hint={
          phase === 'running'
            ? 'Le plus de répétitions propres possible'
            : `Le plus de répétitions possible en ${windowSec} s`
        }
        className="flex-1"
      />
    )
  } else {
    const best = type === 'timedMax' ? timedMaxRecord(info) : undefined
    const repsHint =
      type === 'amrap'
        ? 'Pas de cible : va jusqu’à l’échec technique'
        : type === 'timedMax'
          ? best !== undefined
            ? `en ${windowSec} s · record : ${best}`
            : `en ${windowSec} s`
          : [
              info.set.targetReps ? `Objectif ${rangeText(info.set.targetReps)}${side}` : side.trim(),
              previousReps ? `série ${previousReps.set} : ${previousReps.reps}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
    entryPanel = (
      <SetPanel
        label={type === 'amrap' ? 'Max' : 'Répétitions'}
        groupLabel={type === 'amrap' ? 'Maximum de répétitions' : 'Répétitions'}
        value={String(reps)}
        hint={repsHint}
        steps={{
          onDecrease: () => setReps((r) => Math.max(0, r - 1)),
          onIncrease: () => setReps((r) => Math.min(99, r + 1)),
          decreaseLabel: 'Une répétition de moins',
          increaseLabel: 'Une répétition de plus',
          canDecrease: reps > 0,
          canIncrease: reps < 99,
        }}
        className="flex-1"
      />
    )
  }

  const footer =
    phase === 'ready' ? (
      <div className="flex flex-col gap-2">
        <button type="button" className={sessionButton('primary')} onClick={start}>
          Lancer les {windowSec} s
        </button>
        <button
          type="button"
          className={cx(buttonClass('text', 'normal', true), 'text-on-inverse-muted')}
          onClick={() => setFrozen(0)}
        >
          Saisir sans chrono
        </button>
      </div>
    ) : phase === 'running' ? (
      <button type="button" className={sessionButton('inverse')} onClick={stop}>
        Arrêter maintenant
      </button>
    ) : (
      <div className="flex flex-col gap-3">
        {aboveFooter}
        <FeelingButtons onPick={validate} />
      </div>
    )

  const ended = running && target !== undefined && elapsed >= target
  return (
    <Screen top={top} footer={footer}>
      <p role="status" aria-live="polite" className="sr-only">
        {type === 'timedMax' && phase === 'entry' && started !== null
          ? 'Temps écoulé. Saisis tes répétitions.'
          : ended
            ? 'Objectif atteint.'
            : ''}
      </p>
      <div className="flex items-center gap-3.5">
        <ExerciseThumb primary={ex?.muscles.primary ?? []} size={96} tone="dark" className="rounded-md" />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className={caption}>
            Exercice {position.current} sur {position.total}
          </span>
          <FocusHeading className="font-display text-number-l font-extrabold">
            {ex?.name ?? info.se.exerciseId}
          </FocusHeading>
          {ex ? (
            <button
              type="button"
              onClick={onHelp}
              className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full bg-on-inverse/10 px-3.5 text-caption font-semibold text-on-inverse"
            >
              <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
              Comment faire ?
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-body-strong">
          Série {info.cursor.set + 1} sur {n}
        </span>
        <SetDots states={dotStates(info.se, info.cursor.set)} />
        {superset ? (
          <span className="rounded-full bg-on-inverse/10 px-2.5 py-0.5 text-caption font-semibold">
            Superset · tour {info.cursor.set + 1}
          </span>
        ) : null}
        {finisher ? (
          <span className="rounded-full bg-ember px-2.5 py-0.5 text-caption font-bold text-ink">
            Finisher
          </span>
        ) : null}
      </div>

      {type === 'amrap' ? (
        <p className="m-0 rounded-md bg-on-inverse/8 px-4 py-3 text-body-strong">
          Arrête-toi dès que la forme se dégrade ; descends contrôlé.
        </p>
      ) : null}
      {ex?.unilateral ? (
        <p className="m-0 text-caption text-on-inverse-muted">Fais la série d’un côté, puis de l’autre.</p>
      ) : null}
      {info.se.tempo ? (
        <p className="m-0 text-caption text-on-inverse-muted">{tempoText(info.se.tempo)}</p>
      ) : null}

      <div className="flex flex-1 flex-col gap-3">
        {loadPanel}
        {entryPanel}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Repos

export interface NextUpInfo {
  name: string
  setLabel: string
  /** Cible de la série suivante (« 18 kg × 10 », « max », « max en 45 s »). */
  detail: string
}

export function RestView({
  top,
  endsAt,
  totalSec,
  label,
  recap,
  next,
  onAdjust,
  onEnd,
}: {
  top: TopProps
  endsAt: number
  totalSec: number
  label: string
  /** Rappel de la série validée (« Série 2 validée : 18 kg × 10 »). */
  recap: string | null
  next: NextUpInfo | null
  onAdjust: (deltaSec: number) => void
  onEnd: () => void
}) {
  const now = useNow(true, 250)
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const over = endsAt - now <= 0
  const alerted = useRef(false)
  const [armed, setArmed] = useState(false)
  // Le geste qui a validé la série ne doit pas « passer le repos » par un double-tap sur le même emplacement.
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 600)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!over) {
      alerted.current = false
      return
    }
    if (!alerted.current) {
      alerted.current = true
      // Retour d'arrière-plan bien après la fin : plus la peine de sonner.
      if (now - endsAt < 30_000) alertEnd()
    }
  }, [over, now, endsAt])

  // Annonce sobre pour les lecteurs d'écran : début, 10 secondes, fin (jamais chaque seconde).
  const announce = over
    ? 'Repos terminé.'
    : remaining <= 10
      ? 'Plus que 10 secondes.'
      : `Repos de ${formatSeconds(totalSec)}.`
  const total = Math.max(totalSec, remaining, 1)

  return (
    <Screen
      top={top}
      footer={
        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
          <button
            type="button"
            className={buttonClass('inverse', 'session', true)}
            disabled={!armed}
            onClick={() => onAdjust(-15)}
          >
            −15 s
          </button>
          <button
            type="button"
            className={buttonClass('inverse', 'session', true)}
            disabled={!armed}
            onClick={() => onAdjust(15)}
          >
            +15 s
          </button>
          <button
            type="button"
            disabled={!armed}
            aria-label={over ? undefined : 'Passer le repos'}
            className={buttonClass('primary', 'session', true)}
            onClick={() => (unlockAudio(), onEnd())}
          >
            {over ? 'Série suivante' : 'Passer'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <span className={caption}>{over ? 'Repos terminé' : label}</span>
        {recap ? <span className="text-body-strong">{recap}</span> : null}
      </div>
      <RestTimer
        className="self-center"
        remainingSec={over ? 0 : remaining}
        totalSec={total}
        caption={over ? 'terminé' : `sur ${clockText(totalSec)}`}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {next ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-on-inverse/8 px-[18px] py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={caption}>Ensuite · {next.setLabel.toLowerCase()}</span>
            <span className="text-headline">{next.name}</span>
          </div>
          {next.detail ? (
            <span className="whitespace-nowrap font-display text-number-m font-extrabold text-ember">
              {next.detail}
            </span>
          ) : null}
        </div>
      ) : null}
    </Screen>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Fin

export function FinishedView({
  top,
  done,
  skipped,
  busy,
  error,
  onFinish,
}: {
  top: TopProps
  done: number
  skipped: number
  busy: boolean
  error: ReactNode
  onFinish: () => void
}) {
  return (
    <Screen
      top={top}
      footer={
        <div className="flex flex-col gap-3">
          {error}
          <button type="button" className={sessionButton('primary')} disabled={busy} onClick={onFinish}>
            Terminer la séance
          </button>
        </div>
      }
    >
      <FocusHeading className="font-display text-display-l">Bravo, c’est fini !</FocusHeading>
      <p className="m-0 text-lead">
        {done} série{done > 1 ? 's' : ''} faite{done > 1 ? 's' : ''}
        {skipped > 0 ? `, ${skipped} passée${skipped > 1 ? 's' : ''}` : ''}.
      </p>
      <p className="m-0 text-body text-on-inverse-muted">
        Appuie sur « Terminer la séance » pour voir le récapitulatif et enregistrer ta progression. Une erreur
        de saisie ? Utilise « Options » pour corriger la série précédente.
      </p>
    </Screen>
  )
}
