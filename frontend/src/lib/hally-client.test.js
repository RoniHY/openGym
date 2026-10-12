import { describe, expect, it } from 'vitest'
import { nameResolver, sessionView, routineView, weekPlan, bodyweightView, clientView } from './hally-client.js'
import { EXIDX } from './exercises.js'

const TODAY = '2026-10-14'
// A catalogue exercise whose name does not depend on this test: read it from the catalogue.
const BENCH = '0025'
const benchName = EXIDX[BENCH].n

const session = (id, d, extra = {}) => ({
  id, d, start: Date.parse(d + 'T16:00:00Z'), end: Date.parse(d + 'T17:05:00Z'), name: 'Torso', routineIds: ['r1'], bw: 62,
  entries: [
    { id: BENCH, target: { sets: 2, reps: 8, weight: 60, mode: 'reps' }, sets: [{ w: 60, r: 8, done: true, rir: 2 }, { w: 60, r: 7, done: true, rir: 1 }, { w: 60, r: 0, done: false }] },
    { id: 'c1', target: { sets: 1, reps: 12, weight: 0, mode: 'reps' }, sets: [{ w: 0, r: 12, done: true }], note: 'con banda verde' },
  ],
  prs: [BENCH], ...extra,
})
const detail = (extra = {}) => ({
  user: { id: 'ana', name: 'Ana', created: '2026-10-01T00:00:00.000Z', disabled: false },
  since: '2026-10-01T00:00:00.000Z', unit: 'kg', effort: 'rir', lastSync: 123, live: null,
  routines: [{ id: 'r1', name: 'Torso', emoji: '💪', ex: [
    { id: BENCH, sets: 3, reps: 12, repsMin: 8, weight: 60, mode: 'reps', restSec: 120, note: 'pausa abajo' },
    { id: 'c1', sets: 2, reps: 15, weight: 0, mode: 'reps', sg: 'a' },
    { id: '0027', sets: 2, reps: 15, weight: 20, mode: 'reps', sg: 'a' },
  ] }],
  plan: { weekStart: 1, week: { 1: ['r1'], 4: ['r1', 'gone'] }, queue: null },
  customEx: [{ id: 'c1', n: 'Puente con banda', target: 'glutes' }],
  bodyweight: [{ d: '2026-10-01', w: 63, t: 1 }, { d: '2026-10-12', w: 62.4, t: 2 }],
  workouts: [session('w2', '2026-10-13', { note: 'Me costó el press', pain: { during: 4, area: 'hombro', note: 'al bajar' } }), session('w1', '2026-10-12')],
  unread: ['w2'],
  ...extra,
})

describe('nameResolver', () => {
  it('names the client\'s own exercises, then the catalogue, then falls back to the id', () => {
    const nameOf = nameResolver([{ id: 'c1', n: 'Puente con banda' }, { id: 'c2', name: 'Otro' }, null, { n: 'sin id' }])
    expect(nameOf('c1')).toBe('Puente con banda')
    expect(nameOf('c2')).toBe('Otro')
    expect(nameOf(BENCH)).toBe(benchName)
    expect(nameOf('no-such')).toBe('no-such')
    expect(nameResolver()(undefined)).toBe('')
    expect(nameResolver('x')(BENCH)).toBe(benchName)
  })
})

describe('sessionView', () => {
  const nameOf = nameResolver([{ id: 'c1', n: 'Puente con banda' }])

  it('reads the sets as the client\'s own history shows them, effort included, without unticked rows', () => {
    const s = sessionView(session('w1', '2026-10-12'), { unit: 'kg', nameOf })
    expect(s.exercises.map(e => [e.name, e.line, e.note, e.superset])).toEqual([
      [benchName, '60×8 (RIR 2)  ·  60×7 (RIR 1)', '', false],
      // The client's own exercise is not in the trainer's catalogue, so its load reads as a bar's.
      ['Puente con banda', '0×12', 'con banda verde', false],
    ])
    expect(s).toMatchObject({ id: 'w1', name: 'Torso', d: '2026-10-12', durMs: 65 * 60000, sets: 3, prs: 1, bw: 62, note: '', unread: false, pain: null })
    expect(s.vol).toBe(60 * 8 + 60 * 7)
  })

  it('carries the note, whether it is unread, and the pain with its verdict', () => {
    const w = session('w2', '2026-10-13', { note: ' Me costó el press ', pain: { during: 4, area: 'hombro', worseNextDay: false } })
    const s = sessionView(w, { nameOf, unread: ['w2'] })
    expect(s.note).toBe('Me costó el press')
    expect(s.unread).toBe(true)
    expect(s.pain).toEqual({ during: 4, area: 'hombro', worseNextDay: false, verdict: 'tell' })
    expect(sessionView(w, { nameOf, unread: [] }).unread).toBe(false)
    // An id on the unread list without a note has nothing to read.
    expect(sessionView(session('w3', '2026-10-13'), { nameOf, unread: ['w3'] }).unread).toBe(false)
  })

  it('marks the exercises done as a superset', () => {
    const w = session('w1', '2026-10-12')
    w.entries[0].sg = 'a'; w.entries[1].sg = 'a'
    expect(sessionView(w, { nameOf }).exercises.map(e => e.superset)).toEqual([true, true])
  })

  it('reads a stored volume when there is one, and a session with nothing ticked as empty lines', () => {
    expect(sessionView(session('w1', '2026-10-12', { vol: 999 }), { nameOf }).vol).toBe(999)
    const s = sessionView({ id: 'x', d: 'ayer', entries: [{ id: BENCH, sets: [{ w: 60, r: 8, done: false }, null] }] }, { nameOf })
    expect(s).toMatchObject({ d: null, durMs: 0, sets: 0, prs: 0, bw: null, name: '' })
    expect(s.exercises[0].line).toBe('')
  })
})

