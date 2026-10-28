import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  SUPP_TIMES, SUPP_TIME_LABEL, NAME_MAX, DOSE_MAX, SLEEP_MAX_H, MEAL_KEYS, MEAL_LABEL, MEAL_SHARE,
  LIFE_KEYS, EXTRA_LEVELS, GOAL_DIRS,
  dayLogOf, editDay, canLogDay, shiftISO, setSleep, setWater, addFood, removeFood, toggleTaken, setNote,
  totalsOf, itemsOf, withItem, removeItem, newItemId, goalsOf, withGoals, lastWeightKg, proteinRange,
  rangeSummary, estimateMaintenance, readFood, mealOf, fastOf, withFast, endFast,
} from '../lib/daylog.js'
import { activeGoals, calorieGoal } from '../lib/energy.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Check, NumberField, SearchField, Segmented, SelectRow, TextArea, TextField } from '../components/ui.jsx'
import { FOOD_PRESETS, SUPP_PRESETS, forGrams, fold, matches } from '../lib/nutri-presets.js'
import { confirmSheet } from '../sheets.jsx'

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const openSheet = render => useUI.getState().openSheet(render)

const editToday = (iso, fn) => update(s => { s.dayLog = editDay(s, iso, fn) })

const GLASS_ML = 250

/** A progress ring: `pct` of the way round, with whatever is inside drawn on top. */
function Ring({ pct, color = 'var(--acc)', size = 58, stroke = 11, children }) {
  const p = Math.max(0, Math.min(100, pct || 0))
  const r = 50 - stroke / 2 - 2
  return <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength="100" strokeDasharray={p + ' 100'} />
    </svg>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center' }}>{children}</div>
  </div>
}

const pctOf = (v, goal) => (goal ? ((v || 0) / goal) * 100 : 0)

