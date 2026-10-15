// Vues du mode guidé (plein écran) : échauffement, série, repos, fin. Aucune règle métier : la logique est dans
// src/domain/training, l'orchestration (état, sauvegarde) dans GuidedScreen.tsx.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { nextLoadDown, nextLoadUp } from '../../domain/training'
import type { Equipment, Feeling } from '../../types'
import type { SetInput } from '../../types/guided'
import { Button } from '../../ui'
import { alertEnd, unlockAudio } from './alerts'
import { BigStepper } from './BigStepper'
import { formatClock, formatSeconds, kgText, tempoText } from './format'
import { defaultDuration, defaultReps, loadSummary, targetSummary, usesDuration } from './guidedInfo'
import type { StepInfo } from './guidedInfo'
import { useNow } from './useNow'

// ---------------------------------------------------------------------------------------------------------------
// Cadre : barre du haut, zone défilante, barre d'actions en bas (au-dessus de l'indicateur d'accueil)

export interface TopProps {
  onQuit: () => void
  onMenu?: () => void
  /** Série en cours / total (séries faites ou passées + 1). */
  position: { current: number; total: number; done: number } | null
  /** Bandeau (erreur d'enregistrement) affiché sous la zone sûre, au-dessus de la barre du haut. */
  banner?: ReactNode
}

const topButton =
  'flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-semibold text-zinc-100 active:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

