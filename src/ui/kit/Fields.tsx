import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from './cx'

const controlClass =
  'focus-ring w-full rounded-md bg-canvas px-3.5 font-sans text-input text-ink placeholder:text-ink-muted'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  /** Unité affichée à droite (kg, s…). */
  unit?: string
}

/** Champ texte v2 : étiquette au-dessus, fond canvas (se pose dans une carte ou une feuille), 48 px de haut. */
export function TextField({ label, value, onChange, hint, unit, className, ...input }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-caption text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          className={cx(controlClass, 'min-h-12', unit && 'pr-12')}
          {...input}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-body text-ink-muted"
          >
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-caption text-ink-muted">
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

/** Champ entier : ne garde que les chiffres. */
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

export interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  hint?: string
}

/** Liste déroulante native (sélecteur iOS), flèche dessinée. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-caption text-ink-muted">
        {label}
      </label>
      {/* WebKit ignore min-height sur un <select> natif : hauteur fixe, apparence retirée. */}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value)
            if (next) onChange(next.value)
          }}
          aria-describedby={hint ? hintId : undefined}
          className={cx(controlClass, 'h-12 appearance-none pr-10')}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
