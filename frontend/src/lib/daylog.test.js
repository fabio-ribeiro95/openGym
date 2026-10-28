// The day log: what the helpers read and write, the energy estimate, and that two devices (and the
// server's copy of the sync rules, api/sync-stamps.js) merge it the way they merge the day notes.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import {
  GOALS_ID, KCAL_PER_KG, addFood, addWater, canLogDay, dayLogOf, editDay, emptyDay, estimateMaintenance, goalsOf, isEmptyDay,
  itemsOf, lastWeightKg, proteinRange, rangeSummary, readDay, readFood, readItem, removeFood, removeItem, setNote, setSleep,
  shiftISO, toggleTaken, totalsOf, withDay, withGoals, withItem,
} from './daylog.js'
import { mergeStates, stampChange, STAMPED_MAPS } from './sync-merge.js'
import { mealOf, fastOf, withFast, endFast } from './daylog.js'
import { NOTE_MAX } from './history.js'
import { isoOf } from './format.js'

const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], _ts: 0, ...over,
})
const clone = o => JSON.parse(JSON.stringify(o))

describe('reading a day', () => {
  it('keeps what is valid and drops junk', () => {
    expect(readDay({ sleep: { h: 7.5, q: 4 }, water: 2000, taken: ['a', 'a', 'b'], note: '  ok  ', _ts: 1 }))
      .toEqual({ sleep: { h: 7.5, q: 4 }, water: 2000, food: [], taken: ['a', 'b'], note: 'ok', fast: null })
    expect(readDay({ sleep: { h: -3, q: 9 }, water: 'lots', taken: [3, null, ''], food: [{}, 'x', { n: 'only a name' }] })).toBeNull()
    for (const junk of [null, undefined, 'x', 3, [], { _ts: 4 }]) expect(readDay(junk)).toBeNull()
  })

  it('clamps numbers to sane bounds and rounds them', () => {
    const d = readDay({ sleep: { h: 99.999 }, water: 999999.4 })
    expect(d.sleep.h).toBe(24)
    expect(d.water).toBe(20000)
    expect(readDay({ sleep: { h: 7.256 } }).sleep.h).toBe(7.26)
    expect(readDay({ sleep: { q: 2.5 } })).toBeNull()
  })

  it('reads a food entry with any one of its numbers', () => {
    expect(readFood({ n: ' Lunch ', kcal: 700.4, p: 45.26 })).toEqual({ n: 'Lunch', kcal: 700, p: 45.3, c: null, f: null, fib: null, m: null })
    expect(readFood({ n: 'water' })).toBeNull()
    expect(readFood({ kcal: -5 })).toBeNull()
    expect(readFood({ kcal: 0 })).toEqual({ n: '', kcal: 0, p: null, c: null, f: null, fib: null, m: null })
  })

  it('cuts the note at the shared limit', () => {
    expect(readDay({ note: 'x'.repeat(NOTE_MAX + 40) }).note).toHaveLength(NOTE_MAX)
  })

  it('tells an empty day from one with something in it', () => {
    expect(isEmptyDay(emptyDay())).toBe(true)
    expect(isEmptyDay(null)).toBe(true)
    expect(isEmptyDay({ ...emptyDay(), water: 0 })).toBe(false)
  })
})

