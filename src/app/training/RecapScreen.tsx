import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildSessionAfterMessage } from '../../domain/claude/context'
import { listExerciseStates, resolveSuggestion } from '../../db'
import { acceptSuggestion } from '../../domain/training'
import { formatDateFr } from '../../domain/shared'
import type { LibraryExercise, Equipment, Session } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Card, buttonClass } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { sessionAfterData } from '../claude/inputs'
import { GUIDED_PATH, TRAINING_PATH } from '../routes'
import { ScreenTitle, Section } from './parts'
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
        {error ? <Note tone="error">{error}</Note> : null}
        {list.map((s, i) => (
          <Card key={i}>
            <p className="m-0 text-body">{s.message}</p>
            {s.status === 'pending' && unavailable.has(i) ? (
              <p role="status" className="m-0 mt-2 text-caption font-semibold text-warning">
                Cette variante n’est plus disponible.
              </p>
            ) : null}
            {s.status === 'pending' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  disabled={busy !== null || unavailable.has(i)}
                  onClick={() => void answer(i, 'accepted')}
                >
                  Accepter
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={busy !== null}
                  onClick={() => void answer(i, 'dismissed')}
                >
                  Ignorer
                </Button>
              </div>
            ) : (
              <p className="m-0 mt-2 text-caption font-semibold text-ink-muted">
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
    return <Note tone="error">Impossible de lire la séance. Ferme l’app puis rouvre-la.</Note>
  }
  if (notFound) {
    return (
      <section className="flex flex-col gap-4">
        <ScreenTitle>Séance introuvable</ScreenTitle>
        <Link to={TRAINING_PATH} className={buttonClass('primary', 'normal', true)}>
          Retour à Entraînement
        </Link>
      </section>
    )
  }
  if (!data?.session || !data.summary || !data.equipment) return <div aria-busy="true" className="min-h-40" />
  const { session, summary } = data
  if (session.status === 'in_progress') {
    return (
      <section className="flex flex-col gap-4">
        <ScreenTitle>Séance en cours</ScreenTitle>
        <Link to={GUIDED_PATH} className={buttonClass('primary', 'normal', true)}>
          Reprendre la séance
        </Link>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <p className="m-0 text-caption text-ink-muted">{formatDateFr(session.date, 'long')}</p>
        <ScreenTitle>{session.status === 'done' ? 'Séance terminée' : 'Séance abandonnée'}</ScreenTitle>
      </div>
      <SummaryView summary={summary} names={data.names} plannedMin={session.durationMin} />
      {session.status === 'done' ? (
        <Suggestions session={session} library={data.library} equipment={data.equipment} />
      ) : null}
      {session.status === 'done' ? (
        <div className="mt-4">
          <AskClaudeButton
            kind="session_after"
            build={(base) =>
              buildSessionAfterMessage({ ...base, ...sessionAfterData(session, summary, data.library) })
            }
            renderTrigger={(t) => (
              <Button
                variant="secondary"
                fullWidth
                disabled={t.disabled}
                aria-busy={t.busy}
                onClick={t.onClick}
              >
                {t.label}
              </Button>
            )}
          />
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        <SaveTemplate
          source={session}
          durationMin={session.durationMin}
          defaultName={`Séance du ${formatDateFr(session.date)}`}
        />
        <Button fullWidth onClick={() => navigate(TRAINING_PATH, { replace: true })}>
          Terminé
        </Button>
      </div>
    </section>
  )
}
