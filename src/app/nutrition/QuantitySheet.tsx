import { Star } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setFoodFavorite } from '../../db'
import { macrosFor, roundMacros } from '../../domain/nutrition'
import type { Food } from '../../types'
import { errorMessage, parseDecimal, toInputNumber } from '../../ui'
import { Button } from '../../ui/kit/Button'
import { DecimalField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { Sheet } from '../../ui/kit/Sheet'
import { formatDecimal } from '../../ui/kit/format'
import { foodPath } from '../routes'
import { macroLine } from './format'

/** Quantité en grammes d'un aliment : raccourcis de portion, aperçu des macros en direct, favori. */
export function QuantitySheet({
  food,
  contextSearch = '',
  initialGrams,
  submitLabel = 'Ajouter',
  onSubmit,
  onClose,
}: {
  food: Food
  /** `?repas=…&date=…` : transmis à la fiche pour que le retour retrouve le bon jour et le bon repas. */
  contextSearch?: string
  initialGrams: number
  submitLabel?: string
  onSubmit: (grams: number) => Promise<void>
  onClose: () => void
}) {
  const [grams, setGrams] = useState(toInputNumber(initialGrams))
  const [favorite, setFavorite] = useState(food.favorite)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const value = parseDecimal(grams)
  const valid = value > 0
  const shortcuts = [
    ...(food.defaultPortionG !== undefined ? [food.defaultPortionG] : []),
    ...[50, 100, 150, 200].filter((g) => g !== food.defaultPortionG),
  ]

  const toggleFavorite = async () => {
    setError(null)
    try {
      const next = await setFoodFavorite({ ...food, favorite }, !favorite)
      setFavorite(next.favorite)
    } catch (e) {
      setError(errorMessage(e, 'Impossible de changer le favori.'))
    }
  }

  const submit = async () => {
    if (!valid) {
      setError('Indique une quantité en grammes supérieure à 0.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title={food.name} onClose={onClose} busy={busy}>
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`${foodPath(food.id)}${contextSearch}`}
          className="focus-ring flex min-h-11 items-center rounded-full text-body-strong text-ember-ink"
        >
          Voir la fiche
        </Link>
        <button
          type="button"
          aria-pressed={favorite}
          onClick={() => void toggleFavorite()}
          className="focus-ring flex min-h-11 items-center gap-2 rounded-full px-3 text-body-strong text-ink active:opacity-70"
        >
          <Star
            size={22}
            strokeWidth={1.75}
            aria-hidden="true"
            className={favorite ? 'fill-ember text-ember-ink' : 'text-ink-muted'}
          />
          {favorite ? 'Favori' : 'Mettre en favori'}
        </button>
      </div>
      <DecimalField
        label="Quantité"
        unit="g"
        value={grams}
        onChange={setGrams}
        className="[&_input]:min-h-14 [&_input]:text-title [&_input]:font-bold"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Portions rapides">
        {shortcuts.map((g, i) => (
          <Button
            key={g}
            variant={valid && value === g ? 'dark' : 'flat'}
            aria-pressed={valid && value === g}
            onClick={() => setGrams(toInputNumber(g))}
          >
            {i === 0 && g === food.defaultPortionG
              ? `Portion ${formatDecimal(g)} g`
              : `${formatDecimal(g)} g`}
          </Button>
        ))}
      </div>
      <p aria-live="polite" className="m-0 min-h-6 text-body-strong" data-testid="preview">
        {valid ? macroLine(roundMacros(macrosFor(food.per100g, value))) : null}
      </p>
      {error ? <Note tone="error">{error}</Note> : null}
      <Button fullWidth onClick={() => void submit()} disabled={busy}>
        {submitLabel}
      </Button>
    </Sheet>
  )
}
