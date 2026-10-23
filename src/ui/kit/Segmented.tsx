import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from './cx'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Nom du groupe pour les lecteurs d'écran (« Durée »). */
  ariaLabel: string
  disabled?: boolean
  /** Nombre de colonnes (par défaut : une seule rangée). Au-delà d'une rangée, la piste est moins arrondie. */
  columns?: number
}

/** Choix exclusif en piste arrondie (durée 20 / 30 / 45 / 60 min). Flèches pour changer de choix. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  columns,
}: SegmentedProps<T>) {
  const cols = columns ?? options.length
  const refs = useRef(new Map<T, HTMLButtonElement>())
  // Valeur hors liste : le premier choix reste atteignable au clavier.
  const hasSelected = options.some((o) => o.value === value)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Valeur hors liste : → va au premier, ← au dernier.
    const i = options.findIndex((o) => o.value === value)
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0 || disabled) return
    e.preventDefault()
    const next =
      options[i < 0 ? (step > 0 ? 0 : options.length - 1) : (i + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    refs.current.get(next.value)?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx('grid gap-1.5 bg-canvas p-1', cols < options.length ? 'rounded-lg' : 'rounded-full')}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o, idx) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              if (el) refs.current.set(o.value, el)
              else refs.current.delete(o.value)
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected || (idx === 0 && !hasSelected) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'focus-ring min-h-11 rounded-full font-sans text-body-sm disabled:text-ink-muted',
              selected
                ? 'bg-surface font-bold text-ink shadow-card'
                : 'bg-transparent font-semibold text-ink-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
