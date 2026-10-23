import { useId } from 'react'
import { cx } from './cx'

export interface ChoiceOption<T extends string | number> {
  value: T
  label: string
  /** Phrase d'explication sous le libellé (mise en page `stack`). */
  hint?: string
}

export interface ChoiceGroupProps<T extends string | number> {
  legend: string
  value: T
  options: readonly ChoiceOption<T>[]
  onChange: (value: T) => void
  /** `row` : côte à côte ; `grid` : deux colonnes ; `stack` : cartes empilées avec explication. */
  layout?: 'row' | 'stack' | 'grid'
}

/**
 * Choix unique de formulaire : vrais boutons radio (clavier, VoiceOver) habillés en cases. Le choix est signalé
 * par le fond `ember-soft`, un anneau ember ET la graisse (jamais la couleur seule).
 */
export function ChoiceGroup<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  layout = 'row',
}: ChoiceGroupProps<T>) {
  const name = useId()
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-caption text-ink-muted">{legend}</legend>
      <div
        className={cx(
          layout === 'row' && 'flex gap-2',
          layout === 'grid' && 'grid grid-cols-2 gap-2',
          layout === 'stack' && 'flex flex-col gap-2',
        )}
      >
        {options.map((option) => (
          <label
            key={String(option.value)}
            className={cx(
              'flex min-h-12 min-w-0 cursor-pointer rounded-md bg-canvas py-2.5 text-ink',
              'has-checked:bg-ember-soft has-checked:font-bold has-checked:ring-2 has-checked:ring-ember',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
              layout === 'stack'
                ? 'flex-col justify-center px-3.5'
                : cx('items-center justify-center px-1.5 text-center', layout === 'row' && 'flex-1'),
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="text-body-strong">{option.label}</span>
            {option.hint ? (
              <span className="text-caption font-medium text-ink-muted">{option.hint}</span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
