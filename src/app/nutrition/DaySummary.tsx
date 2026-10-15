import { Link } from 'react-router-dom'
import { progressRatio, roundMacros } from '../../domain/nutrition'
import type { Macros, NutritionTargets } from '../../types'
import { Card } from '../../ui'
import { fmtG, fmtInt } from './format'

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Anneau des calories : consommé / objectif, reste (ou dépassement) dessous. */
function KcalRing({ value, target }: { value: number; target: number | undefined }) {
  const ratio = target === undefined ? 0 : progressRatio(value, target)
  const over = ratio > 1
  const shown = Math.round(value)
  return (
    <div className="flex flex-col items-center">
      <div
        className="relative size-44"
        role="img"
        aria-label={
          target === undefined
            ? `${fmtInt(shown)} kilocalories consommées`
            : `${fmtInt(shown)} kilocalories consommées sur ${fmtInt(target)}`
        }
      >
        <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="100" cy="100" r={RADIUS} fill="none" strokeWidth="16" className="stroke-zinc-800" />
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${Math.min(ratio, 1) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className={over ? 'stroke-amber-400' : 'stroke-orange-400'}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span data-testid="kcal-consumed" className="text-4xl font-bold tabular-nums">
            {fmtInt(shown)}
          </span>
          <span className="text-base text-zinc-400">
            {target === undefined ? 'kcal' : `sur ${fmtInt(target)} kcal`}
          </span>
        </div>
      </div>
      {target !== undefined ? (
        <p data-testid="kcal-left" className={`mt-1 text-lg font-semibold ${over ? 'text-amber-300' : ''}`}>
          {over ? `Dépassé de ${fmtInt(value - target)} kcal` : `Reste ${fmtInt(target - value)} kcal`}
        </p>
      ) : null}
    </div>
  )
}

function MacroBar({
  label,
  value,
  target,
  color,
}: {
  label: string
  value: number
  target: number | undefined
  color: string
}) {
  const ratio = target === undefined ? 0 : progressRatio(value, target)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold">{label}</span>
        <span className="text-base tabular-nums text-zinc-300">
          {fmtG(value)}
          {target === undefined ? '' : ` / ${fmtInt(target)}`} g
        </span>
      </div>
      <div
        {...(target === undefined
          ? { 'aria-hidden': true }
          : {
              role: 'progressbar',
              'aria-label': label,
              'aria-valuemin': 0,
              'aria-valuemax': target,
              'aria-valuenow': Math.round(value),
            })}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-zinc-800"
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
    </div>
  )
}

/** Anneau + barres P/G/L. Sans objectif (pas de pesée), seuls les totaux sont affichés. */
export function DaySummary({ totals, targets }: { totals: Macros; targets: NutritionTargets | undefined }) {
  const shown = roundMacros(totals)
  return (
    <Card>
      <KcalRing value={totals.kcal} target={targets?.kcal} />
      <div className="mt-5 flex flex-col gap-3">
        <MacroBar label="Protéines" value={shown.protein} target={targets?.protein} color="bg-sky-400" />
        <MacroBar label="Glucides" value={shown.carbs} target={targets?.carbs} color="bg-amber-400" />
        <MacroBar label="Lipides" value={shown.fat} target={targets?.fat} color="bg-rose-400" />
      </div>
      {targets === undefined ? (
        <p className="mt-4 text-base text-zinc-300">
          Pour calculer tes objectifs, ajoute une pesée dans{' '}
          <Link to="/progres" className="inline-flex min-h-11 items-center font-semibold text-orange-400">
            Progrès
          </Link>
          .
        </p>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">
          Objectifs calculés pour {fmtG(targets.weightKg)} kg.{' '}
          <Link to="/reglages" className="inline-flex min-h-11 items-center font-semibold text-orange-400">
            Les régler
          </Link>
        </p>
      )}
    </Card>
  )
}
