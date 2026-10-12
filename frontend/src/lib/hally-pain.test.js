import { describe, expect, it } from 'vitest'
import {
  painOf, workoutPain, painFinishFields, painVerdict, setWorkoutPain, setWorseNextDay, painFollowUp,
  PAIN_AREA_MAX, PAIN_NOTE_MAX,
} from './hally-pain.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { editCompletedSession, saveWorkoutEdit, editChangesNothing } from './session-edit.js'
import { mergeStates, stampChange, stampWorkout } from './sync-merge.js'

const clone = x => JSON.parse(JSON.stringify(x))
const workout = (id, d, extra = {}) => ({
  id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), routineIds: ['r1'], routineId: 'r1', name: 'Pierna', bw: 60,
  entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }], prs: [], ...extra,
})
const stateOf = (...workouts) => ({ unit: 'kg', workouts, routines: [], bodyweight: [], exWeights: {}, customEx: [], _ts: 1000 })

describe('painOf', () => {
  it('reads a record and trims what the client typed', () => {
    expect(painOf({ during: 4, area: '  rodilla derecha ', worseNextDay: false, note: ' al bajar ' }))
      .toEqual({ during: 4, area: 'rodilla derecha', worseNextDay: false, note: 'al bajar' })
    expect(painOf({ during: 0 })).toEqual({ during: 0 })
    expect(painOf({ during: '7' })).toEqual({ during: 7 })
    expect(painOf({ during: 10, area: '', note: '   ' })).toEqual({ during: 10 })
  })

  it('caps the zone and the note', () => {
    const p = painOf({ during: 2, area: 'x'.repeat(200), note: 'y'.repeat(2000) })
    expect(p.area).toHaveLength(PAIN_AREA_MAX)
    expect(p.note).toHaveLength(PAIN_NOTE_MAX)
  })

  it('reads anything without a whole 0–10 as no record at all', () => {
    for (const x of [null, undefined, 'mucho', 4, [], {}, { area: 'rodilla' }, { during: 11 }, { during: -1 }, { during: 2.5 }, { during: '' }, { during: 'x' }, { during: null }, { during: true }]) {
      expect(painOf(x)).toBe(null)
    }
    expect(workoutPain({ pain: { during: 3 } })).toEqual({ during: 3 })
    expect(workoutPain({})).toBe(null)
    expect(workoutPain(null)).toBe(null)
  })

  it('keeps "worse the next day" only when it is an answer', () => {
    expect(painOf({ during: 3, worseNextDay: 'no' })).toEqual({ during: 3 })
    expect(painOf({ during: 3, worseNextDay: true })).toEqual({ during: 3, worseNextDay: true })
  })
})

describe('painVerdict: up to 3/10 during and no worse the next day is fine', () => {
  it('says nothing without a record', () => {
    expect(painVerdict(null)).toBe(null)
    expect(painVerdict({ area: 'rodilla' })).toBe(null)
  })

  it('reads the rule', () => {
    expect(painVerdict({ during: 0 })).toBe('none')
    expect(painVerdict({ during: 1 })).toBe('ok')
    expect(painVerdict({ during: 3 })).toBe('ok')
    expect(painVerdict({ during: 3, worseNextDay: false })).toBe('ok')
    expect(painVerdict({ during: 4 })).toBe('tell')
    expect(painVerdict({ during: 4, worseNextDay: false })).toBe('tell')
    expect(painVerdict({ during: 2, worseNextDay: true })).toBe('tell')
    expect(painVerdict({ during: 10, worseNextDay: true })).toBe('tell')
  })
})

describe('the finished-session whitelist (lib/finish-workout.js)', () => {
  const active = { id: 'a1', d: '2026-10-12', start: 1000, routineIds: ['r1'], name: 'Pierna', bw: 60, entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }], topW: 60, target: { sets: 1, reps: 8 } }] }

  it('carries the pain of the running session onto the saved workout', () => {
    const w = buildCompletedWorkout({ ...active, pain: { during: 2, area: ' rodilla ', junk: 1 } }, { end: 2000 })
    expect(w.pain).toEqual({ during: 2, area: 'rodilla' })
  })

  it('adds no key to a session that says nothing about pain, or says it badly', () => {
    expect('pain' in buildCompletedWorkout(active, { end: 2000 })).toBe(false)
    expect('pain' in buildCompletedWorkout({ ...active, pain: { area: 'rodilla' } }, { end: 2000 })).toBe(false)
    expect(painFinishFields(null)).toEqual({})
  })
})