function FoodSheet({ iso, meal, close }) {
  const S = useStore(s => s.S)
  const meals = itemsOf(S, 'meal')
  const [mode, setMode] = useState('list')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)        // a food from the list, waiting for its grams
  const [grams, setGrams] = useState(null)
  const [f, setF] = useState({ n: '', kcal: null, p: null, c: null, f: null })
  const [save, setSave] = useState(false)
  const log = item => { editToday(iso, d => addFood(d, { ...item, m: meal })); toast(t('Added')); close() }

  const foods = FOOD_PRESETS.map(x => ({ ...x, name: t(x.key) })).filter(x => matches(x.name, query))
    .sort((a, b) => a.name.localeCompare(b.name))
  const savedHits = meals.filter(m => matches(m.name, query))
  const macros = v => [v.kcal != null && fmtNum(v.kcal) + ' kcal', v.p != null && fmtNum(v.p) + ' g P', v.c != null && fmtNum(v.c) + ' g C', v.f != null && fmtNum(v.f) + ' g F'].filter(Boolean).join(' · ')

  if (picked) {
    const v = forGrams(picked, grams)
    return <>
      <h3 style={{ marginTop: 0 }}>{picked.name}</h3>
      <label className="row between" style={{ alignItems: 'center', margin: '6px 0 10px' }}>
        <span>{t('Amount')}</span>
        <span className="row" style={{ gap: 6, alignItems: 'baseline' }}>
          <NumberField nullable decimal={false} style={{ width: 90, textAlign: 'right' }} value={grams} onChange={setGrams} /><span className="muted">g</span>
        </span>
      </label>
      <div className="muted small" style={{ marginBottom: 12 }}>{v ? macros(v) : t('Enter the amount in grams.')}</div>
      <div className="muted small" style={{ marginBottom: 12 }}>{t('Typical values per 100 g. Check the label if you have one.')}</div>
      <Button variant="primary" disabled={!v} onClick={() => log({ n: picked.name + ' (' + fmtNum(grams) + ' g)', ...v })}>{t('Add')}</Button>
      <div style={{ height: 8 }} /><Button variant="ghost" onClick={() => setPicked(null)}>{t('Back')}</Button>
    </>
  }

  const food = readFood(f)
  const submit = () => {
    if (!food) return
    if (save && food.n) update(s => { s.nutriItems = withItem(s.nutriItems, newItemId(), { kind: 'meal', name: food.n, kcal: food.kcal, p: food.p, c: food.c, f: food.f, fib: food.fib }) })
    log(food)
  }
  const field = (key, label, unit) => <label style={{ flex: 1, minWidth: 0 }}>
    <div className="muted small">{label}</div>
    <div className="row" style={{ gap: 4, alignItems: 'baseline' }}>
      <NumberField nullable value={f[key]} onChange={v => setF(x => ({ ...x, [key]: v }))} /><span className="muted small">{unit}</span>
    </div>
  </label>
  return <>
    <h3 style={{ marginTop: 0 }}>{t('Add to {0}', t(MEAL_LABEL[meal]))}</h3>
    <Segmented value={mode} onChange={setMode} options={[{ value: 'list', label: t('From the list') }, { value: 'manual', label: t('Type it in') }]} />
    <div style={{ height: 10 }} />
    {mode === 'list' ? <>
      <SearchField value={query} placeholder={t('Search foods')} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} />
      {savedHits.length > 0 && <>
        <h4 className="sec">{t('Saved meals')}</h4>
        <div className="list">{savedHits.map(m => <div className="lrow" key={m.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => log({ n: m.name, kcal: m.kcal, p: m.p, c: m.c, f: m.f, fib: m.fib })}>
          <span className="lrow-m"><span className="lrow-t">{m.name}</span><span className="lrow-s">{macros(m)}</span></span>
          <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')}
            onClick={e => { e.stopPropagation(); update(s => { s.nutriItems = removeItem(s.nutriItems, m.id) }) }}><Icon name="trash" /></button>
        </div>)}</div>
      </>}
      {foods.length > 0 && <>
        <h4 className="sec">{t('Common foods')}</h4>
        <div className="list">{foods.map(x => <div className="lrow" key={x.key} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => { setPicked(x); setGrams(x.g) }}>
          <span className="lrow-m"><span className="lrow-t">{x.name}</span><span className="lrow-s">{t('{0} kcal per 100 g', fmtNum(x.kcal))}</span></span>
          <Icon name="chevronRight" />
        </div>)}</div>
      </>}
      {!foods.length && !savedHits.length && <div className="empty small">
        {t('Nothing found.')} <Button size="sm" variant="ghost" onClick={() => { setF(x => ({ ...x, n: query.trim().slice(0, NAME_MAX) })); setMode('manual') }}>{t('Type it in')}</Button>
      </div>}
    </> : <>
      <TextField value={f.n} maxLength={NAME_MAX} placeholder={t('Name (optional)')} onChange={e => setF(x => ({ ...x, n: e.target.value }))} />
      <div className="row" style={{ gap: 10, margin: '10px 0' }}>{field('kcal', t('Calories'), 'kcal')}{field('p', t('Protein'), 'g')}</div>
      <div className="row" style={{ gap: 10, margin: '10px 0' }}>{field('c', t('Carbs'), 'g')}{field('f', t('Fat'), 'g')}</div>
      <div className="row" style={{ gap: 10, margin: '10px 0' }}>
        <Check checked={save} onChange={setSave} label={t('Save as a meal')} /><span>{t('Save as a meal')}</span>
      </div>
      <Button variant="primary" onClick={submit} disabled={!food}>{t('Add')}</Button>
    </>}
  </>
}

function SuppSheet({ id, close }) {
  const S = useStore(s => s.S)
  const mine = itemsOf(S, 'supp')
  const cur = id ? mine.find(x => x.id === id) : null
  const [name, setName] = useState(cur?.name || '')
  const [dose, setDose] = useState(cur?.dose || '')
  const [when, setWhen] = useState(cur?.when || '')
  const have = new Set(mine.map(x => fold(x.name)))
  const suggestions = id ? [] : SUPP_PRESETS.map(k => t(k)).filter(n => !have.has(fold(n)))
  const save = () => {
    update(s => { s.nutriItems = withItem(s.nutriItems, id || newItemId(), { kind: 'supp', name, dose, when: when || null }) })
    toast(id ? t('Saved') : t('Added'))
    close()
  }
  const remove = () => confirmSheet({
    title: t('Delete supplement?'), message: t('Removes {0} from your list. Days already logged keep their history.', name),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.nutriItems = removeItem(s.nutriItems, id) }); close() },
  })
  return <>
    <h3 style={{ marginTop: 0 }}>{id ? t('Edit supplement') : t('Add supplement')}</h3>
    {suggestions.length > 0 && <>
      <div className="muted small" style={{ marginBottom: 8 }}>{t('Pick one, or type any name below.')}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{suggestions.map(n =>
        <Button key={n} size="sm" variant={fold(name) === fold(n) ? 'primary' : 'tinted'} onClick={() => setName(n)}>{n}</Button>)}</div>
    </>}
    <TextField value={name} maxLength={NAME_MAX} placeholder={t('Name')} onChange={e => setName(e.target.value)} />
    <div style={{ height: 8 }} />
    <TextField value={dose} maxLength={DOSE_MAX} placeholder={t('Dose, for example 5 g')} onChange={e => setDose(e.target.value)} />
    <div className="sect-b"><SelectRow title={t('When')} value={when} onChange={setWhen}
      options={[{ value: '', label: t('Any time') }, ...SUPP_TIMES.map(k => ({ value: k, label: t(SUPP_TIME_LABEL[k]) }))]} /></div>
    <Button variant="primary" onClick={save} disabled={!name.trim()}>{t('Save')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="ghost" style={{ color: 'var(--red)' }} onClick={remove}>{t('Delete')}</Button></>}
  </>
}

