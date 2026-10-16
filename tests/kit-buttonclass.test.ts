import { describe, expect, it } from 'vitest'
import { buttonClass } from '../src/ui/kit/buttonClass'

describe('buttonClass : variantes posées sur une carte', () => {
  it('flat : fond canvas, sans ombre', () => {
    const c = buttonClass('flat')
    expect(c).toContain('bg-canvas')
    expect(c).not.toContain('shadow-card')
  })
  it('dangerSoft : texte critical sur canvas', () => {
    const c = buttonClass('dangerSoft')
    expect(c).toContain('bg-canvas')
    expect(c).toContain('text-critical')
    expect(c).not.toContain('bg-critical')
  })
})
