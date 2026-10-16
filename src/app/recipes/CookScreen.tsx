import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { recipeNutrition, scaleIngredients } from '../../domain/nutrition'
import type { LibraryRecipe } from '../../types'
import { Button, ChoiceGroup, ErrorNote, linkButtonClass } from '../../ui'
import { BackLink, StickyStack } from '../nutrition/parts'
import { useWakeLock } from '../training/useWakeLock'
import { formatDateFr } from '../../domain/shared/dates'
import { fmtGrams, fmtPortions, portionsWord } from './format'
import { LogRecipeSheet } from './LogRecipeSheet'
import { Loading, Notice, NotFound, PortionsStepper, RECIPES_PATH, focusRing } from './parts'
import type { NoticeState } from './parts'
import { PrepareFridgeSheet } from './PrepareFridgeSheet'
import { useFridge, useRecipeLibrary } from './useRecipes'
import type { RecipeLibraryData } from './useRecipes'

type View = 'ingredients' | 'steps'

interface CookState {
  portions: number
  view: View
  step: number
  doneSteps: number[]
  gathered: number[]
}

const stateKey = (id: string) => `cook:${id}`

/** Progression conservée pour la session (retour accidentel, changement d'onglet) ; ignorée si illisible. */
function loadState(id: string, fallbackPortions: number, stepCount: number): CookState {
  const fresh: CookState = {
    portions: fallbackPortions,
    view: 'ingredients',
    step: 0,
    doneSteps: [],
    gathered: [],
  }
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(stateKey(id)) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return fresh
    const o = raw as Record<string, unknown>
    const nums = (v: unknown): number[] =>
      Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
    const portions =
      typeof o['portions'] === 'number' && o['portions'] >= 1 ? o['portions'] : fallbackPortions
    const step =
      typeof o['step'] === 'number'
        ? Math.min(Math.max(0, Math.floor(o['step'])), Math.max(0, stepCount - 1))
        : 0
    return {
      portions,
      view: o['view'] === 'steps' ? 'steps' : 'ingredients',
      step,
      doneSteps: nums(o['doneSteps']),
      gathered: nums(o['gathered']),
    }
  } catch {
    return fresh
  }
}

function saveState(id: string, state: CookState): void {
  try {
    sessionStorage.setItem(stateKey(id), JSON.stringify(state))
  } catch {
    // Stockage indisponible : la progression n'est simplement pas conservée.
  }
}