const LIFE_LABEL = { sedentary: 'Mostly sitting', light: 'On my feet some of the day', active: 'On my feet most of the day' }
const LEVEL_LABEL = { light: 'Light (walking, yoga)', moderate: 'Moderate (cycling, swimming)', vigorous: 'Hard (running, football)' }
const DIR_LABEL = { lose: 'Lose weight', hold: 'Keep my weight', gain: 'Gain weight' }

function GoalsSheet({ close }) {
  const S = useStore(s => s.S)
  const [g, setG] = useState(goalsOf(S))
  const set = (k, v) => setG(x => ({ ...x, [k]: v }))
  const calc = calorieGoal(S, g)
  const kg = lastWeightKg(S)
  const range = proteinRange(kg)
  const learned = estimateMaintenance(S)
  const numRow = (key, label, unit, { decimal = false, hint } = {}) => <div style={{ margin: '8px 0' }}>
    <label className="row between" style={{ alignItems: 'center' }}>
      <span>{label}</span>
      <span className="row" style={{ gap: 6, alignItems: 'baseline' }}>
        <NumberField nullable decimal={decimal} style={{ width: 90, textAlign: 'right' }} value={g[key]} onChange={v => set(key, v || null)} />
        <span className="muted small" style={{ minWidth: 32 }}>{unit}</span>
      </span>
    </label>
    {hint && <div className="muted small" style={{ marginTop: 4 }}>{hint}</div>}
  </div>
  const missingText = { weight: t('a weigh-in'), height: t('your height'), age: t('your year of birth'), sex: t('sex') }
  return <>
    <h3 style={{ marginTop: 0 }}>{t('Daily goals')}</h3>
    <Segmented value={g.auto ? 'auto' : 'manual'} onChange={v => set('auto', v === 'auto')}
      options={[{ value: 'auto', label: t('Work it out') }, { value: 'manual', label: t('Set my own') }]} />
    <div style={{ height: 6 }} />
    {g.auto ? <>
      <h4 className="sec">{t('You')}</h4>
      <div className="muted small">{kg ? t('Weight from your last weigh-in: {0} kg.', fmtNum(Math.round(kg * 10) / 10)) : t('Log a weigh-in in Stats first; the calculation uses your latest one.')}</div>
      {numRow('heightCm', t('Height'), 'cm')}
      {numRow('birthYear', t('Year of birth'), '')}
      <div className="sect-b"><SelectRow title={t('Sex')} value={g.sex || ''} onChange={v => set('sex', v || null)}
        options={[{ value: '', label: t('Not set') }, { value: 'm', label: t('Male') }, { value: 'f', label: t('Female') }]} /></div>
      <h4 className="sec">{t('Activity')}</h4>
      <div className="sect-b">
        <SelectRow title={t('Day to day')} value={g.life || 'sedentary'} onChange={v => set('life', v)} stackedValue
          options={LIFE_KEYS.map(k => ({ value: k, label: t(LIFE_LABEL[k]) }))} />
      </div>
      <div className="muted small">{t('Training logged in openGym over the last four weeks: {0} h a week. It counts on its own.', fmtNum(calc.ok ? calc.trainingH : 0))}</div>
      {numRow('extraH', t('Other exercise'), t('h/week'), { decimal: true, hint: t('Running, football, cycling and the like, not logged here.') })}
      {(g.extraH || 0) > 0 && <div className="sect-b"><SelectRow title={t('How hard')} value={g.extraLevel || 'moderate'} onChange={v => set('extraLevel', v)} stackedValue
        options={EXTRA_LEVELS.map(k => ({ value: k, label: t(LEVEL_LABEL[k]) }))} /></div>}
      <h4 className="sec">{t('Goal')}</h4>
      <Segmented value={g.dir || 'hold'} onChange={v => set('dir', v)} options={GOAL_DIRS.map(k => ({ value: k, label: t(DIR_LABEL[k]) }))} />
      {g.dir && g.dir !== 'hold' && numRow('rate', t('Kilos a week'), 'kg', { decimal: true, hint: t('Empty uses your weight goal, or {0} kg.', g.dir === 'lose' ? '0.5' : '0.25') })}
      <div className="card" style={{ background: 'var(--surface-2)', marginTop: 12 }}>
        {calc.ok ? <>
          <div className="row between"><span>{t('Calories a day')}</span><b style={{ fontSize: '1.4rem' }}>{fmtNum(calc.kcal)}</b></div>
          <div className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
            {t('Resting {0} + day to day {1} + training {2} + other exercise {3} = about {4} to keep your weight.',
              fmtNum(calc.bmr), fmtNum(calc.everyday - calc.bmr), fmtNum(calc.trainingKcal), fmtNum(calc.extraKcal), fmtNum(calc.maintenance))}
            {calc.adjust !== 0 && ' ' + t('{0} kcal a day for {1} kg a week.', (calc.adjust > 0 ? '+' : '') + fmtNum(calc.adjust), fmtNum(calc.rate))}
          </div>
          {calc.floored && <div className="small" style={{ marginTop: 6, color: 'var(--orange)' }}>{t('Kept at your resting burn: going lower is a crash diet. Try a slower rate.')}</div>}
          <div className="muted small" style={{ marginTop: 6 }}>{t('Protein {0} g, carbs {1} g, fat {2} g, fibre {3} g.', calc.protein, calc.carbs, calc.fat, calc.fiber)}</div>
        </> : <div className="muted small">{t('To work it out, add {0}.', calc.missing.map(k => missingText[k]).join(', '))}</div>}
      </div>
      {learned.enough && <div className="muted small" style={{ marginTop: 10 }}>
        {t('From what you logged and your weight trend, you keep your weight at about {0} kcal. Once you have a few weeks of data, that number is the more reliable one.', fmtNum(learned.kcal))}
        {' '}<Button size="sm" variant="ghost" onClick={() => setG(x => ({ ...x, auto: false, kcal: Math.round(learned.kcal + (calc.ok ? calc.adjust : 0)) }))}>{t('Use it')}</Button>
      </div>}
    </> : <>
      {numRow('kcal', t('Calories'), 'kcal')}
      {numRow('protein', t('Protein'), 'g', { hint: range ? t('For your weight, {0} to {1} g a day is the usual range for people who lift.', range.lo, range.hi) : null })}
      {numRow('carbs', t('Carbs'), 'g')}
      {numRow('fat', t('Fat'), 'g')}
      {numRow('fiber', t('Fibre'), 'g')}
    </>}
    <h4 className="sec">{t('Water and sleep')}</h4>
    {numRow('water', t('Water'), 'ml')}
    {numRow('sleepH', t('Sleep'), 'h', { decimal: true })}
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={() => { update(s => { s.nutriItems = withGoals(s.nutriItems, g) }); close() }}>{t('Save')}</Button>
  </>
}

