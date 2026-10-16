import { cx } from './cx'
import { formatInt } from './format'

export type MacroKind = 'protein' | 'carbs' | 'fat'

const MACRO: Record<MacroKind, { label: string; fill: string; dot: string }> = {
  protein: { label: 'Protéines', fill: 'bg-protein', dot: 'bg-protein' },
  carbs: { label: 'Glucides', fill: 'bg-carbs', dot: 'bg-carbs' },
  fat: { label: 'Lipides', fill: 'bg-fat', dot: 'bg-fat' },
}

export interface MacroBarProps {
  kind: MacroKind
  /** Grammes consommés. */
  value: number
  /** Objectif en grammes. */
  target: number
  className?: string
}

/** Barre de macro : mot (jamais la couleur seule), valeur en Archivo, piste `surface-sunken`. */
export function MacroBar({ kind, value, target, className }: MacroBarProps) {
  const { label, fill } = MACRO[kind]
  const ratio = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between text-caption font-semibold">
        <span>{label}</span>
        <span className="font-display tabular-nums">
          {formatInt(value)}
          <span className="font-sans font-medium text-ink-muted">{`\u00a0/ ${formatInt(target)}\u00a0g`}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(target, value, 1)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${formatInt(value)} sur ${formatInt(target)} g`}
        className="h-1.5 rounded-full bg-surface-sunken"
      >
        <div className={cx('h-1.5 rounded-full', fill)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}
