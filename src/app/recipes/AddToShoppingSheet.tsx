import { useState } from 'react'
import type { LibraryRecipe, Recipe } from '../../types'
import { Button, ErrorNote, Sheet, errorMessage } from '../../ui'
import { PortionsStepper } from './parts'
import { addRecipeToList } from './shoppingList'

/** « Ajouter aux courses » : ajoute la recette (portions cumulées) à la liste courante, cochés conservés. */
export function AddToShoppingSheet({
  recipe,
  allRecipes,
  onClose,
  onDone,
}: {
  recipe: LibraryRecipe
  allRecipes: readonly Recipe[]
  onClose: () => void
  onDone: () => void
}) {
  const [portions, setPortions] = useState(recipe.servings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await addRecipeToList(recipe, portions, allRecipes)
      onDone()
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter aux courses. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Ajouter aux courses" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-5">
        <p className="-mt-2 text-base text-zinc-300">{recipe.name}</p>
        <PortionsStepper
          legend="Portions à acheter"
          value={portions}
          min={1}
          max={50}
          step={1}
          onChange={setPortions}
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void submit()} disabled={busy}>
          Ajouter à la liste
        </Button>
      </div>
    </Sheet>
  )
}
