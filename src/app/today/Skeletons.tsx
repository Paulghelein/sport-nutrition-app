import { Card } from '../../ui/kit'
import { SESSION_CARD_MIN_H, WEEK_CARD_MIN_H } from './layout'

/** Squelettes des cartes chargées à la demande (même hauteur minimale que les vraies). */
export function WeekSkeleton() {
  return <Card aria-busy="true" aria-label="Ta semaine" className={WEEK_CARD_MIN_H} />
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
  return <Card aria-busy="true" aria-label="Séance du jour" padding="large" className={SESSION_CARD_MIN_H} />
}
