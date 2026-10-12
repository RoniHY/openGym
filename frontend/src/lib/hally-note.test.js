import { describe, expect, it } from 'vitest'
import { noteWords, noteChanges, setWorkoutNote } from './hally-note.js'
import { NOBODY } from './hally-coaching.js'
import { NOTE_MAX } from './history.js'
import { mergeStates, stampChange } from './sync-merge.js'
import { setWorkoutPain } from './hally-pain.js'

const withTrainer = { trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro', since: null } }
const workout = (id, extra = {}) => ({ id, d: '2026-10-12', start: 1, end: 2, name: 'Pierna', entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }] }], prs: [], ...extra })
const stateOf = (...workouts) => ({ unit: 'kg', workouts, routines: [], bodyweight: [], exWeights: {}, customEx: [], _ts: 1000 })

describe('noteWords', () => {
  it('keeps upstream\'s words for a profile without a trainer', () => {
    for (const me of [NOBODY, null, undefined, { trainer: true, clients: 3, coach: null }]) {
      const w = noteWords(me)
      expect(w.forTrainer).toBe(false)
      expect(w.title).toBe('Session note')
      expect(w.placeholder).toBe('How the session went as a whole.')
      expect([w.action(false), w.action(true)]).toEqual(['Add session note', 'Edit session note'])
    }
  })

  it('names the note for the trainer who reads it', () => {
    const w = noteWords(withTrainer)
    expect(w.forTrainer).toBe(true)
    expect(w.title).toBe('Note for your trainer')
    expect(w.placeholder).toBe('How it went, what felt hard, anything your trainer should know.')
    expect([w.action(false), w.action(true)]).toEqual(['Leave a note for your trainer', 'Edit the note for your trainer'])
  })
})

describe('setWorkoutNote', () => {
  it('writes the note onto the saved workout, trimmed, and stamps the edit', () => {
    const s = stateOf(workout('w1'), workout('w2'))
    expect(setWorkoutNote(s, { id: 'w2' }, '  Me costó la última serie  ', 5000)).toBe('saved')
    expect(s.workouts[1].note).toBe('Me costó la última serie')
    expect(s.workouts[1]._ts).toBe(5000)
    expect('note' in s.workouts[0]).toBe(false)
  })

  it('does not stamp a note that did not change', () => {
    const s = stateOf(workout('w1', { note: 'Bien', _ts: 3000 }))
    expect(noteChanges(s, { id: 'w1' }, ' Bien ')).toBe(false)
    expect(setWorkoutNote(s, { id: 'w1' }, ' Bien ', 9000)).toBe('same')
    expect(s.workouts[0]._ts).toBe(3000)
    expect(setWorkoutNote(stateOf(workout('w1')), { id: 'w1' }, '   ', 9000)).toBe('same')
  })

  it('removes an emptied note, caps a long one, and says when the workout is gone', () => {
    const s = stateOf(workout('w1', { note: 'Bien' }))
    expect(setWorkoutNote(s, { id: 'w1' }, '', 5000)).toBe('saved')
    expect('note' in s.workouts[0]).toBe(false)
    setWorkoutNote(s, { id: 'w1' }, 'x'.repeat(NOTE_MAX + 50), 6000)
    expect(s.workouts[0].note).toHaveLength(NOTE_MAX)
    expect(setWorkoutNote(s, { id: 'nope' }, 'hola')).toBe('gone')
    expect(noteChanges(s, { id: 'nope' }, 'hola')).toBe(false)
    expect(setWorkoutNote(s, { id: 'w1' }, null, 7000)).toBe('saved')
    expect('note' in s.workouts[0]).toBe(false)
  })

  it('a note and a pain record written on two devices both survive the merge', () => {
    const base = stateOf(workout('w1'))
    const change = (mut, wall) => { const next = JSON.parse(JSON.stringify(base)); mut(next); next._ts = stampChange(base, next, wall); return next }
    const phone = change(s => setWorkoutNote(s, { id: 'w1' }, 'Me costó'), 5000)
    const tablet = change(s => setWorkoutPain(s, { id: 'w1' }, { during: 3, area: 'hombro' }), 6000)
    for (const merged of [mergeStates(phone, tablet), mergeStates(tablet, phone)]) {
      expect(merged.workouts[0].note).toBe('Me costó')
      expect(merged.workouts[0].pain).toEqual({ during: 3, area: 'hombro' })
    }
  })
})
