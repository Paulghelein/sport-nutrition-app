// Valeurs par défaut (SPEC §2, §4.1). `now` est toujours fourni par l'appelant.
import { SINGLETON_ID } from '../types'
import type { Equipment, IsoDateTime, NutritionParams, Settings } from '../types'

export const defaultNutritionParams: NutritionParams = {
  surplus: 0.12,
  proteinPerKg: 1.8,
  fatShare: 0.27,
  kcalAdjustment: 0,
}

export function defaultEquipment(now: IsoDateTime): Equipment {
  return {
    id: SINGLETON_ID,
    kettlebell: { minKg: 12, maxKg: 24, stepKg: 1 },
    owned: ['mat'],
    updatedAt: now,
  }
}

export function defaultSettings(now: IsoDateTime): Settings {
  return {
    id: SINGLETON_ID,
    onboardingCompleted: false,
    coachUrl: null,
    lastExportAt: null,
    engine: { volumeTargets: {}, deloadEveryWeeks: 6 },
    updatedAt: now,
  }
}
