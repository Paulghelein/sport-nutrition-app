import type { ReactNode } from 'react'
import { cx } from './cx'

export interface StatTileProps {
  /** Étiquette en capitales au-dessus du chiffre (« Durée »). */
  label: string
  /** Chiffre clé, déjà formaté (`withUnit(31, 'min')`). */
  value: ReactNode
  className?: string
}

/** Étiquette + chiffre clé en Archivo. Se pose par trois dans une carte : `grid grid-cols-3 divide-x divide-line`. */
export function StatTile({ label, value, className }: StatTileProps) {
  return (
    <div className={cx('flex flex-col items-center gap-0.5 text-center', className)}>
      <span className="text-label uppercase text-ink-muted">{label}</span>
      <span className="font-display text-[20px] font-extrabold leading-6 tabular-nums">{value}</span>
    </div>
  )
}