function SummaryCard({ tot, goals }) {
  const eaten = tot.kcal
  const left = goals.kcal ? goals.kcal - eaten : null
  const macros = [['Protein', tot.p, goals.protein, 'var(--pink)'], ['Carbs', tot.c, goals.carbs, 'var(--blue)'], ['Fat', tot.f, goals.fat, 'var(--yellow)'], ['Fibre', tot.fib, goals.fiber, 'var(--green)']]
  return <div className="card">
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <div><div className="muted small">{t('Eaten')}</div><b style={{ fontSize: '1.25rem' }}>{fmtNum(eaten)}</b></div>
      <Ring pct={pctOf(eaten, goals.kcal)} size={132} stroke={9}>
        {left == null ? <span className="muted small">{t('No calorie goal')}</span> : <>
          <b style={{ fontSize: '1.7rem', lineHeight: 1, color: left < 0 ? 'var(--orange)' : undefined }}>{fmtNum(Math.abs(left))}</b>
          <span className="muted small">{left < 0 ? t('kcal over') : t('kcal left')}</span>
        </>}
      </Ring>
      <div><div className="muted small">{t('Goal')}</div><b style={{ fontSize: '1.25rem' }}>{goals.kcal ? fmtNum(goals.kcal) : '–'}</b></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center', marginTop: 14 }}>
      {macros.map(([name, v, goal, color]) => <div key={name}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Ring pct={pctOf(v, goal)} color={color}><b className="small">{fmtNum(Math.round(v))}</b></Ring></div>
        <div className="small" style={{ marginTop: 4 }}>{t(name)}</div>
        <div className="muted small">{goal ? '/ ' + fmtNum(goal) + ' g' : '–'}</div>
      </div>)}
    </div>
  </div>
}

