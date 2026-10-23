import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listSessions } from '../../db'
import { historyItems } from '../../domain/training'
import { formatDateFr } from '../../domain/shared'
import { useLiveQuery } from '../../ui'
import { Card, buttonClass } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { HISTORY_PATH, TRAINING_PATH } from '../routes'
import { ScreenTitle, Tag } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { useLibrary } from './useLibrary'

export default function HistoryScreen() {
  const sessions = useLiveQuery(() => listSessions(), [])
  const lib = useLibrary()
  const error = sessions.error ?? lib.error
  const items = sessions.data ? historyItems(sessions.data) : undefined
  const names = new Map((lib.data?.library ?? []).map((e) => [e.id, e.name]))

  return (
    <section className="flex flex-col gap-4">
      <BackLink to={TRAINING_PATH}>Entraînement</BackLink>
      <ScreenTitle>Historique</ScreenTitle>
      {error ? <Note tone="error">Impossible de lire l’historique. Ferme l’app puis rouvre-la.</Note> : null}
      {!items && !error ? <div aria-busy="true" className="min-h-40" /> : null}
      {items && items.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-body text-ink-muted">
            Aucune séance terminée pour l’instant. Ta première apparaîtra ici.
          </p>
          <Link to={TRAINING_PATH} className={buttonClass('primary', 'normal', true)}>
            Préparer une séance
          </Link>
        </div>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((it) => {
            const shown = it.exerciseIds.slice(0, 3).map((id) => names.get(id) ?? id)
            const more = it.exerciseIds.length - shown.length
            return (
              <li key={it.id}>
                <Link to={`${HISTORY_PATH}/${it.id}`} className="focus-ring block no-underline">
                  <Card className="flex items-center gap-3 active:opacity-80">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-title text-ink">
                          {formatDateFr(it.date, 'long')}
                        </span>
                        <Tag>{it.status === 'done' ? 'Terminée' : 'Abandonnée'}</Tag>
                      </span>
                      <span className="text-body text-ink">
                        {it.actualMin ?? it.durationMin} min · {it.setsDone} série{it.setsDone > 1 ? 's' : ''}
                      </span>
                      {shown.length > 0 ? (
                        <span className="text-caption text-ink-muted">
                          {shown.join(', ')}
                          {more > 0 ? ` et ${more} autre${more > 1 ? 's' : ''}` : ''}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      size={20}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="shrink-0 text-ink-faint"
                    />
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
