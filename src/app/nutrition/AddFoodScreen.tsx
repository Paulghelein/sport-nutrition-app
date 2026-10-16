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
import { addDays, formatDateFr, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { Food, FoodLogEntry, FridgeItem, FreeEntryInput, QuickItem } from '../../types'
import { Button, ChoiceGroup, ErrorBoundary, ErrorNote, errorMessage, useLiveQuery } from '../../ui'
import { FreeEntrySheet } from './FreeEntrySheet'
import { QuantitySheet } from './QuantitySheet'
import { SLOT_LABEL, SLOT_TO, fmtG, fmtInt, isMealSlot, slotForNow } from './format'
import { BackLink, StickyStack, Toast } from './parts'
import { clearSearchSeed, peekSearchSeed } from './navContext'
import type { ToastState } from './parts'
import { useFoods } from './useFoods'

// Recettes de départ et feuille de choix : hors du chunk de l'écran tant qu'on n'ouvre pas ce choix.
const RecipePickerSheet = lazy(() => import('../recipes/RecipePickerSheet'))

const rowClass =
  'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left active:bg-surface-hi'

function FoodRow({ food, onPick }: { food: Food; onPick: (food: Food) => void }) {
  return (
    <li>
      <button type="button" className={rowClass} onClick={() => onPick(food)}>
        <span className="min-w-0">
          <span className="block text-base font-medium leading-snug">
            {food.favorite ? <span aria-label="Favori">★ </span> : null}
            {food.name}
          </span>
          <span className="block text-sm text-zinc-400">
            {food.brand ? `${food.brand} · ` : ''}P {fmtG(food.per100g.protein)} · G{' '}
            {fmtG(food.per100g.carbs)} · L {fmtG(food.per100g.fat)} / 100 g
          </span>
        </span>
        <span className="shrink-0 text-right text-base font-semibold tabular-nums">
          {fmtInt(food.per100g.kcal)}
          <span className="block text-sm font-normal text-zinc-400">kcal/100 g</span>
        </span>
      </button>
    </li>
  )
}

function QuickRow({ item, onAdd }: { item: QuickItem; onAdd: (item: QuickItem) => void }) {
  const name = item.kind === 'food' ? item.food.name : item.name
  const m = roundMacros(item.kind === 'food' ? macrosFor(item.food.per100g, item.grams) : item.macros)
  return (
    <li>
      <button
        type="button"
        className={rowClass}
        aria-label={`Ajouter ${name}, ${item.kind === 'food' ? `${fmtG(item.grams)} g, ` : ''}${fmtInt(m.kcal)} kcal`}
        onClick={() => onAdd(item)}
      >
        <span className="min-w-0">
          <span className="block text-base font-medium leading-snug">{name}</span>
          <span className="block text-sm text-zinc-400">
            {item.kind === 'food' ? `${fmtG(item.grams)} g · ` : ''}
            {fmtInt(m.kcal)} kcal · P {fmtG(m.protein)}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-400 text-2xl font-bold text-zinc-950"
        >
          +
        </span>
      </button>
    </li>
  )
}

export default function AddFoodScreen() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const today = toLocalDate(new Date())
  const askedDate = params.get('date')
  const date = askedDate !== null && isValidLocalDate(askedDate) ? askedDate : today
  const askedSlot = params.get('repas')
  const slot = isMealSlot(askedSlot) ? askedSlot : slotForNow()
  const when = date === today ? '' : date === addDays(today, -1) ? ' · hier' : ` · ${formatDateFr(date)}`
  const back = `/nutrition${date === today ? '' : `?date=${date}`}`

  const { foods, index, preparing, error: foodsError, retry } = useFoods()
  const recentLog = useLiveQuery(() => listLogBetween(addDays(today, -60), today), [today])

  const [query, setQuery] = useState(() => params.get('q') ?? peekSearchSeed())
  const [tab, setTab] = useState<'recents' | 'favorites' | null>(null)
  const [picked, setPicked] = useState<Food | null>(null)
  const [freeOpen, setFreeOpen] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)
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

  const createLink = `/nutrition/aliments/nouveau?repas=${slot}&date=${date}${searching ? `&nom=${encodeURIComponent(query.trim())}` : ''}`

  return (
    <>
      <BackLink to={back}>Journal</BackLink>
      <h1 className="mt-1 text-2xl font-bold">
        Ajouter {SLOT_TO[slot]}
        {when}
      </h1>

      <div className="mt-4">
        <label htmlFor="food-search" className="sr-only">
          Rechercher un aliment
        </label>
        <input
          id="food-search"
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un aliment"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="search"
          className="min-h-12 w-full rounded-xl border border-line bg-surface-hi px-4 text-base text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
        />
      </div>

      <Link
        to={`/nutrition/scanner?repas=${slot}&date=${date}`}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-400 px-3 text-base font-semibold text-zinc-950 no-underline active:bg-orange-300"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9v6M12 9v6M16 9v6" />
        </svg>
        Scanner un code-barres
      </Link>

      <Button variant="secondary" className="mt-2" onClick={() => setRecipeOpen(true)}>
        Portion de recette
      </Button>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setFreeOpen(true)}>
          Saisie libre
        </Button>
        <Link
          to={createLink}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-3 text-center text-base font-semibold text-orange-400 no-underline active:bg-white/5"
        >
          Créer un aliment
        </Link>
      </div>

      {foodsError ? (
        <div className="mt-3 flex flex-col gap-2">
          <ErrorNote>Impossible de charger la base d’aliments.</ErrorNote>
          <Button variant="secondary" onClick={retry}>
            Réessayer
          </Button>
        </div>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="mt-5">
        {preparing && searching ? (
          <p role="status" className="text-base text-zinc-300">
            Préparation de la base d’aliments…
          </p>
        ) : searching ? (
          results.length > 0 ? (
            <ul aria-label="Résultats" className="m-0 flex list-none flex-col gap-2 p-0">
              {results.map((food) => (
                <FoodRow key={food.id} food={food} onPick={setPicked} />
              ))}
            </ul>
          ) : (
            <p className="text-base text-zinc-300">
              Aucun aliment ne correspond. Essaie un autre mot, ou crée-le avec « Créer un aliment ».
            </p>
          )
        ) : (
          <>
            <ChoiceGroup
              legend="Raccourcis"
              value={shownTab}
              onChange={setTab}
              options={[
                { value: 'recents', label: 'Récents' },
                { value: 'favorites', label: 'Favoris' },
              ]}
            />
            {preparing && quick.length === 0 ? (
              <p role="status" className="mt-4 text-base text-zinc-300">
                Préparation de la base d’aliments…
              </p>
            ) : quick.length > 0 ? (
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {quick.map((item) => (
                  <QuickRow key={item.key} item={item} onAdd={(i) => void addQuick(i)} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-base text-zinc-400">
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
    </>
  )
}
