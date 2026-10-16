import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setFoodFavorite } from '../../db'
import { macrosFor, roundMacros } from '../../domain/nutrition'
import type { Food } from '../../types'
import { Button, DecimalField, ErrorNote, Sheet, errorMessage, parseDecimal, toInputNumber } from '../../ui'
import { fmtG, macroLine } from './format'

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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/nutrition/aliments/${food.id}${contextSearch}`}
            className="flex min-h-11 items-center text-base font-semibold text-orange-400"
          >
            Voir la fiche
          </Link>
          <button
            type="button"
            aria-pressed={favorite}
            onClick={() => void toggleFavorite()}
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold active:bg-white/5"
          >
            <span aria-hidden="true" className={`text-2xl ${favorite ? 'text-orange-400' : 'text-zinc-500'}`}>
              {favorite ? '★' : '☆'}
            </span>
            {favorite ? 'Favori' : 'Mettre en favori'}
          </button>
        </div>
        <DecimalField label="Quantité" big unit="g" value={grams} onChange={setGrams} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Portions rapides">
          {shortcuts.map((g, i) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrams(toInputNumber(g))}
              className="min-h-11 rounded-xl border border-v1-line bg-v1-surface-hi px-4 text-base font-semibold active:bg-zinc-700"
            >
              {i === 0 && g === food.defaultPortionG ? `Portion ${fmtG(g)} g` : `${fmtG(g)} g`}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="min-h-6 text-base text-zinc-200" data-testid="preview">
          {valid ? macroLine(roundMacros(macrosFor(food.per100g, value))) : null}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void submit()} disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </Sheet>
  )
}
