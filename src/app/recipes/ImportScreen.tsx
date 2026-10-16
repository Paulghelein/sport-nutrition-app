import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { checkLogEntry, commitImport, listCiqualFoods, validateRecipeInput } from '../../db'
import { recipeNutrition, roundMacros } from '../../domain/nutrition'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import type { FoodLogEntry, ImportPreviewItem, ImportOutcome, Recipe, RecipeInput } from '../../types'
import { Button, Card, ErrorNote, SuccessNote, errorMessage, linkButtonClass } from '../../ui'
import { SLOT_LABEL, fmtG, fmtInt } from '../nutrition/format'
import { BackLink } from '../nutrition/parts'
import { ensureCiqualLoaded } from '../nutrition/ciqualLoader'
import { fmtMinutes } from './format'
import { Badge, Loading, focusRing } from './parts'
import { useRecipeLibrary } from './useRecipes'

type ImportModule = typeof import('../../domain/claude/import')

function asRecipe(input: RecipeInput): Recipe {
  return { ...input, id: 'import', source: 'user', updatedAt: '' }
}

function Warnings({ list }: { list: readonly string[] }) {
  if (list.length === 0) return null
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {list.map((w, i) => (
        <li key={i} className="text-sm text-amber-300">
          ⚠ {w}
        </li>
      ))}
    </ul>
  )
}

