import { AlertTriangle, ChefHat, Star } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildRecipeMessage } from '../../domain/claude/context'
import { deleteRecipe, getProfile, listWeighIns, restoreRecipe, setRecipeFavorite } from '../../db'
import {
  DEFAULT_FRIDGE_DAYS,
  nutritionTargets,
  recipeContentEquals,
  recipeNutrition,
  roundMacros,
  targetWeight,
  toRecipeInput,
} from '../../domain/nutrition'
import { foodCategory, isScannedFood } from '../../domain/nutrition/category'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import type { LibraryRecipe, RecipeNutrition } from '../../types'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, FoodTile, MacroBar, StatTile, cx } from '../../ui/kit'
import { buttonClass } from '../../ui/kit/buttonClass'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { FRIDGE_PATH, SHOPPING_PATH, cookPath, editRecipePath } from '../routes'
import { SLOT_LABEL, fmtG, fmtInt } from '../nutrition/format'
import { usePhotoUrls } from '../nutrition/usePhotoUrls'
import { AddToShoppingSheet } from './AddToShoppingSheet'
import { fmtGrams, fmtMinutes, portionsText } from './format'
import { Badge, BackLink, CiqualBanner, Loading, Notice, NotFound, RECIPES_PATH } from './partsV2'
import type { NoticeState } from './partsV2'
import { loggedNotice } from './loggedNotice'
import { clearRecipeDraft } from './recipeDraft'
import { PrepareFridgeSheet } from './PrepareFridgeSheet'
import { RecipeLogSheet } from './RecipeLogSheet'
import { useFridge, useRecipeLibrary } from './useRecipes'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-label={title} padding="large" className="flex flex-col gap-3">
      <h2 className="m-0 font-display text-title">{title}</h2>
      {children}
    </Card>
  )
}

