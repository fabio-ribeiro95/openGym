// The day log: what you slept, drank, ate and took on a day, kept next to the weigh-in and the
// workouts so the three can be read together. Totals are typed or added from saved meals; there
// is no food database on purpose (it would need a data source and a connection).
//
// Two maps, both stamped per entry the way the day notes are (lib/day-notes.js), so two devices
// that each logged a different day keep both, and the same day keeps the later write
// (lib/sync-merge.js mergeStampedMap). Taking an entry away is a stamped empty entry (`{ _ts }`),
// never a deleted key: a delete would come straight back from the other device's copy.
//
//   S.dayLog = { '2026-10-28': { sleep: { h: 7.5, q: 4 }, water: 2000,
//                                food: [{ n: 'Lunch', kcal: 700, p: 45, c: 80, f: 20 }],
//                                taken: ['<supplement id>'], note: '…', _ts }, … }
//   S.nutriItems = {
//     '<id>': { kind: 'supp', name: 'Creatine', dose: '5 g', when: 'morning', _ts },
//     '<id>': { kind: 'meal', name: 'Oats and whey', kcal: 520, p: 40, c: 60, f: 12, _ts },
//     goals:  { kind: 'goals', kcal: 2600, protein: 160, water: 2500, sleepH: 8, _ts },
//   }
//
// Pure functions only: nothing here reads the store, the clock (unless handed a `now`) or the DOM.
import { NOTE_MAX } from './history.js'
import { isoOf, todayISO, uid } from './format.js'
import { weightRate } from './bodyweight.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86400000

// Bounds that keep a typo from reaching a chart or the sync document.
export const SLEEP_MAX_H = 24
export const WATER_MAX_ML = 20000
export const KCAL_MAX = 20000
export const GRAMS_MAX = 2000
export const FOOD_MAX_ENTRIES = 60
export const NAME_MAX = 40
export const DOSE_MAX = 30
export const GOALS_ID = 'goals'

/** About 7700 kcal per kg of body weight: the usual rule of thumb, rough by nature. */
export const KCAL_PER_KG = 7700
/** Grams of protein per kg of body weight per day, the range research on lifters usually sits in. */
export const PROTEIN_PER_KG = { lo: 1.6, hi: 2.2 }

export const SUPP_TIMES = ['morning', 'noon', 'evening', 'workout', 'bed']
// English source strings, translated where they are shown.
export const SUPP_TIME_LABEL = { morning: 'Morning', noon: 'Midday', evening: 'Evening', workout: 'Around training', bed: 'Before bed' }

const round = (n, dec = 0) => { const k = 10 ** dec; return Math.round(n * k) / k }
const num = (v, max, dec = 0) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? round(Math.min(n, max), dec) : null
}
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// ---- A day ---------------------------------------------------------------------------------

export const emptyDay = () => ({ sleep: null, water: null, food: [], taken: [], note: '' })

/** One food entry read back: { n, kcal, p, c, f } (numbers or null), or null when it holds nothing. */
export function readFood(e) {
  if (!isMap(e)) return null
  const out = { n: text(e.n, NAME_MAX), kcal: num(e.kcal, KCAL_MAX), p: num(e.p, GRAMS_MAX, 1), c: num(e.c, GRAMS_MAX, 1), f: num(e.f, GRAMS_MAX, 1) }
  return out.kcal == null && out.p == null && out.c == null && out.f == null ? null : out
}

/** A stored day read back, junk left out: { sleep: { h, q } | null, water, food, taken, note }; null for none or a cleared one. */
export function readDay(entry) {
  if (!isMap(entry)) return null
  const h = num(entry.sleep?.h, SLEEP_MAX_H, 2)
  const q = Number.isInteger(entry.sleep?.q) && entry.sleep.q >= 1 && entry.sleep.q <= 5 ? entry.sleep.q : null
  const day = {
    sleep: h != null || q != null ? { h, q } : null,
    water: num(entry.water, WATER_MAX_ML),
    food: (Array.isArray(entry.food) ? entry.food : []).map(readFood).filter(Boolean).slice(0, FOOD_MAX_ENTRIES),
    taken: [...new Set((Array.isArray(entry.taken) ? entry.taken : []).filter(x => typeof x === 'string' && x))],
    note: text(entry.note, NOTE_MAX),
  }
  return isEmptyDay(day) ? null : day
}

export const isEmptyDay = d => !d || (!d.sleep && d.water == null && !d.food.length && !d.taken.length && !d.note)

/** The log for `iso`, or null. */
export const dayLogOf = (S, iso) => readDay(isMap(S?.dayLog) ? S.dayLog[iso] : null)

