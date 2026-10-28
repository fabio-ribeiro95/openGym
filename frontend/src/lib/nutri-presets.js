// Starting lists for the Day screen: common foods with rough values per 100 g, and supplement
// names to pick from. Both are shortcuts for typing, not a food database: the values are typical
// figures (cooked unless the name says otherwise) and the user can change any number before
// logging. Supplements carry no dose or timing, so the list suggests nothing about how much to take.
// Names are English source strings, shown through t().

/** { key, g (usual portion in grams), kcal, p, c, f, fib per 100 g } */
export const FOOD_PRESETS = [
  { key: 'Chicken breast, grilled', g: 150, kcal: 165, p: 31, c: 0, f: 3.6, fib: 0 },
  { key: 'Lean beef mince', g: 150, kcal: 137, p: 21, c: 0, f: 5, fib: 0 },
  { key: 'Salmon', g: 150, kcal: 208, p: 20, c: 0, f: 13, fib: 0 },
  { key: 'Hake', g: 150, kcal: 90, p: 19, c: 0, f: 1.3, fib: 0 },
  { key: 'Tuna in water, drained', g: 80, kcal: 116, p: 26, c: 0, f: 1, fib: 0 },
  { key: 'Eggs', g: 100, kcal: 143, p: 12.6, c: 0.7, f: 9.5, fib: 0 },
  { key: 'White rice, cooked', g: 150, kcal: 130, p: 2.7, c: 28, f: 0.3, fib: 0.4 },
  { key: 'Pasta, cooked', g: 150, kcal: 158, p: 5.8, c: 31, f: 0.9, fib: 1.8 },
  { key: 'Potatoes, boiled', g: 200, kcal: 87, p: 1.9, c: 20, f: 0.1, fib: 1.8 },
  { key: 'Beans, cooked', g: 150, kcal: 127, p: 8.7, c: 22.8, f: 0.5, fib: 6.4 },
  { key: 'Bread', g: 60, kcal: 265, p: 9, c: 49, f: 3.2, fib: 2.7 },
  { key: 'Oats', g: 50, kcal: 389, p: 16.9, c: 66, f: 6.9, fib: 10.6 },
  { key: 'Semi-skimmed milk', g: 250, kcal: 46, p: 3.3, c: 4.8, f: 1.6, fib: 0 },
  { key: 'Greek yogurt, fat-free', g: 170, kcal: 59, p: 10, c: 3.6, f: 0.4, fib: 0 },
  { key: 'Cottage cheese', g: 100, kcal: 98, p: 11, c: 3.4, f: 4.3, fib: 0 },
  { key: 'Whey protein powder', g: 30, kcal: 400, p: 80, c: 8, f: 6, fib: 0 },
  { key: 'Banana', g: 120, kcal: 89, p: 1.1, c: 23, f: 0.3, fib: 2.6 },
  { key: 'Apple', g: 150, kcal: 52, p: 0.3, c: 14, f: 0.2, fib: 2.4 },
  { key: 'Broccoli, cooked', g: 150, kcal: 35, p: 2.4, c: 7.2, f: 0.4, fib: 3.3 },
  { key: 'Olive oil', g: 10, kcal: 884, p: 0, c: 0, f: 100, fib: 0 },
  { key: 'Peanut butter', g: 20, kcal: 588, p: 25, c: 20, f: 50, fib: 6 },
  { key: 'Almonds', g: 30, kcal: 579, p: 21, c: 22, f: 50, fib: 12.5 },
]

export const SUPP_PRESETS = [
  'Creatine', 'Whey protein', 'Omega-3', 'Vitamin D', 'Magnesium', 'Caffeine',
  'Multivitamin', 'Zinc', 'Vitamin C', 'Collagen', 'Beta-alanine', 'Electrolytes',
]

const r1 = n => Math.round(n * 10) / 10

/** What `grams` of a food with values per 100 g add up to: { kcal, p, c, f }, or null without grams. */
export function forGrams(per100, grams) {
  const g = Number(grams)
  if (!(g > 0) || !per100) return null
  const k = g / 100
  const v = x => (Number.isFinite(x) ? r1(x * k) : null)
  return { kcal: per100.kcal == null ? null : Math.round(per100.kcal * k), p: v(per100.p), c: v(per100.c), f: v(per100.f), fib: v(per100.fib) }
}

/** Case- and accent-blind match of `query` against a name, for the search field. */
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const matches = (name, query) => !query || fold(name).includes(fold(query).trim())
