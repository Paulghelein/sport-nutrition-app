import { describe, expect, it } from 'vitest'
import { CLAUDE_DEFAULT_URL } from '../../types/claude'
import { resolveCoachUrl } from './bridge'

describe('resolveCoachUrl', () => {
  it('repli sur l’URL par défaut si absente ou non autorisée', () => {
    expect(resolveCoachUrl(null)).toBe(CLAUDE_DEFAULT_URL)
    expect(resolveCoachUrl('https://evil.example.com/claude')).toBe(CLAUDE_DEFAULT_URL)
    expect(resolveCoachUrl('javascript:alert(1)')).toBe(CLAUDE_DEFAULT_URL)
  })
  it('garde une URL autorisée', () => {
    expect(resolveCoachUrl(CLAUDE_DEFAULT_URL)).toBe(CLAUDE_DEFAULT_URL)
  })
})
