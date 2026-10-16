import { useCallback, useState } from 'react'
import { checkExercise, checkLogEntry, listCiqualFoods, validateRecipeInput } from '../../db'
import { applyClaudeSelection } from '../../db/claude'
import { toLocalDate } from '../../domain/shared/dates'
import type { ClaudeApplyOutcome } from '../../types/claude'
import type { ImportPreviewItem } from '../../types'
import { errorMessage } from '../../ui'
import { ensureCiqualLoaded } from '../nutrition/ciqualLoader'
import { useEngineInput } from '../training/useEngineInput'
import { CLIPBOARD_READ_MESSAGE, readFromClipboard } from './clipboard'
import { buildImportContext } from './importContext'
import { buildSelection, defaultSelection, selectionSize, toggleSelection } from './selection'

export interface ClaudeImportState {
  text: string
  setText: (text: string) => void
  /** Les données de l'app (bibliothèque, matériel…) sont chargées : l'analyse est possible. */
  ready: boolean
  loadError: boolean
  busy: boolean
  /** Lecture du presse-papiers : message à afficher (refus, indisponible, vide). */
  pasteNote: string | null
  parseError: string | null
  applyError: string | null
  items: ImportPreviewItem[] | null
  selected: ReadonlySet<number>
  toggle: (index: number, on: boolean) => void
  count: number
  outcome: ClaudeApplyOutcome | null
  /** Nom d'un exercice de la bibliothèque (l'id si inconnu). */
  nameOf: (id: string) => string
  /** Lit le presse-papiers (dans le geste) et analyse tout de suite si possible. */
  pasteFromClipboard: () => Promise<void>
  analyse: (source?: string) => Promise<void>
  apply: () => Promise<void>
}

/** Logique de l'écran « Coller la réponse de Claude » : lecture, analyse, sélection, application. */
export function useClaudeImport(): ClaudeImportState {
  const engine = useEngineInput()
  const [text, setTextState] = useState('')
  const [busy, setBusy] = useState(false)
  const [pasteNote, setPasteNote] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [items, setItems] = useState<ImportPreviewItem[] | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [outcome, setOutcome] = useState<ClaudeApplyOutcome | null>(null)

  const setText = useCallback((value: string) => {
    setTextState(value)
    // Le texte a changé : l'aperçu ne correspond plus.
    setItems(null)
    setSelected(new Set())
    setParseError(null)
    setOutcome(null)
  }, [])

  const analyse = async (source: string = text) => {
    const data = engine.data
    if (!data) return
    setBusy(true)
    setParseError(null)
    setApplyError(null)
    setOutcome(null)
    try {
      // Zod et l'analyseur ne sont chargés qu'ici ; Ciqual sert à relier les ingrédients par leur nom.
      const [m] = await Promise.all([
        import('../../domain/claude/import'),
        ensureCiqualLoaded().catch(() => undefined),
      ])
      const ciqual = await listCiqualFoods()
      const ctx = buildImportContext({
        today: toLocalDate(new Date()),
        ciqual,
        engine: data,
        validateRecipe: validateRecipeInput,
        validateEntry: checkLogEntry,
        validateExercise: checkExercise,
      })
      const result = m.parseImport(source, ctx)
      if (!result.ok) {
        setItems(null)
        setParseError(result.error)
      } else {
        setItems(result.items)
        setSelected(defaultSelection(result.items))
      }
    } catch (e) {
      setItems(null)
      setParseError(errorMessage(e, 'Impossible d’analyser ce texte. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const pasteFromClipboard = async () => {
    setPasteNote(null)
    const read = await readFromClipboard()
    if (!read.ok) {
      setPasteNote(CLIPBOARD_READ_MESSAGE[read.reason])
      return
    }
    setTextState(read.text)
    await analyse(read.text)
  }

  const apply = async () => {
    if (!items) return
    const selection = buildSelection(items, selected)
    if (selectionSize(selection) === 0) return
    setBusy(true)
    setApplyError(null)
    try {
      const done = await applyClaudeSelection(selection)
      setOutcome(done)
      setItems(null)
      setSelected(new Set())
      setTextState('')
    } catch (e) {
      setApplyError(errorMessage(e, 'Impossible d’appliquer la réponse. Rien n’a été modifié ; réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (index: number, on: boolean) =>
    setSelected((prev) => (items ? toggleSelection(items, prev, index, on) : prev))

  const count = items ? selectionSize(buildSelection(items, selected)) : 0

  return {
    text,
    setText,
    ready: engine.data !== undefined,
    loadError: engine.error !== null && engine.error !== undefined,
    busy,
    pasteNote,
    parseError,
    applyError,
    items,
    selected,
    toggle,
    count,
    outcome,
    nameOf: (id) => engine.data?.library.find((e) => e.id === id)?.name ?? id,
    pasteFromClipboard,
    analyse,
    apply,
  }
}