function Cook({ recipe, lib }: { recipe: LibraryRecipe; lib: RecipeLibraryData }) {
  const { data: fridge } = useFridge()
  const [state, setState] = useState<CookState>(() =>
    loadState(recipe.id, recipe.servings, recipe.steps.length),
  )
  const [sheet, setSheet] = useState<'fridge' | 'log' | null>(null)
  const [finished, setFinished] = useState(false)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  useWakeLock()

  const update = (patch: Partial<CookState>) => {
    const next = { ...state, ...patch }
    setState(next)
    saveState(recipe.id, next)
  }

  const scaled = scaleIngredients(recipe, state.portions)
  const total = recipe.steps.length
  const step = state.step
  const done = state.doneSteps.includes(step)
  const nutrition = recipeNutrition(recipe, lib.lookup)

  const markAndNext = () => {
    const doneSteps = done ? state.doneSteps : [...state.doneSteps, step]
    if (step >= total - 1) {
      update({ doneSteps })
      setFinished(true)
    } else {
      update({ doneSteps, step: step + 1 })
    }
  }

  return (
    <section>
      <BackLink to={`/nutrition/recettes/${recipe.id}`}>Fiche</BackLink>
      <h1 className="mt-1 text-2xl font-bold leading-tight">{recipe.name}</h1>

      <div className="mt-4">
        <ChoiceGroup<View>
          legend="Affichage"
          value={state.view}
          onChange={(view) => {
            setFinished(false)
            update({ view })
          }}
          options={[
            { value: 'ingredients', label: 'Ingrédients' },
            { value: 'steps', label: 'Étapes' },
          ]}
        />
      </div>

      {state.view === 'ingredients' ? (
        <div className="mt-5">
          <PortionsStepper
            legend="Portions à cuisiner"
            value={state.portions}
            min={1}
            max={50}
            step={1}
            onChange={(portions) => update({ portions })}
          />
          <p className="mt-2 text-sm text-zinc-400">
            Recette de base : {recipe.servings} {portionsWord(recipe.servings)}. Les quantités sont
            recalculées.
          </p>
          <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
            {scaled.map((ing, i) => {
              const got = state.gathered.includes(i)
              return (
                <li key={i}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={got}
                    onClick={() =>
                      update({
                        gathered: got ? state.gathered.filter((x) => x !== i) : [...state.gathered, i],
                      })
                    }
                    className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border border-v1-line px-3 py-2 text-left active:bg-v1-surface-hi ${focusRing} ${got ? 'bg-v1-surface/60' : 'bg-v1-surface'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-bold ${
                        got ? 'border-orange-400 bg-orange-400 text-zinc-950' : 'border-zinc-500'
                      }`}
                    >
                      {got ? '✓' : ''}
                    </span>
                    <span
                      className={`min-w-0 flex-1 text-xl leading-snug ${got ? 'text-zinc-500 line-through' : ''}`}
                    >
                      {ing.name}
                    </span>
                    <span className={`shrink-0 text-xl font-bold tabular-nums ${got ? 'text-zinc-500' : ''}`}>
                      {fmtGrams(ing.grams)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <StickyStack>
            <Button onClick={() => update({ view: 'steps' })}>Voir les étapes</Button>
          </StickyStack>
        </div>
      ) : finished ? (
        <div className="mt-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
            <p className="text-2xl font-bold text-emerald-100">C’est prêt !</p>
            <p className="mt-1 text-base text-emerald-100">
              {fmtPortions(state.portions)} {portionsWord(state.portions)} cuisinée
              {state.portions >= 2 ? 's' : ''}.
            </p>
          </div>
          <Notice notice={notice} />
          <Button onClick={() => setSheet('fridge')}>Mettre au frigo</Button>
          <Button variant="secondary" disabled={!nutrition} onClick={() => setSheet('log')}>
            Loguer une portion
          </Button>
          <Button variant="ghost" onClick={() => setFinished(false)}>
            Revoir les étapes
          </Button>
          <Link to={`/nutrition/recettes/${recipe.id}`} className={linkButtonClass('secondary')}>
            Retour à la fiche
          </Link>
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold text-zinc-300" aria-live="polite">
              Étape {step + 1} sur {total}
            </p>
            <p className="text-sm text-zinc-400">
              {state.doneSteps.length} faite{state.doneSteps.length > 1 ? 's' : ''}
            </p>
          </div>
          <div role="group" aria-label="Aller à une étape" className="mt-2 flex flex-wrap gap-2">
            {recipe.steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Étape ${i + 1}${state.doneSteps.includes(i) ? ' (faite)' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => update({ step: i })}
                className={`flex size-11 items-center justify-center rounded-full border text-base font-bold ${focusRing} ${
                  i === step
                    ? 'border-orange-400 bg-orange-400 text-zinc-950'
                    : state.doneSteps.includes(i)
                      ? 'border-orange-400/50 bg-orange-400/15 text-orange-300'
                      : 'border-v1-line bg-v1-surface-hi text-zinc-300'
                }`}
              >
                {state.doneSteps.includes(i) && i !== step ? '✓' : i + 1}
              </button>
            ))}
          </div>
          <p className="mt-5 text-3xl font-semibold leading-snug" data-testid="cook-step">
            {recipe.steps[step]}
          </p>
          <StickyStack>
            <div className="flex flex-col gap-2 rounded-2xl bg-v1-bg/90 pt-2 backdrop-blur">
              <Button className="min-h-16 text-xl" onClick={markAndNext}>
                {step >= total - 1 ? 'Fait, terminer' : 'Fait, étape suivante'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={step === 0} onClick={() => update({ step: step - 1 })}>
                  Précédente
                </Button>
                <Button
                  variant="secondary"
                  disabled={step >= total - 1}
                  onClick={() => update({ step: step + 1 })}
                >
                  Suivante
                </Button>
              </div>
            </div>
          </StickyStack>
        </div>
      )}

      {sheet === 'fridge' ? (
        <PrepareFridgeSheet
          recipe={recipe}
          initialPortions={state.portions}
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
      {sheet === 'log' && nutrition ? (
        <LogRecipeSheet
          recipe={recipe}
          nutrition={nutrition}
          ciqualFailed={lib.ciqualFailed}
          fridge={fridge ?? []}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  )
}

export default function CookScreen() {
  const { id = '' } = useParams()
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
  const recipe = data.recipes.find((r) => r.id === id)
  if (!recipe) return <NotFound message="Cette recette n’existe pas ou a été supprimée." />
  return <Cook key={recipe.id} recipe={recipe} lib={data} />
}