describe('routineView', () => {
  it('reads what each exercise asks for, with rest, note and supersets', () => {
    const r = routineView(detail().routines[0], { unit: 'kg', nameOf: nameResolver(detail().customEx) })
    expect(r).toMatchObject({ id: 'r1', name: 'Torso', emoji: '💪' })
    expect(r.exercises.map(e => [e.name, e.line, e.restSec, e.note, e.superset])).toEqual([
      [benchName, '3 × 8–12 · 60 kg', 120, 'pausa abajo', false],
      ['Puente con banda', '2 × 15', null, '', true],
      [EXIDX['0027'].n, '2 × 15 · 20 kg', null, '', true],
    ])
  })

  it('opens on a routine that is not one', () => {
    expect(routineView(null)).toEqual({ id: undefined, name: '?', emoji: '', exercises: [] })
    expect(routineView({ id: 'r', name: 'Rota', ex: 'nope' }).exercises).toEqual([])
    expect(routineView({ id: 'r', name: 'Rota', ex: [null, {}, 7] }).exercises).toEqual([])
  })
})

describe('weekPlan', () => {
  it('lists the days that hold a plan, in the client\'s week order, without deleted routines', () => {
    const d = detail()
    expect(weekPlan(d.plan, d.routines)).toEqual([{ day: 1, routines: ['Torso'] }, { day: 4, routines: ['Torso'] }])
    expect(weekPlan({ ...d.plan, weekStart: 0, week: { 0: 'r1', 1: ['r1'] } }, d.routines).map(x => x.day)).toEqual([0, 1])
    expect(weekPlan(null, null)).toEqual([])
  })
})

describe('bodyweightView', () => {
  it('orders weigh-ins newest first and says how much it moved', () => {
    const b = bodyweightView([{ d: '2026-10-01', w: 63 }, { d: '2026-10-12', w: 62.4 }, { d: '2026-10-05', w: 62.9 }])
    expect(b.entries.map(e => e.d)).toEqual(['2026-10-12', '2026-10-05', '2026-10-01'])
    expect(b.latest).toEqual({ d: '2026-10-12', w: 62.4 })
    expect(b.change).toBe(-0.6)
    expect(b.since).toBe('2026-10-01')
  })

  it('has no change with one weigh-in, and nothing with none or rubbish', () => {
    expect(bodyweightView([{ d: '2026-10-12', w: 62 }])).toEqual({ entries: [{ d: '2026-10-12', w: 62 }], latest: { d: '2026-10-12', w: 62 }, change: null, since: null })
    for (const bad of [null, undefined, 'x', [null, 'x', { d: 'ayer', w: 60 }, { d: '2026-10-12', w: 0 }]]) {
      expect(bodyweightView(bad)).toEqual({ entries: [], latest: null, change: null, since: null })
    }
  })
})

describe('clientView', () => {
  it('puts the whole screen together from one answer', () => {
    const v = clientView(detail(), TODAY)
    expect(v.user).toEqual({ id: 'ana', name: 'Ana', disabled: false })
    expect(v.unit).toBe('kg')
    expect(v.effort).toBe('rir')
    expect(v.sessions.map(s => s.id)).toEqual(['w2', 'w1'])
    expect(v.unread).toEqual(['w2'])
    expect(v.sessions[0].exercises[1].name).toBe('Puente con banda')
    expect(v.routines).toHaveLength(1)
    // Monday and Thursday are planned; two sessions this week (Mon 12 and Tue 13).
    expect(v.week).toEqual({ done: 2, planned: 2 })
    expect(v.weekPlan.map(d => d.day)).toEqual([1, 4])
    expect(v.bodyweight.latest.w).toBe(62.4)
    expect(v.lastPain).toEqual({ during: 4, area: 'hombro', note: 'al bajar', verdict: 'tell', d: '2026-10-13', daysAgo: 1 })
  })

  it('skips sessions it cannot walk and keeps the rest', () => {
    const v = clientView(detail({ workouts: [null, {}, { id: 'bad', entries: [null] }, { id: 'bad2', entries: [{ id: BENCH }] }, session('w1', '2026-10-12')] }), TODAY)
    expect(v.sessions.map(s => s.id)).toEqual(['w1'])
  })

  it('opens on an answer that is not one', () => {
    for (const bad of [null, undefined, 'x', [], {}]) {
      const v = clientView(bad, TODAY)
      expect(v).toMatchObject({ user: { id: '', name: '?' }, sessions: [], unread: [], routines: [], week: { done: 0, planned: 0 }, weekPlan: [], lastPain: null, unit: 'kg', effort: 'none', live: null })
      expect(v.bodyweight.entries).toEqual([])
    }
    const odd = clientView({ user: 'ana', unit: 'stone', routines: 'x', workouts: 'x', bodyweight: 7, customEx: 3, unread: 'w1', plan: [] }, TODAY)
    expect(odd.unit).toBe('kg')
    expect(odd.sessions).toEqual([])
  })

  it('reads pounds as pounds', () => {
    const v = clientView(detail({ unit: 'lb' }), TODAY)
    expect(v.unit).toBe('lb')
    expect(v.routines[0].exercises[0].line).toBe('3 × 8–12 · 60 lb')
  })
})
