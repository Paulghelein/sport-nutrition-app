// Correction d'une séance terminée (historique) : brouillon de saisie (texte) → séance corrigée. Fonctions pures.
import { isPlausibleLoad, setTypeOf, timedMaxWindowOf } from '../../domain/training'
import { plannedLoad, setLoads } from '../../domain/training/guided'
import type { Equipment, Feeling, Session, SetEntry } from '../../types'
import { parseDecimal, toInputNumber } from '../../ui'

export const MAX_REPS = 99
export const MAX_DURATION = 600

export interface SetDraft {
  status: 'done' | 'skipped'
  reps: string
  duration: string
  load: string
  feeling: Feeling | ''
}

export const draftKey = (b: number, e: number, s: number) => `${b}.${e}.${s}`

export function toDraft(set: SetEntry): SetDraft {
  return {
    status: set.status === 'done' ? 'done' : 'skipped',
    reps: set.actualReps === undefined ? '' : String(set.actualReps),
    duration: set.actualDurationSec === undefined ? '' : String(set.actualDurationSec),
    load: set.loadKg === undefined ? '' : toInputNumber(set.loadKg),
    feeling: set.feeling ?? '',
  }
}

/**
 * La correction porte sur une durée (série `time`) et non sur des répétitions. Lu via `setTypeOf` : une série `timedMax`
 * (fenêtre valide) ou `amrap` a un `targetDurationSec` / des reps mais se corrige en répétitions. Une série sans type
 * ni cible garde la règle d'avant (durée réelle présente sans répétitions).
 */
export function byDuration(set: SetEntry): boolean {
  const type = setTypeOf(set)
  if (type === 'amrap') return false
  if (type === 'timedMax' && timedMaxWindowOf(set) !== undefined) return false
  if (type === 'time') return true
  return set.actualDurationSec !== undefined && set.actualReps === undefined
}

/** Séance corrigée d'après le brouillon, ou message d'erreur FR. */
export function applyDrafts(
  session: Session,
  drafts: Record<string, SetDraft>,
  notes: string,
  equipment: Equipment,
): { session: Session } | { error: string } {
  let error: string | null = null
  const blocks = session.blocks.map((block, b) => ({
    ...block,
    exercises: block.exercises.map((se, e) => ({
      ...se,
      sets: se.sets.map((set, s): SetEntry => {
        const d = drafts[draftKey(b, e, s)]
        if (!d) return set
        const { actualReps, actualDurationSec, feeling, status, ...rest } = set
        void [actualReps, actualDurationSec, feeling, status]
        const where = `Série ${s + 1} de l’exercice ${e + 1} (bloc ${b + 1})`
        // Série passée : charge prévue rétablie, comme `skipSet` en séance guidée.
        if (d.status === 'skipped') return { ...setLoads(rest, plannedLoad(set)), status: 'skipped' }
        let next: SetEntry = { ...rest }
        next.status = 'done'
        const field = byDuration(set) ? d.duration : d.reps
        const max = byDuration(set) ? MAX_DURATION : MAX_REPS
        if (!/^\d{1,4}$/.test(field.trim()) || Number(field) > max) {
          error ??= `${where} : indique ${byDuration(set) ? 'une durée en secondes' : 'un nombre de répétitions'} entre 0 et ${max}.`
          return set
        }
        if (byDuration(set)) next.actualDurationSec = Number(field)
        else next.actualReps = Number(field)
        let kg: number | undefined
        if (d.load.trim() !== '') {
          kg = parseDecimal(d.load)
          if (!isPlausibleLoad(kg, equipment)) {
            error ??= `${where} : charge invalide (au plus ${equipment.kettlebell.maxKg} kg).`
            return set
          }
        }
        // charges cohérentes (`plannedLoadKg`), même règle que `recordSet`
        next = setLoads(next, kg)
        if (d.feeling !== '') next.feeling = d.feeling
        return next
      }),
    })),
  }))
  if (error !== null) return { error }
  const next: Session = { ...session, blocks }
  const text = notes.trim()
  if (text === '') delete next.notes
  else next.notes = text
  return { session: next }
}