describe('writing a day', () => {
  it('stamps one entry per day and leaves the other days alone', () => {
    const a = withDay({ '2026-10-01': { water: 500, _ts: 3 } }, '2026-10-02', { ...emptyDay(), sleep: { h: 8, q: null }, water: 1500 }, 10)
    expect(a).toEqual({ '2026-10-01': { water: 500, _ts: 3 }, '2026-10-02': { sleep: { h: 8 }, water: 1500, _ts: 10 } })
  })

  it('writes an empty day as a stamped clear so the removal syncs', () => {
    const a = withDay({ '2026-10-02': { water: 1500, _ts: 3 } }, '2026-10-02', emptyDay(), 12)
    expect(a['2026-10-02']).toEqual({ _ts: 12 })
    expect(dayLogOf({ dayLog: a }, '2026-10-02')).toBeNull()
    expect(withDay(undefined, '2026-10-03', null, 13)).toEqual({ '2026-10-03': { _ts: 13 } })
  })

  it('editDay starts from what is stored and goes through the same write', () => {
    const S = { dayLog: { '2026-10-02': { water: 500, taken: ['s1'], _ts: 3 } } }
    const next = editDay(S, '2026-10-02', d => addWater(d, 250), 20)
    expect(next['2026-10-02']).toEqual({ water: 750, taken: ['s1'], _ts: 20 })
    const fresh = editDay({}, '2026-10-05', d => setSleep(d, { q: 3 }), 21)
    expect(fresh['2026-10-05']).toEqual({ sleep: { q: 3 }, _ts: 21 })
  })

  it('water never goes below zero or past the cap', () => {
    expect(addWater({ ...emptyDay(), water: 100 }, -500).water).toBe(0)
    expect(addWater({ ...emptyDay(), water: 19900 }, 500).water).toBe(20000)
  })

  it('adds and removes food, and ignores an entry with no numbers', () => {
    let d = emptyDay()
    d = addFood(d, { n: 'Oats', kcal: 400, p: 15, c: 60, f: 8 })
    d = addFood(d, { n: 'Whey', kcal: 120, p: 24 })
    d = addFood(d, { n: 'nothing' })
    expect(d.food).toHaveLength(2)
    expect(totalsOf(d)).toEqual({ kcal: 520, p: 39, c: 60, f: 8, fib: 0 })
    d = removeFood(d, 0)
    expect(d.food.map(f => f.n)).toEqual(['Whey'])
    expect(totalsOf(emptyDay())).toEqual({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 })
  })

  it('toggles a supplement taken and sets a note', () => {
    let d = toggleTaken(emptyDay(), 'a')
    d = toggleTaken(d, 'b')
    expect(d.taken).toEqual(['a', 'b'])
    expect(toggleTaken(d, 'a').taken).toEqual(['b'])
    expect(setNote(d, '  slept badly ').note).toBe('slept badly')
  })

  it('does not accept a day that is not today or earlier', () => {
    expect(canLogDay('2026-10-28', '2026-10-28')).toBe(true)
    expect(canLogDay('2026-10-29', '2026-10-28')).toBe(false)
    expect(canLogDay('tomorrow', '2026-10-28')).toBe(false)
  })
})

describe('supplements, saved meals and goals', () => {
  it('reads each kind and rejects what is incomplete', () => {
    expect(readItem({ kind: 'supp', name: ' Creatine ', dose: '5 g', when: 'morning', _ts: 1 })).toEqual({ kind: 'supp', name: 'Creatine', dose: '5 g', when: 'morning' })
    expect(readItem({ kind: 'supp', name: 'Zinc', when: 'sometime' })).toEqual({ kind: 'supp', name: 'Zinc', dose: '', when: null })
    expect(readItem({ kind: 'supp', name: '  ' })).toBeNull()
    expect(readItem({ kind: 'meal', name: 'Oats', kcal: 500, p: 20 })).toEqual({ kind: 'meal', name: 'Oats', kcal: 500, p: 20, c: null, f: null, fib: null })
    expect(readItem({ kind: 'meal', name: 'Empty' })).toBeNull()
    expect(readItem({ kind: 'goals', protein: 160 })).toMatchObject({ kind: 'goals', kcal: null, protein: 160, water: null, sleepH: null, auto: true })
    expect(readItem({ kind: 'goals' })).toBeNull()
    expect(readItem({ kind: 'other', name: 'x' })).toBeNull()
    expect(readItem({ _ts: 3 })).toBeNull()
  })

  it('lists one kind by name and hides cleared ones', () => {
    let map = withItem({}, 's2', { kind: 'supp', name: 'Vitamin D', dose: '2000 IU' }, 1)
    map = withItem(map, 's1', { kind: 'supp', name: 'Creatine', dose: '5 g' }, 2)
    map = withItem(map, 'm1', { kind: 'meal', name: 'Oats', kcal: 500 }, 3)
    map = withGoals(map, { protein: 150 }, 4)
    expect(itemsOf({ nutriItems: map }, 'supp').map(x => x.name)).toEqual(['Creatine', 'Vitamin D'])
    expect(itemsOf({ nutriItems: map }, 'meal')).toHaveLength(1)
    map = removeItem(map, 's1', 9)
    expect(map.s1).toEqual({ _ts: 9 })
    expect(itemsOf({ nutriItems: map }, 'supp').map(x => x.id)).toEqual(['s2'])
    expect(itemsOf({}, 'supp')).toEqual([])
  })

  it('keeps the goals in one stamped entry and reads them back', () => {
    const map = withGoals({}, { kcal: 2600, protein: 160, water: 2500, sleepH: 8 }, 5)
    expect(map[GOALS_ID]).toMatchObject({ kind: 'goals', kcal: 2600, _ts: 5 })
    expect(goalsOf({ nutriItems: map })).toMatchObject({ kcal: 2600, protein: 160, water: 2500, sleepH: 8 })
    expect(goalsOf({})).toMatchObject({ kind: 'goals', kcal: null, protein: null, water: null, sleepH: null, auto: true, heightCm: null })
    expect(itemsOf({ nutriItems: map }, 'goals')).toHaveLength(1)
  })

  it('works out the protein range from the latest weigh-in, in either unit', () => {
    expect(proteinRange(80)).toEqual({ lo: 128, hi: 176 })
    expect(proteinRange(0)).toBeNull()
    expect(lastWeightKg({ unit: 'kg', bodyweight: [{ d: '2026-10-01', w: 80, t: 1 }, { d: '2026-10-05', w: 81, t: 2 }] })).toBe(81)
    expect(lastWeightKg({ unit: 'lb', bodyweight: [{ d: '2026-10-05', w: 176.4, t: 2 }] })).toBeCloseTo(80.01, 1)
    expect(lastWeightKg({ bodyweight: [] })).toBeNull()
  })
})

