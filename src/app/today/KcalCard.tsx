import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getProfile, listLogForDate, listWeighIns } from '../../db'
import { dayLog } from '../../domain/nutrition/journal'
import { nutritionTargets, targetWeight } from '../../domain/nutrition/targets'
import { KcalRing, MacroBar, cx, formatInt } from '../../ui/kit'
import { useLiveQuery } from '../../ui'
import type { LocalDate } from '../../types'
import { NUTRITION_PATH } from '../routes'
import { CardError } from './SectionBoundary'

const CARD = 'rounded-lg bg-surface text-ink shadow-card no-underline focus-ring'
const MIN_H = 'min-h-[134px]'

/** Carte « Calories du jour » : anneau + 3 macros, toute la carte mène au journal. */
export function KcalCard({ today }: { today: LocalDate }) {
  const { data, error, loading } = useLiveQuery(async () => {
    const [entries, profile, weighIns] = await Promise.all([
      listLogForDate(today),
      getProfile(),
      listWeighIns(),
    ])
    return { entries, profile, weighIns }
  }, [today])

  const model = useMemo(() => {
    if (!data) return undefined
    const totals = dayLog(data.entries, today).totals
    const weight = targetWeight(data.weighIns, today)
    const targets =
      data.profile && weight !== undefined ? nutritionTargets(data.profile, weight, today) : undefined
    return { totals, targets }
  }, [data, today])

  if (error && !data) return <CardError>Impossible de lire ton journal. Réessaie dans un instant.</CardError>
  if (!model) {
    return <div aria-busy={loading} aria-label="Calories du jour" role="group" className={cx(CARD, MIN_H)} />
  }

  const { totals, targets } = model
  if (!targets) {
    return (
      <Link
        to={NUTRITION_PATH}
        className={cx(CARD, MIN_H, 'flex items-center justify-between gap-3 px-5 py-4')}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-title font-display">Calories du jour</span>
          <span className="text-body text-ink-muted">
            {totals.kcal > 0 ? `${formatInt(totals.kcal)} kcal aujourd’hui. ` : ''}
            Pas encore d’objectif : ajoute une pesée avec le bouton +.
          </span>
        </span>
        <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-faint" />
      </Link>
    )
  }

  const left = Math.round(targets.kcal - totals.kcal)
  const summary =
    left >= 0
      ? `${formatInt(left)} kcal restantes sur ${formatInt(targets.kcal)}`
      : `${formatInt(-left)} kcal au-dessus de l’objectif de ${formatInt(targets.kcal)}`
  return (
    <Link
      to={NUTRITION_PATH}
      aria-label={`Calories du jour : ${summary}. Ouvrir la nutrition`}
      className={cx(CARD, MIN_H, 'flex items-center gap-[18px] px-5 py-4')}
    >
      <KcalRing consumed={totals.kcal} target={targets.kcal} size={96} />
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <MacroBar kind="protein" value={totals.protein} target={targets.protein} />
        <MacroBar kind="carbs" value={totals.carbs} target={targets.carbs} />
        <MacroBar kind="fat" value={totals.fat} target={targets.fat} />
      </div>
    </Link>
  )
}
