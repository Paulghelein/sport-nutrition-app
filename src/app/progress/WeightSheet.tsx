import { useState } from 'react'
import { checkWeighIn, deleteWeighIn, updateWeighIn, upsertWeighIn } from '../../db'
import { formatDateFr, toLocalDate } from '../../domain/shared'
import { Button, ConfirmSheet, DateField, DecimalField, ErrorNote, Sheet, TextField, errorMessage, parseDecimal, toInputNumber } from '../../ui'
import type { WeighIn } from '../../types'

interface Props {
  /** `null` : nouvelle pesée. */
  weighIn: WeighIn | null
  /** Pesées existantes, pour prévenir qu'une date est déjà prise. */
  existing: WeighIn[]
  /** `deleted` : la pesée vient d'être supprimée. */
  onClose: (deleted?: boolean) => void
}

export function WeightSheet({ weighIn, existing, onClose }: Props) {
  const [weight, setWeight] = useState(weighIn ? toInputNumber(weighIn.weightKg) : '')
  const [date, setDate] = useState(weighIn?.date ?? toLocalDate(new Date()))
  const [note, setNote] = useState(weighIn?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const clash = existing.find((w) => w.date === date && w.id !== weighIn?.id)

  const run = async (action: () => Promise<unknown>, deleted = false) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose(deleted)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer. Réessaie.'))
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const today = toLocalDate(new Date())

  const save = () => {
    const trimmed = note.trim()
    const message = checkWeighIn({ date, weightKg: parseDecimal(weight) }, today)
    if (message) {
      setError(message)
      return undefined
    }
    return run(() =>
      weighIn
        ? updateWeighIn(weighIn.id, {
            weightKg: parseDecimal(weight),
            date,
            note: trimmed === '' ? undefined : trimmed,
          })
        : upsertWeighIn({ date, weightKg: parseDecimal(weight), ...(trimmed !== '' ? { note: trimmed } : {}) }),
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
        onConfirm={() => void run(() => deleteWeighIn(weighIn.id), true)}
      />
    )
  }

  return (
    <Sheet title={weighIn ? 'Modifier la pesée' : 'Ajouter une pesée'} onClose={() => onClose()} busy={busy}>
      <div className="flex flex-col gap-4">
        <DecimalField label="Poids" unit="kg" big value={weight} onChange={setWeight} placeholder="72,5" />
        <DateField label="Date" value={date} onChange={setDate} max={today} />
        {clash && !weighIn ? (
          <p role="status" className="rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2.5 text-sm text-orange-200">
            Une pesée de {toInputNumber(clash.weightKg)} kg existe déjà le {formatDateFr(date)} : elle sera remplacée.
          </p>
        ) : null}
        <TextField label="Note (facultatif)" value={note} onChange={setNote} maxLength={120} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex flex-col gap-2">
          <Button onClick={() => void save()} disabled={busy || weight.trim() === '' || date === ''}>
            Enregistrer
          </Button>
          {weighIn ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Supprimer
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onClose()} disabled={busy}>
            Annuler
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
