import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteSession, updateDoneSession } from '../../db'
import { formatDateFr } from '../../domain/shared'
import type { Equipment, Session } from '../../types'
import {
  Button,
  Card,
  ConfirmSheet,
  DecimalField,
  ErrorNote,
  IntegerField,
  Section,
  SelectField,
  errorMessage,
  linkButtonClass,
} from '../../ui'
import { BackLink } from './parts'
import { applyDrafts, byDuration, draftKey as key, toDraft } from './sessionDrafts'
import type { SetDraft } from './sessionDrafts'
import { SummaryView } from './SummaryView'
import { useSessionSummary } from './useSessionSummary'

const feelingOptions = [
  { value: '' as const, label: 'Non précisé' },
  { value: 'easy' as const, label: 'Facile' },
  { value: 'ok' as const, label: 'Correct' },
  { value: 'hard' as const, label: 'Difficile' },
]

const statusOptions = [
  { value: 'done' as const, label: 'Faite' },
  { value: 'skipped' as const, label: 'Passée' },
]

function Editor({
  session,
  names,
  equipment,
  onDone,
}: {
  session: Session
  names: ReadonlyMap<string, string>
  equipment: Equipment
  onDone: () => void
}) {
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>(() => {
    const out: Record<string, SetDraft> = {}
    session.blocks.forEach((blk, b) =>
      blk.exercises.forEach((se, e) => se.sets.forEach((set, s) => (out[key(b, e, s)] = toDraft(set)))),
    )
    return out
  })
  const [notes, setNotes] = useState(session.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (k: string, changes: Partial<SetDraft>) =>
    setDrafts((d) => ({ ...d, [k]: { ...(d[k] as SetDraft), ...changes } }))

  const save = async () => {
    const result = applyDrafts(session, drafts, notes, equipment)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateDoneSession(result.session)
      onDone()
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer les corrections. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <div className="mt-5">
      <p className="m-0 rounded-xl border border-v1-line bg-v1-surface px-4 py-3 text-base text-zinc-300">
        La correction met à jour l’historique et les records ; elle ne modifie pas ta progression.
      </p>
      {session.blocks.map((blk, b) =>
        blk.exercises.map((se, e) => (
          <Section key={key(b, e, 0)} title={names.get(se.exerciseId) ?? se.exerciseId}>
            <div className="flex flex-col gap-3">
              {se.sets.map((set, s) => {
                const k = key(b, e, s)
                const d = drafts[k] as SetDraft
                const label = `Série ${s + 1}`
                return (
                  <Card key={k}>
                    <fieldset className="m-0 min-w-0 border-0 p-0">
                      <legend className="mb-2 p-0 text-base font-bold">
                        {names.get(se.exerciseId) ?? se.exerciseId} — {label}
                      </legend>
                      <div className="grid grid-cols-2 gap-3">
                        <SelectField
                          label="Statut"
                          value={d.status}
                          options={statusOptions}
                          onChange={(status) => patch(k, { status })}
                        />
                        {d.status === 'done' ? (
                          byDuration(set) ? (
                            <IntegerField
                              label="Durée"
                              unit="s"
                              value={d.duration}
                              maxLength={4}
                              onChange={(duration) => patch(k, { duration })}
                            />
                          ) : (
                            <IntegerField
                              label="Répétitions"
                              value={d.reps}
                              maxLength={4}
                              onChange={(reps) => patch(k, { reps })}
                            />
                          )
                        ) : (
                          <span />
                        )}
                        {d.status === 'done' ? (
                          <>
                            <DecimalField
                              label="Charge"
                              unit="kg"
                              value={d.load}
                              onChange={(load) => patch(k, { load })}
                            />
                            <SelectField
                              label="Ressenti"
                              value={d.feeling}
                              options={feelingOptions}
                              onChange={(feeling) => patch(k, { feeling })}
                            />
                          </>
                        ) : null}
                      </div>
                    </fieldset>
                  </Card>
                )
              })}
            </div>
          </Section>
        )),
      )}
      <Section title="Notes">
        <label htmlFor="session-notes" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Notes sur la séance
        </label>
        <textarea
          id="session-notes"
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 text-base text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
        />
      </Section>
      <div className="mt-5 flex flex-col gap-3">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void save()} disabled={busy}>
          Enregistrer les corrections
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  )
}

export default function HistoryDetailScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, notFound, error } = useSessionSummary(id)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const back = <BackLink to="/entrainement/historique">Historique</BackLink>
  if (error) {
    return (
      <section>
        {back}
        <div className="mt-3">
          <ErrorNote>Impossible de lire la séance. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      </section>
    )
  }
  if (notFound) {
    return (
      <section>
        {back}
        <h1 className="mt-2 text-3xl font-bold">Séance introuvable</h1>
        <Link to="/entrainement/historique" className={`${linkButtonClass('primary')} mt-4`}>
          Retour à l’historique
        </Link>
      </section>
    )
  }
  if (!data?.session || !data.summary || !data.equipment) return <div aria-busy="true" className="min-h-40" />
  const { session, summary, equipment } = data

  const remove = async () => {
    setBusy(true)
    try {
      await deleteSession(session.id)
      navigate('/entrainement/historique', { replace: true })
    } catch (e) {
      setConfirm(false)
      setBusy(false)
      setActionError(errorMessage(e, 'Impossible de supprimer la séance. Réessaie.'))
    }
  }

  return (
    <section>
      {back}
      <h1 className="mt-2 text-3xl font-bold">{formatDateFr(session.date, 'long')}</h1>
      <p className="m-0 mt-1 text-base text-zinc-400">
        {session.status === 'done' ? 'Séance terminée' : 'Séance abandonnée'}
      </p>
      {editing ? (
        <Editor session={session} names={data.names} equipment={equipment} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SummaryView summary={summary} names={data.names} plannedMin={session.durationMin} />
          {session.notes ? (
            <Section title="Notes">
              <Card>
                <p className="m-0 whitespace-pre-wrap text-base">{session.notes}</p>
              </Card>
            </Section>
          ) : null}
          {actionError ? (
            <div className="mt-5">
              <ErrorNote>{actionError}</ErrorNote>
            </div>
          ) : null}
          <div className="mt-8 flex flex-col gap-3">
            {session.status === 'done' ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Corriger les séries
              </Button>
            ) : null}
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Supprimer cette séance
            </Button>
          </div>
        </>
      )}
      {confirm ? (
        <ConfirmSheet
          title="Supprimer cette séance ?"
          message="Elle disparaît de l’historique, du volume et des records. Ta progression actuelle ne change pas."
          confirmLabel="Supprimer"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </section>
  )
}
