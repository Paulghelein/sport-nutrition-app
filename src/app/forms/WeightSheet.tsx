import { useState } from 'react'
import { checkWeighIn, deleteWeighIn, updateWeighIn, upsertWeighIn } from '../../db'
import { formatDateFr, toLocalDate } from '../../domain/shared'
import { errorMessage, parseDecimal, toInputNumber } from '../../ui'
import { Button, Sheet } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { DateField } from '../../ui/kit/DateField'
import { DecimalField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import type { WeighIn } from '../../types'

interface Props {
  /** `null` : nouvelle pesée. */
  weighIn: WeighIn | null
  /** Pesées existantes, pour prévenir qu'une date est déjà prise. */
  existing: WeighIn[]
  /** `deleted` : la pesée vient d'être supprimée. */
  onClose: (deleted?: boolean) => void
  /** Appelée juste avant `onClose` quand la pesée vient d'être enregistrée (l'appelant peut confirmer à l'écran). */
  onSaved?: (weightKg: number) => void
}

/** Feuille d'ajout / modification d'une pesée (feuille du bas du kit). */
export function WeightSheet({ weighIn, existing, onClose, onSaved }: Props) {
  const [weight, setWeight] = useState(weighIn ? toInputNumber(weighIn.weightKg) : '')
  const [date, setDate] = useState(weighIn?.date ?? toLocalDate(new Date()))
  const [note, setNote] = useState(weighIn?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const clash = existing.find((w) => w.date === date && w.id !== weighIn?.id)

  const run = async (action: () => Promise<unknown>, done: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      done()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer. Réessaie.'))
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const today = toLocalDate(new Date())

  const save = () => {
    const trimmed = note.trim()
    const weightKg = parseDecimal(weight)
    const message = checkWeighIn({ date, weightKg }, today)
    if (message) {
      setError(message)
      return undefined
    }
    return run(
      () =>
        weighIn
          ? updateWeighIn(weighIn.id, { weightKg, date, note: trimmed === '' ? undefined : trimmed })
          : upsertWeighIn({ date, weightKg, ...(trimmed !== '' ? { note: trimmed } : {}) }),
      () => {
        onSaved?.(weightKg)
        onClose()
      },
    )
  }

  if (confirmDelete && weighIn) {
    return (
      <ConfirmSheet
        title="Supprimer cette pesée ?"
        message={`La pesée du ${formatDateFr(weighIn.date, 'long')} sera supprimée.`}
        confirmLabel="Supprimer"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void run(
            () => deleteWeighIn(weighIn.id),
            () => onClose(true),
          )
        }
      />
    )
  }

  return (
    <Sheet title={weighIn ? 'Modifier la pesée' : 'Ajouter une pesée'} onClose={() => onClose()} busy={busy}>
      <div className="flex flex-col gap-4">
        <DecimalField label="Poids" unit="kg" value={weight} onChange={setWeight} placeholder="72,5" />
        <DateField label="Date" value={date} onChange={setDate} max={today} />
        {clash && !weighIn ? (
          <div role="status">
            <Note tone="warning">
              Une pesée de {toInputNumber(clash.weightKg)} kg existe déjà le {formatDateFr(date)} : elle sera
              remplacée.
            </Note>
          </div>
        ) : null}
        <TextField label="Note (facultatif)" value={note} onChange={setNote} maxLength={120} />
        {error ? <Note tone="error">{error}</Note> : null}
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            onClick={() => void save()}
            disabled={busy || weight.trim() === '' || date === ''}
          >
            Enregistrer
          </Button>
          {weighIn ? (
            <Button variant="dangerSoft" fullWidth onClick={() => setConfirmDelete(true)} disabled={busy}>
              Supprimer
            </Button>
          ) : null}
          <Button variant="flat" fullWidth onClick={() => onClose()} disabled={busy}>
            Annuler
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
