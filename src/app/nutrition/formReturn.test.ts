import { describe, expect, it } from 'vitest'
import { RECIPE_SCAN_PATH } from '../routes'
import { allowedReturn, returnTarget } from './formReturn'

describe('retour du formulaire d’aliment', () => {
  it('accepte exactement le chemin de la liste blanche', () => {
    expect(allowedReturn(RECIPE_SCAN_PATH)).toBe(RECIPE_SCAN_PATH)
  })
  it('refuse tout le reste (pas de redirection ouverte)', () => {
    for (const bad of [
      null,
      '',
      'https://evil.example',
      '//evil.example',
      `${RECIPE_SCAN_PATH}/`,
      `${RECIPE_SCAN_PATH}?x=1`,
      '/nutrition',
      'javascript:alert(1)',
    ])
      expect(allowedReturn(bad), String(bad)).toBeNull()
  })
  it('construit la destination', () => {
    expect(returnTarget(RECIPE_SCAN_PATH)).toBe(RECIPE_SCAN_PATH)
    expect(returnTarget(RECIPE_SCAN_PATH, 'a b')).toBe(`${RECIPE_SCAN_PATH}?ajout=a%20b`)
  })
})
