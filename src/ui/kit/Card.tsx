import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `normal` : 16 px ; `large` : 20 px ; `none` : lignes de liste qui gèrent leur marge. */
  padding?: 'normal' | 'large' | 'none'
  /** Élément rendu (`section` par défaut ; donne-lui un `aria-label`). */
  as?: 'section' | 'div' | 'article'
}

const paddingClass = { normal: 'p-4', large: 'p-5', none: 'p-0' } as const

/** Carte : surface, rayon 24, ombre `card`, jamais de bordure. */
export function Card({ padding = 'normal', as: Tag = 'section', className, ...props }: CardProps) {
  return (
    <Tag
      className={cx('rounded-lg bg-surface text-ink shadow-card', paddingClass[padding], className)}
      {...props}
    />
  )
}
