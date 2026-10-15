import type { Choice } from './ChoiceGroup'
import type { ActivityLevel, Goal, Sex, TrainingLevel } from '../types'

export const sexes: Choice<Sex>[] = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
]

export const activities: Choice<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Sédentaire', hint: 'Travail assis, peu de marche.' },
  { value: 'light', label: 'Légèrement actif', hint: 'Marche régulière, 1 à 3 séances de sport par semaine.' },
  { value: 'moderate', label: 'Modérément actif', hint: '3 à 5 séances par semaine, ou travail debout.' },
  { value: 'active', label: 'Très actif', hint: 'Sport intense presque tous les jours, ou travail physique.' },
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
export const levelLabel = (level: TrainingLevel): string => levels.find((l) => l.value === level)?.label ?? String(level)
export const activityLabel = (a: ActivityLevel): string => activities.find((x) => x.value === a)?.label ?? a
export const sexLabel = (s: Sex): string => sexes.find((x) => x.value === s)?.label ?? s

