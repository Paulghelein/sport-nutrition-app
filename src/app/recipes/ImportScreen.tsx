import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { checkLogEntry, commitImport, listCiqualFoods, validateRecipeInput } from '../../db'
import { toLocalDate } from '../../domain/shared/dates'
import type { FoodLogEntry, ImportPreviewItem, ImportOutcome, RecipeInput } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { buttonClass } from '../../ui/kit/buttonClass'
import { Note } from '../../ui/kit/Note'
import {
  InvalidPreviewCard,
  MealPreviewCard,
  PreviewSection,
  RecipePreviewCard,
  UnsupportedPreviewCard,
  pasteAreaClass,
} from '../claude/previewCards'
import { ensureCiqualLoaded } from '../nutrition/ciqualLoader'
import { RECIPES_PATH, SETTINGS_PATH, journalPath } from '../routes'
import { Loading } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { useRecipeLibrary } from './useRecipes'

type ImportModule = typeof import('../../domain/claude/import')

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

  const renderItem = (item: ImportPreviewItem) => {
    if (item.kind === 'recipe') {
      return (
        <RecipePreviewCard
          item={item}
          lookup={lib?.lookup}
          label={`Importer la recette ${item.recipe.name}`}
          checked={selected.has(item.index)}
          onChange={(on) => toggle(item.index, on)}
        />
      )
    }
    if (item.kind === 'meal') {
      return (
        <MealPreviewCard
          item={item}
          checked={selected.has(item.index)}
          onChange={(on) => toggle(item.index, on)}
        />
      )
    }
    if (item.kind === 'unsupported') return <UnsupportedPreviewCard item={item} />
    // Éléments J9 : jamais produits ici (pas de `exercises` dans le contexte d'import).
    if (item.kind !== 'invalid') return null
    return <InvalidPreviewCard item={item} />
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <BackLink to={SETTINGS_PATH}>Réglages</BackLink>
      </div>
      <div>
        <h1 className="m-0 font-display text-display-l">Importer</h1>
        <p className="m-0 mt-2 text-body text-ink-muted">
          Colle la réponse de Claude (ou un fichier .json) : des recettes et des repas à ajouter au journal.
          Tu vérifies tout avant d’enregistrer.
        </p>
      </div>

      {outcome ? (
        <div className="flex flex-col gap-3">
          <Note tone="success">
            {outcome.recipesCreated} recette{outcome.recipesCreated > 1 ? 's' : ''} créée
            {outcome.recipesCreated > 1 ? 's' : ''}, {outcome.mealsLogged} repas ajouté
            {outcome.mealsLogged > 1 ? 's' : ''} au journal.
          </Note>
          {outcome.recipesCreated > 0 ? (
            <Link to={RECIPES_PATH} className={buttonClass('secondary', 'normal', true)}>
              Voir les recettes
            </Link>
          ) : null}
          {outcome.mealsLogged > 0 ? (
            <Link
              to={journalPath(outcome.entries[0]?.date ?? '')}
              className={buttonClass('secondary', 'normal', true)}
            >
              Voir le journal
            </Link>
          ) : null}
        </div>
      ) : null}

      <Card className="flex flex-col gap-3">
        <div>
          <label htmlFor="import-text" className="mb-1.5 block text-caption text-ink-muted">
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
            className={pasteAreaClass}
          />
        </div>
        <Button
          variant="flat"
          fullWidth
          onClick={() => void analyse(text)}
          disabled={busy || text.trim() === ''}
        >
          Analyser
        </Button>
        <label
          className={`${buttonClass('flat', 'normal', true)} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus`}
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
      </Card>

      {parseError ? <Note tone="error">{parseError}</Note> : null}
      {error ? <Note tone="error">{error}</Note> : null}
      {busy && !items ? <Loading /> : null}

      {items ? (
        <>
          <PreviewSection id="import-preview" items={items} renderItem={renderItem} />
          <Card className="flex flex-col gap-3">
            <p className="m-0 text-body">
              À enregistrer : <strong>{recipeCount}</strong> recette{recipeCount > 1 ? 's' : ''},{' '}
              <strong>{mealCount}</strong> repas.
            </p>
            <Button fullWidth onClick={() => void confirm()} disabled={busy || recipeCount + mealCount === 0}>
              Importer la sélection
            </Button>
          </Card>
        </>
      ) : null}
    </section>
  )
}
