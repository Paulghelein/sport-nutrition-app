import { describe, expect, it } from 'vitest'
import { checkCoachUrlInput } from './coachUrl'

describe('checkCoachUrlInput', () => {
  it('vide → adresse par défaut (null)', () => {
    expect(checkCoachUrlInput('  ')).toEqual({ ok: true, value: null })
  })
  it('adresse claude.ai acceptée', () => {
    expect(checkCoachUrlInput(' https://claude.ai/project/abc ')).toEqual({
      ok: true,
      value: 'https://claude.ai/project/abc',
    })
  })
  it.each([
    'http://claude.ai/x',
    'https://evil.com/claude.ai',
    'https://claude.ai.evil.com/',
    'javascript:alert(1)',
    'claude.ai',
    'texte',
  ])('refuse %s', (v) => {
    expect(checkCoachUrlInput(v).ok).toBe(false)
  })
})
