// Correction d'une séance terminée (historique) : brouillon de saisie (texte) → séance corrigée. Fonctions pures.
import { isPlausibleLoad } from '../../domain/training'
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

export function byDuration(set: SetEntry): boolean {
  return set.targetDurationSec !== undefined || set.actualDurationSec !== undefined
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
        const { actualReps, actualDurationSec, feeling, status, loadKg, ...rest } = set
        void [actualReps, actualDurationSec, feeling, status, loadKg]
        const where = `Série ${s + 1} de l’exercice ${e + 1} (bloc ${b + 1})`
        const next: SetEntry = { ...rest }
        if (d.status === 'skipped') {
          next.status = 'skipped'
          if (loadKg !== undefined) next.loadKg = loadKg
          return next
        }
        next.status = 'done'
        const field = byDuration(set) ? d.duration : d.reps
        const max = byDuration(set) ? MAX_DURATION : MAX_REPS
        if (!/^\d{1,4}$/.test(field.trim()) || Number(field) > max) {
          error ??= `${where} : indique ${byDuration(set) ? 'une durée en secondes' : 'un nombre de répétitions'} entre 0 et ${max}.`
          return set
        }
        if (byDuration(set)) next.actualDurationSec = Number(field)
        else next.actualReps = Number(field)
        if (d.load.trim() !== '') {
          const kg = parseDecimal(d.load)
          if (!isPlausibleLoad(kg, equipment)) {
            error ??= `${where} : charge invalide (au plus ${equipment.kettlebell.maxKg} kg).`
            return set
          }
          next.loadKg = kg
        }
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
