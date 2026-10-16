import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildRecipeMessage } from '../../domain/claude/context'
import { deleteRecipe, restoreRecipe, setRecipeFavorite } from '../../db'
import {
  DEFAULT_FRIDGE_DAYS,
  recipeContentEquals,
  recipeNutrition,
  roundMacros,
  toRecipeInput,
} from '../../domain/nutrition'
import { formatDateFr } from '../../domain/shared/dates'
import type { LibraryRecipe, RecipeNutrition } from '../../types'
import { Button, Card, ConfirmSheet, ErrorNote, errorMessage, linkButtonClass } from '../../ui'
import { SLOT_LABEL, fmtG, fmtInt } from '../nutrition/format'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { BackLink } from '../nutrition/parts'
import { AddToShoppingSheet } from './AddToShoppingSheet'
import { fmtGrams, fmtMinutes, fmtPortions, portionsWord } from './format'
import { LogRecipeSheet } from './LogRecipeSheet'
import { Badge, CiqualBanner, Loading, Notice, NotFound, RECIPES_PATH, Star, focusRing } from './parts'
import type { NoticeState } from './parts'
import { clearRecipeDraft } from './recipeDraft'
import { PrepareFridgeSheet } from './PrepareFridgeSheet'
import { useFridge, useRecipeLibrary } from './useRecipes'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function MacroTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-hi px-2 py-2.5 text-center">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="m-0 text-2xl font-bold tabular-nums">
        {value}
        <span className="ml-0.5 text-sm font-medium text-zinc-400">{unit}</span>
      </dd>
    </div>
  )
}

