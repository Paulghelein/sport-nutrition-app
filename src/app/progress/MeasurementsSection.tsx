import { useState } from 'react'
import { formatDateFr } from '../../domain/shared/dates'
import { Button, Card, ListRow } from '../../ui/kit'
import { formatDecimal } from '../../ui/kit/format'
import type { Measurement } from '../../types'
import { MeasurementSheet } from '../forms/MeasurementSheet'
import { MEASURE_FIELDS, sortMeasurements } from '../forms/measurementDraft'
import { Note, ScreenSection } from './parts'

function summary(m: Measurement): string {
  return MEASURE_FIELDS.filter(({ key }) => m[key] !== undefined)
    .map(({ key, label }) => `${label} ${formatDecimal(m[key] as number, 2)} cm`)
    .join(' · ')
}

export function MeasurementsSection({ measurements }: { measurements: readonly Measurement[] }) {
  const [sheet, setSheet] = useState<{ measurement: Measurement | null } | null>(null)
  const rows = sortMeasurements(measurements)
  return (
    <ScreenSection
      title="Mensurations"
      action={
        <Button
          id="add-measurement"
          variant="text"
          className="min-h-11"
          onClick={() => setSheet({ measurement: null })}
        >
          Ajouter
        </Button>
      }
    >
      <Card padding="none" className="px-4 py-1.5">
        {rows.length === 0 ? (
          <Note className="py-3">
            Facultatif : mesure bras, poitrine, taille et cuisses (en cm) de temps en temps pour suivre ta
            prise de masse au-delà du poids.
          </Note>
        ) : (
          rows.map((m) => (
            <ListRow
              key={m.id}
              title={formatDateFr(m.date, 'long')}
              subtitle={
                <>
                  {summary(m)}
                  {m.note ? <span className="block truncate">{m.note}</span> : null}
                </>
              }
              onPress={() => setSheet({ measurement: m })}
              ariaLabel={`Modifier la mensuration du ${formatDateFr(m.date, 'long')} : ${summary(m)}`}
            />
          ))
        )}
      </Card>
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
    </ScreenSection>
  )
}
