import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  SUPP_TIMES, SUPP_TIME_LABEL, NAME_MAX, DOSE_MAX, WATER_MAX_ML, SLEEP_MAX_H,
  dayLogOf, editDay, canLogDay, shiftISO, setSleep, addWater, setWater, addFood, removeFood, toggleTaken, setNote,
  totalsOf, itemsOf, withItem, removeItem, newItemId, goalsOf, withGoals, lastWeightKg, proteinRange,
  rangeSummary, estimateMaintenance, readFood,
} from '../lib/daylog.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Check, NumberField, Segmented, SelectRow, TextArea, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const openSheet = render => useUI.getState().openSheet(render)

const editToday = (iso, fn) => update(s => { s.dayLog = editDay(s, iso, fn) })

function Progress({ value, goal }) {
  if (!goal) return null
  const pct = Math.max(0, Math.min(100, Math.round(((value || 0) / goal) * 100)))
  return <div className="bar" style={{ height: 6, borderRadius: 3, background: 'var(--fill)', marginTop: 6, overflow: 'hidden' }}>
    <div style={{ width: pct + '%', height: '100%', background: 'var(--teal)' }} />
  </div>
}

function FoodSheet({ iso, close }) {
  const S = useStore(s => s.S)
  const meals = itemsOf(S, 'meal')
  const [f, setF] = useState({ n: '', kcal: null, p: null, c: null, f: null })
  const [save, setSave] = useState(false)
  const food = readFood(f)
  const log = item => { editToday(iso, d => addFood(d, item)); close() }
  const submit = () => {
    if (!food) return
    if (save && food.n) update(s => { s.nutriItems = withItem(s.nutriItems, newItemId(), { kind: 'meal', name: food.n, kcal: food.kcal, p: food.p, c: food.c, f: food.f }) })
    log(food)
  }
  const field = (key, label, unit) => <label style={{ flex: 1, minWidth: 0 }}>
    <div className="muted small">{label}</div>
    <div className="row" style={{ gap: 4, alignItems: 'baseline' }}>
      <NumberField nullable value={f[key]} onChange={v => setF(x => ({ ...x, [key]: v }))} /><span className="muted small">{unit}</span>
    </div>
  </label>
  return <>
    <h3 style={{ marginTop: 0 }}>{t('Add food')}</h3>
    {meals.length > 0 && <>
      <h4 className="sec">{t('Saved meals')}</h4>
      <div className="list">{meals.map(m => <div className="lrow" key={m.id} style={{ cursor: 'pointer' }} onClick={() => log({ n: m.name, kcal: m.kcal, p: m.p, c: m.c, f: m.f })}>
        <span className="lrow-m"><span className="lrow-t">{m.name}</span>
          <span className="lrow-s">{[m.kcal != null && fmtNum(m.kcal) + ' kcal', m.p != null && fmtNum(m.p) + ' g ' + t('protein')].filter(Boolean).join(' · ')}</span></span>
        <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')}
          onClick={e => { e.stopPropagation(); update(s => { s.nutriItems = removeItem(s.nutriItems, m.id) }) }}><Icon name="trash" /></button>
      </div>)}</div>
    </>}
    <h4 className="sec">{t('Something else')}</h4>
    <TextField value={f.n} maxLength={NAME_MAX} placeholder={t('Name (optional)')} onChange={e => setF(x => ({ ...x, n: e.target.value }))} />
    <div className="row" style={{ gap: 10, margin: '10px 0' }}>{field('kcal', t('Calories'), 'kcal')}{field('p', t('Protein'), 'g')}</div>
    <div className="row" style={{ gap: 10, margin: '10px 0' }}>{field('c', t('Carbs'), 'g')}{field('f', t('Fat'), 'g')}</div>
    <div className="row" style={{ gap: 10, margin: '10px 0' }}>
      <Check checked={save} onChange={setSave} label={t('Save as a meal')} /><span>{t('Save as a meal')}</span>
    </div>
    <Button variant="primary" onClick={submit} disabled={!food}>{t('Add')}</Button>
  </>
}

