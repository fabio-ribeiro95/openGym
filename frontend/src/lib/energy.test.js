import { describe, expect, it } from 'vitest'
import { activeGoals, bmr, calorieGoal, goalRate, trainingHoursPerWeek } from './energy.js'

const NOW = new Date('2026-10-28T12:00:00').getTime()
const H = 3600000, DAY = 86400000
const body = (over = {}) => ({ unit: 'kg', bodyweight: [{ d: '2026-10-27', w: 80 }], workouts: [], ...over })
const goals = (over = {}) => ({ kind: 'goals', auto: true, heightCm: 180, birthYear: 1996, sex: 'm', life: 'sedentary', ...over })

describe('resting burn', () => {
  it('follows Mifflin-St Jeor for men and women', () => {
    expect(bmr({ kg: 80, cm: 180, age: 30, sex: 'm' })).toBe(1780)
    expect(bmr({ kg: 60, cm: 165, age: 30, sex: 'f' })).toBeCloseTo(1320.25, 2)
    expect(bmr({ kg: 80, cm: 180, age: 30 })).toBeNull()
  })
})

describe('training from the log', () => {
  it('averages finished sessions over four weeks and caps one left running', () => {
    const ws = [
      { start: NOW - 2 * DAY, end: NOW - 2 * DAY + 1.5 * H },
      { start: NOW - 9 * DAY, end: NOW - 9 * DAY + 10 * H },   // forgotten: counts as 3 h
      { start: NOW - 40 * DAY, end: NOW - 40 * DAY + H },       // too old
      { start: NOW - DAY },                                      // still open
    ]
    expect(trainingHoursPerWeek(ws, { now: NOW })).toBeCloseTo(4.5 / 4, 5)
  })
})

describe('the calorie goal', () => {
  it('says what is missing instead of guessing', () => {
    expect(calorieGoal(body({ bodyweight: [] }), goals({ sex: null }), { now: NOW })).toEqual({ ok: false, missing: ['weight', 'sex'] })
  })

  it('adds everyday movement, training and other exercise to the resting burn', () => {
    const ws = Array.from({ length: 12 }, (_, i) => ({ start: NOW - (i * 2 + 1) * DAY, end: NOW - (i * 2 + 1) * DAY + H }))   // 3 h a week
    const g = calorieGoal(body({ workouts: ws }), goals({ life: 'light', extraH: 2, extraLevel: 'moderate' }), { now: NOW })
    expect(g.ok).toBe(true)
    expect(g.bmr).toBe(1780)
    expect(g.everyday).toBe(2314)                    // 1780 x 1.3
    expect(g.trainingH).toBe(3)
    expect(g.trainingKcal).toBe(137)                 // 4 MET net x 80 kg x 3 h / 7
    expect(g.extraKcal).toBe(114)                    // 5 MET net x 80 kg x 2 h / 7
    expect(g.kcal).toBe(2570)                        // 2565, to the nearest 10
  })

  it('takes the rate off for a loss and adds it for a gain', () => {
    // on your feet most of the day: 1780 x 1.45 = 2581
    expect(calorieGoal(body(), goals({ life: 'active' }), { now: NOW }).kcal).toBe(2580)
    expect(calorieGoal(body(), goals({ life: 'active', dir: 'lose', rate: 0.5 }), { now: NOW }).kcal).toBe(2030)   // 2581 - 550
    expect(calorieGoal(body(), goals({ life: 'active', dir: 'gain' }), { now: NOW }).kcal).toBe(2860)               // 2581 + 275
  })

  it('never goes below the resting burn', () => {
    const g = calorieGoal(body(), goals({ dir: 'lose', rate: 1.5 }), { now: NOW })
    expect(g.floored).toBe(true)
    expect(g.kcal).toBe(1780)
  })

  it('splits the calories into protein and fat by body weight and carbs for the rest', () => {
    const g = calorieGoal(body(), goals(), { now: NOW })
    expect(g.protein).toBe(144)
    expect(g.fat).toBe(64)
    expect(g.carbs).toBe(Math.round((2140 - 144 * 4 - 64 * 9) / 4))
    expect(g.fiber).toBe(30)
  })

  it('reads a profile in pounds the same way', () => {
    const kg = calorieGoal(body(), goals(), { now: NOW })
    const lb = calorieGoal(body({ unit: 'lb', bodyweight: [{ d: '2026-10-27', w: 176.37 }] }), goals(), { now: NOW })
    expect(lb.kcal).toBe(kg.kcal)
  })
})

describe('the rate of a goal', () => {
  it('uses the number typed, else the weight goal, else a default', () => {
    expect(goalRate({ dir: 'lose', rate: 0.75 }, body())).toBe(0.75)
    expect(goalRate({ dir: 'lose' }, body({ rateGoal: { dir: 'lose', by: '%', lo: 0.5, hi: 1 } }))).toBe(0.6)
    expect(goalRate({ dir: 'lose' }, body({ rateGoal: { dir: 'gain', by: 'w', lo: 0.2, hi: 0.4 } }))).toBe(0.5)
    expect(goalRate({ dir: 'gain' }, body())).toBe(0.25)
  })
})

describe('the goals in use', () => {
  it('takes the calculator when it has what it needs, and the typed numbers otherwise', () => {
    expect(activeGoals(body(), goals({ kcal: 3000 }), { now: NOW }).kcal).toBe(2140)
    expect(activeGoals(body(), goals({ kcal: 3000, auto: false }), { now: NOW }).kcal).toBe(3000)
    expect(activeGoals(body(), goals({ kcal: 3000, heightCm: null }), { now: NOW }).kcal).toBe(3000)
  })
})
