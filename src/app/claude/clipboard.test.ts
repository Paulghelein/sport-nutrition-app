import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard, readFromClipboard } from './clipboard'

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}
afterEach(() => {
  stubClipboard(undefined)
  vi.restoreAllMocks()
})

describe('copyToClipboard', () => {
  it('écrit avec l’API asynchrone', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    expect(await copyToClipboard('abc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('abc')
  })
  it('refus sans repli possible → false', async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowed')) })
    expect(await copyToClipboard('abc')).toBe(false)
  })
  it('API absente : repli execCommand', async () => {
    stubClipboard(undefined)
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    expect(await copyToClipboard('abc')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })
})

describe('readFromClipboard', () => {
  it('texte lu', async () => {
    stubClipboard({ readText: vi.fn().mockResolvedValue('[{"type":"meal"}]') })
    expect(await readFromClipboard()).toEqual({ ok: true, text: '[{"type":"meal"}]' })
  })
  it('indisponible, refusé, vide', async () => {
    stubClipboard(undefined)
    expect(await readFromClipboard()).toEqual({ ok: false, reason: 'unavailable' })
    stubClipboard({ readText: vi.fn().mockRejectedValue(new Error('x')) })
    expect(await readFromClipboard()).toEqual({ ok: false, reason: 'denied' })
    stubClipboard({ readText: vi.fn().mockResolvedValue('  \n') })
    expect(await readFromClipboard()).toEqual({ ok: false, reason: 'empty' })
  })
})
