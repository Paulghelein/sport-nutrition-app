import { useToday } from '../progress/useToday'
import { SessionCard } from './SessionCard'
import { WeekCard } from './WeekCard'

/**
 * Cartes qui dépendent du moteur et du contenu embarqué (calendrier, génération de séance). Chargé à la demande
 * (`lazy`) depuis TodayScreen : rien de tout cela n'entre dans le bundle de démarrage.
 */
export default function TodayTraining() {
  const today = useToday()
  return (
    <>
      <WeekCard today={today} />
      <SessionCard />
    </>
  )
}