describe('setWorkoutPain', () => {
  it('writes the record onto the saved workout and stamps the edit', () => {
    const s = stateOf(workout('w1', '2026-10-10'), workout('w2', '2026-10-12'))
    expect(setWorkoutPain(s, { id: 'w2' }, { during: 4, area: 'rodilla', note: 'al bajar' }, 5000)).toBe('saved')
    expect(s.workouts[1].pain).toEqual({ during: 4, area: 'rodilla', note: 'al bajar' })
    expect(s.workouts[1]._ts).toBe(5000)
    expect('pain' in s.workouts[0]).toBe(false)
    expect(s.workouts[0]._ts).toBeUndefined()
  })

  it('does not stamp a write that changes nothing', () => {
    const s = stateOf(workout('w1', '2026-10-10'))
    setWorkoutPain(s, { id: 'w1' }, { during: 4, area: 'rodilla' }, 5000)
    expect(setWorkoutPain(s, { id: 'w1' }, { during: 4, area: ' rodilla ' }, 9000)).toBe('same')
    expect(s.workouts[0]._ts).toBe(5000)
    expect(setWorkoutPain(stateOf(workout('w1', '2026-10-10')), { id: 'w1' }, null, 9000)).toBe('same')
  })

  it('keeps the answer about the next day when the rest is corrected, and drops it when nothing hurt', () => {
    const s = stateOf(workout('w1', '2026-10-10', { pain: { during: 4, area: 'rodilla', worseNextDay: true } }))
    setWorkoutPain(s, { id: 'w1' }, { during: 5, area: 'rodilla', note: 'más bien 5' }, 5000)
    expect(s.workouts[0].pain).toEqual({ during: 5, area: 'rodilla', worseNextDay: true, note: 'más bien 5' })
    setWorkoutPain(s, { id: 'w1' }, { during: 0 }, 6000)
    expect(s.workouts[0].pain).toEqual({ during: 0 })
  })

  it('takes the record off, refuses a bad one, and says when the workout is gone', () => {
    const s = stateOf(workout('w1', '2026-10-10', { pain: { during: 4 } }))
    expect(setWorkoutPain(s, { id: 'w1' }, { area: 'sin número' }, 5000)).toBe('invalid')
    expect(s.workouts[0].pain).toEqual({ during: 4 })
    expect(setWorkoutPain(s, { id: 'w1' }, null, 6000)).toBe('saved')
    expect('pain' in s.workouts[0]).toBe(false)
    expect(s.workouts[0]._ts).toBe(6000)
    expect(setWorkoutPain(s, { id: 'nope' }, { during: 1 }, 7000)).toBe('gone')
    expect(setWorkoutPain({}, { id: 'w1' }, { during: 1 })).toBe('gone')
  })
})

describe('setWorseNextDay', () => {
  it('answers the question once, stamping the edit', () => {
    const s = stateOf(workout('w1', '2026-10-10', { pain: { during: 4, area: 'rodilla' } }))
    expect(setWorseNextDay(s, { id: 'w1' }, false, 5000)).toBe('saved')
    expect(s.workouts[0].pain).toEqual({ during: 4, area: 'rodilla', worseNextDay: false })
    expect(setWorseNextDay(s, { id: 'w1' }, false, 9000)).toBe('same')
    expect(s.workouts[0]._ts).toBe(5000)
    expect(setWorseNextDay(s, { id: 'w1' }, true, 9000)).toBe('saved')
    expect(s.workouts[0].pain.worseNextDay).toBe(true)
    // In the key order every other write uses, so the same record never reads as two.
    const noted = stateOf(workout('w1', '2026-10-10', { pain: { during: 4, area: 'rodilla', note: 'al bajar' } }))
    setWorseNextDay(noted, { id: 'w1' }, true, 5000)
    expect(JSON.stringify(noted.workouts[0].pain)).toBe(JSON.stringify(painOf({ during: 4, area: 'rodilla', worseNextDay: true, note: 'al bajar' })))
  })

  it('has nothing to answer on a session without pain', () => {
    expect(setWorseNextDay(stateOf(workout('w1', '2026-10-10')), { id: 'w1' }, true)).toBe('invalid')
    expect(setWorseNextDay(stateOf(workout('w1', '2026-10-10', { pain: { during: 0 } })), { id: 'w1' }, true)).toBe('invalid')
    expect(setWorseNextDay(stateOf(), { id: 'w1' }, true)).toBe('gone')
  })
})

