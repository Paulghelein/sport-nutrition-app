import { useState } from 'react'
import { deleteLogEntry, updateLogEntry } from '../../db'
import { regrams, roundMacros } from '../../domain/nutrition'
import type { FoodLogEntry, MealSlot } from '../../types'
import {
  Button,
  ChoiceGroup,
  ConfirmSheet,
  DecimalField,
  ErrorNote,
  Sheet,
  errorMessage,
  parseDecimal,
  toInputNumber,
} from '../../ui'
import { FreeFields } from './freeEntry'
import { parseFreeDraft } from './freeDraft'
import type { FreeDraft } from './freeDraft'
import { macroLine, slotChoices } from './format'

function initialDraft(entry: FoodLogEntry): FreeDraft {
  const m = roundMacros(entry.macros)
  return {
    name: entry.name,
    kcal: toInputNumber(m.kcal),
    protein: toInputNumber(m.protein),
    carbs: toInputNumber(m.carbs),
    fat: toInputNumber(m.fat),
  }
}

/** Modification d'une entrée du journal : quantité (aliment) ou valeurs (autres), repas, suppression. */
export function EntrySheet({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: FoodLogEntry
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const origin = entry.origin
  const [slot, setSlot] = useState<MealSlot>(entry.slot)
  const [grams, setGrams] = useState(origin.kind === 'food' ? toInputNumber(origin.grams) : '')
  const [draft, setDraft] = useState<FreeDraft>(() => initialDraft(entry))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const gramsValue = parseDecimal(grams)
  let preview: string | null = null
  if (origin.kind === 'food' && gramsValue > 0) {
    preview = macroLine(roundMacros(regrams(entry, gramsValue).macros))
  }

  const save = async () => {
    setError(null)
    let next: FoodLogEntry = { ...entry, slot }
    if (origin.kind === 'food') {
      if (!(gramsValue > 0)) {
        setError('Indique une quantité en grammes supérieure à 0.')
        return
      }
      next = { ...regrams(entry, gramsValue), slot }
    } else {
      const parsed = parseFreeDraft(draft)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      const initial = initialDraft(entry)
      const edited = (Object.keys(initial) as (keyof FreeDraft)[]).some((k) => initial[k] !== draft[k])
      if (edited) {
        const v = parsed.value
        // Valeurs modifiées à la main : l'entrée (recette, import…) devient une saisie libre, pour que l'origine
        // (portions, quantité) ne contredise pas les macros affichées.
        next = {
          ...next,
          origin: { kind: 'free' },
          name: v.name,
          macros: { kcal: v.kcal, protein: v.protein ?? 0, carbs: v.carbs ?? 0, fat: v.fat ?? 0 },
        }
      }
    }
    setBusy(true)
    try {
      await updateLogEntry(next)
      onSaved()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer. Réessaie.'))
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteLogEntry(entry.id)
      onDeleted()
    } catch (e) {
      setConfirmDelete(false)
      setError(errorMessage(e, 'Impossible de supprimer. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet title={entry.name} onClose={onClose} busy={busy}>
        <div className="flex flex-col gap-4">
          {origin.kind === 'food' ? (
            <>
              <DecimalField label="Quantité" big unit="g" value={grams} onChange={setGrams} />
              <p aria-live="polite" className="min-h-6 text-base text-zinc-300">
                {preview}
              </p>
            </>
          ) : (
            <FreeFields draft={draft} onChange={setDraft} />
          )}
          <ChoiceGroup legend="Repas" layout="grid" value={slot} options={slotChoices} onChange={setSlot} />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button onClick={() => void save()} disabled={busy}>
            Enregistrer
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Supprimer
          </Button>
        </div>
      </Sheet>
      {confirmDelete ? (
        <ConfirmSheet
          title="Supprimer cette entrée ?"
          message={`« ${entry.name} » sera retiré du journal.`}
          confirmLabel="Supprimer"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
          busy={busy}
        />
      ) : null}
    </>
  )
}
