import { useId } from 'react'

interface StepperProps {
  legend: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Nom de la grandeur pour les libellés des boutons (« séances par semaine »). */
  unitLabel: string
  disabled?: boolean
}

const stepButton =
  'flex size-12 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-2xl font-semibold active:bg-zinc-700 disabled:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

/** Choix d'un entier borné avec boutons − / + (cibles de 48 px). */
export function Stepper({ legend, value, min, max, onChange, unitLabel, disabled = false }: StepperProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-sm font-medium text-zinc-300">
        {legend}
      </p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
          aria-label={`Diminuer : ${unitLabel}`}
        >
          −
        </button>
        <output
          aria-live="polite"
          aria-label={`${legend} : ${value}`}
          className="min-w-12 text-center text-3xl font-bold tabular-nums"
        >
          {value}
        </output>
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`Augmenter : ${unitLabel}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
