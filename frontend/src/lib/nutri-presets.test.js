import { describe, expect, it } from 'vitest'
import { FOOD_PRESETS, SUPP_PRESETS, forGrams, matches } from './nutri-presets.js'

describe('the starting lists', () => {
  it('have unique names and sane values per 100 g', () => {
    expect(new Set(FOOD_PRESETS.map(f => f.key)).size).toBe(FOOD_PRESETS.length)
    expect(new Set(SUPP_PRESETS).size).toBe(SUPP_PRESETS.length)
    for (const f of FOOD_PRESETS) {
      expect(f.g > 0 && f.kcal >= 0 && f.kcal <= 900).toBe(true)
      // the macros add up to roughly the calories (4/4/9), within what fibre and rounding explain
      const est = f.p * 4 + f.c * 4 + f.f * 9
      expect(Math.abs(est - f.kcal) <= Math.max(25, f.kcal * 0.15)).toBe(true)
    }
  })
})

describe('scaling to a portion', () => {
  it('scales calories to whole numbers and macros to tenths', () => {
    expect(forGrams({ kcal: 165, p: 31, c: 0, f: 3.6 }, 150)).toEqual({ kcal: 248, p: 46.5, c: 0, f: 5.4 })
  })
  it('gives nothing without a positive weight', () => {
    expect(forGrams({ kcal: 100, p: 1, c: 1, f: 1 }, 0)).toBeNull()
    expect(forGrams({ kcal: 100, p: 1, c: 1, f: 1 }, '')).toBeNull()
  })
})

describe('searching', () => {
  it('ignores case and accents', () => {
    expect(matches('Pescada cozida', 'PESC')).toBe(true)
    expect(matches('Feijão cozido', 'feijao')).toBe(true)
    expect(matches('Banana', 'maçã')).toBe(false)
    expect(matches('Banana', '')).toBe(true)
  })
})
