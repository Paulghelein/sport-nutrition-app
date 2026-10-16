import { describe, expect, it } from 'vitest'
import { activeTab, hidesTabBar, usesCanvas } from '../src/app/shell/activeTab'
import { legacyRedirect } from '../src/app/shell/legacyRedirect'
import { destinationFor } from '../src/app/shell/destinations'
import { GUIDED_PATH } from '../src/app/routes'

describe('legacyRedirect', () => {
  it('redirige l’ancienne racine et le mode guidé', () => {
    expect(legacyRedirect('/seance')).toBe('/entrainement')
    expect(legacyRedirect('/seance/en-cours')).toBe('/entrainement/seance')
  })
  it('conserve le reste du chemin, la query et le hash', () => {
    expect(legacyRedirect('/seance/x/y', '?z', '')).toBe('/entrainement/x/y?z')
    expect(legacyRedirect('/seance/apercu', '?duree=30', '#haut')).toBe('/entrainement/apercu?duree=30#haut')
    expect(legacyRedirect('/seance/exercices/goblet-squat')).toBe('/entrainement/exercices/goblet-squat')
    expect(legacyRedirect('/seance/')).toBe('/entrainement/')
  })
  it('ne touche pas aux autres chemins (ni aux préfixes trompeurs)', () => {
    for (const p of ['/', '/entrainement', '/nutrition', '/seances', '/seance-x', '/reglages'])
      expect(legacyRedirect(p), p).toBeNull()
  })
})

describe('activeTab', () => {
  it('déduit l’onglet du préfixe du chemin', () => {
    expect(activeTab('/')).toBe('today')
    expect(activeTab('/entrainement')).toBe('training')
    expect(activeTab('/entrainement/exercices/push-up')).toBe('training')
    expect(activeTab('/nutrition/recettes/x')).toBe('nutrition')
    expect(activeTab('/progres')).toBe('progress')
  })
  it('Réglages garde Aujourd’hui allumé ; les chemins hors onglets n’allument rien', () => {
    expect(activeTab('/reglages')).toBe('today')
    expect(activeTab('/reglages/importer')).toBe('today')
    expect(activeTab('/claude/reponse')).toBeNull()
    expect(activeTab('/nutritionnel')).toBeNull()
  })
})

describe('mise en page', () => {
  it('masque la barre en mode séance et en mode cuisine seulement', () => {
    expect(hidesTabBar(GUIDED_PATH)).toBe(true)
    expect(hidesTabBar('/nutrition/recettes/abc/cuisine')).toBe(true)
    expect(hidesTabBar('/entrainement')).toBe(false)
    expect(hidesTabBar('/nutrition/recettes/abc')).toBe(false)
  })
  it('seuls les écrans refaits (accueil, Progrès, Entraînement) sont en clair', () => {
    expect(usesCanvas('/')).toBe(true)
    expect(usesCanvas('/progres')).toBe(true)
    expect(usesCanvas('/entrainement')).toBe(true)
    expect(usesCanvas('/entrainement/apercu')).toBe(true)
    expect(usesCanvas('/nutrition')).toBe(false)
  })
})

describe('destinationFor (feuille Ajouter)', () => {
  it('transmet le repas ciblé', () => {
    expect(destinationFor('scan', 'dinner')).toBe('/nutrition/scanner?repas=dinner')
    expect(destinationFor('search', 'lunch')).toBe('/nutrition/ajouter?repas=lunch')
    expect(destinationFor('recipe-or-fridge', 'snack')).toBe('/nutrition/ajouter?repas=snack&ouvrir=recette')
    expect(destinationFor('quick-entry', 'breakfast')).toBe('/nutrition/ajouter?repas=breakfast&ouvrir=libre')
  })
  it('les autres entrées pointent vers l’existant ; la pesée n’est pas une navigation', () => {
    expect(destinationFor('describe-to-claude', 'lunch')).toBe('/nutrition?claude=1')
    expect(destinationFor('measurements', 'lunch')).toBe('/progres#mensurations')
    expect(destinationFor('weigh-in', 'lunch')).toBeNull()
  })
})
