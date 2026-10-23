import { useId, useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  legend: string
  /** Nom d'une ligne au singulier (« étape »), pour les libellés d'accessibilité. */
  itemLabel: string
  addLabel: string
  items: string[]
  onChange: (items: string[]) => void
  numbered?: boolean
  /** Nombre maximal de lignes : « Ajouter » est désactivé une fois atteint. */
  maxItems?: number
  maxLength?: number
}

const iconButton =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-ink active:opacity-70 disabled:text-ink-faint'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/**
 * Liste de lignes de texte : ajouter, modifier, réordonner, supprimer.
 * Les lignes vides sont filtrées à l'enregistrement. Chaque ligne a une clé stable (le focus et la saisie
 * ne sautent pas quand on supprime ou déplace une ligne).
 */
export function LineListEditor({
  legend,
  itemLabel,
  addLabel,
  items,
  onChange,
  numbered = false,
  maxItems,
  maxLength,
}: Props) {
  const id = useId()
  const [keys, setKeys] = useState<number[]>(() => items.map((_, i) => i))
  const [nextKey, setNextKey] = useState(items.length)

  // La liste peut être remplacée de l'extérieur (« Repartir de zéro ») : on réaligne les clés.
  if (keys.length !== items.length) {
    const aligned = items.map((_, i) => keys[i] ?? nextKey + i)
    setKeys(aligned)
    setNextKey(nextKey + items.length)
  }

  const full = maxItems !== undefined && items.length >= maxItems
  const move = (i: number, to: number) => {
    const nextItems = [...items]
    const nextKeys = [...keys]
    nextItems.splice(to, 0, ...nextItems.splice(i, 1))
    nextKeys.splice(to, 0, ...nextKeys.splice(i, 1))
    setKeys(nextKeys)
    onChange(nextItems)
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-caption text-ink-muted">{legend}</legend>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item, i) => (
          <li key={keys[i] ?? i}>
            <div className="flex items-start gap-2">
              {numbered ? (
                <span
                  aria-hidden="true"
                  className="flex h-12 w-6 shrink-0 items-center justify-center font-display font-bold text-ink-muted"
                >
                  {i + 1}
                </span>
              ) : null}
              <textarea
                id={`${id}-${keys[i] ?? i}`}
                aria-label={`${itemLabel} ${i + 1}`}
                rows={2}
                maxLength={maxLength}
                value={item}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
                className="focus-ring min-h-12 min-w-0 flex-1 rounded-ds-md bg-canvas px-3.5 py-2.5 text-input text-ink"
              />
            </div>
            <div className={`mt-1 flex justify-end gap-2 ${numbered ? 'pl-8' : ''}`}>
              <button
                type="button"
                className={iconButton}
                disabled={i === 0}
                aria-label={`Monter ${itemLabel} ${i + 1}`}
                onClick={() => move(i, i - 1)}
              >
                <Icon>
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </Icon>
              </button>
              <button
                type="button"
                className={iconButton}
                disabled={i === items.length - 1}
                aria-label={`Descendre ${itemLabel} ${i + 1}`}
                onClick={() => move(i, i + 1)}
              >
                <Icon>
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </Icon>
              </button>
              <button
                type="button"
                className={iconButton}
                aria-label={`Supprimer ${itemLabel} ${i + 1}`}
                onClick={() => {
                  setKeys(keys.filter((_, j) => j !== i))
                  onChange(items.filter((_, j) => j !== i))
                }}
              >
                <Icon>
                  <path d="M6 6l12 12M18 6L6 18" />
                </Icon>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={full}
        onClick={() => {
          setKeys([...keys, nextKey])
          setNextKey(nextKey + 1)
          onChange([...items, ''])
        }}
        className="focus-ring mt-2 min-h-11 rounded-ds-pill px-3 text-body-strong text-ember-ink active:opacity-70 disabled:text-ink-muted"
      >
        + {addLabel}
        {full ? ` (maximum ${maxItems})` : ''}
      </button>
    </fieldset>
  )
}
