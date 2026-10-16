import type { ReactNode } from 'react'

/** Section de l'écran Progrès : titre de carte (Archivo), action facultative à droite, contenu. */
export function ScreenSection({
  title,
  action,
  hiddenTitle = false,
  children,
}: {
  title: string
  action?: ReactNode
  /** Titre lu par les lecteurs d'écran seulement (la carte s'explique d'elle-même). */
  hiddenTitle?: boolean
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <div className={hiddenTitle ? 'sr-only' : 'flex items-center justify-between gap-3'}>
        <h2 className="m-0 font-display text-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Petit texte d'unité accolé à un chiffre en Archivo. */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="font-sans text-caption font-medium text-ink-muted">{children}</span>
}

/** Texte d'aide ou d'état vide d'une carte. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-body text-ink-muted ${className}`}>{children}</p>
}