describe('reading a stretch of days', () => {
  it('shifts a date by whole days across a month end', () => {
    expect(shiftISO('2026-10-28', 5)).toBe('2026-11-02')
    expect(shiftISO('2026-03-02', -3)).toBe('2026-02-27')
  })

  it('averages only the days that have a value, and counts supplement days', () => {
    const S = {
      nutriItems: withItem({}, 's1', { kind: 'supp', name: 'Creatine' }, 1),
      dayLog: {
        '2026-10-26': { sleep: { h: 7, q: 4 }, food: [{ kcal: 2000, p: 140 }], taken: ['s1'], _ts: 1 },
        '2026-10-27': { sleep: { h: 8, q: 2 }, water: 2000, food: [{ kcal: 2400, p: 160 }, { kcal: 200 }], taken: ['s1'], _ts: 1 },
        '2026-10-28': { water: 1000, _ts: 1 },
      },
    }
    const r = rangeSummary(S, '2026-10-28', 7)
    expect(r.logged).toBe(3)
    expect(r.sleepAvg).toBe(7.5)
    expect(r.sleepDays).toBe(2)
    expect(r.qualityAvg).toBe(3)
    expect(r.kcalAvg).toBe(2300)
    expect(r.proteinAvg).toBe(150)
    expect(r.proteinDays).toBe(2)
    expect(r.waterAvg).toBe(1500)
    expect(r.supplements).toEqual([{ id: 's1', name: 'Creatine', taken: 2 }])
    expect(rangeSummary({}, '2026-10-28', 7).sleepAvg).toBeNull()
  })
})

describe('the maintenance estimate', () => {
  const now = new Date('2026-10-28T12:00:00').getTime()
  const day = n => shiftISO('2026-10-28', -n)
  const series = ({ kcal, kgPerDay, days = 28, start = 80, unit = 'kg' }) => {
    const dayLog = {}, bodyweight = []
    for (let n = days - 1; n >= 0; n--) {
      dayLog[day(n)] = { food: [{ kcal }], _ts: 1 }
      const kg = start + kgPerDay * (days - 1 - n)
      bodyweight.push({ d: day(n), w: unit === 'lb' ? kg * 2.2046226218 : kg, t: 1 })
    }
    return { unit, dayLog, bodyweight }
  }

  it('is intake when the weight does not move', () => {
    const r = estimateMaintenance(series({ kcal: 2500, kgPerDay: 0 }), { now })
    expect(r.enough).toBe(true)
    expect(r.kcal).toBe(2500)
  })

  it('adds back what a falling weight says the body made up, and takes off what a rising one stored', () => {
    const lose = estimateMaintenance(series({ kcal: 2000, kgPerDay: -0.1 }), { now })
    // the weigh-ins are stored rounded, so the fitted trend is within a hair of the one put in
    expect(Math.abs(lose.kcal - (2000 + 0.1 * KCAL_PER_KG))).toBeLessThanOrEqual(2)
    const gain = estimateMaintenance(series({ kcal: 3000, kgPerDay: 0.05 }), { now })
    expect(Math.abs(gain.kcal - (3000 - 0.05 * KCAL_PER_KG))).toBeLessThanOrEqual(2)
  })

  it('reads a profile that weighs in pounds the same way', () => {
    const kg = estimateMaintenance(series({ kcal: 2400, kgPerDay: -0.05 }), { now })
    const lb = estimateMaintenance(series({ kcal: 2400, kgPerDay: -0.05, unit: 'lb' }), { now })
    expect(Math.abs(lb.kcal - kg.kcal)).toBeLessThanOrEqual(1)
  })

  it('says what is missing instead of guessing', () => {
    expect(estimateMaintenance(series({ kcal: 2500, kgPerDay: 0, days: 10 }), { now })).toMatchObject({ enough: false, reason: 'kcal' })
    const noWeight = { ...series({ kcal: 2500, kgPerDay: 0 }), bodyweight: [] }
    expect(estimateMaintenance(noWeight, { now })).toMatchObject({ enough: false, reason: 'weight' })
  })
})

