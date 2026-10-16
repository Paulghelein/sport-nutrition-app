import { useState } from 'react'
import { prepareFridge } from '../../db'
import { fridgeItemFromPrep } from '../../domain/nutrition'
import { formatDateFr, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { FridgeItem, LibraryRecipe } from '../../types'
import { Button, DateField, ErrorNote, Sheet, errorMessage } from '../../ui'
import { PortionsStepper } from './parts'

/** « Préparer pour le frigo » : portions préparées et date ; la date limite vient de la conservation de la recette. */
export function PrepareFridgeSheet({
  recipe,
  initialPortions,
  onClose,
  onDone,
}: {
  recipe: LibraryRecipe
  initialPortions?: number
  onClose: () => void
  onDone?: (item: FridgeItem) => void
}) {
  const [portions, setPortions] = useState(initialPortions ?? recipe.servings)
  const [date, setDate] = useState<string>(toLocalDate(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = isValidLocalDate(date)
    ? fridgeItemFromPrep({ recipeId: recipe.id, portions, preparedOn: date }, recipe, 'preview')
    : null

  const submit = async () => {
    if (!preview) {
      setError('Choisis une date valide.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await prepareFridge({ ...preview, id: crypto.randomUUID() })
      onDone?.(saved)
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter au frigo. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Préparer pour le frigo" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-5">
        <p className="-mt-2 text-base text-zinc-300">{recipe.name}</p>
        <PortionsStepper
          legend="Portions préparées"
          value={portions}
          min={1}
          max={Math.max(recipe.servings * 2, 12)}
          step={1}
          onChange={setPortions}
        />
        <DateField label="Préparé le" value={date} onChange={setDate} />
        {preview ? (
          <p className="text-base text-zinc-200" aria-live="polite">
            À consommer avant le <strong>{formatDateFr(preview.expiresOn)}</strong>.
          </p>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void submit()} disabled={busy}>
          Mettre au frigo
        </Button>
      </div>
    </Sheet>
  )
}
