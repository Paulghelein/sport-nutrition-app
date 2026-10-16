import { Card, StatTile } from '../../ui/kit'
import { CalendarHeatmap } from '../../ui/kit/CalendarHeatmap'
import type { WeekStripDay } from '../../ui/kit'
import type { Regularity } from '../../types'
import { Note, Unit } from './parts'

export interface HeadlineModel {
  streakWeeks: number
  monthSessions: number
  nutritionShare: number | null
}

/**
 * Carte de tête de Progrès : les trois chiffres (série, séances du mois, nutrition) et le calendrier de 12 semaines.
 * Un jour touché ouvre son résumé (`onSelectDay`).
 */
export function RegularitySection({
  headline,
  days,
  regularity,
  target,
  selectedDate,
  onSelectDay,
}: {
  headline: HeadlineModel
  days: readonly WeekStripDay[]
  regularity: Regularity
  /** Séances minimum d'une « bonne semaine » (seuil de la série). */
  target: number
  selectedDate: string | null
  onSelectDay: (date: string) => void
}) {
  const total = regularity.weeks.reduce((a, w) => a + w.sessions, 0)
  const { streakWeeks, monthSessions, nutritionShare } = headline
  return (
    <Card as="section" aria-label="Régularité" padding="none" className="flex flex-col gap-3 px-[18px] py-4">
      <h2 className="sr-only">Régularité (12 semaines)</h2>
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          align="start"
          size="lg"
          label="Série"
          value={
            <>
              {streakWeeks}
              <Unit> sem.</Unit>
            </>
          }
        />
        <StatTile
          align="start"
          size="lg"
          label="Ce mois"
          value={
            <>
              {monthSessions}
              <Unit>{monthSessions > 1 ? ' séances' : ' séance'}</Unit>
            </>
          }
        />
        <StatTile
          align="start"
          size="lg"
          label="Nutrition"
          value={
            nutritionShare === null ? (
              <>
                —<Unit> % des jours</Unit>
              </>
            ) : (
              <>
                {nutritionShare}
                <Unit> % des jours</Unit>
              </>
            )
          }
        />
      </div>
      <CalendarHeatmap
        days={days}
        selectedDate={selectedDate}
        onSelectDay={onSelectDay}
        label="Calendrier des 12 dernières semaines"
      />
      {total === 0 ? (
        <Note>Pas encore de séance. Lance ta première séance pour démarrer ta série.</Note>
      ) : (
        <p className="m-0 text-caption text-ink-muted">
          Série : semaines d’affilée avec au moins {target} séance{target > 1 ? 's' : ''}. Meilleure série :{' '}
          <b className="font-display font-bold tabular-nums text-ink">{regularity.bestStreak} sem.</b>
        </p>
      )}
    </Card>
  )
}