function MealsCard({ day, iso, goals }) {
  const edit = fn => editToday(iso, fn)
  return <div className="card">{MEAL_KEYS.map((m, mi) => {
    const items = day.food.map((f, i) => ({ f, i })).filter(x => mealOf(x.f) === m)
    const kcal = items.reduce((s, x) => s + (x.f.kcal || 0), 0)
    const target = goals.kcal ? Math.round((goals.kcal * MEAL_SHARE[m]) / 10) * 10 : null
    return <div key={m} style={{ borderTop: mi ? '1px solid var(--sep)' : 'none', paddingTop: mi ? 10 : 0, marginTop: mi ? 10 : 0 }}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <div><b>{t(MEAL_LABEL[m])}</b><div className="muted small">{fmtNum(kcal)}{target ? ' / ' + fmtNum(target) : ''} kcal</div></div>
        <button className="iconbtn" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} aria-label={t('Add to {0}', t(MEAL_LABEL[m]))}
          onClick={() => openSheet(close => <FoodSheet iso={iso} meal={m} close={close} />)}><Icon name="plus" /></button>
      </div>
      {items.length > 0 && <div className="list" style={{ marginTop: 6 }}>{items.map(({ f, i }) => <div className="lrow" key={i}>
        <span className="lrow-m"><span className="lrow-t">{f.n || t('Food')}</span>
          <span className="lrow-s">{[f.kcal != null && fmtNum(f.kcal) + ' kcal', f.p != null && fmtNum(f.p) + ' g P', f.c != null && fmtNum(f.c) + ' g C', f.f != null && fmtNum(f.f) + ' g F'].filter(Boolean).join(' · ')}</span></span>
        <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')} onClick={() => edit(d => removeFood(d, i))}><Icon name="trash" /></button>
      </div>)}</div>}
    </div>
  })}</div>
}

function WaterCard({ day, iso, goals }) {
  const ml = day.water || 0
  const full = Math.floor(ml / GLASS_ML)
  const count = Math.max(full + 1, Math.ceil((goals.water || 2000) / GLASS_ML))
  const tap = i => editToday(iso, d => setWater(d, i < full ? (i === full - 1 ? (full - 1) * GLASS_ML || null : (i + 1) * GLASS_ML) : (i + 1) * GLASS_ML))
  return <div className="card">
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <h4 className="sec" style={{ margin: 0 }}>{t('Water')}</h4>
      <span><b>{fmtNum(ml / 1000)}</b> <span className="muted small">L{goals.water ? ' / ' + fmtNum(goals.water / 1000) + ' L' : ''}</span></span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))', gap: 8, marginTop: 10 }}>
      {Array.from({ length: count }, (_, i) => <button key={i} onClick={() => tap(i)}
        aria-label={i < full ? t('Remove a glass') : t('Add a glass')}
        style={{ height: 42, borderRadius: '4px 4px 9px 9px', border: '2px solid var(--blue)', background: i < full ? 'var(--blue)' : 'transparent', color: 'var(--blue)', fontWeight: 700 }}>
        {i === full ? '+' : ''}</button>)}
    </div>
    <div className="muted small" style={{ marginTop: 8 }}>{t('Each glass is {0} ml.', GLASS_ML)}</div>
  </div>
}

