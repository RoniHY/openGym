import { describe, expect, it } from 'vitest'
import { daysBetween, planState, clientWeek, clientSummary, sortClients, clientList, listTotals, PAIN_RECENT_DAYS } from './hally-trainer.js'

// Monday 2026-10-12. The week runs Mon 12 to Sun 18 with weekStart 1.
const TODAY = '2026-10-14'
const w = (id, d, extra = {}) => ({ id, d, start: Date.parse(d + 'T16:00:00Z'), end: Date.parse(d + 'T17:00:00Z'), name: 'Pierna', routineIds: ['r1'], ...extra })
const plan = (extra = {}) => ({
  weekStart: 1,
  week: { 1: ['r1'], 3: ['r2'], 5: ['r1'] },
  queue: null,
  routines: [{ id: 'r1', name: 'Pierna' }, { id: 'r2', name: 'Torso' }],
  workouts: [],
  ...extra,
})
const row = (extra = {}) => ({
  id: 'ana', name: 'Ana', since: '2026-10-01T00:00:00.000Z', disabled: false, workouts: 0,
  lastWorkout: null, lastPain: null, unreadNotes: 0, lastSync: null, live: null, plan: plan(), ...extra,
})

describe('daysBetween', () => {
  it('counts calendar days, across a month and a clock change', () => {
    expect(daysBetween('2026-10-12', '2026-10-12')).toBe(0)
    expect(daysBetween('2026-10-12', '2026-10-14')).toBe(2)
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)      // the night clocks go back in Europe
    expect(daysBetween('2026-10-14', '2026-10-12')).toBe(-2)
  })
  it('has no answer for something that is not a date', () => {
    for (const x of [null, undefined, '', 'ayer', 7]) expect(daysBetween(x, TODAY)).toBe(null)
  })
})

describe('clientWeek: done against planned, by the app\'s own weekly tally', () => {
  it('counts this week\'s sessions over the weekdays that hold a plan', () => {
    const p = plan({ workouts: [w('a', '2026-10-05'), w('b', '2026-10-12'), w('c', '2026-10-14', { routineIds: ['r2'] })] })
    expect(clientWeek(p, TODAY)).toEqual({ done: 2, planned: 3 })
  })

  it('reads zero of zero for a client with no plan and no sessions', () => {
    expect(clientWeek(plan({ week: {}, routines: [] }), TODAY)).toEqual({ done: 0, planned: 0 })
  })

  it('does not count a weekday whose routine was deleted', () => {
    expect(clientWeek(plan({ week: { 1: ['r1'], 3: ['gone'] } }), TODAY)).toEqual({ done: 0, planned: 2 - 1 })
  })

  it('follows the week start the client chose', () => {
    // Sunday 2026-10-11 belongs to the week of the 12th only when the week starts on Sunday.
    const p = plan({ workouts: [w('a', '2026-10-11')] })
    expect(clientWeek(p, TODAY).done).toBe(0)
    expect(clientWeek({ ...p, weekStart: 0 }, TODAY).done).toBe(1)
  })

  it('counts a rotation by its sessions, not by weekday', () => {
    const since = Date.parse('2026-10-12T00:00:00Z')
    const p = plan({ week: {}, queue: { ids: ['r1', 'r2'], since, startsOn: '2026-10-12' }, workouts: [w('a', '2026-10-13')] })
    expect(clientWeek(p, TODAY)).toEqual({ done: 1, planned: 2 })
  })

  it('opens on a slice that is not one', () => {
    for (const bad of [null, undefined, 'x', 7, [], {}, { workouts: 'x', routines: 3, week: [], queue: 'no' }, { workouts: [null, 'x', { d: 5 }], routines: [null, {}] }]) {
      expect(clientWeek(bad, TODAY)).toEqual({ done: 0, planned: 0 })
    }
    expect(planState({ workouts: [null, { d: '2026-10-12' }, { d: 5 }], routines: [{ name: 'sin id' }, { id: 'r1' }] }))
      .toEqual({ workouts: [{ d: '2026-10-12' }], routines: [{ id: 'r1' }], week: {}, queue: null, weekStart: undefined })
  })
})

