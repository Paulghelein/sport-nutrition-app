import { cx } from './cx'

/** Interrupteur sur toute la ligne (réglage actif / inactif), 48 px. */
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-md bg-canvas px-3.5 py-2 text-left"
    >
      <span className="text-body-strong">{label}</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-ember' : 'bg-surface-sunken',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-6 rounded-full bg-surface-raised shadow-card transition-all motion-reduce:transition-none',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}
