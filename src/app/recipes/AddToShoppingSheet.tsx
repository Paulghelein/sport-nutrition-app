import { useState } from 'react'
import type { LibraryRecipe, Recipe } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Sheet, Stepper } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { addRecipeToList } from './shoppingList'

/** « Ajouter aux courses » (v2) : ajoute la recette (portions cumulées) à la liste courante, cochés conservés. */
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
    <Sheet title="Ajouter aux courses" description={recipe.name} onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-5">
        <Stepper label="Portions à acheter" value={portions} min={1} max={50} onChange={setPortions} />
        {error ? <Note tone="error">{error}</Note> : null}
        <Button fullWidth onClick={() => void submit()} disabled={busy}>
          Ajouter à la liste
        </Button>
      </div>
    </Sheet>
  )
}
