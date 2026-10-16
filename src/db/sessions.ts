// Séances (cycle de vie J4) et modèles de séance. Toutes les écritures sont transactionnelles.
// Les calculs (progression, suggestions, récapitulatif) sont faits en amont par src/domain/training :
// cette couche valide et écrit des objets déjà calculés.
import type {
  ExerciseState,
  Id,
  IsoDateTime,
  Session,
  SessionCompletion,
  SessionSuggestion,
  SessionTemplate,
} from '../types'
import { db } from './database'
import { fail, newId, nowIso } from './helpers'
import { ValidationError } from './repositories'
import { exerciseStateSchema, sessionSchema, sessionTemplateSchema } from './schemas'
import { checkSessionRow, checkTemplate } from './validation'

function validateSession(session: Session): Session {
  if (!sessionSchema.safeParse(session).success) {
    throw new ValidationError('Séance invalide : vérifie les champs saisis.')
  }
  fail(checkSessionRow(session))
  return session
}

function validateState(state: ExerciseState): ExerciseState {
  if (!exerciseStateSchema.safeParse(state).success) {
    throw new ValidationError('État de progression invalide.')
  }
  return state
}

/** Copie sans les champs qui n'ont de sens qu'une fois la séance terminée. */
function stripFinal(session: Session): Session {
  const next = { ...session }
  delete next.endedAt
  delete next.progressionAppliedAt
  delete next.suggestions
  return next
}

export async function getSession(id: Id): Promise<Session | undefined> {
  return db.sessions.get(id)
}

/** Séance `in_progress` la plus récente (il ne doit y en avoir qu'une, voir `startSession`). */
export async function getActiveSession(): Promise<Session | undefined> {
  const rows = await db.sessions.where('status').equals('in_progress').toArray()
  return rows.sort((a, b) => (b.startedAt ?? b.updatedAt).localeCompare(a.startedAt ?? a.updatedAt))[0]
}

/** Écrit la séance au départ (« Commencer »). Refuse s'il en existe déjà une en cours. */
export async function startSession(session: Session, now: IsoDateTime = nowIso()): Promise<Session> {
  const row = validateSession({
    ...stripFinal(session),
    status: 'in_progress',
    startedAt: session.startedAt ?? now,
    updatedAt: now,
  })
  return db.transaction('rw', db.sessions, async () => {
    if ((await db.sessions.where('status').equals('in_progress').count()) > 0) {
      throw new ValidationError('Une séance est déjà en cours : termine-la ou abandonne-la d’abord.')
    }
    if (await db.sessions.get(row.id)) throw new ValidationError('Cette séance existe déjà.')
    await db.sessions.add(row)
    return row
  })
}

/** Sauvegarde l'avancement (à chaque série validée ou repos lancé). Seulement si la séance est encore en cours. */
export async function saveSessionProgress(session: Session, now: IsoDateTime = nowIso()): Promise<Session> {
  const row = validateSession({ ...stripFinal(session), status: 'in_progress', updatedAt: now })
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(row.id)
    if (current?.status !== 'in_progress') {
      throw new ValidationError('Cette séance n’est plus en cours.')
    }
    const next =
      row.startedAt === undefined && current.startedAt ? { ...row, startedAt: current.startedAt } : row
    await db.sessions.put(next)
    return next
  })
}

/** Passe une séance en cours à `abandoned` (ne compte ni pour le volume ni pour la progression). */
export async function abandonSession(id: Id, now: IsoDateTime = nowIso()): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id)
    if (current?.status !== 'in_progress') throw new ValidationError('Cette séance n’est plus en cours.')
    const next: Session = { ...current, status: 'abandoned', endedAt: now, updatedAt: now }
    delete next.restEndsAt
    await db.sessions.put(next)
    return next
  })
}

/**
 * Termine la séance et applique la progression en UNE transaction (sessions + exerciseState).
 * Garde-fou « une seule application » : si la séance en base n'est plus `in_progress` ou porte déjà
 * `progressionAppliedAt`, rien n'est écrit et une `ValidationError` est levée.
 */
export async function completeSession(
  completion: SessionCompletion,
  now: IsoDateTime = nowIso(),
): Promise<Session> {
  const next = validateSession({
    ...completion.session,
    status: 'done',
    endedAt: completion.session.endedAt ?? now,
    progressionAppliedAt: now,
    suggestions: completion.session.suggestions ?? completion.suggestions,
    updatedAt: now,
  })
  delete next.restEndsAt
  const states = completion.states.map(validateState)
  return db.transaction('rw', [db.sessions, db.exerciseState], async () => {
    const current = await db.sessions.get(next.id)
    if (current?.status !== 'in_progress' || current.progressionAppliedAt !== undefined) {
      throw new ValidationError('Séance déjà terminée.')
    }
    await db.sessions.put(next)
    await db.exerciseState.bulkPut(states)
    return next
  })
}