describe('clientSummary', () => {
  it('reads a client who has not logged anything yet', () => {
    expect(clientSummary(row(), TODAY)).toEqual({
      id: 'ana', name: 'Ana', disabled: false, since: '2026-10-01T00:00:00.000Z', sessions: 0,
      last: null, week: { done: 0, planned: 3 }, pain: null, unread: 0, live: null, flags: [],
    })
  })

  it('says when the last session was', () => {
    const s = clientSummary(row({ workouts: 5, lastWorkout: { id: 'b', d: '2026-10-12', name: 'Pierna', end: 1 } }), TODAY)
    expect(s.last).toEqual({ d: '2026-10-12', name: 'Pierna', daysAgo: 2 })
    expect(s.sessions).toBe(5)
  })

  it('holds the last pain record against the rule', () => {
    const fine = clientSummary(row({ lastPain: { during: 2, area: 'rodilla', worseNextDay: false, d: '2026-10-12', workoutId: 'b' } }), TODAY)
    expect(fine.pain).toEqual({ during: 2, area: 'rodilla', worseNextDay: false, d: '2026-10-12', daysAgo: 2, verdict: 'ok' })
    expect(fine.flags).toEqual([])
    expect(clientSummary(row({ lastPain: { during: 0, d: '2026-10-12' } }), TODAY).pain.verdict).toBe('none')
    const tell = clientSummary(row({ lastPain: { during: 5, area: 'hombro', d: '2026-10-13' } }), TODAY)
    expect(tell.pain.verdict).toBe('tell')
    expect(tell.flags).toEqual(['pain'])
    expect(clientSummary(row({ lastPain: { during: 2, worseNextDay: true, d: '2026-10-13' } }), TODAY).flags).toEqual(['pain'])
  })

  it('stops flagging pain that is old news, and still shows it', () => {
    const old = clientSummary(row({ lastPain: { during: 7, d: '2026-09-01' } }), TODAY)
    expect(old.pain.daysAgo).toBeGreaterThan(PAIN_RECENT_DAYS)
    expect(old.pain.verdict).toBe('tell')
    expect(old.flags).toEqual([])
  })

  it('flags unread notes and carries who is training now', () => {
    const s = clientSummary(row({ unreadNotes: 2, live: { name: 'Pierna', exIdx: 1, exTotal: 4, setsDone: 3, setsTotal: 12, startedAt: 1 } }), TODAY)
    expect(s.unread).toBe(2)
    expect(s.flags).toEqual(['unread'])
    expect(s.live.name).toBe('Pierna')
    expect(clientSummary(row({ unreadNotes: 1, lastPain: { during: 9, d: TODAY } }), TODAY).flags).toEqual(['unread', 'pain'])
  })

  it('opens on a row that is not one', () => {
    for (const bad of [null, undefined, 'x', 7, [], {}]) {
      const s = clientSummary(bad, TODAY)
      expect(s).toMatchObject({ id: '', name: '?', last: null, pain: null, unread: 0, live: null, flags: [], week: { done: 0, planned: 0 } })
    }
    const odd = clientSummary({ id: 'x', name: 7, workouts: 'muchos', lastWorkout: { d: 'ayer' }, lastPain: { during: 'mucho' }, unreadNotes: -3, live: 'si', plan: 5 }, TODAY)
    expect(odd).toMatchObject({ id: 'x', name: '?', sessions: 0, last: null, pain: null, unread: 0, live: null })
  })
})

describe('the list', () => {
  const answer = {
    clients: [
      row({ id: 'z', name: 'Zoe' }),
      row({ id: 'm', name: 'Mario', live: { name: 'Torso' } }),
      row({ id: 'b', name: 'Beto', unreadNotes: 1 }),
      row({ id: 'a', name: 'Ana' }),
      row({ id: 'c', name: 'Caro', lastPain: { during: 6, d: TODAY } }),
      null, 'x', { name: 'sin id' },
    ],
  }

  it('puts whoever needs a look first, then whoever trains now, then by name', () => {
    expect(clientList(answer, TODAY).map(s => s.name)).toEqual(['Beto', 'Caro', 'Mario', 'Ana', 'Zoe'])
    expect(sortClients([])).toEqual([])
  })

  it('totals what is above the list', () => {
    expect(listTotals(clientList(answer, TODAY))).toEqual({ clients: 5, live: 1, unread: 1, pain: 1 })
    expect(listTotals([])).toEqual({ clients: 0, live: 0, unread: 0, pain: 0 })
  })

  it('is empty for an answer without a list', () => {
    for (const bad of [null, undefined, {}, { clients: 'x' }, 'x']) expect(clientList(bad, TODAY)).toEqual([])
  })
})