describe('painFollowUp: what the next session asks', () => {
  const hurt = { pain: { during: 4, area: 'rodilla' } }

  it('asks about the last session when it hurt and has no answer yet', () => {
    const s = stateOf(workout('w1', '2026-10-08'), workout('w2', '2026-10-10', hurt))
    expect(painFollowUp(s, '2026-10-12')?.id).toBe('w2')
  })

  it('reads the last session by date, not by its place in the list', () => {
    const s = stateOf(workout('w2', '2026-10-10', hurt), workout('w1', '2026-10-08'))
    expect(painFollowUp(s, '2026-10-12')?.id).toBe('w2')
    expect(painFollowUp(stateOf(workout('w2', '2026-10-10'), workout('w1', '2026-10-08', hurt)), '2026-10-12')).toBe(null)
  })

  it('asks nothing when nothing hurt, it was answered, or there is no record', () => {
    expect(painFollowUp(stateOf(workout('w1', '2026-10-10')), '2026-10-12')).toBe(null)
    expect(painFollowUp(stateOf(workout('w1', '2026-10-10', { pain: { during: 0 } })), '2026-10-12')).toBe(null)
    expect(painFollowUp(stateOf(workout('w1', '2026-10-10', { pain: { during: 4, worseNextDay: false } })), '2026-10-12')).toBe(null)
    expect(painFollowUp(stateOf(), '2026-10-12')).toBe(null)
    expect(painFollowUp(null, '2026-10-12')).toBe(null)
    expect(painFollowUp({ workouts: [null, 'x', { d: 7 }] }, '2026-10-12')).toBe(null)
  })

  it('only asks about the one before: an older session that hurt is no longer the question', () => {
    const s = stateOf(workout('w1', '2026-10-06', hurt), workout('w2', '2026-10-10'))
    expect(painFollowUp(s, '2026-10-12')).toBe(null)
  })

  it('waits for the next day: a second session on the same day cannot know yet', () => {
    const s = stateOf(workout('w1', '2026-10-12', hurt))
    expect(painFollowUp(s, '2026-10-12')).toBe(null)
    expect(painFollowUp(s, '2026-10-13')?.id).toBe('w1')
  })

  it('asks nothing while a saved workout is edited or a past one is logged', () => {
    const s = stateOf(workout('w1', '2026-10-10', hurt))
    expect(painFollowUp({ ...s, active: { id: 'a', editingWorkoutId: 'w1' } }, '2026-10-12')).toBe(null)
    expect(painFollowUp({ ...s, active: { id: 'a', backfill: { d: '2026-10-01' } } }, '2026-10-12')).toBe(null)
    expect(painFollowUp({ ...s, active: { id: 'a' } }, '2026-10-12')?.id).toBe('w1')
  })
})

describe('pain on a saved workout survives the rest of the app', () => {
  it('survives an edit of the session in the history editor', () => {
    const s = stateOf(workout('w1', '2026-10-10', { pain: { during: 4, area: 'rodilla', worseNextDay: false, note: 'al bajar' } }))
    editCompletedSession(s, 'w1')
    // Opening and closing the editor without touching anything is still "nothing changed".
    expect(editChangesNothing(s)).toBe(true)
    s.active.entries[0].sets[0].r = 10
    saveWorkoutEdit(s, 7000)
    expect(s.active).toBe(null)
    expect(s.workouts[0].entries[0].sets[0].r).toBe(10)
    expect(s.workouts[0].pain).toEqual({ during: 4, area: 'rodilla', worseNextDay: false, note: 'al bajar' })
  })

  // lib/sync-merge.js merges a workout both copies have field by field, by the stamps stampChange
  // leaves. These are the conflicts a pain record has to live through.
  const base = () => stateOf(workout('w1', '2026-10-10', { note: 'Bien' }), workout('w2', '2026-10-12'))
  const change = (from, mut, wall) => {
    const next = clone(from)
    mut(next)
    next._ts = stampChange(from, next, wall)
    return next
  }

  it('is kept when the other device edited the note of the same workout', () => {
    const phone = change(base(), s => setWorkoutPain(s, { id: 'w1' }, { during: 4, area: 'rodilla' }), 5000)
    const desk = change(base(), s => { s.workouts[0].note = 'Bien, pero corto'; stampWorkout(s.workouts[0]) }, 6000)
    for (const merged of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      const w1 = merged.workouts.find(w => w.id === 'w1')
      expect(w1.pain).toEqual({ during: 4, area: 'rodilla' })
      expect(w1.note).toBe('Bien, pero corto')
    }
  })

  it('is kept when the other copy is newer as a whole and never saw it', () => {
    const phone = change(base(), s => setWorkoutPain(s, { id: 'w1' }, { during: 4, area: 'rodilla' }), 5000)
    const desk = change(base(), s => { s.bodyweight.push({ d: '2026-10-12', w: 60, t: 8000 }) }, 8000)
    for (const merged of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      expect(merged.workouts.find(w => w.id === 'w1').pain).toEqual({ during: 4, area: 'rodilla' })
      expect(merged.bodyweight).toHaveLength(1)
    }
  })

  it('takes the next-day answer from the device that gave it, over an older copy of the record', () => {
    const start = change(base(), s => setWorkoutPain(s, { id: 'w1' }, { during: 4, area: 'rodilla' }), 5000)
    const phone = change(start, s => setWorseNextDay(s, { id: 'w1' }, true), 7000)
    const desk = change(start, s => { s.workouts[1].note = 'Otra cosa'; stampWorkout(s.workouts[1]) }, 9000)
    for (const merged of [mergeStates(phone, desk), mergeStates(desk, phone)]) {
      expect(merged.workouts.find(w => w.id === 'w1').pain).toEqual({ during: 4, area: 'rodilla', worseNextDay: true })
      expect(merged.workouts.find(w => w.id === 'w2').note).toBe('Otra cosa')
    }
  })

  it('stays off once it was taken off, even against a copy that still has it', () => {
    const start = change(base(), s => setWorkoutPain(s, { id: 'w1' }, { during: 4 }), 5000)
    const phone = change(start, s => setWorkoutPain(s, { id: 'w1' }, null), 7000)
    for (const merged of [mergeStates(phone, start), mergeStates(start, phone)]) {
      expect('pain' in merged.workouts.find(w => w.id === 'w1')).toBe(false)
    }
  })
})
