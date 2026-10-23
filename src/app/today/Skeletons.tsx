import { Card, Skeleton } from '../../ui/kit'
import { SESSION_CARD_MIN_H, WEEK_CARD_MIN_H } from './layout'

/** Squelettes des cartes chargées à la demande (même hauteur minimale que les vraies). */
export function WeekSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Ta semaine" className={WEEK_CARD_MIN_H}>
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="mt-4 h-12 w-full" />
    </Card>
  )
}

export function TrainingSkeleton() {
  return (
    <>
      <WeekSkeleton />
      <SessionSkeleton />
    </>
  )
}

export function SessionSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Séance du jour" padding="large" className={SESSION_CARD_MIN_H}>
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="mt-3 h-8 w-4/5" />
      <Skeleton className="mt-6 h-16 w-full" />
      <Skeleton className="mt-3 h-16 w-full" />
    </Card>
  )
}
