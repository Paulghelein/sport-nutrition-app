import type { ReactNode } from 'react'
import type { MuscleGroup } from '../../types'
import { cx } from './cx'
import { ExerciseThumb } from './MuscleMap'

export interface ExerciseRowProps {
  /** Muscles primaires (miniature de 52 px). */
  muscles: readonly MuscleGroup[]
  /** Nom de l'exercice (un lien vers sa fiche, par exemple). */
  title: ReactNode
  /** Prescription en gras (`3 × 15`). */
  summary: ReactNode
  /** Suite de la prescription, en `ink-muted` (charge, côté, repos…). */
  detail?: ReactNode
  /** Boutons à droite (Remplacer, Retirer) : chacun a son propre libellé accessible. */
  actions?: ReactNode
  className?: string
}

/**
 * Ligne d'exercice de l'aperçu de séance : miniature musculaire 52 px, nom, prescription lisible, actions.
 * Les lignes d'une même carte sont séparées par un filet (`first:border-t-0`).
 */
export function ExerciseRow({ muscles, title, summary, detail, actions, className }: ExerciseRowProps) {
  return (
    <div className={cx('flex items-center gap-3 border-t border-line py-2.5 first:border-t-0', className)}>
      <ExerciseThumb primary={muscles} size={52} background="canvas" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-headline">{title}</span>
        <span className="text-caption text-ink-muted">
          <b className="font-bold text-ink">{summary}</b>
          {detail ? <> · {detail}</> : null}
        </span>
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </div>
  )
}
