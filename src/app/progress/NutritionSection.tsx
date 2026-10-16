import { Card, Section } from '../../ui'
import type { NutritionWeek } from '../../types'
import { formatNumber } from './progressModel'

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
    v === null ? '—' : `${formatNumber(Math.round(v))} ${unit}`
  return (
    <Section title="Nutrition de la semaine">
      <p className="mb-2 text-sm text-zinc-400">Jours complets seulement (aujourd’hui n’est pas compté).</p>
      <Card>
        {daysElapsed === 0 ? (
          <p className="text-base text-zinc-300">
            Semaine commencée : pas encore de jour complet. Les moyennes arrivent demain.
          </p>
        ) : week.daysLogged === 0 ? (
          <p className="text-base text-zinc-300">
            Rien de logué cette semaine. Ajoute tes repas dans l’onglet Nutrition.
          </p>
        ) : (
          <dl className="m-0 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-zinc-400">Calories moyennes</dt>
              <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">{avg(week.avgKcal, 'kcal')}</dd>
              {hasTargets ? (
                <dd className="m-0 text-sm text-zinc-400">objectif {formatNumber(week.targetKcal)} kcal</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Protéines moyennes</dt>
              <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">{avg(week.avgProtein, 'g')}</dd>
              {hasTargets ? (
                <dd className="m-0 text-sm text-zinc-400">objectif {formatNumber(week.targetProtein)} g</dd>
              ) : null}
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400">Jours dans la cible (± 10 % des calories)</dt>
              <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">
                {hasTargets ? `${week.daysInTarget} / ${week.daysLogged}` : '—'}
                <span className="ml-2 text-sm font-medium text-zinc-400">jours logués</span>
              </dd>
            </div>
          </dl>
        )}
        {!hasTargets ? (
          <p className="mt-3 text-sm text-zinc-400">Ajoute une pesée pour calculer ton objectif.</p>
        ) : null}
      </Card>
    </Section>
  )
}