function Selectable({
  checked,
  onChange,
  children,
  label,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  children: React.ReactNode
  label: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-orange-400 ${
        checked ? 'border-orange-400/60 bg-orange-400/5' : 'border-v1-line bg-v1-surface'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-6 shrink-0 accent-orange-400"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export default function ImportScreen() {
  const { data: lib } = useRecipeLibrary()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [items, setItems] = useState<ImportPreviewItem[] | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [parseError, setParseError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const mod = useRef<ImportModule | null>(null)

  const analyse = async (source: string) => {
    setBusy(true)
    setError(null)
    setParseError(null)
    setOutcome(null)
    try {
      // Zod et l'analyseur ne sont chargés qu'ici ; Ciqual sert à relier les ingrédients par leur nom.
      const [m] = await Promise.all([
        import('../../domain/claude/import'),
        ensureCiqualLoaded().catch(() => undefined),
      ])
      mod.current = m
      const ciqual = await listCiqualFoods()
      const result = m.parseImport(source, {
        today: toLocalDate(new Date()),
        ciqual,
        validateRecipe: validateRecipeInput,
        validateEntry: checkLogEntry,
      })
      if (!result.ok) {
        setItems(null)
        setParseError(result.error)
      } else {
        setItems(result.items)
        setSelected(
          new Set(result.items.filter((i) => i.kind === 'recipe' || i.kind === 'meal').map((i) => i.index)),
        )
      }
    } catch (e) {
      setItems(null)
      setParseError(errorMessage(e, 'Impossible d’analyser ce texte. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    try {
      const content = await file.text()
      setText(content)
      await analyse(content)
    } catch {
      setParseError('Impossible de lire ce fichier.')
    }
  }

  const toggle = (index: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(index)
      else next.delete(index)
      return next
    })

  const chosen = (items ?? []).filter((i) => selected.has(i.index))
  const recipeCount = chosen.filter((i) => i.kind === 'recipe').length
  const mealCount = chosen.filter((i) => i.kind === 'meal').length

  const confirm = async () => {
    const m = mod.current
    if (!items || !m) return
    setBusy(true)
    setError(null)
    try {
      const recipes: RecipeInput[] = []
      const entries: FoodLogEntry[] = []
      for (const item of chosen) {
        if (item.kind === 'recipe') recipes.push(item.recipe)
        else if (item.kind === 'meal') {
          entries.push(
            m.importedMealEntry(item.meal, { id: crypto.randomUUID(), createdAt: new Date().toISOString() }),
          )
        }
      }
      const done = await commitImport(recipes, entries)
      setOutcome(done)
      setItems(null)
      setText('')
      setFileName(null)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer l’import. Rien n’a été ajouté ; réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <BackLink to="/reglages">Réglages</BackLink>
      <h1 className="mt-1 text-3xl font-bold">Importer</h1>
      <p className="mt-2 text-base text-zinc-400">
        Colle la réponse de Claude (ou un fichier .json) : des recettes et des repas à ajouter au journal. Tu
        vérifies tout avant d’enregistrer.
      </p>

      {outcome ? (
        <div className="mt-4 flex flex-col gap-3">
          <SuccessNote>
            {outcome.recipesCreated} recette{outcome.recipesCreated > 1 ? 's' : ''} créée
            {outcome.recipesCreated > 1 ? 's' : ''}, {outcome.mealsLogged} repas ajouté
            {outcome.mealsLogged > 1 ? 's' : ''} au journal.
          </SuccessNote>
          {outcome.recipesCreated > 0 ? (
            <Link to="/nutrition/recettes" className={linkButtonClass('secondary')}>
              Voir les recettes
            </Link>
          ) : null}
          {outcome.mealsLogged > 0 ? (
            <Link
              to={`/nutrition?date=${outcome.entries[0]?.date ?? ''}`}
              className={linkButtonClass('secondary')}
            >
              Voir le journal
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <label htmlFor="import-text" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Texte à importer
        </label>
        <textarea
          id="import-text"
          rows={7}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFileName(null)
            // Le texte a changé : l'aperçu ne correspond plus à ce qui est affiché.
            setItems(null)
            setSelected(new Set())
            setParseError(null)
          }}
          placeholder="Colle ici la réponse de Claude"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
        />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Button onClick={() => void analyse(text)} disabled={busy || text.trim() === ''}>
          Analyser
        </Button>
        <label
          className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi px-4 text-base font-semibold text-zinc-100 active:bg-zinc-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-orange-400`}
        >
          {fileName ? `Fichier : ${fileName}` : 'Choisir un fichier .json'}
          <input
            type="file"
            accept=".json,application/json,text/plain"
            className="sr-only"
            aria-label="Fichier JSON à importer"
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {parseError ? (
        <div className="mt-4">
          <ErrorNote>{parseError}</ErrorNote>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      {busy && !items ? <Loading /> : null}

      {items ? (
        <section className="mt-7" aria-labelledby="import-preview">
          <h2 id="import-preview" className="text-xl font-bold">
            Aperçu
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {items.length} élément{items.length > 1 ? 's' : ''} trouvé{items.length > 1 ? 's' : ''}. Décoche
            ce que tu ne veux pas garder.
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {items.map((item) => {
              if (item.kind === 'recipe') {
                const nutrition = lib ? recipeNutrition(asRecipe(item.recipe), lib.lookup) : null
                const m = nutrition ? roundMacros(nutrition.perServing) : null
                return (
                  <li key={item.index}>
                    <Selectable
                      checked={selected.has(item.index)}
                      onChange={(on) => toggle(item.index, on)}
                      label={`Importer la recette ${item.recipe.name}`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold leading-snug">{item.recipe.name}</span>
                        <Badge>Recette</Badge>
                      </span>
                      <span className="mt-1 block text-sm text-zinc-400">
                        {item.recipe.servings} portion{item.recipe.servings > 1 ? 's' : ''} ·{' '}
                        {fmtMinutes(item.recipe.prepMinutes + item.recipe.cookMinutes)} ·{' '}
                        {item.recipe.ingredients.length} ingrédients · {item.recipe.steps.length} étapes
                      </span>
                      {m ? (
                        <span className="mt-1 block text-base font-medium tabular-nums">
                          {fmtInt(m.kcal)} kcal · P {fmtG(m.protein)} · G {fmtG(m.carbs)} · L {fmtG(m.fat)}
                          <span className="text-sm font-normal text-zinc-400"> par portion</span>
                        </span>
                      ) : null}
                      {nutrition && nutrition.missing.length > 0 ? (
                        <span className="mt-1 block text-sm text-amber-300">
                          ⚠ Sans données : {nutrition.missing.join(', ')}.
                        </span>
                      ) : null}
                      <Warnings list={item.warnings} />
                    </Selectable>
                  </li>
                )
              }
              if (item.kind === 'meal') {
                const t = roundMacros(item.meal.totals)
                return (
                  <li key={item.index}>
                    <Selectable
                      checked={selected.has(item.index)}
                      onChange={(on) => toggle(item.index, on)}
                      label={`Ajouter le repas ${item.meal.name} au journal`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold leading-snug">{item.meal.name}</span>
                        <Badge>Repas</Badge>
                        {item.meal.estimated ? <Badge tone="warn">Estimé</Badge> : null}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-400">
                        {SLOT_LABEL[item.meal.slot]} · {formatDateFr(item.meal.date)}
                      </span>
                      <span className="mt-1 block text-base font-medium tabular-nums">
                        {fmtInt(t.kcal)} kcal · P {fmtG(t.protein)} · G {fmtG(t.carbs)} · L {fmtG(t.fat)}
                      </span>
                      <Warnings list={item.warnings} />
                    </Selectable>
                  </li>
                )
              }
              if (item.kind === 'unsupported') {
                return (
                  <li key={item.index} className="rounded-2xl border border-v1-line bg-v1-surface p-3 opacity-80">
                    <p className="text-base font-semibold">
                      Élément {item.index + 1} : <span className="font-mono text-sm">{item.type}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{item.message}</p>
                    <p className="mt-1 text-sm text-zinc-400">Ignoré pour l’instant.</p>
                  </li>
                )
              }
              // Éléments J9 : jamais produits ici (pas de `exercises` dans le contexte d'import).
              if (item.kind !== 'invalid') return null
              return (
                <li key={item.index} className="rounded-2xl border border-red-400/40 bg-red-500/10 p-3">
                  <p className="text-base font-semibold text-red-200">Élément {item.index + 1} invalide</p>
                  <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                    {item.errors.map((e, i) => (
                      <li key={i} className="text-sm text-red-200">
                        {e}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
          <Card className="mt-4">
            <p className="text-base">
              À enregistrer : <strong>{recipeCount}</strong> recette{recipeCount > 1 ? 's' : ''},{' '}
              <strong>{mealCount}</strong> repas.
            </p>
            <Button
              className="mt-3"
              onClick={() => void confirm()}
              disabled={busy || recipeCount + mealCount === 0}
            >
              Importer la sélection
            </Button>
          </Card>
        </section>
      ) : null}
    </section>
  )
}
