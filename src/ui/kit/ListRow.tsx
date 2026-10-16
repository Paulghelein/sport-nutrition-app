import type { ReactNode } from 'react'
import { cx } from './cx'

export interface ListRowProps {
  /** Visuel à gauche (miniature, pictogramme, photo) : 40 à 52 px. */
  leading?: ReactNode
  /** Nom (style headline). */
  title: ReactNode
  /** Détail sous le nom (style caption, ink-muted). */
  subtitle?: ReactNode
  /** Valeur ou action à droite. Quand `onPress` est fourni, la ligne est un <button> : `trailing` ne doit alors rien
   * contenir d'interactif (pas de bouton ni de lien imbriqué), seulement du texte ou une icône. */
  trailing?: ReactNode
  /** Si fourni, toute la ligne est un bouton (cible ≥ 48 px). */
  onPress?: () => void
  /** Libellé accessible du bouton quand `onPress` est fourni et que le texte ne suffit pas. */
  ariaLabel?: string
  className?: string
}

/**
 * Ligne de liste. Les lignes d'une même carte sont séparées par un filet `line` (jamais par d'autres cartes) :
 * le filet est posé sur toutes les lignes sauf la première (`first:border-t-0`).
 */
export function ListRow({ leading, title, subtitle, trailing, onPress, ariaLabel, className }: ListRowProps) {
  const body = (
    <>
      {leading !== undefined && <span className="flex shrink-0">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
        <span className="text-headline truncate">{title}</span>
        {subtitle !== undefined && <span className="text-caption text-ink-muted">{subtitle}</span>}
      </span>
      {trailing !== undefined && <span className="flex shrink-0">{trailing}</span>}
    </>
  )
  const base = 'flex min-h-12 w-full items-center gap-3 border-t border-line py-2.5 first:border-t-0'
  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label={ariaLabel}
        className={cx(base, 'focus-ring text-left text-ink active:opacity-70', className)}
      >
        {body}
      </button>
    )
  }
  return <div className={cx(base, className)}>{body}</div>
}
