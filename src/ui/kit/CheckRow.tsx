import { cx } from './cx'

export interface CheckRowProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** Case à cocher de formulaire sur toute la ligne (48 px). */
export function CheckRow({ label, hint, checked, onChange, disabled = false }: CheckRowProps) {
  return (
    <label
      className={cx(
        'flex min-h-12 items-center gap-3 rounded-md bg-canvas px-3.5 py-2.5',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
        disabled ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer text-ink',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 accent-ember"
      />
      <span className="flex flex-col">
        <span className="text-body-strong">{label}</span>
        {hint ? <span className="text-caption font-medium text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  )
}
