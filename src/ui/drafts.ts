// Brouillons de formulaire : les nombres restent du texte tant que l'utilisateur tape.
// Aucune règle métier ici : la validation (bornes, cohérence) est faite par src/db.
import { defaultNutritionParams } from '../db'
import { SINGLETON_ID } from '../types'
import type {
  ActivityLevel,
  Equipment,
  EquipmentId,
  Goal,
  IsoDateTime,
  LocalDate,
  Profile,
  Sex,
  TrainingLevel,
} from '../types'
import { parseDecimal, toInputNumber } from './format'

export interface ProfileDraft {
  name: string
  sex: Sex
  birthDate: LocalDate | ''
  heightCm: string
  activityLevel: ActivityLevel
  goal: Goal
  level: TrainingLevel
  weeklySessionsTarget: string
  weeklySessionsMin: string
}

export function newProfileDraft(): ProfileDraft {
  return {
    name: '',
    sex: 'male',
    birthDate: '',
    heightCm: '',
    activityLevel: 'light',
    goal: 'bulk',
    level: 1,
    weeklySessionsTarget: '5',
    weeklySessionsMin: '3',
  }
}

export function profileToDraft(profile: Profile): ProfileDraft {
  return {
    name: profile.name ?? '',
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: toInputNumber(profile.heightCm),
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    level: profile.level,
    weeklySessionsTarget: String(profile.weeklySessionsTarget),
    weeklySessionsMin: String(profile.weeklySessionsMin),
  }
}

/** Les champs numériques vides ou illisibles donnent NaN : `src/db` les refuse avec un message. */
export function draftToProfile(draft: ProfileDraft, base: Profile | null, now: IsoDateTime): Profile {
  const name = draft.name.trim()
  const profile: Profile = {
    id: SINGLETON_ID,
    sex: draft.sex,
    birthDate: draft.birthDate,
    heightCm: parseDecimal(draft.heightCm),
    activityLevel: draft.activityLevel,
    goal: draft.goal,
    level: draft.level,
    weeklySessionsTarget: parseDecimal(draft.weeklySessionsTarget),
    weeklySessionsMin: parseDecimal(draft.weeklySessionsMin),
    nutrition: base?.nutrition ?? defaultNutritionParams,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  }
  if (name !== '') profile.name = name
  return profile
}

/** Vrai si les champs obligatoires de l'identité sont remplis (pas une règle métier : champs vides). */
export function isIdentityFilled(draft: ProfileDraft): boolean {
  return draft.birthDate !== '' && draft.heightCm.trim() !== ''
}

export function isGoalsFilled(draft: ProfileDraft): boolean {
  return draft.weeklySessionsTarget.trim() !== '' && draft.weeklySessionsMin.trim() !== ''
}

export interface EquipmentDraft {
  minKg: string
  maxKg: string
  stepKg: string
  owned: EquipmentId[]
}

export function equipmentToDraft(equipment: Equipment): EquipmentDraft {
  return {
    minKg: toInputNumber(equipment.kettlebell.minKg),
    maxKg: toInputNumber(equipment.kettlebell.maxKg),
    stepKg: toInputNumber(equipment.kettlebell.stepKg),
    owned: equipment.owned,
  }
}

export function draftToEquipment(draft: EquipmentDraft, now: IsoDateTime): Equipment {
  return {
    id: SINGLETON_ID,
    kettlebell: {
      minKg: parseDecimal(draft.minKg),
      maxKg: parseDecimal(draft.maxKg),
      stepKg: parseDecimal(draft.stepKg),
    },
    owned: draft.owned,
    updatedAt: now,
  }
}

export const ownableEquipment: { id: EquipmentId; label: string; hint?: string }[] = [
  { id: 'mat', label: 'Tapis' },
  { id: 'pullup_bar', label: 'Barre de traction' },
  { id: 'bands', label: 'Élastiques' },
  { id: 'bench', label: 'Chaise ou banc', hint: 'Solide, pour s’asseoir ou prendre appui' },
  { id: 'table', label: 'Table solide', hint: 'Pour le rowing sous la table' },
]
