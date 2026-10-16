import { Suspense, lazy, useState } from 'react'
import { formatDateFr } from '../../domain/shared'
import { Button, Card, ErrorBoundary, Section, formatKg, formatSignedKg } from '../../ui'
import type { WeighIn } from '../../types'
import { WeightSheet } from './WeightSheet'
import type { WeightModel } from './progressModel'

// Recharts est lourd : chargé seulement à l'ouverture de l'onglet Progrès.
const WeightChart = lazy(() => import('./WeightChart').then((m) => ({ default: m.WeightChart })))

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-zinc-400">{unit}</span> : null}
      </dd>
    </div>
  )
}

/** Affiche seulement : données et couloir viennent de `buildWeightModel` (modèle de l'écran Progrès). */
export function WeightSection({ weight }: { weight: WeightModel }) {
  const [sheet, setSheet] = useState<{ weighIn: WeighIn | null } | null>(null)
  const { summary, corridor, recent: rows } = weight

  return (
    <Section
      title="Poids"
      action={
        <Button id="add-weighin" width="auto" onClick={() => setSheet({ weighIn: null })}>
          Ajouter une pesée
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Card>
          <p className="text-base text-zinc-300">
            Aucune pesée pour l’instant. Ajoute ta première pesée pour voir ta courbe apparaître.
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <>
          <Card>
            <dl className="m-0 flex gap-3">
              <Stat
                label="Dernière pesée"
                value={summary.latest ? formatKg(summary.latest.weightKg) : '—'}
                unit="kg"
              />
              <Stat
                label="Moyenne 7 j"
                value={summary.avg7d !== null ? formatKg(summary.avg7d) : '—'}
                unit="kg"
              />
              <Stat
                label="Variation 7 j"
                value={summary.change7dKg !== null ? formatSignedKg(summary.change7dKg) : '—'}
                unit={summary.change7dKg !== null ? 'kg' : undefined}
              />
            </dl>
            {summary.latest ? (
              <p className="mt-2 text-xs text-zinc-400">
                Dernière pesée le {formatDateFr(summary.latest.date, 'long')}
              </p>
            ) : null}
          </Card>

          <Card className="mt-3 px-2">
            <ErrorBoundary>
              <Suspense fallback={<div className="h-64" aria-busy="true" />}>
                <WeightChart model={weight} />
              </Suspense>
            </ErrorBoundary>
            <p className="mt-1 flex items-center justify-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-zinc-400" /> Pesées
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1 w-4 rounded-full bg-orange-400" /> Moyenne 7 jours
              </span>
              {corridor ? (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed border-emerald-400" />{' '}
                  Couloir cible
                </span>
              ) : null}
            </p>
            {corridor ? (
              <p className="mt-1 text-center text-xs text-zinc-400">
                Couloir : +0,25 à +0,5 % par semaine depuis le {formatDateFr(corridor.date)} (
                {formatKg(corridor.weightKg)} kg).
              </p>
            ) : null}
          </Card>

          <h3 className="mt-6 mb-2 text-base font-semibold text-zinc-300">Historique</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ weighIn: w })}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-v1-line bg-v1-surface px-4 py-2 text-left active:bg-v1-surface-hi focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
                  aria-label={`Modifier la pesée du ${formatDateFr(w.date, 'long')} : ${formatKg(w.weightKg)} kg`}
                >
                  <span className="min-w-0">
                    <span className="block text-base">{formatDateFr(w.date, 'long')}</span>
                    {w.note ? <span className="block truncate text-sm text-zinc-400">{w.note}</span> : null}
                  </span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatKg(w.weightKg)} <span className="text-sm font-medium text-zinc-400">kg</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sheet ? (
        <WeightSheet
          weighIn={sheet.weighIn}
          existing={rows}
          onClose={(deleted) => {
            setSheet(null)
            // La ligne supprimée n'existe plus : le focus va sur « Ajouter une pesée ».
            if (deleted) setTimeout(() => document.getElementById('add-weighin')?.focus(), 0)
          }}
        />
      ) : null}
    </Section>
  )
}
