// « Recette par scan » (F4, R3) : caméra en bandeau, liste d'ingrédients, feuille de résultat. Aucune règle métier ici :
// `domain/nutrition/scan.ts` construit les ingrédients et valide, `recipeNutrition` calcule les macros,
// `createRecipeWithFridge` écrit. Le brouillon vit dans le reducer (draftState.ts) et dans localStorage.
//
// Choix documentés :
// - Même produit relu (ou déjà ajouté par la recherche) : AUCUN ajout ni incrément, message « Déjà dans la liste ».
//   Une caméra qui relit le code ne doit pas doubler la quantité en silence ; pour deux paquets, on modifie la quantité.
// - La caméra est coupée tant qu'une feuille est ouverte (clavier, saisie) et reprend à la fermeture.
// - Le brouillon survit à tout (produit inconnu, erreur réseau, fermeture de l'app) : aucune navigation avant la création.
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { createRecipeWithFridge, getFoodRow } from '../../db'
import { MAX_RECIPE_NAME_LENGTH, MAX_RECIPE_SERVINGS } from '../../domain/nutrition/limits'
import { recipeNutrition } from '../../domain/nutrition/recipes'
import {
  checkScanDraft,
  draftToRecipeInput,
  scanIngredientFromCiqual,
  scanIngredientFromFood,
  servingLabel,
} from '../../domain/nutrition/scan'
import { toLocalDate } from '../../domain/shared/dates'
import type { Ean, Food, FoodLookup, Recipe, ScanErrorKind, ScanIngredient } from '../../types'
import { Button } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { errorMessage } from '../../ui/format'
import { NUTRITION_PATH, RECIPE_SCAN_PATH } from '../routes'
import {
  clearStoredState,
  effectiveFridge,
  findIngredient,
  loadState,
  saveState,
  scanReducer,
} from './draftState'
import { CodeSheet } from './CodeSheet'
import { FoodSearchSheet } from './FoodSearchSheet'
import { GramsSheet } from './GramsSheet'
import { IngredientRow } from './IngredientRow'
import { ResultPanel } from './ResultPanel'
import { ServingsSheet } from './ServingsSheet'
import { StripCamera } from './StripCamera'
import { resolveScan } from '../scan/resolveScan'
import { scanErrorText } from '../scan/scanLogic'
import { useBeep } from '../scan/useBeep'
import { usePhotoUrls } from '../nutrition/usePhotoUrls'
import { useFoods } from '../nutrition/useFoods'

type Sheet =
  | null
  | { kind: 'search'; query: string }
  | { kind: 'code' }
  | { kind: 'grams'; key: string }
  | { kind: 'servings' }
  | { kind: 'clear' }

type Status =
  | { kind: 'idle' }
  | { kind: 'lookup'; ean: Ean }
  | { kind: 'added'; text: string }
  | { kind: 'duplicate'; name: string }
  | { kind: 'error'; ean: Ean; message: string }
  | { kind: 'unknown'; ean: Ean; incomplete: boolean; name?: string; brand?: string; packageG?: number }

const newKey = (): string => crypto.randomUUID()

