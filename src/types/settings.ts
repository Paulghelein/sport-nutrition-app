// Réglages de l'app et du moteur (SPEC §3.5, §5, §10).
import type { IsoDateTime, Range, SingletonId } from './common'
import type { MuscleGroup } from './training'

export interface EngineSettings {
  /** Cibles de séries / semaine par groupe ; un groupe absent utilise la cible par défaut du moteur. */
  volumeTargets: Partial<Record<MuscleGroup, Range>>
  /** Deload programmé toutes les N semaines ; défaut 6. */
  deloadEveryWeeks: number
}

export interface Settings {
  id: SingletonId
  /** Passe à `true` à la fin de l'onboarding ; tant que `false`, l'app affiche l'onboarding. */
  onboardingCompleted: boolean
  /** URL du Projet Claude « Coach » (§10.1) ; `null` → https://claude.ai/new. */
  coachUrl: string | null
  /** Dernier export de sauvegarde, pour le rappel hebdomadaire. */
  lastExportAt: IsoDateTime | null
  engine: EngineSettings
  updatedAt: IsoDateTime
}
