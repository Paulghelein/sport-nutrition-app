import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from './Card'
import { cx } from './cx'

export interface EmptyStateProps {
  /** Icône lucide, décorative (jamais seule porteuse du sens : le titre dit la même chose). */
  icon: LucideIcon
  title: string
  /** Une phrase : quoi faire pour que l'écran se remplisse. */
  children?: ReactNode
  /** Bouton ou lien (déjà stylé avec `Button` / `buttonClass`) qui mène à la saisie concernée. */
  action?: ReactNode
  /** Variante pour l'intérieur d'une carte ou d'une feuille : ni carte ni grand espacement. */
  compact?: boolean
  className?: string
}

/** État vide : icône ink-faint dans un disque surface-sunken, titre, phrase, action facultative. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'grid shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-faint',
          compact ? 'size-10' : 'size-14',
        )}
      >
        <Icon size={compact ? 20 : 26} strokeWidth={1.75} />
      </span>
      <p className="m-0 mt-1 text-headline">{title}</p>
      {children ? <p className="m-0 text-body text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2 flex flex-col items-center gap-1">{action}</div> : null}
    </>
  )
  const layout = 'flex flex-col items-center gap-1.5 text-center'
  if (compact) return <div className={cx(layout, 'py-2', className)}>{body}</div>
  return (
    <Card padding="large" className={cx(layout, className)}>
      {body}
    </Card>
  )
}
