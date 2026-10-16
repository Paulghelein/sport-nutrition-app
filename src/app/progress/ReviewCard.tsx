import { useState } from 'react'
import { dismissReview } from '../../db'
import { formatDateFr, addDays } from '../../domain/shared/dates'
import { Button, Card, ErrorNote, Section, formatSignedKg } from '../../ui'
import type { WeeklyReview } from '../../types'
import { formatNumber, personalRecordText } from './progressModel'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="m-0 mt-1 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}

/** Carte du lundi : bilan de la semaine écoulée. `names` : nom d'un exercice (supprimés compris). */
export function ReviewCard({ review, nameOf }: { review: WeeklyReview; nameOf: (id: string) => string }) {
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const n = review.nutrition
  const close = async () => {
    setBusy(true)
    setError(false)
    try {
      await dismissReview(review.weekStart)
    } catch {
      setError(true)
      setBusy(false)
    }
  }
  return (
    <Section title="Bilan de la semaine">
      <Card aria-label="Bilan de la semaine écoulée">
        <p className="mb-3 text-sm text-zinc-400">
          Du {formatDateFr(review.weekStart, 'long')} au {formatDateFr(addDays(review.weekStart, 6), 'long')}
        </p>
        <dl className="m-0 grid grid-cols-2 gap-3">
          <Stat label="Séances" value={`${review.sessions} / ${review.plannedSessions}`} />
          <Stat label="Minutes" value={`${formatNumber(review.minutes)} min`} />
          <Stat
            label="Poids (moyenne 7 j)"
            value={review.weightChangeKg === null ? '—' : `${formatSignedKg(review.weightChangeKg)} kg`}
          />
          <Stat label="Jours logués" value={`${n.daysLogged} / 7`} />
          <Stat
            label="Calories moy."
            value={n.avgKcal === null ? '—' : `${formatNumber(Math.round(n.avgKcal))} kcal`}
          />
          <Stat
            label="Protéines moy."
            value={n.avgProtein === null ? '—' : `${formatNumber(Math.round(n.avgProtein))} g`}
          />
        </dl>
        <h3 className="mt-4 mb-1 text-base font-semibold text-zinc-300">Records</h3>
        {review.records.length === 0 ? (
          <p className="text-sm text-zinc-400">Pas de record cette semaine.</p>
        ) : (
          <ul className="m-0 list-disc pl-5 text-base">
            {review.records.map((r) => (
              <li key={`${r.exerciseId}-${r.kind}-${r.loadKg ?? 'bw'}`}>
                {nameOf(r.exerciseId)} : {personalRecordText(r.kind, r.value, r.loadKg)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2.5 text-base text-orange-100">
          {review.suggestion.message}
        </p>
        {error ? <ErrorNote>Impossible de fermer le bilan. Réessaie.</ErrorNote> : null}
        <Button className="mt-4" variant="secondary" onClick={() => void close()} disabled={busy}>
          Fermer
        </Button>
      </Card>
    </Section>
  )
}
