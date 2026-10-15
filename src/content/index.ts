// Contenu éditable de départ : exercices, recettes, illustrations. Agent : content-writer.
//
// Contrat (J2) :
// - `seedExercises` : bibliothèque de départ (SPEC §3.1), `source: 'seed'`, `updatedAt: SEED_UPDATED_AT`,
//   ids lisibles en anglais kebab-case, stables (ne jamais renommer un id publié : surcharges et historique en dépendent).
// - `illustrations` : SVG en texte brut indexés par id (`Exercise.illustration`), dessinés en `currentColor`.
//   Chaque fichier `illustrations/<id>.svg` devient l'entrée `<id>`.
import type { Exercise } from '../types'
import { armsExercises } from './exercises/arms'
import { calvesExercises } from './exercises/calves'
import { carryExercises } from './exercises/carry'
import { coreExercises } from './exercises/core'
import { hingeExercises } from './exercises/hinge'
import { lungeExercises } from './exercises/lunge'
import { pullExercises } from './exercises/pull'
import { pushHExercises } from './exercises/push_h'
import { pushVExercises } from './exercises/push_v'
import { squatExercises } from './exercises/squat'

export { SEED_UPDATED_AT } from './exercises/meta'

export const seedExercises: readonly Exercise[] = [
  ...hingeExercises,
  ...squatExercises,
  ...lungeExercises,
  ...pushHExercises,
  ...pushVExercises,
  ...pullExercises,
  ...coreExercises,
  ...carryExercises,
  ...armsExercises,
  ...calvesExercises,
]

const svgFiles = import.meta.glob<string>('./illustrations/*.svg', { query: '?raw', import: 'default', eager: true })

export const illustrations: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(svgFiles).map(([path, svg]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), svg]),
)
