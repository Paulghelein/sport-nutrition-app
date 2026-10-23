import { Check, ChevronLeft, ChevronRight, TriangleAlert, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatInt } from './format'
import { ListRow } from './ListRow'
import { Sheet } from './Sheet'
import { StatTile } from './StatTile'

export interface DaySummarySessionView {
  id: string
  /** « Séance de 32 min ». */
  title: string
  /** « 12 séries · Goblet squat, Pompes ». */
  details: string
  /** Un texte par record battu (« Goblet squat : 18 kg × 12 »). */
  records: readonly string[]
}

export interface DaySummaryMealView {
  id: string
  /** « Déjeuner ». */
  label: string
  /** Noms des aliments, déjà joints. */
  details: string
  kcal: number
}

export interface DaySummaryView {
  /** « Mercredi 14 octobre ». */
  title: string
  /** « aujourd’hui », « à venir »… */
  description?: string
  future: boolean
  /** Journée en cours (aujourd'hui) : le bilan nutrition n'est pas jugé, il n'est pas fini. */
  inProgress?: boolean
  sessions: readonly DaySummarySessionView[]
  meals: readonly DaySummaryMealView[]
  /** Totaux du jour (kcal, protéines en g). */
  totals: { kcal: number; protein: number }
  /** Objectifs du jour ; `null` si inconnus (pas de pesée). */
  targets: { kcal: number; protein: number } | null
  /** `true` dans la cible (±10 %), `false` hors cible, `null` non évalué. */
  nutritionOk: boolean | null
}

export interface DaySummarySheetProps {
  day: DaySummaryView
  onClose: () => void
  /** Jour précédent / suivant : absent = bouton désactivé (hors plage, ou jour à venir). */
  onPrev?: () => void
  onNext?: () => void
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <h3 className="m-0 text-label uppercase text-ink-muted">{label}</h3>
      <div className="rounded-md bg-surface px-4">{children}</div>
    </section>
  )
}

/**
 * Résumé d'un jour (touché dans le calendrier ou la semaine) : séance et records, repas, total face à l'objectif.
 * Présentationnel : les textes viennent de l'écran (rien de métier ici). Feuille du kit : modale, focus piégé.
 */
export function DaySummarySheet({ day, onClose, onPrev, onNext }: DaySummarySheetProps) {
  const empty = day.sessions.length === 0 && day.meals.length === 0
  const { totals, targets } = day
  return (
    <Sheet title={day.title} description={day.description} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="day-summary">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="focus-ring flex min-h-11 items-center justify-start gap-1 rounded-full bg-surface px-3 text-body-strong text-ink active:opacity-70 disabled:text-ink-muted disabled:opacity-60"
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            Jour précédent
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="focus-ring flex min-h-11 items-center justify-end gap-1 rounded-full bg-surface px-3 text-body-strong text-ink active:opacity-70 disabled:text-ink-muted disabled:opacity-60"
          >
            Jour suivant
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {day.future ? (
          <p className="m-0 text-body text-ink-muted">Ce jour n’est pas encore arrivé.</p>
        ) : empty ? (
          <p className="m-0 text-body text-ink-muted">Rien d’enregistré ce jour-là : ni séance, ni repas.</p>
        ) : null}

        {day.sessions.length > 0 && (
          <Block label="Séance">
            {day.sessions.map((s) => (
              <div key={s.id} className="border-t border-line py-2.5 first:border-t-0">
                <p className="m-0 text-headline">{s.title}</p>
                <p className="m-0 text-caption text-ink-muted">{s.details}</p>
                {s.records.length > 0 && (
                  <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
                    {s.records.map((r) => (
                      <li
                        key={`${s.id}-${r}`}
                        className="flex items-center gap-2 text-caption font-semibold text-ember-ink"
                      >
                        <Trophy size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                        <span>Record : {r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Block>
        )}

        {day.meals.length > 0 && (
          <Block label="Repas">
            {day.meals.map((m) => (
              <ListRow
                key={m.id}
                title={m.label}
                subtitle={m.details}
                trailing={
                  <span className="font-display text-headline tabular-nums">
                    {formatInt(m.kcal)}{' '}
                    <span className="font-sans text-caption font-medium text-ink-muted">kcal</span>
                  </span>
                }
              />
            ))}
          </Block>
        )}

        {!day.future && day.meals.length > 0 && (
          <Block label="Total du jour">
            <div className="grid grid-cols-2 gap-2 py-3">
              <StatTile
                label="Calories"
                value={
                  <>
                    {formatInt(totals.kcal)}
                    <span className="font-sans text-caption font-medium text-ink-muted">
                      {targets ? ` / ${formatInt(targets.kcal)} kcal` : ' kcal'}
                    </span>
                  </>
                }
              />
              <StatTile
                label="Protéines"
                value={
                  <>
                    {formatInt(totals.protein)}
                    <span className="font-sans text-caption font-medium text-ink-muted">
                      {targets ? ` / ${formatInt(targets.protein)} g` : ' g'}
                    </span>
                  </>
                }
              />
            </div>
            <p
              className="m-0 flex items-center gap-1.5 border-t border-line py-2.5 text-caption font-semibold"
              data-testid="day-nutrition-status"
            >
              {day.inProgress ? (
                <span className="text-ink-muted">
                  Journée en cours : le bilan se fait à la fin de la journée.
                </span>
              ) : day.nutritionOk === true ? (
                <>
                  <Check size={16} strokeWidth={2} aria-hidden="true" className="text-good" />
                  <span className="text-good">Dans la cible (± 10 % des calories et des protéines)</span>
                </>
              ) : day.nutritionOk === false ? (
                <>
                  <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="text-warning" />
                  <span className="text-warning">Hors cible (± 10 % des calories et des protéines)</span>
                </>
              ) : (
                <span className="text-ink-muted">Objectif inconnu : ajoute une pesée pour le calculer.</span>
              )}
            </p>
          </Block>
        )}
      </div>
    </Sheet>
  )
}
