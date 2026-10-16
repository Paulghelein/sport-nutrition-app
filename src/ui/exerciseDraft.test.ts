import { describe, expect, it } from 'vitest'
import { seedExercises } from '../content'
import { toExerciseInput } from '../domain/training/library'
import {
  canBeAmrap,
  draftToExercise,
  exerciseToDraft,
  loadExerciseDraft,
  saveExerciseDraft,
} from './exerciseDraft'

const pushUp = seedExercises.find((e) => e.id === 'push-up')

describe('exerciseDraft : drapeau amrap', () => {
  it('le point de départ a bien le drapeau (garde-fou du contenu)', () => {
    expect(pushUp?.amrap).toBe(true)
  })

  it('aller-retour : modifier push-up sans toucher au drapeau le conserve', () => {
    if (!pushUp) throw new Error('push-up absent')
    const input = toExerciseInput(pushUp)
    const draft = exerciseToDraft(input)
    expect(draft.amrap).toBe(true)
    expect(draftToExercise(draft).amrap).toBe(true)
  })

  it('décoché : le drapeau est retiré (absent = non)', () => {
    if (!pushUp) throw new Error('push-up absent')
    const draft = { ...exerciseToDraft(toExerciseInput(pushUp)), amrap: false }
    expect(draftToExercise(draft)).not.toHaveProperty('amrap')
  })

  it('jamais écrit hors poids du corps en répétitions', () => {
    if (!pushUp) throw new Error('push-up absent')
    const base = exerciseToDraft(toExerciseInput(pushUp))
    expect(canBeAmrap(base)).toBe(true)
    expect(canBeAmrap({ ...base, finisher: true })).toBe(false)
    expect(draftToExercise({ ...base, loadType: 'kettlebell' })).not.toHaveProperty('amrap')
    expect(draftToExercise({ ...base, loadType: 'timed' })).not.toHaveProperty('amrap')
    expect(canBeAmrap({ loadType: 'kettlebell', target: 'reps', finisher: false })).toBe(false)
  })

  it('brouillon enregistré avant le drapeau : amrap absent = non', () => {
    if (!pushUp) throw new Error('push-up absent')
    const { amrap, ...old } = exerciseToDraft(toExerciseInput(pushUp))
    void amrap
    sessionStorage.setItem('forge:exercise-draft:old', JSON.stringify(old))
    expect(loadExerciseDraft('old')?.amrap).toBe(false)
    saveExerciseDraft('new', { ...old, amrap: true })
    expect(loadExerciseDraft('new')?.amrap).toBe(true)
  })
})
