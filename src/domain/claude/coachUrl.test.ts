import { describe, expect, it } from 'vitest'
import { isAllowedCoachUrl } from './coachUrl'

describe('isAllowedCoachUrl', () => {
  it.each(['https://claude.ai/new', 'https://claude.ai/project/abc', 'https://www.claude.ai/x'])(
    'accepte %s',
    (u) => {
      expect(isAllowedCoachUrl(u)).toBe(true)
    },
  )
  it.each([
    'http://claude.ai/x',
    'https://evil.com/claude.ai',
    'https://claude.ai.evil.com/',
    'https://notclaude.ai/',
    'https://x.test',
    'javascript:alert(1)',
    'claude.ai',
    '',
  ])('refuse %s', (u) => {
    expect(isAllowedCoachUrl(u)).toBe(false)
  })
})
