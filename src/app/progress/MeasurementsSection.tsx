import { useState } from 'react'
import { addMeasurement, deleteMeasurement, updateMeasurement } from '../../db'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import {
  Button,
  Card,
  ConfirmSheet,
  DateField,
  DecimalField,
  ErrorNote,
  Section,
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
  sortMeasurements,
} from './measurementDraft'
import type { MeasurementDraft } from './measurementDraft'
import { formatNumber } from './progressModel'

function summary(m: Measurement): string {
  return MEASURE_FIELDS.filter(({ key }) => m[key] !== undefined)
    .map(({ key, label }) => `${label} ${formatNumber(m[key] as number)} cm`)
    .join(' · ')
}

function MeasurementSheet({
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

export function MeasurementsSection({ measurements }: { measurements: readonly Measurement[] }) {
  const [sheet, setSheet] = useState<{ measurement: Measurement | null } | null>(null)
  const rows = sortMeasurements(measurements)
  return (
    <Section
      title="Mensurations"
      action={
        <Button id="add-measurement" width="auto" onClick={() => setSheet({ measurement: null })}>
          Ajouter
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Card>
          <p className="text-base text-zinc-300">
            Facultatif : mesure bras, poitrine, taille et cuisses (en cm) de temps en temps pour suivre ta
            prise de masse au-delà du poids.
          </p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSheet({ measurement: m })}
                aria-label={`Modifier la mensuration du ${formatDateFr(m.date, 'long')} : ${summary(m)}`}
                className="flex min-h-14 w-full flex-col justify-center rounded-xl border border-line bg-surface px-4 py-2 text-left active:bg-surface-hi focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
              >
                <span className="text-base font-semibold">{formatDateFr(m.date, 'long')}</span>
                <span className="text-sm text-zinc-300">{summary(m)}</span>
                {m.note ? <span className="truncate text-sm text-zinc-400">{m.note}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sheet ? (
        <MeasurementSheet
          measurement={sheet.measurement}
          onClose={(deleted) => {
            setSheet(null)
            // La ligne supprimée n'existe plus : le focus va sur « Ajouter ».
            if (deleted) setTimeout(() => document.getElementById('add-measurement')?.focus(), 0)
          }}
        />
      ) : null}
    </Section>
  )
}