const PLANS = [12, 14, 16, 18, 20]
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':') }
const hhmm = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function FastCard({ S, day }) {
  const fast = fastOf(S)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!fast.start) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [fast.start])
  const on = !!fast.start
  const pct = on ? ((now - fast.start) / (fast.plan * 3600000)) * 100 : 0
  const start = () => update(s => { s.nutriItems = withFast(s.nutriItems, { plan: fast.plan, start: Date.now() }) })
  const stop = () => { update(s => { const r = endFast(s); s.nutriItems = r.nutriItems; s.dayLog = r.dayLog }); toast(t('Fast ended')) }
  const plan = p => update(s => { s.nutriItems = withFast(s.nutriItems, { ...fastOf(s), plan: p }) })
  return <div className="card">
    <div className="row between" style={{ alignItems: 'center' }}>
      <h4 className="sec" style={{ margin: 0 }}>{t('Intermittent fasting')}</h4>
      <SelectRow title={t('Plan')} value={fast.plan} onChange={plan} options={PLANS.map(p => ({ value: p, label: p + ':' + (24 - p) }))} />
    </div>
    <div className="row" style={{ gap: 14, alignItems: 'center', flexWrap: 'nowrap', margin: '10px 0' }}>
      <Ring pct={pct} size={92} stroke={10}><span className="muted small">{on ? Math.floor(Math.min(100, pct)) + '%' : '–'}</span></Ring>
      <div style={{ minWidth: 0 }}>
        <div className="muted small">{on ? (pct >= 100 ? t('Fasting goal reached') : t('Fasting')) : t('Eating window')}</div>
        <div style={{ fontSize: '1.7rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{on ? clock(now - fast.start) : '--:--:--'}</div>
        <div className="muted small">{on ? t('Started {0}, ends {1}', hhmm(fast.start), hhmm(fast.start + fast.plan * 3600000))
          : day.fast ? t('Fasted {0} h today', fmtNum(day.fast)) : t('Start when you finish your last meal.')}</div>
      </div>
    </div>
    <Button variant={on ? 'plain' : 'primary'} style={on ? { color: 'var(--red)' } : undefined} onClick={on ? stop : start}>{on ? t('End fast') : t('Start fast')}</Button>
  </div>
}

function WeekCard({ S, goals }) {
  const sum = useMemo(() => rangeSummary(S, todayISO(), 7), [S])
  const energy = useMemo(() => estimateMaintenance(S), [S])
  const range = proteinRange(lastWeightKg(S))
  if (!sum.logged) return null
  const stat = (label, val, sub) => <div style={{ flex: 1, minWidth: 0 }}>
    <div className="muted small">{label}</div><div style={{ fontWeight: 600 }}>{val}</div>{sub && <div className="muted small">{sub}</div>}
  </div>
  return <div className="card">
    <h4 className="sec" style={{ marginTop: 0 }}>{t('Last 7 days')}</h4>
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      {sum.kcalDays > 0 && stat(t('Calories'), fmtNum(Math.round(sum.kcalAvg)), goals.kcal ? t('goal {0}', fmtNum(goals.kcal)) : null)}
      {sum.proteinDays > 0 && stat(t('Protein'), fmtNum(Math.round(sum.proteinAvg)) + ' g', goals.protein ? t('goal {0}', fmtNum(goals.protein)) + ' g' : range ? range.lo + '-' + range.hi + ' g' : null)}
      {sum.sleepDays > 0 && stat(t('Sleep'), fmtNum(Math.round(sum.sleepAvg * 10) / 10) + ' h', goals.sleepH ? t('goal {0} h', fmtNum(goals.sleepH)) : null)}
      {sum.waterDays > 0 && stat(t('Water'), fmtNum(Math.round(sum.waterAvg / 100) / 10) + ' L')}
    </div>
    {sum.supplements.length > 0 && <div className="muted small" style={{ marginTop: 10 }}>
      {sum.supplements.map(s => s.name + ' ' + s.taken + '/7').join(' · ')}</div>}
    <div className="muted small" style={{ marginTop: 10 }}>
      {energy.enough
        ? t('Estimated maintenance: about {0} kcal a day, from {1} days of calories and your weight trend.', fmtNum(energy.kcal), energy.kcalDays)
        : energy.reason === 'weight'
          ? t('Maintenance estimate needs a few more weigh-ins.')
          : t('Maintenance estimate needs {0} days with calories logged ({1} so far).', 14, energy.kcalDays)}
    </div>
  </div>
}

export default function DayLog() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [iso, setIso] = useState(todayISO())
  const today = todayISO()
  const day = dayLogOf(S, iso) || { sleep: null, water: null, food: [], taken: [], note: '', fast: null }
  const goals = activeGoals(S, goalsOf(S))
  const supps = itemsOf(S, 'supp')
  const tot = totalsOf(day)
  const edit = fn => editToday(iso, fn)
  const go = n => { const next = shiftISO(iso, n); if (canLogDay(next, today)) setIso(next) }
  const quality = [1, 2, 3, 4, 5].map(v => ({ value: v, label: String(v) }))
  const goalsSheet = () => openSheet(close => <GoalsSheet close={close} />)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/stats" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Day')}</h1><div className="sub">{t('Food, water, fasting, sleep and supplements')}</div></div>
      <button className="iconbtn" onClick={goalsSheet} aria-label={t('Daily goals')}><Icon name="gear" /></button>
    </div>

    <div className="card row between" style={{ alignItems: 'center' }}>
      <button className="iconbtn" onClick={() => go(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <b>{iso === today ? t('Today') : fmtDate(iso, true)}</b>
      <button className="iconbtn" onClick={() => go(1)} disabled={iso >= today} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

    <SummaryCard tot={tot} goals={goals} />
    {!goals.kcal && <div className="card row between" style={{ alignItems: 'center', gap: 12 }}>
      <div className="muted small" style={{ flex: 1, minWidth: 0 }}>{t('Set your height, age and activity, and the app works out your calories and macros.')}</div>
      <Button size="sm" variant="tinted" onClick={goalsSheet}>{t('Set goals')}</Button>
    </div>}
    <MealsCard day={day} iso={iso} goals={goals} />
    <WaterCard day={day} iso={iso} goals={goals} />
    {iso === today && <FastCard S={S} day={day} />}

    <div className="card">
      <h4 className="sec" style={{ marginTop: 0 }}>{t('Sleep')}</h4>
      <div className="row between" style={{ alignItems: 'center' }}>
        <span className="row" style={{ gap: 6, alignItems: 'baseline' }}>
          <NumberField nullable value={day.sleep?.h ?? null} style={{ width: 80 }}
            onChange={v => edit(d => setSleep(d, { h: v == null ? null : Math.min(SLEEP_MAX_H, v) }))} />
          <span className="muted">{t('hours')}</span>
        </span>
        {goals.sleepH && <span className="muted small">{t('goal {0} h', fmtNum(goals.sleepH))}</span>}
      </div>
      <div className="muted small" style={{ margin: '10px 0 6px' }}>{t('How rested do you feel? 1 is awful, 5 is great.')}</div>
      <Segmented value={day.sleep?.q ?? 0} options={quality} onChange={v => edit(d => setSleep(d, { q: v === d.sleep?.q ? null : v }))} />
    </div>

    <div className="card">
      <div className="row between" style={{ alignItems: 'center' }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Supplements')}</h4>
        <Button size="sm" icon="plus" onClick={() => openSheet(close => <SuppSheet close={close} />)}>{t('Add')}</Button>
      </div>
      {supps.length ? <div className="list" style={{ marginTop: 8 }}>{supps.map(s => <div className="lrow" key={s.id}>
        <Check checked={day.taken.includes(s.id)} onChange={() => edit(d => toggleTaken(d, s.id))} label={s.name} />
        <span className="lrow-m" style={{ marginInlineStart: 10 }}><span className="lrow-t">{s.name}</span>
          <span className="lrow-s">{[s.dose, s.when && t(SUPP_TIME_LABEL[s.when])].filter(Boolean).join(' · ')}</span></span>
        <button className="iconbtn" aria-label={t('Edit')} onClick={() => openSheet(close => <SuppSheet id={s.id} close={close} />)}><Icon name="pencil" /></button>
      </div>)}</div>
        : <div className="muted small" style={{ marginTop: 8 }}>{t('Add what you take, then tick it off each day.')}</div>}
    </div>

    <div className="card">
      <h4 className="sec" style={{ marginTop: 0 }}>{t('Note')}</h4>
      <TextArea value={day.note} rows={2} placeholder={t('How did the day go?')} onChange={e => edit(d => setNote(d, e.target.value))} />
    </div>

    <WeekCard S={S} goals={goals} />
  </div>
}
