import type { Choice } from './ChoiceGroup'
import type {
  ActivityLevel,
  EquipmentId,
  ExercisePreference,
  Goal,
  LoadType,
  MovementPattern,
  MuscleGroup,
  Sex,
  TrainingLevel,
} from '../types'
import { ownableEquipment } from './drafts'

export const sexes: Choice<Sex>[] = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
]

export const activities: Choice<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Sédentaire', hint: 'Travail assis, peu de marche.' },
  {
    value: 'light',
    label: 'Légèrement actif',
    hint: 'Marche régulière, 1 à 3 séances de sport par semaine.',
  },
  { value: 'moderate', label: 'Modérément actif', hint: '3 à 5 séances par semaine, ou travail debout.' },
  {
    value: 'active',
    label: 'Très actif',
    hint: 'Sport intense presque tous les jours, ou travail physique.',
  },
]

export const goals: Choice<Goal>[] = [
  { value: 'bulk', label: 'Prise de masse' },
  { value: 'maintain', label: 'Maintien' },
  { value: 'cut', label: 'Sèche' },
]

export const levels: Choice<TrainingLevel>[] = [
  { value: 1, label: 'Débutant' },
  { value: 2, label: 'Intermédiaire' },
  { value: 3, label: 'Avancé' },
]

export const goalLabel = (goal: Goal): string => goals.find((g) => g.value === goal)?.label ?? goal
export const levelLabel = (level: TrainingLevel): string =>
  levels.find((l) => l.value === level)?.label ?? String(level)
export const activityLabel = (a: ActivityLevel): string => activities.find((x) => x.value === a)?.label ?? a
export const sexLabel = (s: Sex): string => sexes.find((x) => x.value === s)?.label ?? s

export const patterns: Choice<MovementPattern>[] = [
  { value: 'hinge', label: 'Charnière' },
  { value: 'squat', label: 'Squat' },
  { value: 'lunge', label: 'Fente' },
  { value: 'push_h', label: 'Poussée horizontale' },
  { value: 'push_v', label: 'Poussée verticale' },
  { value: 'pull', label: 'Tirage' },
  { value: 'core', label: 'Gainage' },
  { value: 'carry', label: 'Porté' },
  { value: 'arms', label: 'Bras' },
  { value: 'calves', label: 'Mollets' },
]

export const muscles: Choice<MuscleGroup>[] = [
  { value: 'chest', label: 'Pectoraux' },
  { value: 'back', label: 'Dos' },
  { value: 'shoulders', label: 'Épaules' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'forearms', label: 'Avant-bras' },
  { value: 'traps', label: 'Trapèzes' },
  { value: 'abs', label: 'Abdominaux' },
  { value: 'lower_back', label: 'Lombaires' },
  { value: 'glutes', label: 'Fessiers' },
  { value: 'quads', label: 'Quadriceps' },
  { value: 'hamstrings', label: 'Ischio-jambiers' },
  { value: 'calves', label: 'Mollets' },
]

export const loadTypes: Choice<LoadType>[] = [
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bodyweight', label: 'Poids du corps' },
  { value: 'timed', label: 'Chronométré' },
]

export const preferences: Choice<ExercisePreference>[] = [
  { value: 'liked', label: 'J’aime' },
  { value: 'neutral', label: 'Neutre' },
  { value: 'disliked', label: 'Je n’aime pas' },
  { value: 'hidden', label: 'Masquer' },
]

/** Tout le matériel que peut requérir un exercice (kettlebell comprise), dans l'ordre d'affichage. */
export const equipmentChoices: Choice<EquipmentId>[] = [
  { value: 'kettlebell', label: 'Kettlebell' },
  ...ownableEquipment.map((e) => ({ value: e.id, label: e.label })),
]

export const patternLabel = (p: MovementPattern): string => patterns.find((x) => x.value === p)?.label ?? p
export const muscleLabel = (m: MuscleGroup): string => muscles.find((x) => x.value === m)?.label ?? m
export const loadTypeLabel = (t: LoadType): string => loadTypes.find((x) => x.value === t)?.label ?? t
export const preferenceLabel = (p: ExercisePreference): string =>
  preferences.find((x) => x.value === p)?.label ?? p
export const equipmentLabel = (e: EquipmentId): string =>
  equipmentChoices.find((x) => x.value === e)?.label ?? e
