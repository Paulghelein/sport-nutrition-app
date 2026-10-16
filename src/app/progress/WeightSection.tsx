import { Suspense, lazy, useState } from 'react'
import { formatDateFr } from '../../domain/shared'
import { ErrorBoundary, formatKg, formatSignedKg } from '../../ui'
import { Button, Card, ListRow, StatTile } from '../../ui/kit'
import type { WeighIn } from '../../types'
import { WeightSheet } from '../forms/WeightSheet'
import { Note, ScreenSection, Unit } from './parts'
import { WEIGHT_TREND_DAYS } from './progressModel'
import type { CorridorStatus, WeightModel, WeightTrend } from './progressModel'

// Recharts est lourd : chargé seulement à l'ouverture de l'onglet Progrès.
const WeightChart = lazy(() => import('./WeightChart').then((m) => ({ default: m.WeightChart })))

const CHART_HEIGHT = 120
/** Pesées montrées dans l'historique avant « Voir toutes les pesées ». */
const HISTORY_SHOWN = 8

const CORRIDOR_WORDS: Record<CorridorStatus, string> = {
  inside: 'dans le couloir',
  below: 'sous le couloir',
  above: 'au-dessus du couloir',
}

/** « 8 sem. » ou « 12 j » : durée réellement couverte par la variation. */
function spanText(spanDays: number): string {
  return spanDays >= 14 ? `${Math.round(spanDays / 7)} sem.` : `${spanDays} j`
}

function trendText(trend: WeightTrend): string {
  const change = `${formatSignedKg(trend.changeKg)} kg en ${spanText(trend.spanDays)}`
  return trend.corridorStatus ? `${change} · ${CORRIDOR_WORDS[trend.corridorStatus]}` : change
}

/** Résumé lu par les lecteurs d'écran à la place de la courbe. */
function chartSummary(trend: WeightTrend, corridor: boolean): string {
  const base = `Courbe de la moyenne 7 jours de ${formatKg(trend.startAvg)} à ${formatKg(trend.endAvg)} kg en ${spanText(trend.spanDays)}`
  return trend.corridorStatus && corridor
    ? `${base}, ${CORRIDOR_WORDS[trend.corridorStatus]} de prise visé.`
    : `${base}.`
}

/** Carte poids : moyenne 7 j, courbe, couloir de prise, dernière pesée. Données de `buildWeightModel`. */
export function WeightSection({ weight }: { weight: WeightModel }) {
  const [sheet, setSheet] = useState<{ weighIn: WeighIn | null } | null>(null)
  const { summary, corridor, trend, recent: rows } = weight
  const addButton = (
    <Button id="add-weighin" variant="text" className="min-h-11" onClick={() => setSheet({ weighIn: null })}>
      Ajouter une pesée
    </Button>
  )

  return (
    <>
      <ScreenSection title="Poids" hiddenTitle>
        <Card padding="none" className="flex flex-col gap-2 px-[18px] py-4">
          {rows.length === 0 ? (
            <>
              <Note>
                Aucune pesée pour l’instant. Ajoute ta première pesée pour voir ta courbe apparaître.
              </Note>
              {addButton}
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-label uppercase text-ink-muted">Poids · moyenne 7 j</span>
                  <span className="font-display text-number-l font-extrabold tabular-nums">
                    {summary.avg7d !== null ? formatKg(summary.avg7d) : '—'}
                    <Unit> kg</Unit>
                  </span>
                </div>
                {trend ? (
                  <span
                    className={`max-w-[55%] text-right text-caption font-bold ${
                      trend.corridorStatus === 'inside'
                        ? 'text-good'
                        : trend.corridorStatus
                          ? 'text-warning'
                          : 'text-ink-muted'
                    }`}
                  >
                    {trendText(trend)}
                  </span>
                ) : null}
              </div>

              {trend ? (
                <>
                  <ErrorBoundary>
                    <Suspense fallback={<div style={{ height: CHART_HEIGHT }} aria-busy="true" />}>
                      <WeightChart model={weight} summary={chartSummary(trend, corridor !== null)} />
                    </Suspense>
                  </ErrorBoundary>
                  <p className="m-0 flex justify-between gap-2 text-label font-medium normal-case tracking-normal text-ink-muted">
                    <span>
                      {formatDateFr(trend.firstDate)} · {formatKg(trend.startAvg)}
                    </span>
                    {corridor ? <span className="text-center">couloir +0,25 à +0,5 %/sem.</span> : null}
                    <span>Aujourd’hui</span>
                  </p>
                </>
              ) : (
                <Note>
                  La courbe apparaît dès deux pesées sur les {WEIGHT_TREND_DAYS / 7} dernières semaines.
                </Note>
              )}

              <div className="mt-1 grid grid-cols-2 divide-x divide-line border-t border-line pt-3">
                <StatTile
                  label="Dernière pesée"
                  value={
                    <>
                      {summary.latest ? formatKg(summary.latest.weightKg) : '—'}
                      <Unit> kg</Unit>
                    </>
                  }
                />
                <StatTile
                  label="Variation 7 j"
                  value={
                    summary.change7dKg !== null ? (
                      <>
                        {formatSignedKg(summary.change7dKg)}
                        <Unit> kg</Unit>
                      </>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
              {summary.latest ? (
                <p className="m-0 text-center text-caption text-ink-muted">
                  Dernière pesée le {formatDateFr(summary.latest.date, 'long')}
                </p>
              ) : null}
              <div className="flex justify-center">{addButton}</div>
            </>
          )}
        </Card>
      </ScreenSection>

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
    </>
  )
}

/**
 * Historique des pesées (modifiables), plus récentes d'abord : placé en bas de l'écran avec les mensurations, pas dans
 * la carte Poids (« est-ce que je progresse ? » passe avant la liste). 8 lignes puis « Voir les N pesées ».
 */
export function WeighInHistory({ rows }: { rows: readonly WeighIn[] }) {
  const [sheet, setSheet] = useState<WeighIn | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (rows.length === 0) return null
  const shown = showAll ? rows : rows.slice(0, HISTORY_SHOWN)
  return (
    <ScreenSection title="Historique des pesées">
      <Card padding="none" className="px-4 py-1.5">
        {shown.map((w) => (
          <ListRow
            key={w.id}
            title={formatDateFr(w.date, 'long')}
            subtitle={w.note ? w.note : undefined}
            trailing={
              <span className="font-display text-headline font-bold tabular-nums">
                {formatKg(w.weightKg)} <Unit>kg</Unit>
              </span>
            }
            onPress={() => setSheet(w)}
            ariaLabel={`Modifier la pesée du ${formatDateFr(w.date, 'long')} : ${formatKg(w.weightKg)} kg`}
          />
        ))}
      </Card>
      {rows.length > HISTORY_SHOWN && !showAll ? (
        <Button variant="secondary" onClick={() => setShowAll(true)}>
          Voir les {rows.length} pesées
        </Button>
      ) : null}
      {sheet ? (
        <WeightSheet
          weighIn={sheet}
          existing={[...rows]}
          onClose={(deleted) => {
            setSheet(null)
            // La ligne supprimée n'existe plus : le focus va sur « Ajouter une pesée ».
            if (deleted) setTimeout(() => document.getElementById('add-weighin')?.focus(), 0)
          }}
        />
      ) : null}
    </ScreenSection>
  )
}