/** Whether `iso` can be logged: a real date, today or earlier. Nothing is logged ahead of time. */
export const canLogDay = (iso, today = todayISO()) => ISO.test(String(iso || '')) && iso <= today

const stored = d => ({
  ...(d.sleep ? { sleep: { ...(d.sleep.h != null ? { h: d.sleep.h } : {}), ...(d.sleep.q != null ? { q: d.sleep.q } : {}) } } : {}),
  ...(d.water != null ? { water: d.water } : {}),
  ...(d.food.length ? { food: d.food.map(f => ({ ...(f.n ? { n: f.n } : {}), ...(f.kcal != null ? { kcal: f.kcal } : {}), ...(f.p != null ? { p: f.p } : {}), ...(f.c != null ? { c: f.c } : {}), ...(f.f != null ? { f: f.f } : {}) })) } : {}),
  ...(d.taken.length ? { taken: d.taken } : {}),
  ...(d.note ? { note: d.note } : {}),
})

/**
 * S.dayLog with `iso` set to `day` (as readDay gives it), stamped `now`. An empty day is written
 * as a cleared entry, so the removal syncs (see the top of this file).
 */
export function withDay(map, iso, day, now = Date.now()) {
  const clean = readDay(day ? stored({ ...emptyDay(), ...day }) : null)
  return { ...(isMap(map) ? map : {}), [iso]: clean ? { ...stored(clean), _ts: now } : { _ts: now } }
}

/** S.dayLog after `fn` has changed a copy of the day on `iso`: the one write every edit goes through. */
export const editDay = (S, iso, fn, now = Date.now()) =>
  withDay(S?.dayLog, iso, fn({ ...emptyDay(), ...(dayLogOf(S, iso) || {}) }), now)

// Edits on a day (each returns a new day):
export const setSleep = (d, patch) => ({ ...d, sleep: { h: null, q: null, ...(d.sleep || {}), ...patch } })
export const setWater = (d, ml) => ({ ...d, water: ml })
export const addWater = (d, ml) => ({ ...d, water: Math.min(WATER_MAX_ML, Math.max(0, (d.water || 0) + ml)) })
export const addFood = (d, food) => {
  const f = readFood(food)
  return f ? { ...d, food: [...d.food, f].slice(0, FOOD_MAX_ENTRIES) } : d
}
export const removeFood = (d, i) => ({ ...d, food: d.food.filter((_, k) => k !== i) })
export const toggleTaken = (d, id) => ({ ...d, taken: d.taken.includes(id) ? d.taken.filter(x => x !== id) : [...d.taken, id] })
export const setNote = (d, v) => ({ ...d, note: text(v, NOTE_MAX) })

/** What the day's food adds up to. A macro nobody typed stays out of its total, so 0 means "none". */
export function totalsOf(day) {
  const sum = k => (day?.food || []).reduce((s, f) => s + (f[k] || 0), 0)
  return { kcal: round(sum('kcal')), p: round(sum('p'), 1), c: round(sum('c'), 1), f: round(sum('f'), 1) }
}

// ---- Supplements, saved meals, goals ----------------------------------------------------------

/** A stored item read back, or null for none or a cleared one. */
export function readItem(entry) {
  if (!isMap(entry)) return null
  const name = text(entry.name, NAME_MAX)
  if (entry.kind === 'supp') {
    return name ? { kind: 'supp', name, dose: text(entry.dose, DOSE_MAX), when: SUPP_TIMES.includes(entry.when) ? entry.when : null } : null
  }
  if (entry.kind === 'meal') {
    const m = { kind: 'meal', name, kcal: num(entry.kcal, KCAL_MAX), p: num(entry.p, GRAMS_MAX, 1), c: num(entry.c, GRAMS_MAX, 1), f: num(entry.f, GRAMS_MAX, 1) }
    return name && (m.kcal != null || m.p != null || m.c != null || m.f != null) ? m : null
  }
  if (entry.kind === 'goals') {
    const g = { kind: 'goals', kcal: num(entry.kcal, KCAL_MAX), protein: num(entry.protein, GRAMS_MAX), water: num(entry.water, WATER_MAX_ML), sleepH: num(entry.sleepH, SLEEP_MAX_H, 1) }
    return g.kcal != null || g.protein != null || g.water != null || g.sleepH != null ? g : null
  }
  return null
}

const byName = (a, b) => a.name.localeCompare(b.name)

/** The supplements or saved meals, as [{ id, ...item }], by name. */
export function itemsOf(S, kind) {
  if (!isMap(S?.nutriItems)) return []
  return Object.entries(S.nutriItems).map(([id, e]) => ({ id, ...readItem(e) })).filter(x => x.kind === kind).sort(byName)
}