/**
 * Correction d'une séance `done` depuis l'historique (séries, notes). Ne touche jamais `exerciseState` ;
 * `status`, `progressionAppliedAt` et `suggestions` sont repris de la ligne en base (la correction ne les change pas).
 */
export async function updateDoneSession(session: Session, now: IsoDateTime = nowIso()): Promise<Session> {
  validateSession({ ...session, updatedAt: now })
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(session.id)
    if (current?.status !== 'done') throw new ValidationError('Seule une séance terminée peut être corrigée.')
    const next: Session = { ...session, status: current.status, updatedAt: now }
    delete next.progressionAppliedAt
    delete next.suggestions
    if (current.progressionAppliedAt !== undefined) next.progressionAppliedAt = current.progressionAppliedAt
    if (current.suggestions !== undefined) next.suggestions = current.suggestions
    validateSession(next)
    await db.sessions.put(next)
    return next
  })
}

export async function deleteSession(id: Id): Promise<void> {
  await db.sessions.delete(id)
}

/**
 * Répond à une suggestion `pending` d'une séance `done`. En cas d'acceptation, `makeState` est évaluée DANS la
 * transaction avec l'état courant de l'exercice concerné (pour ne pas écraser une progression plus récente) ;
 * l'état renvoyé est écrit. Pour un `level_up`, l'exercice concerné est la cible : si elle a déjà un état, il est
 * conservé et `makeState` n'est pas appelée.
 */
export async function resolveSuggestion(
  sessionId: Id,
  index: number,
  status: 'accepted' | 'dismissed',
  makeState?: (current: ExerciseState | undefined) => ExerciseState | undefined,
  now: IsoDateTime = nowIso(),
): Promise<Session> {
  if (makeState !== undefined && status !== 'accepted') {
    throw new ValidationError('Un état ne peut accompagner qu’une acceptation.')
  }
  return db.transaction('rw', [db.sessions, db.exerciseState], async () => {
    const current = await db.sessions.get(sessionId)
    if (!current) throw new ValidationError('Séance introuvable.')
    if (current.status !== 'done')
      throw new ValidationError('Les suggestions ne concernent qu’une séance terminée.')
    const suggestion = current.suggestions?.[index]
    if (!suggestion) throw new ValidationError('Suggestion introuvable.')
    if (suggestion.status !== 'pending') throw new ValidationError('Suggestion déjà traitée.')
    let written: ExerciseState | undefined
    if (makeState !== undefined) {
      const targetId =
        suggestion.kind === 'level_up'
          ? (suggestion.toExerciseId ?? suggestion.exerciseId)
          : suggestion.exerciseId
      const existing = await db.exerciseState.get(targetId)
      if (!(suggestion.kind === 'level_up' && existing)) {
        const made = makeState(existing)
        if (made !== undefined) written = { ...validateState(made), updatedAt: now }
      }
    }
    const suggestions: SessionSuggestion[] = (current.suggestions ?? []).map((s, i) =>
      i === index ? { ...s, status } : s,
    )
    const next: Session = { ...current, suggestions, updatedAt: now }
    await db.sessions.put(next)
    if (written) await db.exerciseState.put(written)
    return next
  })
}

// ---------- Modèles de séance ----------

export type SessionTemplateInput = Omit<SessionTemplate, 'id' | 'createdAt' | 'updatedAt'>

export function buildTemplate(
  input: SessionTemplateInput,
  id: Id,
  createdAt: IsoDateTime,
  now: IsoDateTime,
): SessionTemplate {
  fail(checkTemplate(input))
  const row: SessionTemplate = {
    id,
    name: input.name.trim(),
    durationMin: input.durationMin,
    blocks: input.blocks.map((b) => ({ ...b })),
    createdAt,
    updatedAt: now,
  }
  if (!sessionTemplateSchema.safeParse(row).success) {
    throw new ValidationError('Modèle invalide : vérifie les champs saisis.')
  }
  return row
}

/** Modèles triés par nom. */
export async function listTemplates(): Promise<SessionTemplate[]> {
  const rows = await db.sessionTemplates.toArray()
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id))
}

export async function createTemplate(
  input: SessionTemplateInput,
  now: IsoDateTime = nowIso(),
): Promise<SessionTemplate> {
  const row = buildTemplate(input, newId(), now, now)
  await db.sessionTemplates.add(row)
  return row
}

export async function updateTemplate(
  id: Id,
  input: SessionTemplateInput,
  now: IsoDateTime = nowIso(),
): Promise<SessionTemplate> {
  return db.transaction('rw', db.sessionTemplates, async () => {
    const current = await db.sessionTemplates.get(id)
    if (!current) throw new ValidationError('Modèle introuvable.')
    const row = buildTemplate(input, id, current.createdAt, now)
    await db.sessionTemplates.put(row)
    return row
  })
}

export async function deleteTemplate(id: Id): Promise<void> {
  await db.sessionTemplates.delete(id)
}
