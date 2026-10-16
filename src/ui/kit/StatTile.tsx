import type { ReactNode } from 'react'
import { cx } from './cx'

export interface StatTileProps {
  /** Étiquette en capitales au-dessus du chiffre (« Durée »). */
  label: string
  /** Chiffre clé, déjà formaté (`withUnit(31, 'min')`). */
  value: ReactNode
  /** `center` (défaut) : tuile centrée dans une grille de trois ; `start` : alignée à gauche (écran Progrès). */
  align?: 'center' | 'start'
  /** `md` (défaut) : jeton `title`, interligne 24 ; `lg` : jeton `title` (20/26), chiffres de tête d'un écran. */
  size?: 'md' | 'lg'
  className?: string
}

/** Étiquette + chiffre clé en Archivo. Se pose par trois dans une carte : `grid grid-cols-3 divide-x divide-line`. */
export function StatTile({ label, value, align = 'center', size = 'md', className }: StatTileProps) {
  return (
    <div
      className={cx(
        'flex flex-col gap-0.5',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <span className="text-label uppercase text-ink-muted">{label}</span>
      <span
        className={cx('font-display text-title font-extrabold tabular-nums', size === 'md' && 'leading-6')}
      >
        {value}
      </span>
    </div>
  )
}