function SuppSheet({ id, close }) {
  const S = useStore(s => s.S)
  const cur = id ? itemsOf(S, 'supp').find(x => x.id === id) : null
  const [name, setName] = useState(cur?.name || '')
  const [dose, setDose] = useState(cur?.dose || '')
  const [when, setWhen] = useState(cur?.when || '')
  const save = () => {
    update(s => { s.nutriItems = withItem(s.nutriItems, id || newItemId(), { kind: 'supp', name, dose, when: when || null }) })
    close()
  }
  const remove = () => confirmSheet({
    title: t('Delete supplement?'), message: t('Removes {0} from your list. Days already logged keep their history.', name),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.nutriItems = removeItem(s.nutriItems, id) }); close() },
  })
  return <>
    <h3 style={{ marginTop: 0 }}>{id ? t('Edit supplement') : t('Add supplement')}</h3>
    <TextField value={name} maxLength={NAME_MAX} placeholder={t('Name')} onChange={e => setName(e.target.value)} />
    <div style={{ height: 8 }} />
    <TextField value={dose} maxLength={DOSE_MAX} placeholder={t('Dose, for example 5 g')} onChange={e => setDose(e.target.value)} />
    <div className="sect-b"><SelectRow title={t('When')} value={when} onChange={setWhen}
      options={[{ value: '', label: t('Any time') }, ...SUPP_TIMES.map(k => ({ value: k, label: t(SUPP_TIME_LABEL[k]) }))]} /></div>
    <Button variant="primary" onClick={save} disabled={!name.trim()}>{t('Save')}</Button>
    {id && <><div style={{ height: 8 }} /><Button variant="ghost" style={{ color: 'var(--red)' }} onClick={remove}>{t('Delete')}</Button></>}
  </>
}

function GoalsSheet({ close }) {
  const S = useStore(s => s.S)
  const [g, setG] = useState(goalsOf(S))
  const kg = lastWeightKg(S)
  const range = proteinRange(kg)
  const row = (key, label, unit, decimal) => <label className="row between" style={{ margin: '8px 0', alignItems: 'center' }}>
    <span>{label}</span>
    <span className="row" style={{ gap: 6, alignItems: 'baseline' }}>
      <NumberField nullable decimal={decimal} style={{ width: 90, textAlign: 'right' }} value={g[key]} onChange={v => setG(x => ({ ...x, [key]: v || null }))} />
      <span className="muted small" style={{ minWidth: 32 }}>{unit}</span>
    </span>
  </label>
  return <>
    <h3 style={{ marginTop: 0 }}>{t('Daily goals')}</h3>
    {row('kcal', t('Calories'), 'kcal', false)}
    {row('protein', t('Protein'), 'g', false)}
    {range && <div className="muted small" style={{ marginBottom: 6 }}>{t('For your weight, {0} to {1} g a day is the usual range for people who lift.', range.lo, range.hi)}</div>}
    {row('water', t('Water'), 'ml', false)}
    {row('sleepH', t('Sleep'), 'h', true)}
    <div style={{ height: 8 }} />
    <Button variant="primary" onClick={() => { update(s => { s.nutriItems = withGoals(s.nutriItems, g) }); close() }}>{t('Save')}</Button>
  </>
}

