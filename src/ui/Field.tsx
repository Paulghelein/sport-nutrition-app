import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

const controlClass =
  'w-full rounded-xl border border-line bg-surface-hi px-3 text-zinc-100 [color-scheme:dark] placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  /** Unité affichée à droite (kg, cm…). */
  unit?: string
  /** Gros chiffres pour la saisie d'un poids. */
  big?: boolean
}

export function TextField({ label, value, onChange, hint, unit, big = false, className = '', ...input }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          className={`${controlClass} ${big ? 'min-h-16 text-4xl font-bold tabular-nums' : 'min-h-12 text-base'} ${unit ? 'pr-12' : ''}`}
          {...input}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base text-zinc-400"
          >
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Champ décimal (accepte « 72,5 »). */
export function DecimalField(props: Omit<TextFieldProps, 'type' | 'inputMode'>) {
  return <TextField {...props} type="text" inputMode="decimal" autoComplete="off" />
}

/** Champ entier. */
export function IntegerField(props: Omit<TextFieldProps, 'type' | 'inputMode'>) {
  return (
    <TextField
      {...props}
      onChange={(v) => props.onChange(v.replace(/\D/g, ''))}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
    />
  )
}

export function DateField(props: Omit<TextFieldProps, 'type' | 'inputMode'>) {
  return <TextField {...props} type="date" className={`${props.className ?? ''}`} />
}
