import { useId } from 'react'

export interface Choice<T extends string | number> {
  value: T
  label: string
  /** Phrase d'explication (affichée sous le libellé, mise en page empilée). */
  hint?: string
}

interface ChoiceGroupProps<T extends string | number> {
  legend: string
  value: T
  options: readonly Choice<T>[]
  onChange: (value: T) => void
  /** `row` : boutons côte à côte ; `grid` : deux colonnes ; `stack` : cartes empilées avec explication. */
  layout?: 'row' | 'stack' | 'grid'
}

/** Choix unique : vrais boutons radio (accessibles au clavier et à VoiceOver), habillés en segments. */
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
      <legend className="mb-1.5 p-0 text-sm font-medium text-zinc-300">{legend}</legend>
      <div
        className={
          layout === 'row'
            ? 'flex gap-2'
            : layout === 'grid'
              ? 'grid grid-cols-2 gap-2'
              : 'flex flex-col gap-2'
        }
      >
        {options.map((option) => (
          <label
            key={String(option.value)}
            className={`flex min-h-12 min-w-0 cursor-pointer rounded-xl border border-line bg-surface-hi py-2.5 has-checked:border-orange-400 has-checked:bg-orange-400/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-orange-400 ${
              layout === 'stack'
                ? 'flex-col justify-center px-3'
                : `items-center justify-center px-1.5 text-center ${layout === 'row' ? 'flex-1' : ''}`
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="text-base font-semibold">{option.label}</span>
            {option.hint ? <span className="text-sm text-zinc-400">{option.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
