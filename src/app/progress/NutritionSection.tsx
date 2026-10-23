import { CalendarClock, Utensils } from 'lucide-react'
import { Card, EmptyState, StatTile } from '../../ui/kit'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import type { NutritionWeek } from '../../types'
import { Note, ScreenSection, Unit } from './parts'

export function NutritionSection({
  week,
  hasTargets,
  daysElapsed,
}: {
  week: NutritionWeek
  hasTargets: boolean
  daysElapsed: number
}) {
  const avg = (v: number | null, unit: string) =>
    v === null ? (
      '—'
    ) : (
      <>
        {formatInt(v)}
        <Unit> {unit}</Unit>
      </>
    )
  return (
    <ScreenSection title="Nutrition de la semaine">
      <Card padding="none" className="flex flex-col gap-3 px-[18px] py-4">
        <p className="m-0 text-caption text-ink-muted">
          Jours complets seulement (aujourd’hui n’est pas compté).
        </p>
        {daysElapsed === 0 ? (
          <EmptyState compact icon={CalendarClock} title="Semaine commencée">
            Pas encore de jour complet : les moyennes arrivent demain.
          </EmptyState>
        ) : week.daysLogged === 0 ? (
          <EmptyState compact icon={Utensils} title="Rien de logué cette semaine">
            Ajoute tes repas dans l’onglet Nutrition.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <div className="flex flex-col gap-0.5">
              <StatTile align="start" size="lg" label="Calories moyennes" value={avg(week.avgKcal, 'kcal')} />
              {hasTargets ? (
                <p className="m-0 text-caption text-ink-muted">
                  objectif {formatDecimal(week.targetKcal, 2)} kcal
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-0.5">
              <StatTile
                align="start"
                size="lg"
                label="Protéines moyennes"
                value={avg(week.avgProtein, 'g')}
              />
              {hasTargets ? (
                <p className="m-0 text-caption text-ink-muted">
                  objectif {formatDecimal(week.targetProtein, 2)} g
                </p>
              ) : null}
            </div>
            <StatTile
              align="start"
              size="lg"
              className="col-span-2"
              label="Jours à ±10 % des calories"
              value={
                <>
                  {hasTargets ? `${week.daysInTarget} / ${week.daysLogged}` : '—'}
                  <Unit> jours logués</Unit>
                </>
              }
            />
          </div>
        )}
        {!hasTargets ? (
          <Note className="text-caption">Ajoute une pesée pour calculer ton objectif.</Note>
        ) : null}
      </Card>
    </ScreenSection>
  )
}
