import { Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SetPanelSteps {
  onDecrease: () => void
  onIncrease: () => void
  /** Libellés des boutons (« Moins 1 kg », « Une répétition de plus »). */
  decreaseLabel: string
  increaseLabel: string
  canDecrease?: boolean
  canIncrease?: boolean
}

export interface SetPanelProps {
  /** Étiquette en capitales (« Charge », « Répétitions », « Durée », « Max »). */
  label: string
  /** Nom accessible du groupe si différent de l'étiquette. */
  groupLabel?: string
  /** Valeur déjà formatée (`18`, `0:45`) : très grande, lisible à 1 m. */
  value: string
  unit?: string
  /** `xl` : display-xl (64 px) ; `l` : texte long (« Poids du corps »). */
  valueSize?: 'xl' | 'l'
  /** Ligne sous la valeur (objectif, évolution de charge). */
  hint?: ReactNode
  /** `accent` : ember (hausse de charge) ; `muted` : secondaire. */
  hintTone?: 'accent' | 'muted'
  /** Boutons − / + de 64 px ; absents : panneau d'information seule (« Poids du corps »). */
  steps?: SetPanelSteps
  /** La valeur change toute seule (chronomètre, compte à rebours) : `role="timer"` silencieux (`aria-live="off"`), jamais lue à chaque seconde. L'écran annonce la fin à part. */
  timer?: boolean
  /** Contenu libre à droite à la place des boutons (chronomètre). */
  aside?: ReactNode
  className?: string
}

const STEP_BUTTON =
  'focus-ring grid size-16 shrink-0 place-items-center rounded-full bg-on-inverse/10 text-on-inverse active:bg-on-inverse/20 disabled:text-on-inverse-muted disabled:opacity-50'

function ValueTag({
  timer,
  children,
  ...props
}: {
  timer: boolean
  children: ReactNode
  className: string
  'aria-label': string
}) {
  return timer ? (
    <span role="timer" aria-live="off" {...props}>
      {children}
    </span>
  ) : (
    <output {...props}>{children}</output>
  )
}

/**
 * Panneau géant du mode séance (fond sombre) : étiquette, valeur en display-xl, ligne d'aide et deux boutons de
 * 64 px (± un palier). Se pose sur fond `inverse`. La valeur est un `<output>` (ou un `role="timer"` silencieux avec `timer`).
 */
export function SetPanel({
  label,
  groupLabel,
  value,
  unit,
  valueSize = 'xl',
  hint,
  hintTone = 'muted',
  steps,
  aside,
  timer = false,
  className,
}: SetPanelProps) {
  return (
    <div
      role="group"
      aria-label={groupLabel ?? label}
      className={cx(
        'flex min-h-[168px] items-center justify-between gap-3 rounded-ds-lg bg-on-inverse/6 px-[18px] py-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-label uppercase text-on-inverse-muted">{label}</span>
        <ValueTag
          timer={timer}
          aria-label={`${groupLabel ?? label} : ${value}${unit ? ` ${unit}` : ''}`}
          className={cx(
            'font-display font-extrabold tabular-nums',
            valueSize === 'xl' ? 'text-display-xl' : 'text-display-l',
          )}
        >
          {value}
          {unit ? <span className="text-[26px] font-bold text-on-inverse-muted">{` ${unit}`}</span> : null}
        </ValueTag>
        {hint ? (
          <span
            className={cx(
              'text-caption',
              hintTone === 'accent' ? 'font-semibold text-ember' : 'text-on-inverse-muted',
            )}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {steps ? (
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            aria-label={steps.increaseLabel}
            disabled={steps.canIncrease === false}
            onClick={steps.onIncrease}
            className={STEP_BUTTON}
          >
            <Plus size={28} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={steps.decreaseLabel}
            disabled={steps.canDecrease === false}
            onClick={steps.onDecrease}
            className={STEP_BUTTON}
          >
            <Minus size={28} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : (
        aside
      )}
    </div>
  )
}
