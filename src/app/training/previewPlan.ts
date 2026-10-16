import { generateSession } from '../../domain/training'
import type { SessionBlock, SessionDuration, SessionPlan } from '../../types'
import { loadPreviewEdit } from './previewDraft'
import type { EngineBase } from './useEngineInput'

/**
 * Séance proposée pour une durée (aperçu sans `?modele`). Une seule définition : l'aperçu et la carte « Séance du jour »
 * d'Aujourd'hui l'appellent, donc la carte montre exactement ce que l'aperçu affichera.
 */
export function planForDuration(data: EngineBase, durationMin: SessionDuration): SessionPlan {
  return generateSession({ ...data, durationMin })
}

/** Clé de l'édition de l'aperçu d'une séance proposée (même jour, même durée). */
export function previewKey(durationMin: SessionDuration, date: string): string {
  return `duree:${durationMin}:${date}`
}

/**
 * Blocs que montrera l'aperçu : l'édition enregistrée pour ce jour et cette durée si elle existe, sinon ceux du plan.
 * La carte « Séance du jour » s'en sert pour afficher la même séance que l'aperçu.
 */
export function previewBlocks(plan: SessionPlan, date: string): SessionBlock[] {
  return loadPreviewEdit(previewKey(plan.durationMin, date)) ?? plan.blocks
}
