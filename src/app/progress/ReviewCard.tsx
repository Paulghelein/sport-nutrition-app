import { useState } from 'react'
import { dismissReview } from '../../db'
import { buildReviewMessage } from '../../domain/claude/context'
import { formatDateFr, addDays } from '../../domain/shared/dates'
import { formatSignedKg } from '../../ui'
import { Button, Card, StatTile } from '../../ui/kit'
import type { WeeklyReview } from '../../types'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { reviewData } from '../claude/inputs'
import { Note, ScreenSection, Unit } from './parts'
import { formatNumber, personalRecordText } from './progressModel'

/** Carte du lundi : bilan de la semaine écoulée. `nameOf` : nom d'un exercice (supprimés compris). */
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
  const unit = (text: string) => <Unit> {text}</Unit>
  return (
    <ScreenSection title="Bilan de la semaine">
      <Card
        aria-label="Bilan de la semaine écoulée"
        padding="none"
        className="flex flex-col gap-3 px-[18px] py-4"
      >
        <p className="m-0 text-caption text-ink-muted">
          Du {formatDateFr(review.weekStart, 'long')} au {formatDateFr(addDays(review.weekStart, 6), 'long')}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <StatTile align="start" label="Séances" value={`${review.sessions} / ${review.plannedSessions}`} />
          <StatTile
            align="start"
            label="Minutes"
            value={
              <>
                {formatNumber(review.minutes)}
                {unit('min')}
              </>
            }
          />
          <StatTile
            align="start"
            label="Poids (moyenne 7 j)"
            value={
              review.weightChangeKg === null ? (
                '—'
              ) : (
                <>
                  {formatSignedKg(review.weightChangeKg)}
                  {unit('kg')}
                </>
              )
            }
          />
          <StatTile align="start" label="Jours logués" value={`${n.daysLogged} / 7`} />
          <StatTile
            align="start"
            label="Calories moy."
            value={
              n.avgKcal === null ? (
                '—'
              ) : (
                <>
                  {formatNumber(Math.round(n.avgKcal))}
                  {unit('kcal')}
                </>
              )
            }
          />
          <StatTile
            align="start"
            label="Protéines moy."
            value={
              n.avgProtein === null ? (
                '—'
              ) : (
                <>
                  {formatNumber(Math.round(n.avgProtein))}
                  {unit('g')}
                </>
              )
            }
          />
        </div>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <h3 className="m-0 text-label uppercase text-ink-muted">Records</h3>
          {review.records.length === 0 ? (
            <Note className="text-caption">Pas de record cette semaine.</Note>
          ) : (
            <ul className="m-0 list-disc pl-5 text-body">
              {review.records.map((r) => (
                <li key={`${r.exerciseId}-${r.kind}-${r.loadKg ?? 'bw'}-${r.windowSec ?? '-'}`}>
                  {nameOf(r.exerciseId)} : {personalRecordText(r.kind, r.value, r.loadKg, r.windowSec)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="m-0 rounded-ds-md bg-ember-soft px-3.5 py-3 text-body text-ink">
          {review.suggestion.message}
        </p>
        {error ? (
          <p role="alert" className="m-0 text-body font-semibold text-critical">
            Impossible de fermer le bilan. Réessaie.
          </p>
        ) : null}
        <AskClaudeButton
          kind="review"
          build={(base) => buildReviewMessage({ ...base, ...reviewData(review, nameOf) })}
        />
        <Button variant="secondary" fullWidth onClick={() => void close()} disabled={busy}>
          Fermer
        </Button>
      </Card>
    </ScreenSection>
  )
}
