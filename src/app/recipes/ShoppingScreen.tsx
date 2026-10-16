import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteShoppingList, saveShoppingList, setShoppingItemChecked } from '../../db'
import {
  AISLE_LABELS,
  AISLE_ORDER,
  groupShoppingItems,
  manualShoppingItem,
  normalizeFoodSearch,
} from '../../domain/nutrition'
import type { Aisle, LibraryRecipe, ShoppingItem, ShoppingList } from '../../types'
import {
  Button,
  Card,
  ConfirmSheet,
  DecimalField,
  ErrorNote,
  Sheet,
  SelectField,
  TextField,
  errorMessage,
  parseDecimal,
  useLiveQuery,
} from '../../ui'
import { BackLink } from '../nutrition/parts'
import { fmtGrams, fmtPortions, portionsWord } from './format'
import { Loading, RECIPES_PATH, SearchIcon, focusRing, iconButtonClass, searchInputClass } from './parts'
import { addManualItem, loadCurrentList, rebuildList } from './shoppingList'
import { useRecipeLibrary } from './useRecipes'

const aisleOptions = AISLE_ORDER.map((a) => ({ value: a, label: AISLE_LABELS[a] }))

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
      <div className="relative">
        <label htmlFor="shopping-search" className="sr-only">
          Rechercher une recette
        </label>
        <SearchIcon />
        <input
          id="shopping-search"
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder="Rechercher une recette"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={searchInputClass}
        />
      </div>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {shown.map((r) => {
          const portions = picked.get(r.id)
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-hi py-2 pl-3 pr-2"
            >
              <span className="min-w-0 text-base font-medium leading-snug">{r.name}</span>
              {portions === undefined ? (
                <Button
                  variant="secondary"
                  width="auto"
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
                    className={iconButtonClass}
                    aria-label={`Une portion de moins : ${r.name}`}
                    onClick={() => setPortions(r.id, portions - 1)}
                  >
                    −
                  </button>
                  <span
                    className="min-w-9 text-center text-lg font-bold tabular-nums"
                    aria-label={`${fmtPortions(portions)} ${portionsWord(portions)} de ${r.name}`}
                  >
                    {fmtPortions(portions)}
                  </span>
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Une portion de plus : ${r.name}`}
                    onClick={() => setPortions(r.id, portions + 1)}
                  >
                    +
                  </button>
                </span>
              )}
            </li>
          )
        })}
        {shown.length === 0 ? <li className="text-base text-zinc-400">Aucune recette trouvée.</li> : null}
      </ul>
      <div className="sticky bottom-0 -mx-4 mt-3 flex flex-col gap-2 bg-surface px-4 pb-1 pt-2">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void apply()} disabled={busy}>
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
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void submit()} disabled={busy}>
          Ajouter
        </Button>
      </div>
    </Sheet>
  )
}

export default function ShoppingScreen() {
  const { data: lib, error: libError } = useRecipeLibrary()
  const live = useLiveQuery(() => loadCurrentList(), [])
  const [sheet, setSheet] = useState<'recipes' | 'manual' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list: ShoppingList | undefined = live.data
  const groups = useMemo(() => (list ? groupShoppingItems(list.items) : []), [list])
  const names = useMemo(() => new Map((lib?.recipes ?? []).map((r) => [r.id, r.name])), [lib])
  const checked = list ? list.items.filter((i) => i.checked).length : 0

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
    <section>
      <BackLink to={RECIPES_PATH}>Recettes</BackLink>
      <h1 className="mt-1 text-3xl font-bold">Courses</h1>

      {live.error || libError ? (
        <div className="mt-4">
          <ErrorNote>Impossible de lire la liste. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      {live.loading && !list ? (
        <Loading />
      ) : (
        <>
          <Card className="mt-4">
            <h2 className="text-lg font-bold">Recettes de la liste</h2>
            {list && list.sources.length > 0 ? (
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-base text-zinc-200">
                {list.sources.map((s) => (
                  <li key={s.recipeId} className="flex justify-between gap-3">
                    <span className="min-w-0">{names.get(s.recipeId) ?? 'Recette supprimée'}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">
                      {fmtPortions(s.portions)} {portionsWord(s.portions)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-base text-zinc-400">Aucune recette pour l’instant.</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={!lib || busy} onClick={() => setSheet('recipes')}>
                Choisir les recettes
              </Button>
              <Button
                variant="secondary"
                disabled={!lib || busy || !list || list.sources.length === 0}
                onClick={() => list && void run(() => apply(list.sources))}
              >
                Régénérer
              </Button>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              Régénérer recalcule les quantités (recette modifiée) et garde ce que tu as déjà coché.
            </p>
          </Card>

          {!list || list.items.length === 0 ? (
            <Card className="mt-4 text-center">
              <p className="text-lg font-semibold">Liste vide</p>
              <p className="mt-1 text-base text-zinc-400">
                Choisis des recettes : les ingrédients sont additionnés et rangés par rayon.
              </p>
            </Card>
          ) : (
            <>
              <p aria-live="polite" className="mt-5 text-sm text-zinc-400" data-testid="shopping-progress">
                {checked} / {list.items.length} dans le panier
              </p>
              {groups.map((g) => (
                <section key={g.aisle} className="mt-3" aria-labelledby={`aisle-${g.aisle}`}>
                  <h2 id={`aisle-${g.aisle}`} className="mb-1.5 text-lg font-bold">
                    {AISLE_LABELS[g.aisle]}
                  </h2>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {g.items.map((item) => (
                      <li key={item.id} className="flex items-stretch gap-2">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.checked}
                          disabled={busy}
                          onClick={() =>
                            void run(() => setShoppingItemChecked(list.id, item.id, !item.checked))
                          }
                          className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl border px-3 py-2 text-left active:bg-surface-hi ${focusRing} ${
                            item.checked ? 'border-line bg-surface/60' : 'border-line bg-surface'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-bold ${
                              item.checked
                                ? 'border-orange-400 bg-orange-400 text-zinc-950'
                                : 'border-zinc-500'
                            }`}
                          >
                            {item.checked ? '✓' : ''}
                          </span>
                          <span
                            className={`min-w-0 flex-1 text-lg leading-snug ${item.checked ? 'text-zinc-500 line-through' : 'font-medium'}`}
                          >
                            {item.name}
                          </span>
                          {item.grams > 0 ? (
                            <span
                              className={`shrink-0 text-lg font-semibold tabular-nums ${item.checked ? 'text-zinc-500' : 'text-zinc-200'}`}
                            >
                              {fmtGrams(item.grams)}
                            </span>
                          ) : null}
                        </button>
                        {item.manual === true ? (
                          <button
                            type="button"
                            className={`${iconButtonClass} h-auto w-12`}
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
                            ✕
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <Button variant="secondary" onClick={() => setSheet('manual')} disabled={busy}>
              Ajouter un article
            </Button>
            {list && (list.items.length > 0 || list.sources.length > 0) ? (
              <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={busy}>
                Vider la liste
              </Button>
            ) : null}
            <Link
              to={RECIPES_PATH}
              className="flex min-h-12 items-center justify-center text-base font-medium text-zinc-300 underline"
            >
              Voir les recettes
            </Link>
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
    </section>
  )
}
