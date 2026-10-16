import { describe, expect, it } from 'vitest'
import type { Food } from '../../types'
import { classifyCameraError, createScanGate, scanErrorText, scanReducer } from './scanLogic'
import type { ScanState } from './scanLogic'

const ok = { isSecureContext: true, hasMediaDevices: true }
const food = { id: 'off-1', name: 'x' } as Food

describe('classifyCameraError', () => {
  it('traduit les noms d’erreur getUserMedia', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' }, ok)).toBe('permission_denied')
    expect(classifyCameraError({ name: 'NotFoundError' }, ok)).toBe('no_camera')
    expect(classifyCameraError({ name: 'OverconstrainedError' }, ok)).toBe('no_camera')
    expect(classifyCameraError({ name: 'NotReadableError' }, ok)).toBe('unknown')
    expect(classifyCameraError(new Error('x'), ok)).toBe('unknown')
    expect(classifyCameraError(null, ok)).toBe('unknown')
  })
  it('priorise le contexte', () => {
    expect(classifyCameraError(undefined, { isSecureContext: false, hasMediaDevices: false })).toBe(
      'insecure_context',
    )
    expect(classifyCameraError(undefined, { isSecureContext: true, hasMediaDevices: false })).toBe(
      'unsupported',
    )
  })
  it('explique les réglages iOS (Safari, pas d’entrée Forge)', () => {
    const body = scanErrorText('permission_denied').body
    expect(body).toContain('Réglages → Apps → Safari → Caméra')
    expect(body).toContain('ferme complètement Forge')
  })
})

describe('createScanGate', () => {
  it('ignore le même code dans la fenêtre, accepte un autre code ou plus tard', () => {
    const gate = createScanGate(3000)
    expect(gate('A', 0)).toBe(true)
    expect(gate('A', 1000)).toBe(false)
    expect(gate('B', 1100)).toBe(true)
    expect(gate('B', 5000)).toBe(true)
  })
})

describe('scanReducer', () => {
  it('un seul déclenchement pendant la recherche', () => {
    let s: ScanState = { phase: 'scanning' }
    s = scanReducer(s, { type: 'detected', ean: '1' })
    expect(s).toEqual({ phase: 'lookup', ean: '1' })
    expect(scanReducer(s, { type: 'detected', ean: '2' })).toBe(s)
  })
  it('chemin nominal puis nouveau scan', () => {
    let s: ScanState = scanReducer({ phase: 'scanning' }, { type: 'detected', ean: '1' })
    s = scanReducer(s, { type: 'resolved', food })
    expect(s.phase).toBe('quantity')
    s = scanReducer(s, { type: 'added', name: 'x' })
    expect(s.phase).toBe('added')
    expect(scanReducer(s, { type: 'again' })).toEqual({ phase: 'scanning' })
  })
  it('erreur puis annulation', () => {
    let s: ScanState = scanReducer({ phase: 'scanning' }, { type: 'detected', ean: '1' })
    s = scanReducer(s, { type: 'failed', ean: '1', message: 'm' })
    expect(s.phase).toBe('error')
    expect(scanReducer(s, { type: 'cancel' })).toEqual({ phase: 'scanning' })
  })
})
