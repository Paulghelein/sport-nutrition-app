import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  MAX_FRIDGE_DAYS,
  MAX_RECIPE_NAME_LENGTH,
  createRecipe,
  updateRecipe,
  validateRecipeInput,
} from '../../db'
import {
  AISLE_LABELS,
  AISLE_ORDER,
  emptyRecipeInput,
  recipeContentEquals,
  recipeNutrition,
  roundMacros,
  toRecipeInput,
  DEFAULT_FRIDGE_DAYS,
} from '../../domain/nutrition'
import type { Aisle, Food, FoodLookup, LibraryRecipe, MealSlot, Recipe } from '../../types'
import { Button, Card, ErrorNote, IntegerField, SelectField, TextField, errorMessage } from '../../ui'
import { fmtG, fmtInt, slotChoices } from '../nutrition/format'
import { BackLink } from '../nutrition/parts'
import { LineListEditor } from '../training/LineListEditor'
import { FoodPickerSheet } from './FoodPickerSheet'
import {
  CiqualBanner,
  Loading,
  NotFound,
  RECIPES_PATH,
  ToggleChip,
  focusRing,
  iconButtonClass,
} from './parts'
import {
  clearRecipeDraft,
  draftToInput,
  loadRecipeDraft,
  newIngredientDraft,
  recipeToDraft,
  saveRecipeDraft,
} from './recipeDraft'
import type { IngredientDraft, RecipeDraft } from './recipeDraft'
import { useRecipeLibrary } from './useRecipes'
import type { RecipeLibraryData } from './useRecipes'

const aisleOptions = AISLE_ORDER.map((a) => ({ value: a, label: AISLE_LABELS[a] }))

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </Card>
  )
}

function linkLabel(i: IngredientDraft, lookup: FoodLookup): string | null {
  if (i.foodId === undefined && i.ciqualCode === undefined) return null
  const food =
    (i.foodId !== undefined ? lookup(i.foodId) : undefined) ??
    (i.ciqualCode !== undefined ? lookup(`ciqual-${i.ciqualCode}`) : undefined)
  return food ? food.name : 'Aliment introuvable (valeurs de repli)'
}