describe('syncing the day log', () => {
  it('is a stamped map on both sides, and the two lists agree', () => {
    for (const k of ['dayLog', 'nutriItems']) {
      expect(STAMPED_MAPS).toContain(k)
      expect(Server.STAMPED_MAPS).toContain(k)
    }
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
  })

  it('keeps a different day from each device and the later write of the same day', () => {
    const phone = base({ _ts: 10, dayLog: { '2026-10-01': { water: 500, _ts: 5 }, '2026-10-02': { water: 100, _ts: 8 } } })
    const laptop = base({ _ts: 12, dayLog: { '2026-10-02': { water: 900, sleep: { h: 7 }, _ts: 11 }, '2026-10-03': { water: 300, _ts: 9 } } })
    const merged = mergeStates(laptop, phone)
    expect(Object.keys(merged.dayLog).sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(merged.dayLog['2026-10-02']).toEqual({ water: 900, sleep: { h: 7 }, _ts: 11 })
    expect(mergeStates(phone, laptop).dayLog['2026-10-02'].water).toBe(900)
  })

  it('lets a cleared day beat an older copy of it, so a removal does not come back', () => {
    const phone = base({ _ts: 20, dayLog: { '2026-10-02': { _ts: 15 } } })
    const laptop = base({ _ts: 10, dayLog: { '2026-10-02': { water: 900, _ts: 9 } } })
    const merged = mergeStates(phone, laptop)
    expect(merged.dayLog['2026-10-02']).toEqual({ _ts: 15 })
    expect(dayLogOf(merged, '2026-10-02')).toBeNull()
  })

  it('merges supplements by id on their own stamps', () => {
    const phone = base({ _ts: 10, nutriItems: { s1: { kind: 'supp', name: 'Creatine', _ts: 4 } } })
    const laptop = base({ _ts: 12, nutriItems: { s1: { kind: 'supp', name: 'Creatine', dose: '5 g', _ts: 9 }, s2: { kind: 'supp', name: 'Zinc', _ts: 8 } } })
    const merged = mergeStates(laptop, phone)
    expect(merged.nutriItems.s1.dose).toBe('5 g')
    expect(Object.keys(merged.nutriItems).sort()).toEqual(['s1', 's2'])
  })

  it('re-stamps a day the change touched', () => {
    const prev = base({ _ts: 100, dayLog: { '2026-10-02': { water: 100, _ts: 90 } } })
    const next = clone(prev)
    next.dayLog['2026-10-02'] = { water: 600, _ts: 777 }
    const at = stampChange(prev, next, 5000)
    expect(next.dayLog['2026-10-02']._ts).toBe(at)
  })

  it('gives a reset of the log the same treatment as the other stamped maps', () => {
    const today = isoOf(new Date())
    const a = base({ _ts: 10, dayLog: { [today]: { water: 100, _ts: 5 } } })
    expect(mergeStates(a, base({ _ts: 1 })).dayLog[today].water).toBe(100)
  })
})

describe('meals, fibre and fasting', () => {
  it('keeps the meal a food was logged under, and shows older entries with the snacks', () => {
    const d = readDay({ food: [{ n: 'Oats', kcal: 230, fib: 6, m: 'breakfast' }, { kcal: 100, m: 'brunch' }] })
    expect(d.food.map(f => f.m)).toEqual(['breakfast', null])
    expect(d.food.map(mealOf)).toEqual(['breakfast', 'snack'])
    expect(totalsOf(d).fib).toBe(6)
    const map = withDay({}, '2026-10-02', d, 5)
    expect(map['2026-10-02'].food).toEqual([{ n: 'Oats', kcal: 230, fib: 6, m: 'breakfast' }, { kcal: 100 }])
  })

  it('reads the calculator fields and throws out what is out of range', () => {
    const g = readItem({ kind: 'goals', heightCm: 178, birthYear: 1996, sex: 'm', life: 'light', extraH: 2.25, extraLevel: 'vigorous', dir: 'lose', rate: 0.5 })
    expect(g).toMatchObject({ heightCm: 178, birthYear: 1996, sex: 'm', life: 'light', extraH: 2.3, extraLevel: 'vigorous', dir: 'lose', rate: 0.5, auto: true })
    const bad = readItem({ kind: 'goals', heightCm: 40, sex: 'x', life: 'couch', dir: 'up', kcal: 2000, auto: false })
    expect(bad).toMatchObject({ heightCm: null, sex: null, life: null, dir: null, kcal: 2000, auto: false })
  })

  it('starts and ends a fast, and books the hours on the day it ended', () => {
    const start = new Date('2026-10-01T20:00:00').getTime()
    const end = new Date('2026-10-02T12:30:00').getTime()
    let S = { nutriItems: withFast({}, { plan: 16, start }, 1), dayLog: {} }
    expect(fastOf(S)).toEqual({ kind: 'fast', plan: 16, start })
    S = { ...S, ...endFast(S, end) }
    expect(fastOf(S).start).toBeNull()
    expect(dayLogOf(S, '2026-10-02').fast).toBe(16.5)
    expect(fastOf({})).toEqual({ kind: 'fast', plan: 16, start: null })
  })
})
