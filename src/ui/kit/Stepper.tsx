import { Minus, Plus } from 'lucide-react'
import { useId } from 'react'
import { cx } from './cx'
import { formatDecimal } from './format'

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Pas des boutons − / + (1 par défaut ; 0,5 pour des kilos par exemple). */
  step?: number
  /** Affichage de la valeur (`(v) => withUnit(v, 'kg')`). Par défaut : nombre à la française. */
  format?: (value: number) => string
  /** Titre visible de la grandeur (« Séances par semaine »). Sert aussi de nom au groupe. */
  label: string
  /** Libellés des boutons si le défaut (`Diminuer : <label>`) ne convient pas. */
  decreaseLabel?: string
  increaseLabel?: string
  disabled?: boolean
  className?: string
}

const stepButton =
  'focus-ring grid size-12 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card active:opacity-70 disabled:text-ink-faint disabled:shadow-none'

/** Nettoie les erreurs de virgule flottante (0,1 + 0,2) en arrondissant à la précision du pas. */
function snap(value: number, step: number): number {
  // Décimales du pas (toFixed accepte 0 à 100). `toFixed` sur le pas évite la notation exponentielle (1e-7) ;
  // limite : au-delà de 6 décimales, le pas est arrondi.
  const decimals = (step.toFixed(6).replace(/0+$/, '').split('.')[1] ?? '').length
  return Number(value.toFixed(decimals))
}

/** Stepper unique : valeur bornée avec boutons − / + de 48 px. Le chiffre est en Archivo, tabulaire. */
export function Stepper({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  format = (v) => formatDecimal(v, 2),
  label,
  decreaseLabel,
  increaseLabel,
  disabled = false,
  className,
}: StepperProps) {
  const id = useId()
  const set = (next: number) => onChange(Math.min(max, Math.max(min, snap(next, step))))
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <p id={id} className="mb-1.5 text-caption text-ink-muted">
        {label}
      </p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
          aria-label={decreaseLabel ?? `Diminuer : ${label}`}
        >
          <Minus size={24} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <output
          aria-live="polite"
          aria-label={`${label} : ${format(value)}`}
          className={cx(
            'min-w-16 text-center font-display text-number-l tabular-nums',
            disabled && 'text-ink-muted',
          )}
        >
          {format(value)}
        </output>
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
          aria-label={increaseLabel ?? `Augmenter : ${label}`}
        >
          <Plus size={24} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
