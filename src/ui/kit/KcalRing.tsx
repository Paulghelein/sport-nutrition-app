import { formatInt } from './format'

export interface KcalRingProps {
  /** Calories consommées. */
  consumed: number
  /** Objectif du jour. */
  target: number
  /** Diamètre en px (96 par défaut). */
  size?: number
}

const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Anneau de calories : reste au centre en Archivo. Au-delà de l'objectif, l'anneau est plein et le texte l'indique. */
export function KcalRing({ consumed, target, size = 96 }: KcalRingProps) {
  const remaining = Math.round(target - consumed)
  const over = remaining < 0
  const ratio = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0
  return (
    <div
      role="img"
      aria-label={
        over
          ? `${formatInt(-remaining)} kcal au-dessus de l'objectif de ${formatInt(target)} kcal`
          : `${formatInt(remaining)} kcal restantes sur ${formatInt(target)} kcal`
      }
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className="-rotate-90">
        <circle cx="48" cy="48" r={RADIUS} fill="none" strokeWidth="10" className="stroke-surface-sunken" />
        {ratio > 0 && (
          <circle
            cx="48"
            cy="48"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className="stroke-ember"
          />
        )}
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-title font-extrabold leading-[22px] tabular-nums">
          {formatInt(Math.abs(remaining))}
        </span>
        <span className="text-tiny font-medium leading-normal text-ink-muted">
          {over ? 'en trop' : 'restantes'}
        </span>
      </div>
    </div>
  )
}
