import { ChevronLeft } from 'lucide-react'
import type { MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Bouton retour en haut des écrans enfants : pastille claire avec chevron et libellé (cible 44 px). */
export function BackLink({
  to,
  children,
  onClick,
}: {
  to: string
  children: ReactNode
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="focus-ring inline-flex min-h-11 items-center gap-1 self-start rounded-ds-pill bg-surface py-2 pl-2.5 pr-4 text-body-strong text-ink no-underline shadow-card active:opacity-70"
    >
      <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </Link>
  )
}
