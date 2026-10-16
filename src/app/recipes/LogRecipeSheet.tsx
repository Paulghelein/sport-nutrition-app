// v1 (sombre) : ne sert plus que le sélecteur de recettes du journal (RecipePickerSheet). Les écrans Recettes, Frigo,
// fiche et mode cuisine utilisent RecipeLogSheet (v2). À supprimer en R5 avec RecipePickerSheet.
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
import { Button, ChoiceGroup, DateField, ErrorNote, Sheet, errorMessage } from '../../ui'
import { macroLine, slotChoices, slotForNow } from '../nutrition/format'
import { fmtPortions, portionsWord } from './format'
import { PortionsStepper } from './parts'

export interface LogRecipeSheetProps {
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
 * Feuille « Loguer une portion » : jour, repas, portions (0,5 à 4), et origine frigo.
 * Réutilisable par le journal : elle écrit elle-même via `logRecipeEntries` (le frigo est décrémenté dans la même
 * transaction) puis appelle `onLogged`.
 */
export function LogRecipeSheet({
  recipe,
  nutrition,
  fridge = [],
  initialDate,
  initialSlot,
  initialFridgeItemId,
  ciqualFailed = false,
  onClose,
  onLogged,
}: LogRecipeSheetProps) {
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
    <Sheet title="Loguer une portion" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-5">
        <p className="-mt-2 text-base text-zinc-300">{recipe.name}</p>
        <DateField label="Jour" value={date} onChange={setDate} />
        <ChoiceGroup<MealSlot>
          legend="Repas"
          layout="grid"
          value={slot}
          options={slotChoices}
          onChange={setSlot}
        />
        <PortionsStepper
          legend="Portions"
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
                hint: `${fmtPortions(f.portionsLeft)} ${portionsWord(f.portionsLeft)} restante${f.portionsLeft >= 2 ? 's' : ''} · jusqu’au ${formatDateFr(f.expiresOn)}`,
              })),
              { value: NO_FRIDGE, label: 'Pas depuis le frigo', hint: 'Le frigo reste inchangé.' },
            ]}
          />
        ) : null}
        <p aria-live="polite" className="min-h-6 text-base text-zinc-200" data-testid="log-preview">
          {macroLine(m)}
        </p>
        {ciqualFailed ? (
          <ErrorNote>
            Base d’aliments non chargée : les macros seraient fausses. Réessaie depuis la liste des recettes.
          </ErrorNote>
        ) : nutrition.missing.length > 0 ? (
          <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            Macros incomplètes : sans données pour {nutrition.missing.join(', ')}.
          </p>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void submit()} disabled={busy || ciqualFailed}>
          Ajouter au journal
        </Button>
      </div>
    </Sheet>
  )
}