function IngredientEditor({
  ingredient,
  index,
  count,
  lookup,
  onChange,
  onMove,
  onRemove,
  onSearch,
}: {
  ingredient: IngredientDraft
  index: number
  count: number
  lookup: FoodLookup
  onChange: (next: IngredientDraft) => void
  onMove: (to: number) => void
  onRemove: () => void
  onSearch: () => void
}) {
  const n = index + 1
  const linked = linkLabel(ingredient, lookup)
  const v = ingredient.values
  const setValue = (k: 'kcal' | 'protein' | 'carbs' | 'fat', text: string) =>
    v && onChange({ ...ingredient, values: { ...v, [k]: text.replace(/[^\d.,]/g, '') } })
  return (
    <li className="rounded-2xl border border-v1-line bg-v1-surface-hi p-3">
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <TextField
          label={`Ingrédient ${n}`}
          value={ingredient.name}
          onChange={(name) => onChange({ ...ingredient, name })}
          autoComplete="off"
        />
        <TextField
          label={`Quantité ${n}`}
          unit="g"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={ingredient.grams}
          onChange={(grams) => onChange({ ...ingredient, grams })}
        />
      </div>
      <div className="mt-3">
        <SelectField
          label={`Rayon ${n}`}
          value={ingredient.aisle}
          options={aisleOptions}
          onChange={(aisle: Aisle) => onChange({ ...ingredient, aisle })}
        />
      </div>
      <div className="mt-3 rounded-xl border border-v1-line bg-v1-surface px-3 py-2.5">
        {linked !== null ? (
          <p className="text-base">
            <span className="text-zinc-400">Relié à : </span>
            <span className="font-medium">{linked}</span>
          </p>
        ) : v ? (
          <p className="text-base text-zinc-200">Valeurs pour 100 g saisies à la main.</p>
        ) : (
          <p className="text-base text-amber-300">Aucune donnée nutritionnelle : compte pour 0.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            width="auto"
            onClick={onSearch}
            aria-label={`Relier l’ingrédient ${n} à un aliment`}
          >
            {linked !== null ? 'Changer d’aliment' : 'Chercher un aliment'}
          </Button>
          {v === undefined ? (
            <Button
              variant="ghost"
              width="auto"
              aria-label={`Saisir les valeurs de l’ingrédient ${n}`}
              onClick={() =>
                onChange({
                  ...ingredient,
                  values: { kcal: '', protein: '', carbs: '', fat: '' },
                })
              }
            >
              Saisir pour 100 g
            </Button>
          ) : (
            <Button
              variant="ghost"
              width="auto"
              aria-label={`Retirer les valeurs de l’ingrédient ${n}`}
              onClick={() => {
                const rest = { ...ingredient }
                delete rest.values
                onChange(rest)
              }}
            >
              Retirer les valeurs
            </Button>
          )}
          {linked !== null ? (
            <Button
              variant="ghost"
              width="auto"
              aria-label={`Délier l’ingrédient ${n}`}
              onClick={() => {
                const rest = { ...ingredient }
                delete rest.foodId
                delete rest.ciqualCode
                onChange(rest)
              }}
            >
              Délier
            </Button>
          ) : null}
        </div>
        {v ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ['kcal', 'Calories (kcal)'],
                ['protein', 'Protéines (g)'],
                ['carbs', 'Glucides (g)'],
                ['fat', 'Lipides (g)'],
              ] as const
            ).map(([k, label]) => (
              <TextField
                key={k}
                label={`${label} / 100 g`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={v[k]}
                onChange={(t) => setValue(k, t)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          className={iconButtonClass}
          disabled={index === 0}
          aria-label={`Monter l’ingrédient ${n}`}
          onClick={() => onMove(index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={iconButtonClass}
          disabled={index === count - 1}
          aria-label={`Descendre l’ingrédient ${n}`}
          onClick={() => onMove(index + 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Supprimer l’ingrédient ${n}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
    </li>
  )
}

function LiveMacros({ draft, lookup }: { draft: RecipeDraft; lookup: FoodLookup }) {
  const nutrition = useMemo(() => {
    const input = draftToInput(draft)
    const safe: Recipe = {
      ...input,
      id: 'draft',
      source: 'user',
      updatedAt: '',
      servings: Number.isFinite(input.servings) && input.servings > 0 ? input.servings : 1,
      // Une quantité illisible compte pour 0 le temps de la saisie.
      ingredients: input.ingredients.map((i) => ({ ...i, grams: Number.isFinite(i.grams) ? i.grams : 0 })),
    }
    return recipeNutrition(safe, lookup)
  }, [draft, lookup])
  const m = roundMacros(nutrition.perServing)
  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-3"
      data-testid="live-macros"
    >
      <p className="text-sm font-medium text-zinc-300">Par portion (calculé en direct)</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {fmtInt(m.kcal)} kcal
        <span className="ml-2 text-base font-medium text-zinc-300">
          P {fmtG(m.protein)} · G {fmtG(m.carbs)} · L {fmtG(m.fat)}
        </span>
      </p>
      {nutrition.missing.length > 0 ? (
        <p className="mt-1 text-sm text-amber-300">Sans données : {nutrition.missing.join(', ')}.</p>
      ) : null}
    </div>
  )
}

function RecipeForm({ current, lib }: { current: LibraryRecipe | null; lib: RecipeLibraryData }) {
  const navigate = useNavigate()
  const draftKey = current?.id ?? 'new'
  const base = () => recipeToDraft(current ? toRecipeInput(current) : emptyRecipeInput())
  const [restored] = useState(() => loadRecipeDraft(draftKey))
  const [draft, setDraftState] = useState<RecipeDraft>(() => restored ?? base())
  const [showRestored, setShowRestored] = useState(restored !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchFor, setSearchFor] = useState<string | null>(null)

  const setDraft = (next: RecipeDraft) => {
    setError(null)
    setDraftState(next)
    // Brouillon conservé tant que le formulaire n'est pas enregistré (retour accidentel, changement d'onglet).
    saveRecipeDraft(draftKey, next)
  }
  const patch = (changes: Partial<RecipeDraft>) => setDraft({ ...draft, ...changes })
  const setIngredient = (key: string, next: IngredientDraft) =>
    patch({ ingredients: draft.ingredients.map((i) => (i.key === key ? next : i)) })
  const moveIngredient = (from: number, to: number) => {
    const list = [...draft.ingredients]
    list.splice(to, 0, ...list.splice(from, 1))
    patch({ ingredients: list })
  }

  const pickFood = (key: string, food: Food) => {
    const target = draft.ingredients.find((i) => i.key === key)
    if (!target) return
    const next: IngredientDraft = {
      key,
      name: target.name.trim() === '' ? food.name : target.name,
      grams: target.grams,
      aisle: food.aisle ?? target.aisle,
      // Les valeurs saisies restent comme repli (la recherche d'un aliment ne les efface pas).
      ...(target.values ? { values: target.values } : {}),
      // Un aliment Ciqual est relié par son code, un aliment perso ou OFF par son id.
      ...(food.source === 'ciqual' && food.ciqualCode !== undefined
        ? { ciqualCode: food.ciqualCode }
        : { foodId: food.id }),
    }
    patch({ ingredients: draft.ingredients.map((i) => (i.key === key ? next : i)) })
    setSearchFor(null)
  }

  const save = async () => {
    const input = draftToInput(draft)
    const message = validateRecipeInput(input)
    if (message) {
      setError(message)
      return
    }
    // Rien n'a changé : retour à la fiche sans créer de surcharge.
    if (current && recipeContentEquals(input, toRecipeInput(current))) {
      clearRecipeDraft(draftKey)
      navigate(`/nutrition/recettes/${current.id}`, { replace: true })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = current ? await updateRecipe(current, input) : await createRecipe(input)
      clearRecipeDraft(draftKey)
      navigate(`/nutrition/recettes/${saved.id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer la recette. Réessaie.'))
      setBusy(false)
    }
  }

  const restart = () => {
    clearRecipeDraft(draftKey)
    setDraftState(base())
    setShowRestored(false)
    setError(null)
  }

  const searching = draft.ingredients.find((i) => i.key === searchFor)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      noValidate
    >
      <BackLink to={current ? `/nutrition/recettes/${current.id}` : RECIPES_PATH}>
        {current ? 'Fiche' : 'Recettes'}
      </BackLink>
      <h1 className="mt-1 text-3xl font-bold">{current ? 'Modifier la recette' : 'Nouvelle recette'}</h1>
      {current?.source === 'seed' ? (
        <p className="mt-2 text-base text-zinc-400">
          Ta version remplacera l’original ; tu pourras le rétablir.
        </p>
      ) : null}
      <CiqualBanner failed={lib.ciqualFailed} onRetry={lib.retry} />
      {showRestored ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2.5 text-base text-orange-100">
          <span role="status">Brouillon retrouvé.</span>
          <button
            type="button"
            onClick={restart}
            className="min-h-11 shrink-0 px-2 font-semibold text-orange-300 underline"
          >
            Repartir de zéro
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-5">
        <FormSection title="Général">
          <TextField
            label="Nom"
            value={draft.name}
            onChange={(name) => patch({ name })}
            maxLength={MAX_RECIPE_NAME_LENGTH}
            autoComplete="off"
          />
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-sm font-medium text-zinc-300">Repas</legend>
            <div className="flex flex-wrap gap-2">
              {slotChoices.map((s) => (
                <ToggleChip
                  key={s.value}
                  label={s.label}
                  checked={draft.meal.includes(s.value)}
                  onChange={(on) =>
                    patch({
                      meal: on
                        ? slotChoices
                            .map((c) => c.value)
                            .filter((v: MealSlot) => v === s.value || draft.meal.includes(v))
                        : draft.meal.filter((m) => m !== s.value),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
          <IntegerField
            label="Portions"
            value={draft.servings}
            onChange={(servings) => patch({ servings })}
          />
          <div className="grid grid-cols-2 gap-3">
            <IntegerField
              label="Préparation"
              unit="min"
              value={draft.prepMinutes}
              onChange={(prepMinutes) => patch({ prepMinutes })}
            />
            <IntegerField
              label="Cuisson"
              unit="min"
              value={draft.cookMinutes}
              onChange={(cookMinutes) => patch({ cookMinutes })}
            />
          </div>
          <IntegerField
            label="Conservation au frigo"
            unit="jours"
            value={draft.fridgeDays}
            onChange={(fridgeDays) => patch({ fridgeDays })}
            hint={`Vide : ${DEFAULT_FRIDGE_DAYS} jours. Maximum ${MAX_FRIDGE_DAYS}.`}
          />
          <TextField
            label="Étiquettes"
            hint="Séparées par des virgules : batch, rapide…"
            value={draft.tags}
            onChange={(tags) => patch({ tags })}
            autoComplete="off"
          />
        </FormSection>

        <FormSection title="Ingrédients">
          <p className="-mt-2 text-sm text-zinc-400">
            Quantités en grammes, pour toute la recette (poids cru).
          </p>
          <LiveMacros draft={draft} lookup={lib.lookup} />
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {draft.ingredients.map((ing, i) => (
              <IngredientEditor
                key={ing.key}
                ingredient={ing}
                index={i}
                count={draft.ingredients.length}
                lookup={lib.lookup}
                onChange={(next) => setIngredient(ing.key, next)}
                onMove={(to) => moveIngredient(i, to)}
                onRemove={() => patch({ ingredients: draft.ingredients.filter((x) => x.key !== ing.key) })}
                onSearch={() => setSearchFor(ing.key)}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => patch({ ingredients: [...draft.ingredients, newIngredientDraft()] })}
            className={`min-h-11 rounded-xl px-3 text-base font-semibold text-orange-400 active:bg-white/5 ${focusRing}`}
          >
            + Ajouter un ingrédient
          </button>
        </FormSection>

        <FormSection title="Étapes">
          <LineListEditor
            legend="Étapes de la recette"
            itemLabel="Étape"
            addLabel="Ajouter une étape"
            numbered
            maxItems={30}
            maxLength={600}
            items={draft.steps}
            onChange={(steps) => patch({ steps })}
          />
        </FormSection>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" disabled={busy}>
          {current ? 'Enregistrer les modifications' : 'Créer la recette'}
        </Button>
      </div>

      {searching && searchFor ? (
        <FoodPickerSheet
          index={lib.index}
          initialQuery={searching.name}
          onPick={(food) => pickFood(searchFor, food)}
          onClose={() => setSearchFor(null)}
        />
      ) : null}
    </form>
  )
}

export default function RecipeFormScreen() {
  const { id } = useParams()
  const { data, error } = useRecipeLibrary()

  if (error) {
    return (
      <section>
        <BackLink to={RECIPES_PATH}>Recettes</BackLink>
        <div className="mt-3">
          <ErrorNote>Impossible de lire les recettes. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      </section>
    )
  }
  if (!data) return <Loading />
  if (id === undefined) return <RecipeForm current={null} lib={data} />
  const current = data.recipes.find((r) => r.id === id)
  if (!current) return <NotFound message="Cette recette n’existe pas ou a été supprimée." />
  return <RecipeForm key={current.id} current={current} lib={data} />
}