function Macros({ recipe, nutrition }: { recipe: LibraryRecipe; nutrition: RecipeNutrition }) {
  const m = roundMacros(nutrition.perServing)
  return (
    <Card className="mt-4">
      <p className="text-sm font-medium text-zinc-300">
        Par portion <span className="text-zinc-400">(recette pour {recipe.servings})</span>
      </p>
      <p className="mt-1 text-5xl font-bold tabular-nums" data-testid="kcal-per-serving">
        {fmtInt(m.kcal)} <span className="text-xl font-medium text-zinc-400">kcal</span>
      </p>
      <dl className="m-0 mt-3 grid grid-cols-3 gap-2">
        <MacroTile label="Protéines" value={fmtG(m.protein)} unit="g" />
        <MacroTile label="Glucides" value={fmtG(m.carbs)} unit="g" />
        <MacroTile label="Lipides" value={fmtG(m.fat)} unit="g" />
      </dl>
      {nutrition.missing.length > 0 ? (
        <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
          Sans données nutritionnelles : {nutrition.missing.join(', ')}. Ces ingrédients comptent pour 0 dans
          les macros ; tu peux les compléter en modifiant la recette.
        </p>
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
    <article>
      <BackLink to={RECIPES_PATH}>Recettes</BackLink>

      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-3xl font-bold leading-tight">{recipe.name}</h1>
        <button
          type="button"
          aria-pressed={recipe.favorite === true}
          aria-label={recipe.favorite === true ? 'Retirer des favoris' : 'Mettre en favori'}
          disabled={busy}
          onClick={() =>
            void run(async () => void (await setRecipeFavorite(recipe, recipe.favorite !== true)))
          }
          className={`-mr-2 flex size-12 shrink-0 items-center justify-center rounded-xl text-3xl active:bg-white/5 ${focusRing}`}
        >
          <Star on={recipe.favorite === true} />
        </button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-zinc-300">
        <span>{recipe.meal.map((s) => SLOT_LABEL[s]).join(', ')}</span>
        {recipe.source === 'user' ? <Badge>Perso</Badge> : null}
        {modified ? <Badge>Modifiée</Badge> : null}
      </p>

      <CiqualBanner failed={data.ciqualFailed} onRetry={data.retry} />
      <Macros recipe={recipe} nutrition={nutrition} />

      <dl className="m-0 mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-surface-hi px-2 py-2.5 text-center">
          <dt className="text-sm text-zinc-400">Préparation</dt>
          <dd className="m-0 text-lg font-semibold">{fmtMinutes(recipe.prepMinutes)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-hi px-2 py-2.5 text-center">
          <dt className="text-sm text-zinc-400">Cuisson</dt>
          <dd className="m-0 text-lg font-semibold">{fmtMinutes(recipe.cookMinutes)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-hi px-2 py-2.5 text-center">
          <dt className="text-sm text-zinc-400">Frigo</dt>
          <dd className="m-0 text-lg font-semibold">
            {recipe.fridgeDays !== undefined
              ? `${recipe.fridgeDays} j`
              : `${DEFAULT_FRIDGE_DAYS} j (par défaut)`}
          </dd>
        </div>
      </dl>

      {mine.length > 0 && nextExpiry ? (
        <Link
          to="/nutrition/frigo"
          className="mt-3 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-base text-emerald-100 no-underline"
        >
          <span>
            Au frigo : <strong>{fmtPortions(leftTotal)}</strong> {portionsWord(leftTotal)}
          </span>
          <span className="text-sm">jusqu’au {formatDateFr(nextExpiry)}</span>
        </Link>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <Link to={`/nutrition/recettes/${recipe.id}/cuisine`} className={linkButtonClass('primary')}>
          Cuisiner
        </Link>
        <Button variant="secondary" onClick={() => setSheet('log')}>
          Loguer une portion
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setSheet('fridge')}>
            Préparer pour le frigo
          </Button>
          <Button variant="secondary" onClick={() => setSheet('shopping')}>
            Ajouter aux courses
          </Button>
        </div>
        <AskClaudeButton kind="recipe" build={(base) => buildRecipeMessage({ ...base, recipe, nutrition })} />
        <Notice notice={notice} />
      </div>

      <Block title="Ingrédients">
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {nutrition.ingredients.map((r, i) => (
            <li
              key={i}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2"
            >
              <span className="min-w-0 text-base leading-snug">
                {r.ingredient.name}
                {r.resolution === 'missing' ? (
                  <span className="mt-0.5 block text-sm text-amber-300">Sans données nutritionnelles</span>
                ) : null}
              </span>
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {fmtGrams(r.ingredient.grams)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-zinc-400">
          Quantités pour {recipe.servings} {portionsWord(recipe.servings)}, en grammes crus.
        </p>
      </Block>

      <Block title="Étapes">
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-base leading-relaxed text-zinc-200">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-base font-bold text-orange-300"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">
                <span className="sr-only">Étape {i + 1} : </span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      </Block>

      {recipe.tags.length > 0 ? (
        <p className="mt-5 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </p>
      ) : null}

      {actionError ? (
        <div className="mt-5">
          <ErrorNote>{actionError}</ErrorNote>
        </div>
      ) : null}

      <Card className="mt-7 flex flex-col gap-2">
        <Link to={`/nutrition/recettes/${recipe.id}/modifier`} className={linkButtonClass('secondary')}>
          Modifier
        </Link>
        {modified ? (
          <Button variant="secondary" onClick={() => setConfirm('restore')}>
            Rétablir l’original
          </Button>
        ) : null}
        <Button variant="danger" onClick={() => setConfirm('delete')}>
          Supprimer
        </Button>
      </Card>

      {sheet === 'log' ? (
        <LogRecipeSheet
          recipe={recipe}
          nutrition={nutrition}
          ciqualFailed={data.ciqualFailed}
          fridge={mine}
          onClose={() => setSheet(null)}
          onLogged={(entries) => {
            const n = entries[0]?.origin.kind === 'recipe' ? entries[0].origin.portions : 1
            setNotice({
              message: `${fmtPortions(n)} ${portionsWord(n)} ajoutée${n >= 2 ? 's' : ''} au journal.`,
              to: `/nutrition?date=${entries[0]?.date ?? ''}`,
              linkLabel: 'Journal',
            })
          }}
        />
      ) : null}
      {sheet === 'fridge' ? (
        <PrepareFridgeSheet
          recipe={recipe}
          onClose={() => setSheet(null)}
          onDone={(item) =>
            setNotice({
              message: `${fmtPortions(item.portionsLeft)} ${portionsWord(item.portionsLeft)} au frigo jusqu’au ${formatDateFr(item.expiresOn)}.`,
              to: '/nutrition/frigo',
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
              to: '/nutrition/courses',
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