export function Frame({
  top,
  actions,
  children,
}: {
  top: TopProps
  actions: ReactNode
  children: ReactNode
}) {
  const p = top.position
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {top.banner ? <div className="px-4 pt-2">{top.banner}</div> : null}
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <button type="button" className={topButton} onClick={top.onQuit}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          Quitter
        </button>
        {p ? (
          <p className="m-0 text-base font-semibold tabular-nums text-zinc-300">
            Série {p.current} / {p.total}
          </p>
        ) : null}
        {top.onMenu ? (
          <button type="button" className={topButton} onClick={top.onMenu}>
            Options
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        ) : (
          <span className="min-w-12" />
        )}
      </div>
      {p ? (
        <div
          role="progressbar"
          aria-label="Avancement de la séance"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.done}
          className="mx-4 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hi"
        >
          <div
            className="h-full rounded-full bg-orange-400"
            style={{ width: `${p.total === 0 ? 0 : Math.round((p.done / p.total) * 100)}%` }}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">{children}</div>
      <div
        className="border-t border-line bg-surface px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {actions}
      </div>
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
    <Frame
      top={top}
      actions={
        <Button
          className="min-h-16 text-xl"
          onClick={() => {
            unlockAudio()
            onStart()
          }}
        >
          C’est parti
        </Button>
      }
    >
      <FocusHeading className="text-4xl font-extrabold">Échauffement</FocusHeading>
      {minutes ? <p className="m-0 mt-1 text-lg text-zinc-400">environ {minutes} min</p> : null}
      <ol className="m-0 mt-5 flex list-decimal flex-col gap-4 pl-6 text-xl leading-snug text-zinc-100">
        {warmup.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ol>
      <p className="m-0 mt-6 text-base text-zinc-400">
        Pas de hâte : 5 minutes d’échauffement évitent les blessures. Appuie sur « C’est parti » quand tu es
        prêt.
      </p>
    </Frame>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Série

const feelings: { value: Feeling; label: string; className: string }[] = [
  {
    value: 'easy',
    label: 'Facile',
    className: 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100 active:bg-emerald-500/40',
  },
  {
    value: 'ok',
    label: 'Correct',
    className: 'border-sky-400/60 bg-sky-500/20 text-sky-100 active:bg-sky-500/40',
  },
  {
    value: 'hard',
    label: 'Difficile',
    className: 'border-rose-400/60 bg-rose-500/20 text-rose-100 active:bg-rose-500/40',
  },
]

export function SetView({
  top,
  info,
  equipment,
  onValidate,
  onHelp,
}: {
  top: TopProps
  info: StepInfo
  equipment: Equipment
  onValidate: (input: SetInput) => void
  onHelp: () => void
}) {
  const byDuration = usesDuration(info)
  const [reps, setReps] = useState(() => defaultReps(info))
  const [duration, setDuration] = useState(() => defaultDuration(info))
  const [load, setLoad] = useState<number | undefined>(info.set.loadKg)
  const [chrono, setChrono] = useState<number | null>(null)
  const now = useNow(chrono !== null, 200)
  const elapsed = chrono === null ? 0 : Math.max(0, Math.floor((now - chrono) / 1000))
  const target = info.set.targetDurationSec
  const alerted = useRef(false)
  useEffect(() => {
    if (chrono !== null && target !== undefined && elapsed >= target && !alerted.current) {
      alerted.current = true
      alertEnd()
    }
  }, [chrono, elapsed, target])

  const kb = equipment.kettlebell
  const loadUp = load === undefined ? null : nextLoadUp(load, kb.stepKg, kb)
  const loadDown = load === undefined ? null : nextLoadDown(load, kb.stepKg, kb)
  const summary = loadSummary(info)
  const ex = info.exercise
  const superset = info.block.kind === 'superset'
  const finisher = info.block.kind === 'finisher'
  const n = info.se.sets.length

  const validate = (feeling: Feeling) => {
    unlockAudio()
    const input: SetInput = { feeling }
    if (byDuration) input.durationSec = chrono !== null ? elapsed : duration
    else input.reps = reps
    if (load !== undefined) input.loadKg = load
    onValidate(input)
  }

  return (
    <Frame
      top={top}
      actions={
        <div className="flex flex-col gap-3">
          {byDuration ? (
            <>
              {chrono === null ? (
                <BigStepper
                  label={`Durée tenue${ex?.unilateral ? ' (par côté)' : ''}`}
                  display={String(duration)}
                  unit="s"
                  onDecrease={() => setDuration((d) => Math.max(0, d - 5))}
                  onIncrease={() => setDuration((d) => Math.min(600, d + 5))}
                  canDecrease={duration > 0}
                  canIncrease={duration < 600}
                />
              ) : (
                <p className="m-0 text-center" role="timer" aria-label="Chronomètre de la série">
                  <span className="text-6xl font-bold tabular-nums">{formatClock(elapsed)}</span>
                  {target !== undefined ? (
                    <span className="ml-2 text-xl text-zinc-400">/ {formatClock(target)}</span>
                  ) : null}
                </p>
              )}
              <Button
                variant={chrono === null ? 'secondary' : 'primary'}
                className="min-h-14"
                onClick={() => {
                  unlockAudio()
                  if (chrono === null) {
                    alerted.current = false
                    setChrono(Date.now())
                  } else {
                    setDuration(elapsed)
                    setChrono(null)
                  }
                }}
              >
                {chrono === null ? 'Lancer le chrono' : 'Arrêter le chrono'}
              </Button>
            </>
          ) : (
            <BigStepper
              label={`Répétitions faites${ex?.unilateral ? ' (par côté)' : ''}`}
              display={String(reps)}
              onDecrease={() => setReps((r) => Math.max(0, r - 1))}
              onIncrease={() => setReps((r) => Math.min(99, r + 1))}
              canDecrease={reps > 0}
              canIncrease={reps < 99}
            />
          )}
          {load !== undefined ? (
            <BigStepper
              label="Charge utilisée"
              display={kgText(load)}
              unit="kg"
              size="lg"
              onDecrease={() => loadDown !== null && setLoad(loadDown)}
              onIncrease={() => loadUp !== null && setLoad(loadUp)}
              canDecrease={loadDown !== null}
              canIncrease={loadUp !== null}
            />
          ) : null}
          <div role="group" aria-label="Valider la série avec ton ressenti">
            <p className="m-0 mb-1.5 text-center text-sm font-medium text-zinc-400">
              Comment c’était ? Ça valide la série.
            </p>
            <div className="flex gap-2">
              {feelings.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => validate(f.value)}
                  className={`flex h-16 min-w-0 flex-1 items-center justify-center rounded-2xl border text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${f.className}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line bg-surface-hi px-3 py-1 text-base font-semibold tabular-nums">
          Série {info.cursor.set + 1} sur {n}
        </span>
        {superset ? (
          <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-base font-semibold text-sky-200">
            Superset · tour {info.cursor.set + 1}
          </span>
        ) : null}
        {finisher ? (
          <span className="rounded-full border border-orange-400/50 bg-orange-400/10 px-3 py-1 text-base font-semibold text-orange-200">
            Finisher
          </span>
        ) : null}
      </div>
      <FocusHeading className="mt-3 text-4xl font-extrabold leading-tight">
        {ex?.name ?? info.se.exerciseId}
      </FocusHeading>

      <p className="m-0 mt-5 flex items-baseline gap-2 font-black leading-none text-orange-300">
        <span className={summary.unit ? 'text-8xl tabular-nums' : 'text-5xl'}>{summary.big}</span>
        {summary.unit ? <span className="text-4xl font-bold">{summary.unit}</span> : null}
      </p>
      {summary.note ? <p className="m-0 mt-2 text-base text-zinc-300">{summary.note}</p> : null}

      <p className="m-0 mt-5 text-4xl font-bold leading-tight">{targetSummary(info)}</p>
      {ex?.unilateral ? (
        <p className="m-0 mt-1 text-base text-zinc-400">Fais la série d’un côté, puis de l’autre.</p>
      ) : null}
      {info.se.tempo ? <p className="m-0 mt-2 text-base text-zinc-300">{tempoText(info.se.tempo)}</p> : null}

      {ex ? (
        <div className="mt-6">
          <Button variant="secondary" className="min-h-14" onClick={onHelp}>
            Comment faire ?
          </Button>
        </div>
      ) : null}
    </Frame>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Repos

export interface NextUpInfo {
  name: string
  setLabel: string
  detail: string
}

export function RestView({
  top,
  endsAt,
  totalSec,
  label,
  next,
  onAdjust,
  onEnd,
}: {
  top: TopProps
  endsAt: number
  totalSec: number
  label: string
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

  const [initial] = useState(totalSec)
  const fraction = over ? 0 : Math.min(1, remaining / Math.max(totalSec, remaining, 1))
  // Annonce sobre pour les lecteurs d'écran : début, 10 secondes, fin (jamais chaque seconde).
  const announce = over
    ? 'Repos terminé.'
    : remaining <= 10
      ? 'Plus que 10 secondes.'
      : `Repos de ${formatSeconds(initial)}.`

  return (
    <Frame
      top={top}
      actions={
        <Button className="min-h-16 text-xl" disabled={!armed} onClick={() => (unlockAudio(), onEnd())}>
          {over ? 'Série suivante' : 'Passer le repos'}
        </Button>
      }
    >
      <p className="m-0 text-xl font-semibold text-zinc-300">{over ? 'Repos terminé' : label}</p>
      <p
        role="timer"
        aria-label="Temps de repos restant"
        className={`m-0 mt-2 text-center text-[7rem] font-black leading-none tabular-nums ${over ? 'text-emerald-300' : 'text-zinc-50'}`}
      >
        {formatClock(remaining)}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <div
        aria-hidden="true"
        className="mx-auto mt-5 h-3 max-w-sm overflow-hidden rounded-full bg-surface-hi"
      >
        <div
          className="h-full rounded-full bg-orange-400"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3">
        <Button variant="secondary" className="min-h-14" onClick={() => onAdjust(-15)}>
          −15 s
        </Button>
        <Button variant="secondary" className="min-h-14" onClick={() => onAdjust(15)}>
          +15 s
        </Button>
      </div>
      {next ? (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
          <p className="m-0 text-sm font-medium text-zinc-400">À suivre</p>
          <p className="m-0 mt-1 text-2xl font-bold leading-tight">{next.name}</p>
          <p className="m-0 mt-1 text-lg text-zinc-300">
            {next.setLabel}
            {next.detail ? ` · ${next.detail}` : ''}
          </p>
        </div>
      ) : null}
    </Frame>
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
    <Frame
      top={top}
      actions={
        <div className="flex flex-col gap-3">
          {error}
          <Button className="min-h-16 text-xl" disabled={busy} onClick={onFinish}>
            Terminer la séance
          </Button>
        </div>
      }
    >
      <FocusHeading className="text-4xl font-extrabold">Bravo, c’est fini !</FocusHeading>
      <p className="m-0 mt-3 text-xl text-zinc-200">
        {done} série{done > 1 ? 's' : ''} faite{done > 1 ? 's' : ''}
        {skipped > 0 ? `, ${skipped} passée${skipped > 1 ? 's' : ''}` : ''}.
      </p>
      <p className="m-0 mt-3 text-base text-zinc-400">
        Appuie sur « Terminer la séance » pour voir le récapitulatif et enregistrer ta progression. Une erreur
        de saisie ? Utilise « Options » pour corriger la série précédente.
      </p>
    </Frame>
  )
}
