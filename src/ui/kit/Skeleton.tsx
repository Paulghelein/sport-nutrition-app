import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'

/** Bloc de chargement : surface-sunken, pulsation douce (coupée sous `prefers-reduced-motion`). */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cx('rounded-md bg-surface-sunken motion-safe:animate-pulse', className)}
    />
  )
}

/** Conteneur de squelette : annoncé « occupé » aux lecteurs d'écran, avec un texte masqué. */
export function SkeletonGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">Chargement…</span>
      {children}
    </div>
  )
}

/**
 * Squelette générique d'un écran : barre de titre et cartes. Fallback des écrans chargés à la demande ;
 * `title={false}` quand le vrai titre est déjà affiché au-dessus.
 */
export function ScreenSkeleton({ cards = 3, title = true }: { cards?: number; title?: boolean }) {
  return (
    <SkeletonGroup className="flex flex-col gap-4">
      {title ? <Skeleton className="mt-1 h-9 w-3/5" /> : null}
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className={cx('rounded-lg', i === 0 ? 'h-36' : 'h-24')} />
      ))}
    </SkeletonGroup>
  )
}

/** Squelette d'une `Section` de l'entraînement (marge haute, barre de titre, carte) : même encombrement que la vraie. */
export function SectionSkeleton() {
  return (
    <SkeletonGroup className="mt-7 flex flex-col gap-3">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-56 rounded-lg" />
    </SkeletonGroup>
  )
}

/** Squelette d'une carte seule (liste, section) : à poser là où une requête locale n'a pas répondu. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <SkeletonGroup className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-card">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-4', i === 0 ? 'w-2/5' : i % 2 ? 'w-full' : 'w-4/5')} />
      ))}
    </SkeletonGroup>
  )
}
