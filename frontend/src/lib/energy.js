// The daily calorie and macro goal, worked out from the body and the week's exercise.
//
//   resting burn (BMR)   Mifflin-St Jeor: 10 x kg + 6.25 x cm - 5 x age, +5 for men, -161 for women
//   everyday movement    BMR x 1.2 (mostly sitting), 1.3 (on your feet some of the day) or 1.45
//                        (on your feet most of the day). These are lower than the usual "activity
//                        factors" on purpose: those include exercise, and exercise is added below.
//   training             the sessions logged in openGym over the last four weeks, as hours a week,
//                        at about 5 MET (a mix of lifting and rest between sets)
//   other exercise       hours a week the user types (running, football…) at 3.5, 6 or 8 MET
//   goal                 lose or gain at `rate` kg a week: about 7700 kcal per kg, spread over 7 days
//
// Exercise counts net of what the body burns at rest anyway (MET - 1), so it is not counted twice.
// Every step is an estimate; the result is a starting point the user can change, and the day log's
// own estimate from logged calories and the weight trend (daylog.js estimateMaintenance) is the
// better number once there is enough data.
import { KCAL_PER_KG, lastWeightKg } from './daylog.js'

export const LIFE_FACTOR = { sedentary: 1.2, light: 1.3, active: 1.45 }
export const EXTRA_MET = { light: 3.5, moderate: 6, vigorous: 8 }
export const TRAINING_MET = 5
export const TRAINING_WINDOW_DAYS = 28
/** A session longer than this was most likely left running; it counts as this long. */
export const SESSION_MAX_H = 3
export const DEFAULT_RATE = { lose: 0.5, gain: 0.25 }
export const PROTEIN_G_PER_KG = 1.8
export const FAT_G_PER_KG = 0.8
export const FIBER_G_PER_1000_KCAL = 14

const DAY_MS = 86400000
const round = (n, to = 1) => Number((Math.round(n / to) * to).toFixed(2))

/** Mifflin-St Jeor resting burn in kcal a day, or null when something is missing. */
export function bmr({ kg, cm, age, sex }) {
  if (!(kg > 0) || !(cm > 0) || !(age > 0) || (sex !== 'm' && sex !== 'f')) return null
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161)
}

/** Hours a week of training logged in openGym over the last `days` (finished sessions only). */
export function trainingHoursPerWeek(workouts, { now = Date.now(), days = TRAINING_WINDOW_DAYS } = {}) {
  const from = now - days * DAY_MS
  let h = 0
  for (const w of Array.isArray(workouts) ? workouts : []) {
    const s = Number(w?.start), e = Number(w?.end)
    if (!(s > 0) || !(e > s) || e < from || s > now) continue
    h += Math.min(SESSION_MAX_H, (e - s) / 3600000)
  }
  return h / (days / 7)
}

/** The kg a week the goal aims at: the user's own number, else the weight goal (S.rateGoal), else a default. */
export function goalRate(goals, S) {
  if (goals?.rate > 0) return goals.rate
  const rg = S?.rateGoal
  if (rg && rg.dir === goals?.dir && Number(rg.hi) > 0) {
    const mid = (Math.abs(Number(rg.lo) || 0) + Math.abs(Number(rg.hi))) / 2
    const kg = lastWeightKg(S)
    if (rg.by === '%' && kg) return round((mid / 100) * kg, 0.05)
    if (rg.by === 'w') return round(S?.unit === 'lb' ? mid / 2.2046226218 : mid, 0.05)
  }
  return DEFAULT_RATE[goals?.dir] || 0
}

/**
 * The calorie goal and how it was reached:
 *   { ok: true, kcal, protein, carbs, fat, fiber, bmr, everyday, trainingH, trainingKcal,
 *     extraKcal, maintenance, adjust, floored }
 * or { ok: false, missing: ['weight', 'height', 'age', 'sex'] } when the body data is incomplete.
 * Training and other exercise are kcal a day, averaged over the week.
 */
export function calorieGoal(S, goals, { now = Date.now() } = {}) {
  const kg = lastWeightKg(S)
  const year = new Date(now).getFullYear()
  const age = goals?.birthYear ? year - goals.birthYear : null
  const missing = [!kg && 'weight', !goals?.heightCm && 'height', !(age > 0) && 'age', !goals?.sex && 'sex'].filter(Boolean)
  if (missing.length) return { ok: false, missing }

  const base = bmr({ kg, cm: goals.heightCm, age, sex: goals.sex })
  const everyday = base * (LIFE_FACTOR[goals.life] || LIFE_FACTOR.sedentary)
  const trainingH = trainingHoursPerWeek(S?.workouts, { now })
  const trainingKcal = ((TRAINING_MET - 1) * kg * trainingH) / 7
  const extraKcal = ((EXTRA_MET[goals.extraLevel || 'moderate'] - 1) * kg * (goals.extraH || 0)) / 7
  const maintenance = everyday + trainingKcal + extraKcal

  const dir = goals.dir || 'hold'
  const rate = dir === 'hold' ? 0 : goalRate(goals, S)
  const adjust = ((dir === 'lose' ? -1 : 1) * rate * KCAL_PER_KG) / 7
  let kcal = maintenance + adjust
  // Eating below the resting burn is a crash diet, whatever the rate asked for.
  const floored = kcal < base
  if (floored) kcal = base
  kcal = round(kcal, 10)

  const protein = round(kg * PROTEIN_G_PER_KG)
  const fat = round(kg * FAT_G_PER_KG)
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4))
  const fiber = round((kcal / 1000) * FIBER_G_PER_1000_KCAL)
  return {
    ok: true, kcal, protein, carbs, fat, fiber,
    bmr: round(base), everyday: round(everyday), trainingH: round(trainingH, 0.1),
    trainingKcal: round(trainingKcal), extraKcal: round(extraKcal), maintenance: round(maintenance, 10),
    adjust: round(adjust), rate, floored,
  }
}

/**
 * The goals the day screen measures against: with the calculator on and enough data, its
 * calories and macros; otherwise what the user typed. Water and sleep are always typed.
 */
export function activeGoals(S, goals, opts) {
  const calc = goals?.auto !== false ? calorieGoal(S, goals, opts) : null
  if (calc?.ok) return { ...goals, kcal: calc.kcal, protein: calc.protein, carbs: calc.carbs, fat: calc.fat, fiber: calc.fiber, calc }
  return { ...goals, calc }
}
