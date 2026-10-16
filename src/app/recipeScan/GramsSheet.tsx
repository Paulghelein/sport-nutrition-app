import { useState } from 'react'
import { MAX_INGREDIENT_GRAMS } from '../../domain/nutrition/limits'
import type { ScanIngredient } from '../../types'
import { Button } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Sheet } from '../../ui/kit/Sheet'
import { formatDecimal } from '../../ui/kit/format'
import { ingredientSource, parseGrams } from './draftState'

/** Quantité d'un ingrédient : champ en grammes, raccourci « paquet entier », retrait de la liste. */
export function GramsSheet({
  ingredient,
  onSave,
  onWhole,
  onRemove,
  onClose,
}: {
  ingredient: ScanIngredient
  onSave: (grams: number) => void
  onWhole: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(formatDecimal(ingredient.grams, 2).replace(/\s/g, ''))
  const [touched, setTouched] = useState(false)
  const grams = parseGrams(text)
  const invalid = touched && grams === null
  return (
    <Sheet title={ingredient.name} description={ingredientSource(ingredient)} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (grams !== null) onSave(grams)
        }}
      >
        <TextField
          label="Quantité"
          value={text}
          onChange={(v) => {
            setText(v)
            setTouched(true)
          }}
          unit="g"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          aria-invalid={invalid}
          hint={
            invalid
              ? `Entre une quantité supérieure à 0 et au plus ${MAX_INGREDIENT_GRAMS} g.`
              : 'En grammes (millilitres pour un liquide, à peu près).'
          }
        />
        {ingredient.packageG !== undefined ? (
          <Button variant="secondary" fullWidth onClick={onWhole}>
            Paquet entier ({formatDecimal(ingredient.packageG, 2)} g)
          </Button>
        ) : null}
        <Button type="submit" fullWidth disabled={grams === null}>
          Enregistrer
        </Button>
        <Button variant="text" fullWidth onClick={onRemove} className="min-h-11">
          Retirer de la recette
        </Button>
      </form>
    </Sheet>
  )
}
