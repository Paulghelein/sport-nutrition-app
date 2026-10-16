import { Link } from 'react-router-dom'
import { listSessions } from '../../db'
import { historyItems } from '../../domain/training'
import { formatDateFr } from '../../domain/shared'
import { ErrorNote, linkButtonClass, useLiveQuery } from '../../ui'
import { BackLink } from './parts'
import { useLibrary } from './useLibrary'

export default function HistoryScreen() {
  const sessions = useLiveQuery(() => listSessions(), [])
  const lib = useLibrary()
  const error = sessions.error ?? lib.error
  const items = sessions.data ? historyItems(sessions.data) : undefined
  const names = new Map((lib.data?.library ?? []).map((e) => [e.id, e.name]))

  return (
    <section>
      <BackLink to="/seance">Séance</BackLink>
      <h1 className="mt-2 text-3xl font-bold">Historique</h1>
      {error ? (
        <div className="mt-4">
          <ErrorNote>Impossible de lire l’historique. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      ) : null}
      {!items && !error ? <div aria-busy="true" className="min-h-40" /> : null}
      {items && items.length === 0 ? (
        <div className="mt-5">
          <p className="m-0 text-base text-zinc-300">
            Aucune séance terminée pour l’instant. Ta première apparaîtra ici.
          </p>
          <Link to="/seance" className={`${linkButtonClass('primary')} mt-4`}>
            Préparer une séance
          </Link>
        </div>
      ) : null}
      {items && items.length > 0 ? (
        <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
          {items.map((it) => {
            const shown = it.exerciseIds.slice(0, 3).map((id) => names.get(id) ?? id)
            const more = it.exerciseIds.length - shown.length
            return (
              <li key={it.id}>
                <Link
                  to={`/seance/historique/${it.id}`}
                  className="flex min-h-20 flex-col justify-center rounded-2xl border border-v1-line bg-v1-surface p-4 no-underline active:bg-v1-surface-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold text-zinc-100">{formatDateFr(it.date, 'long')}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${
                        it.status === 'done'
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                          : 'border-zinc-500/50 bg-zinc-500/10 text-zinc-300'
                      }`}
                    >
                      {it.status === 'done' ? 'Terminée' : 'Abandonnée'}
                    </span>
                  </span>
                  <span className="mt-1 text-base text-zinc-300">
                    {it.actualMin ?? it.durationMin} min · {it.setsDone} série{it.setsDone > 1 ? 's' : ''}
                  </span>
                  {shown.length > 0 ? (
                    <span className="text-sm text-zinc-400">
                      {shown.join(', ')}
                      {more > 0 ? ` et ${more} autre${more > 1 ? 's' : ''}` : ''}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
