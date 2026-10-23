import { useId } from 'react'
import type { ReactNode } from 'react'

/** Section de l'écran Réglages : titre de carte (Archivo) puis contenu ; la section est nommée par son titre. */
export function SettingsSection({
  title,
  intro,
  children,
}: {
  title: string
  /** Phrase d'introduction sous le titre. */
  intro?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 font-display text-title">
          {title}
        </h2>
        {intro ? <p className="m-0 text-body text-ink-muted">{intro}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Cadre de chargement d'une section à la demande (hauteur réservée pour ne pas faire sauter la page). */
export function SectionFallback() {
  return <div aria-busy="true" className="h-40 rounded-ds-lg bg-surface-sunken/50" />
}
