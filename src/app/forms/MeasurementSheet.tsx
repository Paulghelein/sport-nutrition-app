import { useState } from 'react'
import { addMeasurement, deleteMeasurement, updateMeasurement } from '../../db'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import {
  Button,
  ConfirmSheet,
  DateField,
  DecimalField,
  ErrorNote,
  Sheet,
  TextField,
  errorMessage,
} from '../../ui'
import type { Measurement } from '../../types'
import {
  MEASURE_FIELDS,
  draftToMeasurement,
  measurementPatch,
  measurementToDraft,
  newMeasurementDraft,
} from './measurementDraft'
import type { MeasurementDraft } from './measurementDraft'

/** Feuille d'ajout / modification d'une mensuration. Écran de saisie v1 (champs sombres), refait avec les Réglages (R5). */
export function MeasurementSheet({
  measurement,
  onClose,
}: {
  measurement: Measurement | null
  onClose: (deleted?: boolean) => void
}) {
  const today = toLocalDate(new Date())
  const [draft, setDraft] = useState<MeasurementDraft>(() =>
    measurement ? measurementToDraft(measurement) : newMeasurementDraft(today),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const save = () => {
    const result = draftToMeasurement(draft, today)
    if (!result.ok) {
      setError(result.error)
      return
    }
    void run(() =>
      measurement
        ? updateMeasurement(measurement.id, measurementPatch(result.input))
        : addMeasurement(result.input),
    )
  }

  if (confirmDelete && measurement) {
    return (
      <ConfirmSheet
        title="Supprimer cette mensuration ?"
        message={`La mesure du ${formatDateFr(measurement.date, 'long')} sera supprimée.`}
        confirmLabel="Supprimer"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void run(() => deleteMeasurement(measurement.id), true)}
      />
    )
  }

  return (
    <Sheet
      title={measurement ? 'Modifier la mensuration' : 'Ajouter une mensuration'}
      onClose={() => onClose()}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <DateField
          label="Date"
          value={draft.date}
          max={today}
          onChange={(date) => setDraft({ ...draft, date })}
        />
        {MEASURE_FIELDS.map(({ key, label }) => (
          <DecimalField
            key={key}
            label={label}
            unit="cm"
            value={draft.values[key]}
            onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [key]: v } })}
          />
        ))}
        <TextField
          label="Note (facultatif)"
          value={draft.note}
          maxLength={120}
          onChange={(note) => setDraft({ ...draft, note })}
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex flex-col gap-2">
          <Button onClick={save} disabled={busy}>
            Enregistrer
          </Button>
          {measurement ? (
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