export default function RecipeScanScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, dispatch] = useReducer(scanReducer, undefined, () => loadState())
  const [sheet, setSheet] = useState<Sheet>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [cameraError, setCameraError] = useState<ScanErrorKind | null>(null)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [showProblem, setShowProblem] = useState(false)
  const [creating, setCreating] = useState(false)
  const createLock = useRef(false)
  const [params, setParams] = useSearchParams()
  const [createError, setCreateError] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const [extraFoods, setExtraFoods] = useState<ReadonlyMap<string, Food>>(new Map())
  const beep = useBeep()
  const busy = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const draftRef = useRef(state.draft)
  useEffect(() => {
    draftRef.current = state.draft
  })

  // Brouillon conservé à chaque changement.
  useEffect(() => saveState(state), [state])
  useEffect(() => () => abort.current?.abort(), [])

  // Messages courts : disparaissent seuls.
  useEffect(() => {
    if (status.kind !== 'added' && status.kind !== 'duplicate') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 4000)
    return () => clearTimeout(t)
  }, [status])

  const foods = useFoods()
  const foodsById = useMemo(() => new Map((foods.foods ?? []).map((f) => [f.id, f])), [foods.foods])
  const lookup = useCallback<FoodLookup>(
    (id) => foodsById.get(id) ?? extraFoods.get(id),
    [foodsById, extraFoods],
  )
  const nutritionReady = foods.foods !== undefined && !foods.preparing

  const { draft } = state
  const photos = usePhotoUrls(draft.ingredients.flatMap((i) => (i.foodId !== undefined ? [i.foodId] : [])))

  const nutrition = useMemo(() => {
    if (draft.ingredients.length === 0 || !nutritionReady) return null
    const recipe: Recipe = { ...draftToRecipeInput(draft), id: 'brouillon', source: 'user', updatedAt: '' }
    return recipeNutrition(recipe, lookup)
  }, [draft, lookup, nutritionReady])

  const problem = checkScanDraft(draft)
  const fridge = effectiveFridge(state)
  const servingsText = servingLabel(draft.servings, draft.servingUnit)
  const macrosNote =
    draft.ingredients.length === 0
      ? 'Ajoute un ingrédient.'
      : !nutritionReady
        ? 'Calcul en cours…'
        : nutrition && nutrition.missing.length > 0
          ? `Sans données (macros sous-estimées) : ${nutrition.missing.join(', ')}`
          : null

  // ---------- Ajout d'un aliment ----------

  const addFood = (food: Food) => {
    const ciqual = food.source === 'ciqual' && food.ciqualCode !== undefined
    const existing = findIngredient(
      draftRef.current,
      ciqual ? { ciqualCode: food.ciqualCode } : { foodId: food.id },
    )
    if (existing) {
      setStatus({ kind: 'duplicate', name: existing.name })
      return
    }
    const key = newKey()
    const ingredient: ScanIngredient = ciqual
      ? scanIngredientFromCiqual({ code: food.ciqualCode ?? '', name: food.name }, { key })
      : scanIngredientFromFood(food, { key })
    setExtraFoods((prev) => new Map(prev).set(food.id, food))
    dispatch({ type: 'add', ingredient })
    setStatus({
      kind: 'added',
      text: `Ajouté : ${food.name} · ${ingredient.grams} g`,
    })
  }

  // ---------- Recherche d'un code ----------

  const lookupEan = async (ean: Ean) => {
    if (busy.current || createLock.current) return
    const known = findIngredient(draftRef.current, { foodId: `off-${ean}` })
    if (known) {
      setStatus({ kind: 'duplicate', name: known.name })
      return
    }
    busy.current = true
    const ctrl = new AbortController()
    abort.current = ctrl
    setStatus({ kind: 'lookup', ean })
    try {
      const res = await resolveScan(ean, (input, init) => fetch(input, init), ctrl.signal)
      if (res.status === 'aborted' || ctrl.signal.aborted) return
      if (res.status === 'food') addFood(res.food)
      else if (res.status === 'error') setStatus({ kind: 'error', ean, message: res.message })
      else {
        const unknown: Status = { kind: 'unknown', ean, incomplete: res.origin === 'incomplete' }
        if (res.name !== undefined) unknown.name = res.name
        if (res.brand !== undefined) unknown.brand = res.brand
        if (res.packageG !== undefined) unknown.packageG = res.packageG
        setStatus(unknown)
      }
    } catch (e) {
      if (!ctrl.signal.aborted)
        setStatus({ kind: 'error', ean, message: errorMessage(e, 'Recherche impossible. Réessaie.') })
    } finally {
      if (abort.current === ctrl) busy.current = false
    }
  }

  const cancelLookup = () => {
    abort.current?.abort()
    busy.current = false
    setStatus({ kind: 'idle' })
  }

  // ---------- Création ----------

  const create = async () => {
    if (createLock.current) return
    if (problem !== null) {
      setShowProblem(true)
      return
    }
    createLock.current = true
    setCreating(true)
    setCreateError(null)
    try {
      const { recipe } = await createRecipeWithFridge({
        recipe: draftToRecipeInput(draft),
        fridgePortions: fridge,
        preparedOn: toLocalDate(new Date()),
      })
      // Le brouillon est effacé avant de quitter l'écran ; `replace` : « retour » ne ramène pas sur un écran vide.
      clearStoredState()
      dispatch({ type: 'clear' })
      void navigate(`${NUTRITION_PATH}/recettes/${recipe.id}`, { replace: true })
    } catch (e) {
      setCreateError(errorMessage(e, 'Création impossible. Ton brouillon est conservé, réessaie.'))
      createLock.current = false
      setCreating(false)
    }
  }

  // Formulaire d'aliment pré-rempli ; au retour l'aliment créé arrive par `?ajout=<id>` (voir plus bas).
  // Le brouillon est déjà dans localStorage : rien ne se perd pendant l'absence.
  const createFoodFor = (u: Extract<Status, { kind: 'unknown' }>) => {
    const q = new URLSearchParams({
      ean: u.ean,
      origine: u.incomplete ? 'incomplete' : 'not_found',
      retour: RECIPE_SCAN_PATH,
    })
    if (u.name) q.set('nom', u.name)
    if (u.brand) q.set('marque', u.brand)
    if (u.packageG !== undefined) q.set('paquet', String(u.packageG))
    void navigate(`${NUTRITION_PATH}/aliments/nouveau?${q.toString()}`)
  }

  const handoff = params.get('ajout')
  useEffect(() => {
    if (handoff === null) return
    let alive = true
    void getFoodRow(handoff).then((food) => {
      if (!alive) return
      if (food) addFood(food)
      setParams(
        (p) => {
          p.delete('ajout')
          return p
        },
        { replace: true },
      )
    })
    return () => {
      alive = false
    }
  }, [handoff, setParams])

  const goBack = () => {
    if (location.key !== 'default') void navigate(-1)
    else void navigate(NUTRITION_PATH)
  }

  const editing = sheet?.kind === 'grams' ? draft.ingredients.find((i) => i.key === sheet.key) : undefined
  const cameraOn = sheet === null && cameraError === null && !creating
  const closeSheet = () => setSheet(null)
  const cameraText = cameraError ? scanErrorText(cameraError) : null
  const createLabel = fridge > 0 ? `Créer et mettre ${servingLabel(fridge)} au frigo` : 'Créer la recette'

  return (
    <div>
      {/* Bandeau caméra : pleine largeur, collant en haut pendant que la liste défile. */}
      <header
        className="ds-bleed-edge sticky z-20 flex flex-col overflow-hidden bg-inverse text-on-inverse"
        style={{
          // Couplage avec TabsLayout via `--page-*` (src/index.css) : le bandeau déborde dans le remplissage de
          // <main> (haut, gauche, droite) et `top` négatif le garde collé sous la barre d'état.
          height: 'calc(env(safe-area-inset-top) + 13rem)',
          paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
          paddingBottom: '1rem',
        }}
      >
        <StripCamera
          key={cameraAttempt}
          active={cameraOn}
          flash={status.kind === 'lookup'}
          hint={sheet === null ? 'Scanne le produit suivant' : 'Caméra en pause'}
          failedTitle={cameraText ? cameraText.title : null}
          onBack={goBack}
          onCode={(ean) => {
            if (busy.current || createLock.current) return
            beep()
            void lookupEan(ean)
          }}
          onError={setCameraError}
        />
      </header>

      <div className="mt-4 flex flex-col gap-3">
        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {cameraError !== null && cameraText ? (
            <Note tone="warning">
              <p className="m-0 font-semibold">{cameraText.title}</p>
              <p className="m-0 mt-1 text-caption">{cameraText.body}</p>
              {cameraError !== 'insecure_context' && cameraError !== 'unsupported' ? (
                <Button
                  variant="secondary"
                  className="mt-2 min-h-11"
                  onClick={() => {
                    setCameraError(null)
                    setCameraAttempt((n) => n + 1)
                  }}
                >
                  Réessayer la caméra
                </Button>
              ) : null}
            </Note>
          ) : null}
          {status.kind === 'lookup' ? (
            <Note tone="warning">
              <p className="m-0">Recherche du produit {status.ean}…</p>
              <Button variant="secondary" className="mt-2 min-h-11" onClick={cancelLookup}>
                Annuler
              </Button>
            </Note>
          ) : null}
          {status.kind === 'added' ? <Note tone="success">{status.text}</Note> : null}
          {status.kind === 'duplicate' ? (
            <Note tone="warning">
              Déjà dans la liste : {status.name}. Touche sa quantité pour la changer.
            </Note>
          ) : null}
          {status.kind === 'error' ? (
            <Note tone="error">
              <p className="m-0">{status.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => void lookupEan(status.ean)}>
                  Réessayer
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => setSheet({ kind: 'search', query: '' })}
                >
                  Chercher un aliment
                </Button>
              </div>
            </Note>
          ) : null}
          {status.kind === 'unknown' ? (
            <Note tone="error">
              <p className="m-0">
                {status.incomplete
                  ? `Produit trouvé (${status.ean}) mais sans toutes les valeurs nutritionnelles.`
                  : `Produit inconnu (${status.ean}).`}{' '}
                Cherche l’aliment à la place : ta liste est conservée.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => setSheet({ kind: 'search', query: status.name ?? '' })}
                >
                  Chercher un aliment
                </Button>
                <Button variant="secondary" className="min-h-11" onClick={() => createFoodFor(status)}>
                  Créer l’aliment
                </Button>
              </div>
            </Note>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <label htmlFor="recipe-scan-name" className="text-label uppercase text-ink-muted">
              Nom de la recette
            </label>
            <input
              id="recipe-scan-name"
              value={draft.name}
              maxLength={MAX_RECIPE_NAME_LENGTH}
              placeholder="Ex. Egg muffins"
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => dispatch({ type: 'set_name', name: e.target.value })}
              className="focus-ring min-h-11 w-full rounded-sm bg-transparent p-0 font-display text-title text-ink placeholder:text-ink-faint"
            />
          </div>
          <span className="pb-3 text-caption font-semibold text-ink-muted">
            {draft.ingredients.length} ingr.
          </span>
        </div>

        <section aria-label="Ingrédients" className="rounded-lg bg-surface px-3.5 py-1 shadow-card">
          {draft.ingredients.length === 0 ? (
            <p className="m-0 py-4 text-body text-ink-muted">
              Scanne un produit avec la caméra, saisis son code ou cherche un aliment : la liste se remplit
              ici.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {draft.ingredients.map((ing) => (
                <IngredientRow
                  key={ing.key}
                  ingredient={ing}
                  photoUrl={ing.foodId !== undefined ? photos.get(ing.foodId) : undefined}
                  onEdit={() => setSheet({ kind: 'grams', key: ing.key })}
                  onRemove={() => dispatch({ type: 'remove', key: ing.key })}
                />
              ))}
            </ul>
          )}
        </section>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="min-h-11 flex-1 px-3!"
            icon={<Plus size={18} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => setSheet({ kind: 'search', query: '' })}
          >
            Chercher un aliment
          </Button>
          <Button
            variant="secondary"
            className="min-h-11 flex-1 px-3!"
            onClick={() => setSheet({ kind: 'code' })}
          >
            Saisir un code
          </Button>
        </div>

        {draft.ingredients.length > 0 || draft.name.trim() !== '' ? (
          <Button variant="text" className="min-h-11 self-center" onClick={() => setSheet({ kind: 'clear' })}>
            Tout effacer
          </Button>
        ) : null}
      </div>

      {/* Place sous la liste pour la feuille de résultat (fixe) ; elle recouvre la barre d'onglets. */}
      <div aria-hidden="true" style={{ height: panelHeight }} />
      <ResultPanel
        servingsText={servingsText}
        servings={draft.servings}
        maxServings={MAX_RECIPE_SERVINGS}
        perServing={nutrition?.perServing ?? null}
        macrosNote={macrosNote}
        problem={showProblem ? problem : null}
        createError={createError}
        createLabel={createLabel}
        creating={creating}
        onStep={(d) => {
          dispatch({ type: 'set_servings', servings: draft.servings + d })
          setShowProblem(false)
        }}
        onEdit={() => setSheet({ kind: 'servings' })}
        onCreate={() => void create()}
        onHeight={setPanelHeight}
      />

      {sheet?.kind === 'search' ? (
        <FoodSearchSheet
          index={foods.index}
          preparing={foods.preparing}
          failed={foods.error != null && foods.preparing === false && foods.foods === undefined}
          initialQuery={sheet.query}
          onPick={(food) => {
            closeSheet()
            addFood(food)
          }}
          onClose={closeSheet}
        />
      ) : null}
      {sheet?.kind === 'code' ? (
        <CodeSheet
          onSubmit={(ean) => {
            closeSheet()
            void lookupEan(ean)
          }}
          onClose={closeSheet}
        />
      ) : null}
      {editing ? (
        <GramsSheet
          key={editing.key}
          ingredient={editing}
          onSave={(grams) => {
            dispatch({ type: 'set_grams', key: editing.key, grams })
            closeSheet()
          }}
          onWhole={() => {
            dispatch({ type: 'whole_package', key: editing.key })
            closeSheet()
          }}
          onRemove={() => {
            dispatch({ type: 'remove', key: editing.key })
            closeSheet()
          }}
          onClose={closeSheet}
        />
      ) : null}
      {sheet?.kind === 'servings' ? (
        <ServingsSheet
          servings={draft.servings}
          unit={draft.servingUnit}
          fridge={fridge}
          onServings={(n) => dispatch({ type: 'set_servings', servings: n })}
          onUnit={(unit) => dispatch({ type: 'set_unit', unit })}
          onFridge={(n) => dispatch({ type: 'set_fridge', fridge: n })}
          onClose={closeSheet}
        />
      ) : null}
      {sheet?.kind === 'clear' ? (
        <ConfirmSheet
          title="Tout effacer ?"
          message="Le nom, les ingrédients et les quantités seront supprimés. Les produits scannés restent dans ta liste d’aliments."
          confirmLabel="Tout effacer"
          onConfirm={() => {
            dispatch({ type: 'clear' })
            setStatus({ kind: 'idle' })
            setShowProblem(false)
            closeSheet()
          }}
          onCancel={closeSheet}
        />
      ) : null}
    </div>
  )
}
