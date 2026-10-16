import { Settings } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { parseLocalNoon } from '../../ui/kit'
import { SETTINGS_PATH } from '../routes'
import { useToday } from '../progress/useToday'
import { KcalCard } from './KcalCard'
import { SectionBoundary } from './SectionBoundary'
import { TrainingSkeleton } from './Skeletons'

// Moteur et contenu à la demande : hors du bundle de démarrage.
const TodayTraining = lazy(() => import('./TodayTraining'))

const dateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** « Vendredi 16 octobre » à partir d'une date locale `AAAA-MM-JJ`. */
function dateLabel(date: string): string {
  const text = dateFormat.format(parseLocalNoon(date))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Écran Aujourd'hui (F1) : la semaine, la séance du jour, les calories. */
export function TodayScreen() {
  const today = useToday()
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="m-0 text-caption text-ink-muted">{dateLabel(today)}</p>
          <h1 className="m-0 font-display text-display-l">Aujourd’hui</h1>
        </div>
        <Link
          to={SETTINGS_PATH}
          aria-label="Réglages"
          className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card"
        >
          <Settings size={22} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </header>
      <SectionBoundary>
        <Suspense fallback={<TrainingSkeleton />}>
          <TodayTraining />
        </Suspense>
      </SectionBoundary>
      <KcalCard today={today} />
    </div>
  )
}
