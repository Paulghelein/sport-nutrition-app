import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { listExerciseStates, resolveSuggestion } from '../../db'
import { acceptSuggestion } from '../../domain/training'
import { formatDateFr } from '../../domain/shared'
import type { LibraryExercise, Equipment, Session } from '../../types'
import { Button, Card, ErrorNote, Section, errorMessage, linkButtonClass } from '../../ui'
import { GUIDED_PATH } from '../routes'
import { SaveTemplate } from './SaveTemplate'
import { SummaryView } from './SummaryView'
import { useSessionSummary } from './useSessionSummary'

function Suggestions({
  session,
  library,
  equipment,
}: {
  session: Session
  library: LibraryExercise[]
  equipment: Equipment
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Suggestions acceptées mais devenues inapplicables (variante déjà débloquée ou supprimée).
  const [unavailable, setUnavailable] = useState<ReadonlySet<number>>(new Set())
  const list = session.suggestions ?? []
  if (list.length === 0) return null

  const answer = async (index: number, status: 'accepted' | 'dismissed') => {
    const suggestion = list[index]
    if (!suggestion) return
    setBusy(index)
    setError(null)
    try {
      if (status === 'accepted') {
        // Vérifie avant d'écrire qu'il y a bien quelque chose à appliquer (sinon on ne la marque pas « Acceptée »).
        const probe = acceptSuggestion(suggestion, {
          library,
          states: await listExerciseStates(),
          equipment,
          date: session.date,
          now: new Date().toISOString(),
        })
        if (probe === undefined) {
          setUnavailable((prev) => new Set(prev).add(index))
          return
        }
      }
      await resolveSuggestion(
        session.id,
        index,
        status,
        status === 'accepted'
          ? (current) =>
              acceptSuggestion(suggestion, {
                library,
                states: current ? [current] : [],
                equipment,
                date: session.date,
                now: new Date().toISOString(),
              })
          : undefined,
      )
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer ta réponse. Réessaie.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Suggestions">
      <div className="flex flex-col gap-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {list.map((s, i) => (
          <Card key={i}>
            <p className="m-0 text-base leading-relaxed text-zinc-100">{s.message}</p>
            {s.status === 'pending' && unavailable.has(i) ? (
              <p role="status" className="m-0 mt-2 text-sm font-semibold text-amber-300">
                Cette variante n’est plus disponible.
              </p>
            ) : null}
            {s.status === 'pending' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  disabled={busy !== null || unavailable.has(i)}
                  onClick={() => void answer(i, 'accepted')}
                >
                  Accepter
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void answer(i, 'dismissed')}
                >
                  Ignorer
                </Button>
              </div>
            ) : (
              <p className="m-0 mt-2 text-sm font-semibold text-zinc-400">
                {s.status === 'accepted' ? 'Acceptée' : 'Ignorée'}
              </p>
            )}
          </Card>
        ))}
      </div>
    </Section>
  )
}

export default function RecapScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, notFound, error } = useSessionSummary(id)

  if (error) {
    return <ErrorNote>Impossible de lire la séance. Ferme l’app puis rouvre-la.</ErrorNote>
  }
  if (notFound) {
    return (
      <section>
        <h1 className="text-3xl font-bold">Séance introuvable</h1>
        <Link to="/seance" className={`${linkButtonClass('primary')} mt-4`}>
          Retour à Séance
        </Link>
      </section>
    )
  }
  if (!data?.session || !data.summary || !data.equipment) return <div aria-busy="true" className="min-h-40" />
  const { session, summary } = data
  if (session.status === 'in_progress') {
    return (
      <section>
        <h1 className="text-3xl font-bold">Séance en cours</h1>
        <Link to={GUIDED_PATH} className={`${linkButtonClass('primary')} mt-4`}>
          Reprendre la séance
        </Link>
      </section>
    )
  }

  return (
    <section>
      <h1 className="text-3xl font-bold">
        {session.status === 'done' ? 'Séance terminée' : 'Séance abandonnée'}
      </h1>
      <p className="m-0 mt-1 text-base text-zinc-400">{formatDateFr(session.date, 'long')}</p>
      <SummaryView summary={summary} names={data.names} plannedMin={session.durationMin} />
      {session.status === 'done' ? (
        <Suggestions session={session} library={data.library} equipment={data.equipment} />
      ) : null}
      <div className="mt-8 flex flex-col gap-3">
        <SaveTemplate
          source={session}
          durationMin={session.durationMin}
          defaultName={`Séance du ${formatDateFr(session.date)}`}
        />
        <Button onClick={() => navigate('/seance', { replace: true })}>Terminé</Button>
      </div>
    </section>
  )
}
