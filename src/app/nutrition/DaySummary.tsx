import { Link } from 'react-router-dom'
import { MacroBar, cx } from '../../ui/kit'
import type { MacroKind } from '../../ui/kit'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import { PROGRESS_PATH, SETTINGS_PATH } from '../routes'
import type { JournalBilan } from './journalModel'

const MACRO_LABEL: Record<MacroKind, string> = { protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides' }
const MACRO_DOT: Record<MacroKind, string> = { protein: 'bg-protein', carbs: 'bg-carbs', fat: 'bg-fat' }

const linkClass =
  'focus-ring inline-flex min-h-11 items-center font-semibold text-ember-ink underline underline-offset-2'

/** Macro sans objectif : le mot, une pastille de couleur et la valeur (jamais la couleur seule). */
function MacroTotal({ kind, value }: { kind: MacroKind; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-caption font-semibold">
        <span aria-hidden="true" className={cx('size-2 rounded-full', MACRO_DOT[kind])} />
        {MACRO_LABEL[kind]}
      </span>
      <span className="font-display text-body-strong tabular-nums">
        {formatDecimal(value)}
        <span className="font-sans text-caption font-medium text-ink-muted">{'\u00a0g'}</span>
      </span>
    </div>
  )
}

/**
 * Carte bilan : kcal consommées / objectif (Archivo), barre ember et trois macros. Sans objectif (pas de pesée),
 * seuls les totaux sont affichés, avec le lien pour en ajouter une.
 */
export function DaySummary({ bilan }: { bilan: JournalBilan }) {
  const { totals, targets, ratio, left, over } = bilan
  return (
    <section
      aria-label="Bilan du jour"
      className="flex flex-col gap-3 rounded-lg bg-surface px-[18px] py-4 text-ink shadow-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-display text-number-l tabular-nums">
          <span data-testid="kcal-consumed">{formatInt(totals.kcal)}</span>
          <span className="font-sans text-body font-medium text-ink-muted">
            {targets ? `\u00a0/ ${formatInt(targets.kcal)}\u00a0kcal` : '\u00a0kcal'}
          </span>
        </span>
        {targets ? (
          <span
            data-testid="kcal-left"
            className={cx('text-caption font-semibold', over > 0 ? 'text-warning' : 'text-ember-ink')}
          >
            {over > 0 ? `Dépassé de ${formatInt(over)} kcal` : `${formatInt(left)} restantes`}
          </span>
        ) : null}
      </div>
      {targets ? (
        <div
          role="progressbar"
          aria-label="Calories"
          aria-valuemin={0}
          aria-valuemax={targets.kcal}
          aria-valuenow={Math.min(Math.round(totals.kcal), targets.kcal)}
          aria-valuetext={`${formatInt(totals.kcal)} sur ${formatInt(targets.kcal)} kcal`}
          className="h-2.5 rounded-full bg-surface-sunken"
        >
          <div className="h-2.5 rounded-full bg-ember" style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : null}
      {targets ? (
        <div className="flex flex-col gap-2.5">
          <MacroBar kind="protein" value={totals.protein} target={targets.protein} />
          <MacroBar kind="carbs" value={totals.carbs} target={targets.carbs} />
          <MacroBar kind="fat" value={totals.fat} target={targets.fat} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          <MacroTotal kind="protein" value={totals.protein} />
          <MacroTotal kind="carbs" value={totals.carbs} />
          <MacroTotal kind="fat" value={totals.fat} />
        </div>
      )}
      {targets ? (
        <p className="m-0 text-caption text-ink-muted">
          Objectifs calculés pour {formatDecimal(targets.weightKg)} kg.{' '}
          <Link to={SETTINGS_PATH} className={linkClass}>
            Les régler
          </Link>
        </p>
      ) : (
        <p className="m-0 text-body text-ink-muted">
          Pour calculer tes objectifs, ajoute une pesée dans{' '}
          <Link to={PROGRESS_PATH} className={linkClass}>
            Progrès
          </Link>
          .
        </p>
      )}
    </section>
  )
}
