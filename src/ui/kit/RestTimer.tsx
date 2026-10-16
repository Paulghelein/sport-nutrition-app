import type { ReactNode } from 'react'
import { cx } from './cx'

export interface RestTimerProps {
  /** Secondes restantes (0 quand le repos est fini). */
  remainingSec: number
  /** Durée totale du repos, pour l'arc de l'anneau. */
  totalSec: number
  /** Texte sous le temps (« sur 1:30 », « terminé »). */
  caption?: ReactNode
  /** Nom accessible du minuteur. */
  ariaLabel?: string
  className?: string
}

const RADIUS = 118
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Anneau de repos de 260 px sur fond sombre : l'arc ember se vide, le temps restant est en 76 px. Le temps est un
 * `role="timer"` (silencieux : aucune annonce à chaque seconde, l'écran annonce le début, les 10 dernières secondes
 * et la fin à part). Le contenu du minuteur n'est que le temps : « sur 1:30 » est à côté.
 */
export function RestTimer({
  remainingSec,
  totalSec,
  caption,
  ariaLabel = 'Temps de repos restant',
  className,
}: RestTimerProps) {
  const ratio = totalSec > 0 ? Math.min(1, Math.max(0, remainingSec / totalSec)) : 0
  return (
    <div className={cx('relative size-[260px] shrink-0', className)}>
      <svg width="260" height="260" viewBox="0 0 260 260" aria-hidden="true" className="-rotate-90">
        <circle cx="130" cy="130" r={RADIUS} fill="none" strokeWidth="10" className="stroke-on-inverse/12" />
        {ratio > 0 && (
          <circle
            cx="130"
            cy="130"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className="stroke-ember"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <span
          role="timer"
          aria-label={ariaLabel}
          className="font-display text-[76px] font-extrabold leading-[76px] tracking-[-0.02em] tabular-nums"
        >
          {clock(remainingSec)}
        </span>
        {caption ? <span className="text-caption font-semibold text-on-inverse-muted">{caption}</span> : null}
      </div>
    </div>
  )
}