function WeekCard({ S }) {
  const goals = goalsOf(S)
  const sum = useMemo(() => rangeSummary(S, todayISO(), 7), [S])
  const energy = useMemo(() => estimateMaintenance(S), [S])
  const kg = lastWeightKg(S)
  const range = proteinRange(kg)
  if (!sum.logged) return null
  const stat = (label, val, sub) => <div style={{ flex: 1, minWidth: 0 }}>
    <div className="muted small">{label}</div><div style={{ fontWeight: 600 }}>{val}</div>{sub && <div className="muted small">{sub}</div>}
  </div>
  return <div className="card">
    <h4 className="sec" style={{ marginTop: 0 }}>{t('Last 7 days')}</h4>
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      {sum.sleepDays > 0 && stat(t('Sleep'), fmtNum(Math.round(sum.sleepAvg * 10) / 10) + ' h', goals.sleepH ? t('goal {0} h', fmtNum(goals.sleepH)) : null)}
      {sum.kcalDays > 0 && stat(t('Calories'), fmtNum(Math.round(sum.kcalAvg)), goals.kcal ? t('goal {0}', fmtNum(goals.kcal)) : null)}
      {sum.proteinDays > 0 && stat(t('Protein'), fmtNum(Math.round(sum.proteinAvg)) + ' g', range ? range.lo + '-' + range.hi + ' g' : null)}
      {sum.waterDays > 0 && stat(t('Water'), fmtNum(Math.round(sum.waterAvg)) + ' ml')}
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
  const day = dayLogOf(S, iso) || { sleep: null, water: null, food: [], taken: [], note: '' }
  const goals = goalsOf(S)
  const supps = itemsOf(S, 'supp')
  const tot = totalsOf(day)
  const kg = lastWeightKg(S)
  const range = proteinRange(kg)
  const edit = fn => editToday(iso, fn)
  const go = n => { const next = shiftISO(iso, n); if (canLogDay(next, today)) setIso(next) }
  const quality = [1, 2, 3, 4, 5].map(v => ({ value: v, label: String(v) }))

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/stats" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Day')}</h1><div className="sub">{t('Sleep, food, water and supplements')}</div></div>
      <button className="iconbtn" onClick={() => openSheet(close => <GoalsSheet close={close} />)} aria-label={t('Daily goals')}><Icon name="gear" /></button>
    </div>

    <div className="card row between" style={{ alignItems: 'center' }}>
      <button className="iconbtn" onClick={() => go(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
      <b>{iso === today ? t('Today') : fmtDate(iso, true)}</b>
      <button className="iconbtn" onClick={() => go(1)} disabled={iso >= today} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
    </div>

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
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Water')}</h4>
        <span><b>{fmtNum(day.water || 0)}</b> <span className="muted small">ml{goals.water ? ' / ' + fmtNum(goals.water) : ''}</span></span>
      </div>
      <Progress value={day.water} goal={goals.water} />
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {[250, 500].map(ml => <Button key={ml} size="sm" variant="tinted" icon="plus" onClick={() => edit(d => addWater(d, ml))}>{ml} ml</Button>)}
        {(day.water || 0) > 0 && <Button size="sm" variant="ghost" onClick={() => edit(d => addWater(d, -250))}>-250 ml</Button>}
        {(day.water || 0) > 0 && <Button size="sm" variant="ghost" onClick={() => edit(d => setWater(d, null))}>{t('Clear')}</Button>}
      </div>
    </div>

    <div className="card">
      <div className="row between" style={{ alignItems: 'center' }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Food')}</h4>
        <Button size="sm" icon="plus" onClick={() => openSheet(close => <FoodSheet iso={iso} close={close} />)}>{t('Add')}</Button>
      </div>
      {day.food.length > 0 && <>
        <div className="row" style={{ gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          <div><b>{fmtNum(tot.kcal)}</b> <span className="muted small">kcal{goals.kcal ? ' / ' + fmtNum(goals.kcal) : ''}</span></div>
          <div><b>{fmtNum(tot.p)}</b> <span className="muted small">g {t('protein')}{goals.protein ? ' / ' + fmtNum(goals.protein) : range ? ' (' + range.lo + '-' + range.hi + ')' : ''}</span></div>
        </div>
        <Progress value={tot.kcal} goal={goals.kcal} />
        <div className="list" style={{ marginTop: 10 }}>{day.food.map((f, i) => <div className="lrow" key={i}>
          <span className="lrow-m"><span className="lrow-t">{f.n || t('Food')}</span>
            <span className="lrow-s">{[f.kcal != null && fmtNum(f.kcal) + ' kcal', f.p != null && fmtNum(f.p) + ' g P', f.c != null && fmtNum(f.c) + ' g C', f.f != null && fmtNum(f.f) + ' g F'].filter(Boolean).join(' · ')}</span></span>
          <button className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')} onClick={() => edit(d => removeFood(d, i))}><Icon name="trash" /></button>
        </div>)}</div>
      </>}
      {!day.food.length && <div className="muted small" style={{ marginTop: 8 }}>{t('Type what you ate, or add a saved meal. Totals are only as exact as what you enter.')}</div>}
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

    <WeekCard S={S} />
  </div>
}