function Macros({ recipe, nutrition }: { recipe: LibraryRecipe; nutrition: RecipeNutrition }) {
  const m = roundMacros(nutrition.perServing)
  // Objectifs du jour : les barres montrent la part d'une journée que représente une portion (sans profil : chiffres seuls).
  const ref = useLiveQuery(async () => {
    const [profile, weighIns] = await Promise.all([getProfile(), listWeighIns()])
    const today = toLocalDate(new Date())
    const weight = targetWeight(weighIns, today)
    return profile && weight !== undefined ? nutritionTargets(profile, weight, today) : null
  }, [])
  const targets = ref.data ?? null
  return (
    <Card padding="large" className="flex flex-col gap-3">
      <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 text-caption text-ink-muted">
        <span className="text-label uppercase">Par portion</span>
        <span>recette pour {portionsText(recipe.servings, recipe.servingUnit)}</span>
      </p>
      <p className="m-0 font-display text-display-l tabular-nums" data-testid="kcal-per-serving">
        {fmtInt(m.kcal)} <span className="font-sans text-body font-medium text-ink-muted">kcal</span>
      </p>
      {targets ? (
        <div className="flex flex-col gap-2.5">
          <MacroBar kind="protein" value={m.protein} target={targets.protein} />
          <MacroBar kind="carbs" value={m.carbs} target={targets.carbs} />
          <MacroBar kind="fat" value={m.fat} target={targets.fat} />
          <p className="m-0 text-caption text-ink-muted">Barres : part de tes objectifs du jour.</p>
        </div>
      ) : (
        <dl className="m-0 grid grid-cols-3 divide-x divide-line">
          {(
            [
              ['Protéines', m.protein, 'bg-protein'],
              ['Glucides', m.carbs, 'bg-carbs'],
              ['Lipides', m.fat, 'bg-fat'],
            ] as const
          ).map(([label, value, dot]) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <dt className="flex items-center gap-1.5 text-caption font-semibold">
                <span aria-hidden="true" className={cx('size-2 rounded-full', dot)} />
                {label}
              </dt>
              <dd className="m-0 font-display text-title tabular-nums">
                {fmtG(value)}
                <span className="font-sans text-caption font-medium text-ink-muted">{'\u00a0g'}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {nutrition.missing.length > 0 ? (
        <Note tone="warning">
          Sans données nutritionnelles : {nutrition.missing.join(', ')}. Ces ingrédients comptent pour 0 dans
          les macros ; tu peux les compléter en modifiant la recette.
        </Note>
      ) : null}
    </Card>
  )
}

export default function RecipeScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, error } = useRecipeLibrary()
  const fridge = useFridge()
  const [sheet, setSheet] = useState<'log' | 'fridge' | 'shopping' | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'restore' | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  // Photos des ingrédients qui sont des produits scannés (clé de recette inconnue tant que `data` n'est pas là).
  const recipeForPhotos = data?.recipes.find((r) => r.id === id)
  const photoIds = recipeForPhotos
    ? recipeForPhotos.ingredients.flatMap((ing) => {
        const food = ing.foodId !== undefined ? data?.lookup(ing.foodId) : undefined
        return food && isScannedFood(food) ? [food.id] : []
      })
    : []
  const photoUrls = usePhotoUrls(photoIds)

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
  const recipe = data.recipes.find((r) => r.id === id)
  if (!recipe) {
    return (
      <NotFound
        message={
          data.seeds.some((r) => r.id === id)
            ? 'Cette recette a été supprimée. Tu peux la retrouver dans « Recettes supprimées ».'
            : 'Cette recette n’existe pas.'
        }
      />
    )
  }

  const nutrition = recipeNutrition(recipe, data.lookup)
  // Un simple favori sur une recette de départ crée une surcharge : ce n'est pas une modification du contenu.
  const seed = data.seeds.find((r) => r.id === recipe.id)
  const modified =
    recipe.overridden && !(seed && recipeContentEquals(toRecipeInput(seed), toRecipeInput(recipe)))
  const mine = (fridge.data ?? []).filter((f) => f.recipeId === recipe.id)
  const leftTotal = mine.reduce((sum, f) => sum + f.portionsLeft, 0)
  const nextExpiry = mine.map((f) => f.expiresOn).sort()[0]

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setConfirm(null)
      after?.()
    } catch (e) {
      setConfirm(null)
      setActionError(errorMessage(e, 'Action impossible. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3.5">
      <div>
        <BackLink to={RECIPES_PATH}>Recettes</BackLink>
      </div>

      <header className="flex items-start gap-3">
        <FoodTile category="dish" size={56} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-display text-number-l font-extrabold">{recipe.name}</h1>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-muted">
            <span>{recipe.meal.map((s) => SLOT_LABEL[s]).join(', ')}</span>
            {recipe.source === 'user' ? <Badge>Perso</Badge> : null}
            {modified ? <Badge>Modifiée</Badge> : null}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={recipe.favorite === true}
          aria-label={recipe.favorite === true ? 'Retirer des favoris' : 'Mettre en favori'}
          disabled={busy}
          onClick={() =>
            void run(async () => void (await setRecipeFavorite(recipe, recipe.favorite !== true)))
          }
          className="focus-ring -mr-1 grid size-12 shrink-0 place-items-center rounded-full text-ink active:opacity-70"
        >
          <Star
            size={26}
            strokeWidth={1.75}
            aria-hidden="true"
            className={recipe.favorite === true ? 'fill-ember text-ember-ink' : 'text-ink-muted'}
          />
        </button>
      </header>

      <CiqualBanner failed={data.ciqualFailed} onRetry={data.retry} />
      <Macros recipe={recipe} nutrition={nutrition} />

      <Card as="div" className="grid grid-cols-3 divide-x divide-line">
        <StatTile label="Préparation" value={fmtMinutes(recipe.prepMinutes)} />
        <StatTile label="Cuisson" value={fmtMinutes(recipe.cookMinutes)} />
        <StatTile
          label="Frigo"
          value={recipe.fridgeDays !== undefined ? `${recipe.fridgeDays} j` : `${DEFAULT_FRIDGE_DAYS} j`}
        />
      </Card>
      {recipe.fridgeDays === undefined ? (
        <p className="-mt-2 m-0 text-caption text-ink-muted">
          Conservation au frigo : {DEFAULT_FRIDGE_DAYS} jours par défaut.
        </p>
      ) : null}

      {mine.length > 0 && nextExpiry ? (
        <Link
          to={FRIDGE_PATH}
          className="focus-ring flex min-h-12 items-center justify-between gap-3 rounded-ds-md bg-ember-soft px-4 py-2.5 text-body text-ink no-underline active:opacity-80"
        >
          <span>
            Au frigo : <strong className="font-display">{portionsText(leftTotal, recipe.servingUnit)}</strong>
          </span>
          <span className="text-caption">jusqu’au {formatDateFr(nextExpiry)}</span>
        </Link>
      ) : null}

      <div className="flex flex-col gap-2">
        <Link to={cookPath(recipe.id)} className={buttonClass('primary', 'normal', true)}>
          <ChefHat size={20} strokeWidth={1.75} aria-hidden="true" />
          Cuisiner
        </Link>
        <Button variant="secondary" fullWidth onClick={() => setSheet('log')}>
          Loguer une portion
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="px-3 text-center leading-tight"
            onClick={() => setSheet('fridge')}
          >
            Préparer pour le frigo
          </Button>
          <Button
            variant="secondary"
            className="px-3 text-center leading-tight"
            onClick={() => setSheet('shopping')}
          >
            Ajouter aux courses
          </Button>
        </div>
        <AskClaudeButton
          kind="recipe"
          build={(base) => buildRecipeMessage({ ...base, recipe, nutrition })}
          renderTrigger={({ onClick, disabled, busy: waiting, label }) => (
            <Button variant="text" fullWidth onClick={onClick} disabled={disabled} aria-busy={waiting}>
              {label}
            </Button>
          )}
        />
        <Notice notice={notice} />
      </div>

      <Block title="Ingrédients">
        <ul className="m-0 list-none p-0">
          {nutrition.ingredients.map((r, i) => {
            const food = r.ingredient.foodId !== undefined ? data.lookup(r.ingredient.foodId) : undefined
            const scanned = food !== undefined && isScannedFood(food)
            return (
              <li
                key={i}
                className="flex min-h-12 items-center gap-3 border-t border-line py-2 first:border-t-0"
              >
                <FoodTile
                  category={foodCategory({ name: r.ingredient.name })}
                  photoUrl={food && scanned ? photoUrls.get(food.id) : undefined}
                  badge={scanned ? 'barcode' : undefined}
                />
                <span className="min-w-0 flex-1 text-body-strong">
                  {r.ingredient.name}
                  {r.resolution === 'missing' ? (
                    <span className="flex items-center gap-1 text-caption font-medium text-warning">
                      <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                      Sans données nutritionnelles
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-display text-body-strong tabular-nums">
                  {fmtGrams(r.ingredient.grams)}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="m-0 text-caption text-ink-muted">
          Quantités pour {portionsText(recipe.servings, recipe.servingUnit)}, en grammes crus.
        </p>
      </Block>

      <Block title="Étapes">
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-body">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-ember-soft font-display text-body-strong font-bold"
              >
                {i + 1}
              </span>
              <span className="pt-1">
                <span className="sr-only">Étape {i + 1} : </span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </Block>

      {recipe.tags.length > 0 ? (
        <p className="m-0 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </p>
      ) : null}

      {actionError ? <Note tone="error">{actionError}</Note> : null}

      <Card as="div" className="flex flex-col gap-2">
        <Link to={editRecipePath(recipe.id)} className={buttonClass('flat', 'normal', true)}>
          Modifier
        </Link>
        {modified ? (
          <Button variant="flat" fullWidth onClick={() => setConfirm('restore')}>
            Rétablir l’original
          </Button>
        ) : null}
        <Button variant="danger" fullWidth onClick={() => setConfirm('delete')}>
          Supprimer
        </Button>
      </Card>

      {sheet === 'log' ? (
        <RecipeLogSheet
          recipe={recipe}
          nutrition={nutrition}
          ciqualFailed={data.ciqualFailed}
          fridge={mine}
          onClose={() => setSheet(null)}
          onLogged={(entries, fridgeBefore) =>
            setNotice(loggedNotice(entries, fridgeBefore, recipe.servingUnit))
          }
        />
      ) : null}
      {sheet === 'fridge' ? (
        <PrepareFridgeSheet
          recipe={recipe}
          onClose={() => setSheet(null)}
          onDone={(item) =>
            setNotice({
              message: `${portionsText(item.portionsLeft, recipe.servingUnit)} au frigo jusqu’au ${formatDateFr(item.expiresOn)}.`,
              to: FRIDGE_PATH,
              linkLabel: 'Frigo',
            })
          }
        />
      ) : null}
      {sheet === 'shopping' ? (
        <AddToShoppingSheet
          recipe={recipe}
          allRecipes={data.recipes}
          onClose={() => setSheet(null)}
          onDone={() =>
            setNotice({
              message: 'Ajouté à la liste de courses.',
              to: SHOPPING_PATH,
              linkLabel: 'Courses',
            })
          }
        />
      ) : null}

      {confirm === 'delete' ? (
        <ConfirmSheet
          title="Supprimer cette recette ?"
          message={
            recipe.source === 'user'
              ? `« ${recipe.name} » sera supprimée pour de bon, avec ses portions au frigo. Le journal garde son nom.`
              : `« ${recipe.name} » disparaît de la liste. Tu pourras la restaurer depuis « Recettes supprimées »${
                  modified ? ' ; tes modifications seront perdues si tu la restaures' : ''
                }.`
          }
          confirmLabel="Supprimer"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void run(
              async () => {
                await deleteRecipe(recipe)
                clearRecipeDraft(recipe.id)
              },
              () => navigate(RECIPES_PATH, { replace: true }),
            )
          }
        />
      ) : null}
      {confirm === 'restore' ? (
        <ConfirmSheet
          title="Rétablir l’original ?"
          message="Ta version modifiée sera remplacée par la recette d’origine."
          confirmLabel="Rétablir"
          danger={false}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void run(() =>
              restoreRecipe(
                recipe.id,
                data.seeds.find((r) => r.id === recipe.id),
              ),
            )
          }
        />
      ) : null}
    </article>
  )
}
