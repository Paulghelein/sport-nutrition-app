import { describe, expect, it } from 'vitest'
import { routeDepth, transitionFor } from '../src/app/shell/pageTransition'

describe('routeDepth', () => {
  it('0 pour les racines d’onglet et de section de Nutrition', () => {
    for (const p of [
      '/',
      '/entrainement',
      '/nutrition',
      '/nutrition/recettes',
      '/nutrition/frigo',
      '/nutrition/courses',
      '/progres',
    ])
      expect(routeDepth(p), p).toBe(0)
    expect(routeDepth('/nutrition/recettes/')).toBe(0)
  })
  it('croît avec la profondeur', () => {
    expect(routeDepth('/reglages')).toBe(1)
    expect(routeDepth('/reglages/importer')).toBe(2)
    expect(routeDepth('/entrainement/exercices/goblet-squat')).toBe(3)
    expect(routeDepth('/entrainement/exercices/goblet-squat/modifier')).toBe(4)
  })
})

describe('transitionFor', () => {
  it('glisse pour un PUSH vers une route plus profonde', () => {
    expect(transitionFor('/', '/reglages', 'PUSH')).toBe('slide')
    expect(transitionFor('/entrainement/exercices', '/entrainement/exercices/goblet-squat', 'PUSH')).toBe(
      'slide',
    )
    expect(transitionFor('/nutrition/recettes', '/nutrition/recettes/nouvelle', 'PUSH')).toBe('slide')
    expect(transitionFor('/reglages', '/reglages/importer', 'PUSH')).toBe('slide')
    expect(transitionFor('/', '/entrainement/apercu', 'PUSH')).toBe('slide')
  })
  it('ne glisse pas au retour (POP) ni pour un remplacement', () => {
    expect(transitionFor('/entrainement/exercices/x', '/entrainement/exercices', 'POP')).toBe('none')
    expect(transitionFor('/entrainement/exercices', '/entrainement/exercices/x', 'POP')).toBe('none')
    expect(transitionFor('/', '/reglages', 'REPLACE')).toBe('none')
  })
  it('ne glisse pas pour un changement d’onglet ni entre sections de même niveau', () => {
    expect(transitionFor('/', '/progres', 'PUSH')).toBe('none')
    expect(transitionFor('/entrainement/exercices/x', '/nutrition', 'PUSH')).toBe('none')
    expect(transitionFor('/nutrition', '/nutrition/recettes', 'PUSH')).toBe('none')
    expect(transitionFor('/entrainement/historique', '/entrainement/modeles', 'PUSH')).toBe('none')
    expect(transitionFor('/entrainement/exercices/x', '/entrainement/exercices', 'PUSH')).toBe('none')
  })
  it('ne glisse jamais vers le mode séance ni le mode cuisine, ni sur le même chemin', () => {
    expect(transitionFor('/entrainement/apercu', '/entrainement/seance', 'PUSH')).toBe('none')
    expect(transitionFor('/nutrition/recettes/x', '/nutrition/recettes/x/cuisine', 'PUSH')).toBe('none')
    expect(transitionFor('/nutrition/recettes', '/nutrition/recette-scan', 'PUSH')).toBe('none')
    expect(transitionFor('/reglages', '/reglages', 'PUSH')).toBe('none')
  })
  it('ne glisse pas vers une route moins profonde (fiche recette → réponse de Claude)', () => {
    expect(transitionFor('/nutrition/recettes/x', '/claude/reponse', 'PUSH')).toBe('none')
  })
})
