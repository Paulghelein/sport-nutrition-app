import { useId } from 'react'

interface BigStepperProps {
  label: string
  /** Valeur affichée (déjà mise en forme). */
  display: string
  unit?: string
  onDecrease: () => void
  onIncrease: () => void
  canDecrease?: boolean
  canIncrease?: boolean
  /** Taille des chiffres : `xl` pour la saisie principale d'une série. */
  size?: 'lg' | 'xl'
}

const button =
  'flex shrink-0 items-center justify-center rounded-2xl border border-v1-line bg-v1-surface-hi text-4xl font-semibold leading-none text-zinc-100 active:bg-zinc-700 disabled:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400'

/** Choix d'un nombre avec de gros boutons − / + (64 px), pensé pour des doigts moites pendant une séance. */
export function BigStepper({
  label,
  display,
  unit,
  onDecrease,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
  size = 'xl',
}: BigStepperProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="flex items-center justify-between gap-3">
      <button
        type="button"
        className={`${button} ${size === 'xl' ? 'size-16' : 'size-12'}`}
        onClick={onDecrease}
        disabled={!canDecrease}
        aria-label={`Diminuer : ${label}`}
      >
        −
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <span id={id} className="text-sm font-medium text-zinc-400">
          {label}
        </span>
        <output
          aria-label={`${label} : ${display}${unit ? ` ${unit}` : ''}`}
          className={`font-bold tabular-nums leading-none ${size === 'xl' ? 'text-6xl' : 'text-3xl'}`}
        >
          {display}
          {unit ? <span className="ml-1.5 text-xl font-semibold text-zinc-400">{unit}</span> : null}
        </output>
      </div>
      <button
        type="button"
        className={`${button} ${size === 'xl' ? 'size-16' : 'size-12'}`}
        onClick={onIncrease}
        disabled={!canIncrease}
        aria-label={`Augmenter : ${label}`}
      >
        +
      </button>
    </div>
  )
}
