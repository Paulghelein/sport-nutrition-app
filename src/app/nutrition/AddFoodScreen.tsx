import { Plus, ScanBarcode } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { addLogEntries, deleteLogEntry, listLogBetween, listLogForDate, undoRecipeEntries } from '../../db'
import {
  favoriteItems,
  foodLogEntry,
  freeLogEntry,
  macrosFor,
  recentItems,
  roundMacros,
  searchFoodIndex,
} from '../../domain/nutrition'
import { foodCategory, isScannedFood } from '../../domain/nutrition/category'
import { addDays, formatDateFr, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { Food, FoodLogEntry, FridgeItem, FreeEntryInput, QuickItem } from '../../types'
import { ErrorBoundary, errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, Segmented, buttonClass } from '../../ui/kit'
import { FoodRow as KitFoodRow } from '../../ui/kit/FoodRow'
import { Note } from '../../ui/kit/Note'
import { SearchBox } from '../../ui/kit/SearchBox'
import { NEW_FOOD_PATH, NUTRITION_PATH, SCAN_PATH } from '../routes'
import { FreeEntrySheet } from './FreeEntrySheet'
import { QuantitySheet } from './QuantitySheet'
import { SLOT_LABEL, SLOT_TO, fmtG, fmtInt, isMealSlot, slotForNow } from './format'
import { Toast } from './JournalToast'
import type { ToastState } from './JournalToast'
import { StickyStack } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { clearSearchSeed, peekSearchSeed } from './navContext'
import { useFoods } from './useFoods'

// Recettes de départ et feuille de choix : hors du chunk de l'écran tant qu'on n'ouvre pas ce choix.
const RecipePickerSheet = lazy(() => import('../recipes/RecipePickerSheet'))

const rowBorder = 'relative border-t border-line first:border-t-0'

function FoodRow({ food, onPick }: { food: Food; onPick: (food: Food) => void }) {
  const p = food.per100g
  return (
    <li className={rowBorder}>
      <KitFoodRow
        name={food.favorite ? `${food.name} (favori)` : food.name}
        quantity={food.brand ? `${food.brand} · 100 g` : '100 g'}
        protein={p.protein}
        carbs={p.carbs}
        fat={p.fat}
        kcal={p.kcal}
        category={foodCategory({ name: food.name })}
        scanned={isScannedFood(food)}
        onPress={() => onPick(food)}
        ariaLabel={`${food.name}${food.favorite ? ' (favori)' : ''}${food.brand ? `, ${food.brand}` : ''}, ${fmtInt(p.kcal)} kcal pour 100 g`}
      />
    </li>
  )
}

function QuickRow({ item, onAdd }: { item: QuickItem; onAdd: (item: QuickItem) => void }) {
  const name = item.kind === 'food' ? item.food.name : item.name
  const m = roundMacros(item.kind === 'food' ? macrosFor(item.food.per100g, item.grams) : item.macros)
  return (
    <li className={rowBorder}>
      <KitFoodRow
        name={name}
        quantity={item.kind === 'food' ? `${fmtG(item.grams)} g` : 'Saisie libre'}
        protein={m.protein}
        carbs={m.carbs}
        fat={m.fat}
        kcal={m.kcal}
        category={foodCategory({ name })}
        scanned={item.kind === 'food' && isScannedFood(item.food)}
        className="pr-12"
        ariaLabel={`Ajouter ${name}, ${item.kind === 'food' ? `${fmtG(item.grams)} g, ` : ''}${fmtInt(m.kcal)} kcal`}
        onPress={() => onAdd(item)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-canvas text-ink"
      >
        <Plus size={20} strokeWidth={2.25} />
      </span>
    </li>
  )
}

export default function AddFoodScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const today = toLocalDate(new Date())
  const askedDate = params.get('date')
  const date = askedDate !== null && isValidLocalDate(askedDate) ? askedDate : today
  const askedSlot = params.get('repas')
  const slot = isMealSlot(askedSlot) ? askedSlot : slotForNow()
  const when = date === today ? '' : date === addDays(today, -1) ? ' · hier' : ` · ${formatDateFr(date)}`
  const back = `${NUTRITION_PATH}${date === today ? '' : `?date=${date}`}`

  const { foods, index, preparing, error: foodsError, retry } = useFoods()
  const recentLog = useLiveQuery(() => listLogBetween(addDays(today, -60), today), [today])

  const [query, setQuery] = useState(() => params.get('q') ?? peekSearchSeed())
  const [tab, setTab] = useState<'recents' | 'favorites' | null>(null)
  const [picked, setPicked] = useState<Food | null>(null)
  // `?ouvrir=recette|libre` (feuille Ajouter) : ouvre la feuille demandée (même si l'écran est déjà affiché), puis
  // nettoie l'adresse (replace) pour que le retour arrière ne la rouvre pas.
  const [freeOpen, setFreeOpen] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)
  const wantedSheet = params.get('ouvrir')
  const [seenSheet, setSeenSheet] = useState<string | null>(null)
  if (wantedSheet !== seenSheet) {
    setSeenSheet(wantedSheet)
    if (wantedSheet === 'recette') setRecipeOpen(true)
    if (wantedSheet === 'libre') setFreeOpen(true)
  }
  useEffect(() => {
    if (wantedSheet === null) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('ouvrir')
        return next
      },
      { replace: true },
    )
  }, [wantedSheet, setParams])
  // Ajouts de cette session (repas + jour), conservés si on va voir une fiche aliment puis qu'on revient.
  const addedKey = `added:${slot}:${date}`
  const [storedAdded, setStoredAdded] = useState<string[]>(() => {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(addedKey) ?? '[]')
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  const dayLog = useLiveQuery(() => listLogForDate(date), [date])
  const existing = dayLog.data ? new Set(dayLog.data.map((e) => e.id)) : undefined
  const added = existing ? storedAdded.filter((id) => existing.has(id)) : storedAdded
  const setAdded = (update: (ids: string[]) => string[]) =>
    setStoredAdded((ids) => {
      const next = update(ids)
      sessionStorage.setItem(addedKey, JSON.stringify(next))
      return next
    })
  const busy = useRef(false)
  useEffect(() => clearSearchSeed(), [])
  const [toast, setToast] = useState<ToastState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  const results = useMemo(() => (index ? searchFoodIndex(index, query) : []), [index, query])
  const { recents, lastGrams } = useMemo(() => {
    const byId = new Map((foods ?? []).map((f) => [f.id, f]))
    const all = recentItems(recentLog.data ?? [], byId, 500)
    const grams = new Map<string, number>()
    for (const item of all) if (item.kind === 'food') grams.set(item.food.id, item.grams)
    return { recents: all.slice(0, 20), lastGrams: grams }
  }, [foods, recentLog.data])
  const favorites = useMemo(() => favoriteItems(foods ?? []), [foods])

  const shownTab = tab ?? (recents.length > 0 || favorites.length === 0 ? 'recents' : 'favorites')
  const quick = shownTab === 'recents' ? recents : favorites
  const searching = query.trim() !== ''

  const context = () => ({ id: crypto.randomUUID(), now: new Date().toISOString() })

  const record = async (entry: FoodLogEntry) => {
    await addLogEntries([entry])
    setAdded((a) => [...a, entry.id])
    setToast({
      message: `Ajouté : ${entry.name}`,
      undo: async () => {
        await deleteLogEntry(entry.id)
        setAdded((a) => a.filter((id) => id !== entry.id))
      },
    })
  }

  const addQuick = async (item: QuickItem) => {
    if (busy.current) return
    busy.current = true
    setError(null)
    try {
      await record(
        item.kind === 'food'
          ? foodLogEntry(item.food, item.grams, slot, date, context())
          : freeLogEntry(
              {
                name: item.name,
                kcal: item.macros.kcal,
                protein: item.macros.protein,
                carbs: item.macros.carbs,
                fat: item.macros.fat,
              },
              slot,
              date,
              context(),
            ),
      )
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter. Réessaie.'))
    } finally {
      busy.current = false
    }
  }

  const addFood = async (food: Food, grams: number) => {
    await record(foodLogEntry(food, grams, slot, date, context()))
    setPicked(null)
    setQuery('')
  }

  const addFree = async (input: FreeEntryInput) => {
    await record(freeLogEntry(input, slot, date, context()))
    setFreeOpen(false)
  }

  const addRecipeEntries = (entries: FoodLogEntry[], fridgeBefore: FridgeItem[]) => {
    const ids = entries.map((e) => e.id)
    setAdded((a) => [...a, ...ids])
    setToast({
      message: `Ajouté : ${entries[0]?.name ?? 'recette'}`,
      undo: async () => {
        // Supprime les entrées et rend les portions au frigo (ligne recréée si elle était vidée).
        await undoRecipeEntries(entries, fridgeBefore)
        setAdded((a) => a.filter((id) => !ids.includes(id)))
      },
    })
  }

  const createLink = `${NEW_FOOD_PATH}?repas=${slot}&date=${date}${searching ? `&nom=${encodeURIComponent(query.trim())}` : ''}`

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink to={back}>Journal</BackLink>
      <h1 className="m-0 font-display text-display-l">
        Ajouter {SLOT_TO[slot]}
        {when}
      </h1>

      <SearchBox
        id="food-search"
        label="Rechercher un aliment"
        value={query}
        onChange={setQuery}
        onClear={() => setQuery('')}
        autoFocus
      />

      <Link to={`${SCAN_PATH}?repas=${slot}&date=${date}`} className={buttonClass('primary', 'normal', true)}>
        <ScanBarcode size={22} strokeWidth={1.75} aria-hidden="true" />
        Scanner un code-barres
      </Link>

      <Button variant="secondary" fullWidth onClick={() => setRecipeOpen(true)}>
        Portion de recette
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setFreeOpen(true)}>
          Saisie libre
        </Button>
        <Link to={createLink} className={buttonClass('secondary')}>
          Créer un aliment
        </Link>
      </div>

      {foodsError ? (
        <div className="flex flex-col gap-2">
          <Note tone="error">Impossible de charger la base d’aliments.</Note>
          <Button variant="secondary" onClick={retry}>
            Réessayer
          </Button>
        </div>
      ) : null}
      {error ? <Note tone="error">{error}</Note> : null}

      <div className="mt-2 flex flex-col gap-3">
        {preparing && searching ? (
          <p role="status" className="m-0 text-body text-ink-muted">
            Préparation de la base d’aliments…
          </p>
        ) : searching ? (
          results.length > 0 ? (
            <Card padding="none" className="px-4">
              <ul aria-label="Résultats" className="m-0 list-none p-0">
                {results.map((food) => (
                  <FoodRow key={food.id} food={food} onPick={setPicked} />
                ))}
              </ul>
            </Card>
          ) : (
            <p className="m-0 text-body text-ink-muted">
              Aucun aliment ne correspond. Essaie un autre mot, ou crée-le avec « Créer un aliment ».
            </p>
          )
        ) : (
          <>
            <Segmented
              ariaLabel="Raccourcis"
              value={shownTab}
              onChange={setTab}
              options={[
                { value: 'recents', label: 'Récents' },
                { value: 'favorites', label: 'Favoris' },
              ]}
            />
            {preparing && quick.length === 0 ? (
              <p role="status" className="m-0 text-body text-ink-muted">
                Préparation de la base d’aliments…
              </p>
            ) : quick.length > 0 ? (
              <Card padding="none" className="px-4">
                <ul className="m-0 list-none p-0">
                  {quick.map((item) => (
                    <QuickRow key={item.key} item={item} onAdd={(i) => void addQuick(i)} />
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="m-0 text-body text-ink-muted">
                {shownTab === 'recents'
                  ? 'Tes aliments récents apparaîtront ici. Cherche un aliment ci-dessus pour commencer.'
                  : 'Aucun favori pour l’instant : ouvre un aliment et touche l’étoile.'}
              </p>
            )}
          </>
        )}
      </div>

      <StickyStack>
        <Toast toast={toast} onDismiss={dismissToast} />
        {added.length > 0 ? (
          <Button
            fullWidth
            onClick={() => {
              sessionStorage.removeItem(addedKey)
              clearSearchSeed()
              navigate(back)
            }}
          >
            Terminer ({added.length} ajouté{added.length > 1 ? 's' : ''} · {SLOT_LABEL[slot]})
          </Button>
        ) : null}
      </StickyStack>

      {picked ? (
        <QuantitySheet
          key={picked.id}
          food={picked}
          contextSearch={`?repas=${slot}&date=${date}`}
          initialGrams={lastGrams.get(picked.id) ?? picked.defaultPortionG ?? 100}
          onSubmit={(grams) => addFood(picked, grams)}
          onClose={() => setPicked(null)}
        />
      ) : null}
      {recipeOpen ? (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <RecipePickerSheet
              date={date}
              slot={slot}
              onLogged={addRecipeEntries}
              onClose={() => setRecipeOpen(false)}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      {freeOpen ? <FreeEntrySheet onSubmit={addFree} onClose={() => setFreeOpen(false)} /> : null}
    </div>
  )
}
