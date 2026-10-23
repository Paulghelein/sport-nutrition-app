import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { pillClass } from './pillClass'

export interface PillTab<T extends string> {
  id: T
  label: string
}

export interface PillTabsProps<T extends string> {
  tabs: readonly PillTab<T>[]
  value: T
  onChange: (id: T) => void
  /** Nom de la liste d'onglets pour les lecteurs d'écran. */
  ariaLabel: string
  /** Id des panneaux (`${panelIdPrefix}-${tab.id}`) pour `aria-controls`, si les panneaux existent. */
  panelIdPrefix?: string
}

/** Onglets en pastilles (Journal · Recettes · Frigo · Courses). Flèches gauche/droite pour naviguer. */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  panelIdPrefix,
}: PillTabsProps<T>) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  // Valeur hors liste : le premier onglet reste atteignable au clavier.
  const hasSelected = tabs.some((t) => t.id === value)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Valeur hors liste : → va au premier, ← au dernier.
    const i = tabs.findIndex((t) => t.id === value)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = tabs[i < 0 ? (step > 0 ? 0 : tabs.length - 1) : (i + step + tabs.length) % tabs.length]
    if (!next) return
    onChange(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
      {tabs.map((t, idx) => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el)
              else refs.current.delete(t.id)
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${t.id}` : undefined}
            tabIndex={selected || (idx === 0 && !hasSelected) ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={pillClass(selected)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
