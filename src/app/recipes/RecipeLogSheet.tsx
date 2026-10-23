import { useState } from 'react'
import { logRecipeEntries } from '../../db'
import { recipeLogEntry, roundMacros } from '../../domain/nutrition'
import { formatDateFr, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type {
  FoodLogEntry,
  FridgeItem,
  Id,
  LibraryRecipe,
  LocalDate,
  MealSlot,
  RecipeNutrition,
} from '../../types'
import { errorMessage } from '../../ui'
import { Button, Sheet, Stepper } from '../../ui/kit'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { macroLine, slotChoices, slotForNow } from '../nutrition/format'
import { portionsText } from './format'

export interface RecipeLogSheetProps {
  recipe: LibraryRecipe
  /** Résultat de `recipeNutrition(recipe, lookup)` : les macros du log sont figées depuis `perServing`. */
  nutrition: RecipeNutrition
  /** Lignes du frigo pour cette recette (les autres sont ignorées). Vide : pas de choix « depuis le frigo ». */
  fridge?: readonly FridgeItem[]
  initialDate?: LocalDate
  initialSlot?: MealSlot
  /** Ligne du frigo présélectionnée. Sans elle, la plus proche de la péremption l'est quand il y en a. */
  initialFridgeItemId?: Id
  onClose: () => void
  /** Base d'aliments non chargée : les macros sont incomplètes, l'ajout est bloqué. */
  ciqualFailed?: boolean
  /** `fridgeBefore` : lignes du frigo avant le log (pour `undoRecipeEntries`). */
  onLogged?: (entries: FoodLogEntry[], fridgeBefore: FridgeItem[]) => void
}

const NO_FRIDGE = 'none'

/**
 * Feuille « Loguer une portion » (Recettes, Frigo, fiche, mode cuisine, sélecteur de recettes du journal). Jour, repas, portions (0,5 à 4), et origine frigo.
 * Réutilisable par le journal : elle écrit elle-même via `logRecipeEntries` (le frigo est décrémenté dans la même
 * transaction) puis appelle `onLogged`.
 */
export function RecipeLogSheet({
  recipe,
  nutrition,
  fridge = [],
  initialDate,
  initialSlot,
  initialFridgeItemId,
  ciqualFailed = false,
  onClose,
  onLogged,
}: RecipeLogSheetProps) {
  const mine = fridge
    .filter((f) => f.recipeId === recipe.id)
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0))
  const [date, setDate] = useState<string>(initialDate ?? toLocalDate(new Date()))
  const [slot, setSlot] = useState<MealSlot>(
    () =>
      initialSlot ?? (recipe.meal.includes(slotForNow()) ? slotForNow() : (recipe.meal[0] ?? slotForNow())),
  )
  const [wanted, setPortions] = useState(1)
  const [origin, setOrigin] = useState<string>(() => {
    if (initialFridgeItemId !== undefined && mine.some((f) => f.id === initialFridgeItemId)) {
      return initialFridgeItemId
    }
    return mine[0]?.id ?? NO_FRIDGE
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromFridge = mine.find((f) => f.id === origin)
  // Depuis le frigo : jamais plus que ce qu'il reste (au moins 0,5, le frigo est alors vidé).
  const maxPortions = fromFridge ? Math.max(0.5, Math.min(4, Math.floor(fromFridge.portionsLeft * 2) / 2)) : 4
  const portions = Math.min(wanted, maxPortions)
  const m = roundMacros({
    kcal: nutrition.perServing.kcal * portions,
    protein: nutrition.perServing.protein * portions,
    carbs: nutrition.perServing.carbs * portions,
    fat: nutrition.perServing.fat * portions,
  })

  const submit = async () => {
    if (!isValidLocalDate(date)) {
      setError('Choisis une date valide.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const entry = recipeLogEntry(
        recipe,
        nutrition,
        {
          recipeId: recipe.id,
          portions,
          date,
          slot,
          ...(fromFridge ? { fridgeItemId: fromFridge.id } : {}),
        },
        { id: crypto.randomUUID(), createdAt: new Date().toISOString() },
      )
      const saved = await logRecipeEntries([entry])
      onLogged?.(saved, fromFridge ? [{ ...fromFridge }] : [])
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter au journal. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Loguer une portion" description={recipe.name} onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-5">
        <TextField label="Jour" type="date" value={date} onChange={setDate} />
        <ChoiceGroup<MealSlot>
          legend="Repas"
          layout="grid"
          value={slot}
          options={slotChoices}
          onChange={setSlot}
        />
        <Stepper
          label="Portions"
          value={portions}
          min={0.5}
          max={maxPortions}
          step={0.5}
          onChange={setPortions}
        />
        {mine.length > 0 ? (
          <ChoiceGroup<string>
            legend="Origine"
            layout="stack"
            value={origin}
            onChange={setOrigin}
            options={[
              ...mine.map((f) => ({
                value: f.id,
                label: 'Depuis le frigo',
                hint: `Reste ${portionsText(f.portionsLeft, recipe.servingUnit)} · jusqu’au ${formatDateFr(f.expiresOn)}`,
              })),
              { value: NO_FRIDGE, label: 'Pas depuis le frigo', hint: 'Le frigo reste inchangé.' },
            ]}
          />
        ) : null}
        <p aria-live="polite" className="m-0 min-h-6 text-body-strong" data-testid="log-preview">
          {macroLine(m)}
        </p>
        {ciqualFailed ? (
          <Note tone="error">
            Base d’aliments non chargée : les macros seraient fausses. Réessaie depuis la liste des recettes.
          </Note>
        ) : nutrition.missing.length > 0 ? (
          <Note tone="warning">Macros incomplètes : sans données pour {nutrition.missing.join(', ')}.</Note>
        ) : null}
        {error ? <Note tone="error">{error}</Note> : null}
        <Button fullWidth onClick={() => void submit()} disabled={busy || ciqualFailed}>
          Ajouter au journal
        </Button>
      </div>
    </Sheet>
  )
}
