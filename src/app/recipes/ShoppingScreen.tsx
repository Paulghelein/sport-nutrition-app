import { Check, Minus, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { deleteShoppingList, saveShoppingList, setShoppingItemChecked } from '../../db'
import {
  AISLE_LABELS,
  AISLE_ORDER,
  groupShoppingItems,
  manualShoppingItem,
  normalizeFoodSearch,
} from '../../domain/nutrition'
import { foodCategory, isScannedFood } from '../../domain/nutrition/category'
import type { Aisle, LibraryRecipe, ShoppingItem, ShoppingList } from '../../types'
import { errorMessage, parseDecimal, useLiveQuery } from '../../ui'
import { Button, Card, FoodTile, Sheet, cx } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { DecimalField, SelectField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { NutritionTabs } from '../nutrition/NutritionTabs'
import { usePhotoUrls } from '../nutrition/usePhotoUrls'
import { fmtGrams, portionsText } from './format'
import { Loading } from './parts'
import { SearchBox } from '../../ui/kit/SearchBox'
import { formatDecimal } from '../../ui/kit/format'
import { addManualItem, loadCurrentList, rebuildList } from './shoppingList'
import { useFridgePortions } from './useFridge'
import { useRecipeLibrary } from './useRecipes'

const aisleOptions = AISLE_ORDER.map((a) => ({ value: a, label: AISLE_LABELS[a] }))

const smallStep =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-ink active:opacity-70'

function PickRecipesSheet({
  recipes,
  initial,
  onClose,
  onApply,
}: {
  recipes: readonly LibraryRecipe[]
  initial: ReadonlyMap<string, number>
  onClose: () => void
  onApply: (sources: { recipeId: string; portions: number }[]) => Promise<void>
}) {
  const [picked, setPicked] = useState<Map<string, number>>(() => new Map(initial))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = normalizeFoodSearch(query)
  const shown = recipes.filter((r) => q === '' || normalizeFoodSearch(r.name).includes(q))

  const setPortions = (id: string, portions: number) =>
    setPicked((prev) => {
      const next = new Map(prev)
      if (portions <= 0) next.delete(id)
      else next.set(id, portions)
      return next
    })

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      await onApply([...picked].map(([recipeId, portions]) => ({ recipeId, portions })))
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible de générer la liste. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Recettes de la liste" onClose={onClose} busy={busy}>
      <div className="flex">
        <SearchBox
          id="shopping-search"
          label="Rechercher une recette"
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
        />
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map((r) => {
          const portions = picked.get(r.id)
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0"
            >
              <span className="min-w-0 text-body-strong">{r.name}</span>
              {portions === undefined ? (
                <Button
                  variant="flat"
                  className="shrink-0"
                  aria-label={`Ajouter ${r.name}`}
                  onClick={() => setPortions(r.id, r.servings)}
                >
                  Ajouter
                </Button>
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={smallStep}
                    aria-label={`Une portion de moins : ${r.name}`}
                    onClick={() => setPortions(r.id, portions - 1)}
                  >
                    <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <span className="min-w-9 text-center font-display text-title tabular-nums">
                    <span aria-hidden="true">{formatDecimal(portions, 2)}</span>
                    <span className="sr-only">{`${portionsText(portions, r.servingUnit)} de ${r.name}`}</span>
                  </span>
                  <button
                    type="button"
                    className={smallStep}
                    aria-label={`Une portion de plus : ${r.name}`}
                    onClick={() => setPortions(r.id, portions + 1)}
                  >
                    <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          )
        })}
        {shown.length === 0 ? (
          <li className="py-2 text-body text-ink-muted">Aucune recette trouvée.</li>
        ) : null}
      </ul>
      {/* Dans une Sheet : -mx-4 px-4 est couplé au px-4 de src/ui/kit/Sheet.tsx (pas à la marge de page). */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-surface-raised px-4 pb-1 pt-2">
        {error ? <Note tone="error">{error}</Note> : null}
        <Button fullWidth onClick={() => void apply()} disabled={busy}>
          {picked.size === 0
            ? 'Vider les recettes'
            : `Générer la liste (${picked.size} recette${picked.size > 1 ? 's' : ''})`}
        </Button>
      </div>
    </Sheet>
  )
}

function ManualItemSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (item: ShoppingItem) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [grams, setGrams] = useState('')
  const [aisle, setAisle] = useState<Aisle>('other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (name.trim() === '') {
      setError('Indique le nom de l’article.')
      return
    }
    const g = grams.trim() === '' ? 0 : parseDecimal(grams)
    if (Number.isNaN(g)) {
      setError('La quantité doit être un nombre en grammes (ou vide).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(manualShoppingItem(name, aisle, g, crypto.randomUUID()))
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter l’article. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Ajouter un article" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-4">
        <TextField label="Article" value={name} onChange={setName} autoComplete="off" />
        <DecimalField label="Quantité (facultatif)" unit="g" value={grams} onChange={setGrams} />
        <SelectField label="Rayon" value={aisle} options={aisleOptions} onChange={setAisle} />
        {error ? <Note tone="error">{error}</Note> : null}
        <Button fullWidth onClick={() => void submit()} disabled={busy}>
          Ajouter
        </Button>
      </div>
    </Sheet>
  )
}

export default function ShoppingScreen() {
  const fridgePortions = useFridgePortions()
  const { data: lib, error: libError } = useRecipeLibrary()
  const live = useLiveQuery(() => loadCurrentList(), [])
  const [sheet, setSheet] = useState<'recipes' | 'manual' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list: ShoppingList | undefined = live.data
  const groups = useMemo(
    () => (list ? groupShoppingItems(list.items).filter((g) => g.items.length > 0) : []),
    [list],
  )
  const byId = useMemo(() => new Map((lib?.recipes ?? []).map((r) => [r.id, r])), [lib])
  const checked = list ? list.items.filter((i) => i.checked).length : 0
  // Produit scanné = aliment relié à un code-barres / Open Food Facts : photo hors ligne (Dexie) et badge.
  const isScanned = (item: ShoppingItem): boolean => {
    const food = item.foodId !== undefined ? lib?.lookup(item.foodId) : undefined
    return food !== undefined && isScannedFood(food)
  }
  const photoUrls = usePhotoUrls(
    (list?.items ?? []).flatMap((i) => (isScanned(i) && i.foodId !== undefined ? [i.foodId] : [])),
  )

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e, 'Action impossible. Réessaie.'))
    } finally {
      setBusy(false)
      setConfirmClear(false)
    }
  }

  const apply = async (sources: { recipeId: string; portions: number }[]) => {
    if (!lib) return
    await rebuildList(list, sources, lib.recipes)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <header>
        <h1 className="m-0 font-display text-display-l">Courses</h1>
      </header>
      <NutritionTabs current="shopping" fridgePortions={fridgePortions} />

      {live.error || libError ? (
        <Note tone="error">Impossible de lire la liste. Ferme l’app puis rouvre-la.</Note>
      ) : null}
      {error ? <Note tone="error">{error}</Note> : null}

      {live.loading && !list ? (
        <Loading />
      ) : (
        <>
          <Card padding="large" className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-title">Recettes de la liste</h2>
            {list && list.sources.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body">
                {list.sources.map((s) => (
                  <li key={s.recipeId} className="flex justify-between gap-3">
                    <span className="min-w-0">{byId.get(s.recipeId)?.name ?? 'Recette supprimée'}</span>
                    <span className="shrink-0 font-display font-bold tabular-nums">
                      {portionsText(s.portions, byId.get(s.recipeId)?.servingUnit)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body text-ink-muted">Aucune recette pour l’instant.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="flat" disabled={!lib || busy} onClick={() => setSheet('recipes')}>
                Choisir les recettes
              </Button>
              <Button
                variant="flat"
                disabled={!lib || busy || !list || list.sources.length === 0}
                onClick={() => list && void run(() => apply(list.sources))}
              >
                Régénérer
              </Button>
            </div>
            <p className="m-0 text-caption text-ink-muted">
              Régénérer recalcule les quantités (recette modifiée) et garde ce que tu as déjà coché.
            </p>
          </Card>

          {!list || list.items.length === 0 ? (
            <Card padding="large" className="flex flex-col items-center gap-1 text-center">
              <p className="m-0 font-display text-title">Liste vide</p>
              <p className="m-0 text-body text-ink-muted">
                Choisis des recettes : les ingrédients sont additionnés et rangés par rayon.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <p
                  aria-live="polite"
                  className="m-0 text-caption text-ink-muted"
                  data-testid="shopping-progress"
                >
                  {checked} / {list.items.length} dans le panier
                </p>
                <div
                  role="progressbar"
                  aria-label="Panier"
                  aria-valuemin={0}
                  aria-valuemax={list.items.length}
                  aria-valuenow={checked}
                  className="h-1.5 rounded-full bg-surface-sunken"
                >
                  <div
                    className="h-1.5 rounded-full bg-ember"
                    style={{ width: `${(checked / list.items.length) * 100}%` }}
                  />
                </div>
              </div>
              {groups.map((g) => (
                <section key={g.aisle} aria-labelledby={`aisle-${g.aisle}`} className="flex flex-col gap-1.5">
                  <h2 id={`aisle-${g.aisle}`} className="m-0 font-display text-title">
                    {AISLE_LABELS[g.aisle]}
                  </h2>
                  <Card padding="none" className="px-3">
                    <ul className="m-0 list-none p-0">
                      {g.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-stretch gap-1 border-t border-line first:border-t-0"
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={item.checked}
                            disabled={busy}
                            onClick={() =>
                              void run(() => setShoppingItemChecked(list.id, item.id, !item.checked))
                            }
                            className="focus-ring flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-sm py-2 text-left text-ink active:opacity-70"
                          >
                            <span
                              aria-hidden="true"
                              className={cx(
                                'grid size-8 shrink-0 place-items-center rounded-sm border-2',
                                item.checked ? 'border-ember bg-ember text-ink' : 'border-ink-muted',
                              )}
                            >
                              {item.checked ? <Check size={20} strokeWidth={2.5} /> : null}
                            </span>
                            <FoodTile
                              category={foodCategory({ name: item.name })}
                              photoUrl={item.foodId !== undefined ? photoUrls.get(item.foodId) : undefined}
                              badge={isScanned(item) ? 'barcode' : undefined}
                              size={40}
                              className={item.checked ? 'opacity-50' : undefined}
                            />
                            <span
                              className={cx(
                                'min-w-0 flex-1 text-headline',
                                item.checked && 'text-ink-muted line-through',
                              )}
                            >
                              {item.name}
                            </span>
                            {item.grams > 0 ? (
                              <span
                                className={cx(
                                  'shrink-0 font-display text-body-strong font-bold tabular-nums',
                                  item.checked && 'text-ink-muted',
                                )}
                              >
                                {fmtGrams(item.grams)}
                              </span>
                            ) : null}
                          </button>
                          {item.manual === true ? (
                            <button
                              type="button"
                              className="focus-ring grid min-h-16 w-12 shrink-0 place-items-center rounded-sm text-ink-muted active:opacity-70"
                              aria-label={`Supprimer ${item.name}`}
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  saveShoppingList({
                                    ...list,
                                    items: list.items.filter((x) => x.id !== item.id),
                                  }),
                                )
                              }
                            >
                              <X size={20} strokeWidth={1.75} aria-hidden="true" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </section>
              ))}
            </>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="secondary" fullWidth onClick={() => setSheet('manual')} disabled={busy}>
              Ajouter un article
            </Button>
            {list && (list.items.length > 0 || list.sources.length > 0) ? (
              <Button variant="danger" fullWidth onClick={() => setConfirmClear(true)} disabled={busy}>
                Vider la liste
              </Button>
            ) : null}
          </div>
        </>
      )}

      {sheet === 'recipes' && lib ? (
        <PickRecipesSheet
          recipes={lib.recipes}
          initial={new Map((list?.sources ?? []).map((s) => [s.recipeId, s.portions]))}
          onClose={() => setSheet(null)}
          onApply={apply}
        />
      ) : null}
      {sheet === 'manual' ? (
        <ManualItemSheet
          onClose={() => setSheet(null)}
          onAdd={async (item) => {
            await addManualItem(list, item)
          }}
        />
      ) : null}
      {confirmClear && list ? (
        <ConfirmSheet
          title="Vider la liste ?"
          message="Tous les articles et les recettes de la liste sont retirés."
          confirmLabel="Vider"
          busy={busy}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => void run(() => deleteShoppingList(list.id))}
        />
      ) : null}
    </div>
  )
}
