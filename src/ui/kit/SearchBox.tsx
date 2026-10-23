import { Search, X } from 'lucide-react'

export interface SearchBoxProps {
  id: string
  /** Nom accessible (étiquette masquée) et texte d'aide du champ. */
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  autoFocus?: boolean
}

/** Champ de recherche v2 : loupe, saisie 16 px (pas de zoom iOS), bouton effacer de 44 px. */
export function SearchBox({ id, label, value, onChange, onClear, autoFocus }: SearchBoxProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        id={id}
        type="search"
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring min-h-12 w-full appearance-none rounded-ds-md bg-surface pl-11 pr-11 font-sans text-input text-ink shadow-card placeholder:text-ink-muted [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value !== '' ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={onClear}
          className="focus-ring absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-muted"
        >
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
