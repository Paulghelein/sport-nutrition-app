import { cx } from './cx'

export type SetDotState = 'done' | 'current' | 'todo' | 'skipped'

export interface SetDotsProps {
  states: readonly SetDotState[]
  className?: string
}

const DOT: Record<SetDotState, string> = {
  done: 'bg-good',
  current: 'bg-ember ring-[3px] ring-ember/30',
  todo: 'bg-on-inverse/18',
  skipped: 'bg-transparent ring-2 ring-inset ring-on-inverse-muted',
}

/** Pastilles de séries d'un exercice (faite, en cours, à faire, passée). Décoratives : le texte « Série 2 sur 4 » les accompagne. */
export function SetDots({ states, className }: SetDotsProps) {
  return (
    <span aria-hidden="true" className={cx('flex items-center gap-2', className)}>
      {states.map((s, i) => (
        <span key={i} className={cx('size-2.5 rounded-full', DOT[s])} />
      ))}
    </span>
  )
}

export interface SessionProgressProps {
  /** Avancement de chaque exercice, de 0 à 1, dans l'ordre de la séance. */
  fractions: readonly number[]
  /** Exercice courant, à partir de 1. */
  current: number
  className?: string
}

/** Barre d'avancement de la séance : un segment par exercice, rempli en ember à proportion des séries faites. */
export function SessionProgress({ fractions, current, className }: SessionProgressProps) {
  const total = fractions.length
  return (
    <div
      role="progressbar"
      aria-label={`Avancement : exercice ${current} sur ${total}`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={fractions.reduce((n, f) => n + (f >= 1 ? 1 : 0), 0)}
      className={cx('grid gap-1', className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, total)}, minmax(0, 1fr))` }}
    >
      {fractions.map((f, i) => (
        <span key={i} className="h-[5px] overflow-hidden rounded-[3px] bg-on-inverse/18">
          <span
            className="block h-full rounded-[3px] bg-ember"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%` }}
          />
        </span>
      ))}
    </div>
  )
}
