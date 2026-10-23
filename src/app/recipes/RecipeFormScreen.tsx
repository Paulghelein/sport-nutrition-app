import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MAX_FRIDGE_DAYS, createRecipe, updateRecipe, validateRecipeInput } from '../../db'
import { MAX_RECIPE_NAME_LENGTH } from '../../domain/nutrition/limits'
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
import { errorMessage } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { CheckRow } from '../../ui/kit/CheckRow'
import { IntegerField, SelectField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { slotChoices } from '../nutrition/format'
import { RECIPES_PATH, recipePath } from '../routes'
import { LineListEditor } from '../training/LineListEditor'
import { FoodPickerSheet } from './FoodPickerSheet'
import { CiqualBanner, Loading, NotFound } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { formatDecimal, formatInt } from '../../ui/kit/format'
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
    <Card padding="large" aria-label={title} className="flex flex-col gap-4">
      <h2 className="m-0 font-display text-title">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
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
  const iconButton =
    'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-ink active:opacity-70 disabled:text-ink-faint'
  return (
    <li className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
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
      <SelectField
        label={`Rayon ${n}`}
        value={ingredient.aisle}
        options={aisleOptions}
        onChange={(aisle: Aisle) => onChange({ ...ingredient, aisle })}
      />
      <div className="flex flex-col gap-2">
        {linked !== null ? (
          <p className="m-0 text-body">
            <span className="text-ink-muted">Relié à : </span>
            <span className="text-body-strong">{linked}</span>
          </p>
        ) : v ? (
          <p className="m-0 text-body">Valeurs pour 100 g saisies à la main.</p>
        ) : (
          <p className="m-0 text-body text-warning">Aucune donnée nutritionnelle : compte pour 0.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="flat" onClick={onSearch} aria-label={`Relier l’ingrédient ${n} à un aliment`}>
            {linked !== null ? 'Changer d’aliment' : 'Chercher un aliment'}
          </Button>
          {v === undefined ? (
            <Button
              variant="text"
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
              variant="text"
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
              variant="text"
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
          <div className="grid grid-cols-2 gap-2">
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={iconButton}
          disabled={index === 0}
          aria-label={`Monter l’ingrédient ${n}`}
          onClick={() => onMove(index - 1)}
        >
          <ChevronUp size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={index === count - 1}
          aria-label={`Descendre l’ingrédient ${n}`}
          onClick={() => onMove(index + 1)}
        >
          <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label={`Supprimer l’ingrédient ${n}`}
          onClick={onRemove}
        >
          <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
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
    <div aria-live="polite" className="rounded-md bg-canvas p-3.5" data-testid="live-macros">
      <p className="m-0 text-caption text-ink-muted">Par portion (calculé en direct)</p>
      <p className="m-0 mt-1 font-display text-number-l tabular-nums">
        {formatInt(m.kcal)} kcal
        <span className="ml-2 font-sans text-body font-medium text-ink-muted">
          P {formatDecimal(m.protein)} · G {formatDecimal(m.carbs)} · L {formatDecimal(m.fat)}
        </span>
      </p>
      {nutrition.missing.length > 0 ? (
        <p className="m-0 mt-1 text-caption text-warning">Sans données : {nutrition.missing.join(', ')}.</p>
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
      navigate(recipePath(current.id), { replace: true })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = current ? await updateRecipe(current, input) : await createRecipe(input)
      clearRecipeDraft(draftKey)
      navigate(recipePath(saved.id), { replace: true })
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
      className="mx-auto flex max-w-xl flex-col gap-4"
    >
      <div>
        <BackLink to={current ? recipePath(current.id) : RECIPES_PATH}>
          {current ? 'Fiche' : 'Recettes'}
        </BackLink>
      </div>
      <h1 className="m-0 font-display text-display-l">
        {current ? 'Modifier la recette' : 'Nouvelle recette'}
      </h1>
      {current?.source === 'seed' ? (
        <p className="m-0 text-body text-ink-muted">
          Ta version remplacera l’original ; tu pourras le rétablir.
        </p>
      ) : null}
      <CiqualBanner failed={lib.ciqualFailed} onRetry={lib.retry} />
      {showRestored ? (
        <Card className="flex items-center justify-between gap-3 py-2 pr-2">
          <span role="status" className="text-body">
            Brouillon retrouvé.
          </span>
          <Button variant="text" onClick={restart}>
            Repartir de zéro
          </Button>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4">
        <FormSection title="Général">
          <TextField
            label="Nom"
            value={draft.name}
            onChange={(name) => patch({ name })}
            maxLength={MAX_RECIPE_NAME_LENGTH}
            autoComplete="off"
          />
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-caption text-ink-muted">Repas</legend>
            <div className="grid grid-cols-2 gap-2">
              {slotChoices.map((s) => (
                <CheckRow
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
          <p className="-mt-2 mb-0 text-caption text-ink-muted">
            Quantités en grammes, pour toute la recette (poids cru).
          </p>
          <LiveMacros draft={draft} lookup={lib.lookup} />
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
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
          <Button
            variant="flat"
            fullWidth
            icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => patch({ ingredients: [...draft.ingredients, newIngredientDraft()] })}
          >
            Ajouter un ingrédient
          </Button>
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

      <div className="flex flex-col gap-3">
        {error ? <Note tone="error">{error}</Note> : null}
        <Button type="submit" fullWidth disabled={busy}>
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
      <section className="flex flex-col gap-3">
        <div>
          <BackLink to={RECIPES_PATH}>Recettes</BackLink>
        </div>
        <Note tone="error">Impossible de lire les recettes. Ferme l’app puis rouvre-la.</Note>
      </section>
    )
  }
  if (!data) return <Loading />
  if (id === undefined) return <RecipeForm current={null} lib={data} />
  const current = data.recipes.find((r) => r.id === id)
  if (!current) return <NotFound message="Cette recette n’existe pas ou a été supprimée." />
  return <RecipeForm key={current.id} current={current} lib={data} />
}
