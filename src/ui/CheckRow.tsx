interface CheckRowProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function CheckRow({ label, hint, checked, onChange, disabled = false }: CheckRowProps) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-orange-400">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 accent-orange-400"
      />
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        {hint ? <span className="text-sm text-zinc-400">{hint}</span> : null}
      </span>
    </label>
  )
}