/** S.nutriItems with `id` set to `item` ({ kind, … }), stamped `now`. */
export function withItem(map, id, item, now = Date.now()) {
  const clean = readItem(item)
  return { ...(isMap(map) ? map : {}), [id]: clean ? { ...clean, _ts: now } : { _ts: now } }
}

/** S.nutriItems with `id` taken away: a stamped clear that still syncs. */
export const removeItem = (map, id, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { _ts: now } })

export const newItemId = () => uid()

export const goalsOf = S => {
  const g = readItem(isMap(S?.nutriItems) ? S.nutriItems[GOALS_ID] : null)
  return g?.kind === 'goals' ? g : { kind: 'goals', kcal: null, protein: null, water: null, sleepH: null }
}
export const withGoals = (map, goals, now = Date.now()) => withItem(map, GOALS_ID, { ...goals, kind: 'goals' }, now)

/** The latest weigh-in in kg, or null. */
export function lastWeightKg(S) {
  const rows = (Array.isArray(S?.bodyweight) ? S.bodyweight : []).filter(b => Number(b?.w) > 0)
  if (!rows.length) return null
  const last = rows.reduce((a, b) => (b.d > a.d || (b.d === a.d && (b.t || 0) > (a.t || 0)) ? b : a))
  return S?.unit === 'lb' ? Number(last.w) / 2.2046226218 : Number(last.w)
}

/** { lo, hi } grams of protein for a body weight in kg, or null without one. */
export const proteinRange = kg => (kg > 0 ? { lo: round(kg * PROTEIN_PER_KG.lo), hi: round(kg * PROTEIN_PER_KG.hi) } : null)

// ---- Reading a stretch of days ---------------------------------------------------------------

/** `iso` moved by `n` days, DST-proof (read at noon). */
export function shiftISO(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/**
 * The `days` ending on `endIso`, averaged over the days that have a value (an unlogged day is not
 * a zero): sleep hours, water, calories and protein, plus how many of the days each average
 * rests on, and per active supplement the days it was taken.
 */
export function rangeSummary(S, endIso = todayISO(), days = 7) {
  const isos = Array.from({ length: days }, (_, i) => shiftISO(endIso, -(days - 1 - i)))
  const logs = isos.map(iso => ({ iso, day: dayLogOf(S, iso) }))
  const col = pick => logs.map(({ day }) => (day ? pick(day) : null)).filter(v => v != null)
  const sleep = col(d => d.sleep?.h ?? null), water = col(d => d.water)
  const kcal = col(d => (d.food.some(f => f.kcal != null) ? totalsOf(d).kcal : null))
  const protein = col(d => (d.food.some(f => f.p != null) ? totalsOf(d).p : null))
  const quality = col(d => d.sleep?.q ?? null)
  return {
    days, from: isos[0], to: endIso,
    logged: logs.filter(l => l.day).length,
    sleepAvg: mean(sleep), sleepDays: sleep.length, qualityAvg: mean(quality),
    waterAvg: mean(water), waterDays: water.length,
    kcalAvg: mean(kcal), kcalDays: kcal.length,
    proteinAvg: mean(protein), proteinDays: protein.length,
    supplements: itemsOf(S, 'supp').map(s => ({ id: s.id, name: s.name, taken: logs.filter(l => l.day?.taken.includes(s.id)).length })),
  }
}

export const ENERGY_WINDOW_DAYS = 28
export const ENERGY_MIN_KCAL_DAYS = 14

/**
 * A rough estimate of the calories that hold your weight, from what you ate and where the weight
 * went over the last four weeks: average intake minus what the weight trend (kg per day times
 * about 7700 kcal) says you stored or burned off. Needs at least two weeks of calories logged
 * and enough weigh-ins for a trend (lib/bodyweight.js weightRate). Days with no calories are left
 * out, so it is only as good as the days you logged in full.
 */
export function estimateMaintenance(S, { now = Date.now(), days = ENERGY_WINDOW_DAYS } = {}) {
  const end = isoOf(new Date(now))
  const sum = rangeSummary(S, end, days)
  if (sum.kcalDays < ENERGY_MIN_KCAL_DAYS) return { enough: false, kcalDays: sum.kcalDays, reason: 'kcal' }
  const rate = weightRate(S?.bodyweight, { now, days })
  if (!rate.enough) return { enough: false, kcalDays: sum.kcalDays, reason: 'weight' }
  const kgPerWeek = S?.unit === 'lb' ? rate.perWeek / 2.2046226218 : rate.perWeek
  const kcal = round(sum.kcalAvg - (kgPerWeek / 7) * KCAL_PER_KG)
  return { enough: true, kcal, intake: round(sum.kcalAvg), kgPerWeek, kcalDays: sum.kcalDays }
}
