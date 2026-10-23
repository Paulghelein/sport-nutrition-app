import { describe, expect, it } from 'vitest'
import { formatKg, formatSignedKg, parseDecimal, toInputNumber } from '../src/ui/format'
import { checkWeighIn } from '../src/db/validation'

describe('parseDecimal', () => {
  it('accepte la virgule et le point', () => {
    expect(parseDecimal('72,5')).toBe(72.5)
    expect(parseDecimal(' 72.5 ')).toBe(72.5)
    expect(parseDecimal('72')).toBe(72)
  })
  it('renvoie NaN pour vide ou illisible', () => {
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('   ')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal('72,5,3')).toBeNaN()
    expect(parseDecimal('1e3')).toBeNaN()
    expect(parseDecimal('0x10')).toBeNaN()
    expect(parseDecimal('-5')).toBeNaN()
    expect(parseDecimal('72,')).toBeNaN()
  })
  it('ne laisse pas passer Infinity (NaN ou rejet par checkWeighIn)', () => {
    const n = parseDecimal('Infinity')
    expect(n).toBeNaN()
    expect(checkWeighIn({ date: '2026-10-15', weightKg: n }, '2026-10-15')).toMatch(/30 et 250/)
    expect(checkWeighIn({ date: '2026-10-15', weightKg: Infinity }, '2026-10-15')).toMatch(/30 et 250/)
  })
})

describe('formatage', () => {
  it('toInputNumber / formatKg / formatSignedKg', () => {
    expect(toInputNumber(72.5)).toBe('72,5')
    expect(formatKg(80)).toBe('80,0')
    expect(formatKg(72.46)).toBe('72,5')
    expect(formatSignedKg(0.3)).toMatch(/^\+0,3$/)
    expect(formatSignedKg(-0.3)).toMatch(/^[−-]0,3$/)
    expect(formatSignedKg(0)).toBe('0,0')
  })
})
