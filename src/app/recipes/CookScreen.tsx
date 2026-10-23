import { Check } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { recipeNutrition, scaleIngredients } from '../../domain/nutrition'
import { formatDateFr } from '../../domain/shared/dates'
import type { LibraryRecipe } from '../../types'
import { Button, Stepper, cx } from '../../ui/kit'
import { buttonClass } from '../../ui/kit/buttonClass'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import { Note } from '../../ui/kit/Note'
import { MAX_RECIPE_SERVINGS } from '../../domain/nutrition/limits'
import { FRIDGE_PATH, recipePath } from '../routes'
import { useWakeLock } from '../training/useWakeLock'
import { fmtGrams, portionsText } from './format'
import { Loading, Notice, NotFound, RECIPES_PATH } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import type { NoticeState } from './parts'
import { loggedNotice } from './loggedNotice'
import { PrepareFridgeSheet } from './PrepareFridgeSheet'
import { RecipeLogSheet } from './RecipeLogSheet'
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
      typeof o['portions'] === 'number' && o['portions'] >= 1
        ? Math.min(o['portions'], MAX_RECIPE_SERVINGS)
        : fallbackPortions
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

/** Zone collée en bas de <main> (jamais `fixed`) : boutons de 64 px à portée de pouce, fondu sur le fond. */
function BottomActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-col gap-2 bg-canvas px-4 pb-3 pt-3 shadow-[0_-12px_24px_var(--color-canvas)]">
      {children}
    </div>
  )
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
    <section className="flex flex-col">
      <div>
        <BackLink to={recipePath(recipe.id)}>Fiche</BackLink>
      </div>
      <h1 className="m-0 mt-1 font-display text-title leading-tight">{recipe.name}</h1>

      <div className="mt-3 rounded-ds-lg bg-surface p-3 shadow-card">
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

      <div className="mt-3">
        <Notice notice={notice} />
      </div>

      {state.view === 'ingredients' ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-ds-lg bg-surface p-4 shadow-card">
            <Stepper
              label="Portions à cuisiner"
              value={state.portions}
              min={1}
              max={MAX_RECIPE_SERVINGS}
              onChange={(portions) => update({ portions })}
            />
            <p className="m-0 mt-2 text-caption text-ink-muted">
              Recette de base : {portionsText(recipe.servings, recipe.servingUnit)}. Les quantités sont
              recalculées.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
                    className={cx(
                      'focus-ring flex min-h-16 w-full items-center gap-3 rounded-ds-md px-4 py-2 text-left text-ink shadow-card active:opacity-70',
                      got ? 'bg-surface-sunken' : 'bg-surface',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'grid size-8 shrink-0 place-items-center rounded-ds-sm border-2',
                        got ? 'border-ember bg-ember text-ink' : 'border-ink-muted',
                      )}
                    >
                      {got ? <Check size={20} strokeWidth={2.5} /> : null}
                    </span>
                    <span className={cx('min-w-0 flex-1 text-title', got && 'text-ink-muted line-through')}>
                      {ing.name}
                    </span>
                    <span
                      className={cx(
                        'shrink-0 font-display text-title font-extrabold tabular-nums',
                        got && 'text-ink-muted',
                      )}
                    >
                      {fmtGrams(ing.grams)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <BottomActions>
            <Button size="session" fullWidth onClick={() => update({ view: 'steps' })}>
              Voir les étapes
            </Button>
          </BottomActions>
        </div>
      ) : finished ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-ds-lg bg-surface p-5 shadow-card">
            <p className="m-0 font-display text-display-l">C’est prêt !</p>
            <p className="m-0 mt-1 text-headline">
              Tu as cuisiné {portionsText(state.portions, recipe.servingUnit)}.
            </p>
          </div>
          <BottomActions>
            <Button size="session" fullWidth onClick={() => setSheet('fridge')}>
              Mettre au frigo
            </Button>
            <Button variant="secondary" size="session" fullWidth onClick={() => setSheet('log')}>
              Loguer une portion
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="text" size="session" onClick={() => setFinished(false)}>
                Revoir les étapes
              </Button>
              <Link to={recipePath(recipe.id)} className={buttonClass('secondary', 'session')}>
                Retour à la fiche
              </Link>
            </div>
          </BottomActions>
        </div>
      ) : (
        <div className="mt-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <p className="m-0 font-display text-title" aria-live="polite">
              Étape {step + 1} sur {total}
            </p>
            <p className="m-0 text-caption text-ink-muted">
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
                className={cx(
                  'focus-ring grid size-11 place-items-center rounded-full font-display text-body-strong font-bold',
                  i === step
                    ? 'bg-ember text-ink'
                    : state.doneSteps.includes(i)
                      ? 'bg-ember-soft text-ink'
                      : 'bg-surface text-ink shadow-card',
                )}
              >
                {state.doneSteps.includes(i) && i !== step ? (
                  <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </button>
            ))}
          </div>
          <p className="m-0 mt-5 text-number-l font-semibold" data-testid="cook-step">
            {recipe.steps[step]}
          </p>
          <BottomActions>
            <Button size="session" fullWidth onClick={markAndNext}>
              {step >= total - 1 ? 'Fait, terminer' : 'Fait, étape suivante'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="session"
                disabled={step === 0}
                onClick={() => update({ step: step - 1 })}
              >
                Précédente
              </Button>
              <Button
                variant="secondary"
                size="session"
                disabled={step >= total - 1}
                onClick={() => update({ step: step + 1 })}
              >
                Suivante
              </Button>
            </div>
          </BottomActions>
        </div>
      )}

      {sheet === 'fridge' ? (
        <PrepareFridgeSheet
          recipe={recipe}
          initialPortions={state.portions}
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
      {sheet === 'log' ? (
        <RecipeLogSheet
          recipe={recipe}
          nutrition={nutrition}
          ciqualFailed={lib.ciqualFailed}
          fridge={fridge ?? []}
          onClose={() => setSheet(null)}
          onLogged={(entries, fridgeBefore) =>
            setNotice(loggedNotice(entries, fridgeBefore, recipe.servingUnit))
          }
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
  if (!recipe) return <NotFound message="Cette recette n’existe pas ou a été supprimée." />
  return <Cook key={recipe.id} recipe={recipe} lib={data} />
}
