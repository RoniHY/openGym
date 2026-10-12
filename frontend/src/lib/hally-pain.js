// Hally: pain reported for a session.
//
// A finished workout may carry `pain: { during, area?, worseNextDay?, note? }`:
//
//   during        0–10, how much it hurt while training (0 is an answer: "nothing hurt")
//   area          where, in the client's words ("rodilla derecha")
//   worseNextDay  asked when the next session opens: was it worse the day after?
//   note          anything else about it
//
// The rule the client reads, and the trainer reads the record by: up to 3/10 during the session
// and no worse the next day is fine; past either, tell your trainer.
//
// The record lives on the client's own workout, so it syncs like the rest of the session and
// works without signal; the trainer reads it through the trainer routes (api/trainer.js, which
// has the same reading of the shape in its own painOf). Every write is an edit of a saved
// workout and is stamped like one (stampWorkout), so a conflict between two devices keeps it.
import { sameWorkout } from './workout-date.js'
import { stampWorkout } from './sync-merge.js'
import { todayISO } from './format.js'

export const PAIN_MAX = 10
/** Up to here, during the session, is within what is expected. */
export const PAIN_OK_MAX = 3
export const PAIN_AREA_MAX = 40
export const PAIN_NOTE_MAX = 280

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * A pain record as it is stored, or null for anything that is not one. `during` has to be a whole
 * number from 0 to 10: without it there is no record, only loose text.
 */
export function painOf(p) {
  if (!isMap(p)) return null
  const during = typeof p.during === 'string' && p.during.trim() !== '' ? Number(p.during) : p.during
  if (!Number.isInteger(during) || during < 0 || during > PAIN_MAX) return null
  const area = text(p.area, PAIN_AREA_MAX)
  const note = text(p.note, PAIN_NOTE_MAX)
  return {
    during,
    ...(area ? { area } : {}),
    ...(typeof p.worseNextDay === 'boolean' ? { worseNextDay: p.worseNextDay } : {}),
    ...(note ? { note } : {}),
  }
}

/** The pain record of a workout, or null. */
export const workoutPain = w => painOf(w?.pain)

/**
 * What a session being finished carries into its saved record: the one field
 * lib/finish-workout.js lists for Hally. Empty unless the running session has a pain record.
 */
export function painFinishFields(active) {
  const pain = painOf(active?.pain)
  return pain ? { pain } : {}
}

/**
 * How a record stands against the rule:
 *   'none'  nothing hurt
 *   'ok'    up to 3/10 and not worse the next day (or not asked yet)
 *   'tell'  more than 3/10 during, or worse the next day: the trainer should know
 * null without a record.
 */
export function painVerdict(p) {
  const pain = painOf(p)
  if (!pain) return null
  if (pain.worseNextDay === true || pain.during > PAIN_OK_MAX) return 'tell'
  return pain.during === 0 ? 'none' : 'ok'
}

const recordOf = (state, w) => (Array.isArray(state?.workouts) ? state.workouts.find(x => x && sameWorkout(x, w)) : null) || null
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Writes `pain` onto the saved workout `w` inside `state` (null takes the record off). The
 * answer to "worse the next day" is kept across an edit of the rest unless the edit says
 * otherwise. Returns 'saved', 'same' (nothing changed, so nothing is stamped: a stamp outranks
 * what another device wrote since), 'invalid' or 'gone' (the workout was deleted meanwhile).
 * Mutates `state` — made for useStore's update().
 */
export function setWorkoutPain(state, w, pain, now = Date.now()) {
  const rec = recordOf(state, w)
  if (!rec) return 'gone'
  const before = painOf(rec.pain)
  if (pain == null) {
    if (!('pain' in rec)) return 'same'
    delete rec.pain
    stampWorkout(rec, now)
    return 'saved'
  }
  const next = painOf(pain)
  if (!next) return 'invalid'
  if (typeof next.worseNextDay !== 'boolean' && typeof before?.worseNextDay === 'boolean') next.worseNextDay = before.worseNextDay
  // Nothing hurt, so there is nothing that could have got worse.
  if (next.during === 0) delete next.worseNextDay
  // In the one key order painOf writes, so a record reads the same whichever way it was made.
  const canon = painOf(next)
  if (same(rec.pain, canon)) return 'same'
  rec.pain = canon
  stampWorkout(rec, now)
  return 'saved'
}

/**
 * Whether setWorkoutPain would change the record: asked before the store is told to update, so an
 * answer that is already saved (a field left without typing) costs no write and no sync.
 */
export function painChanges(state, w, pain) {
  const rec = recordOf(state, w)
  return !!rec && setWorkoutPain({ workouts: [{ ...rec }] }, rec, pain, 0) === 'saved'
}

/** Answers "was it worse the next day?" on the saved workout `w`. Same returns as setWorkoutPain. */
export function setWorseNextDay(state, w, worse, now = Date.now()) {
  const rec = recordOf(state, w)
  if (!rec) return 'gone'
  const pain = painOf(rec.pain)
  if (!pain || pain.during === 0) return 'invalid'
  if (pain.worseNextDay === !!worse) return 'same'
  rec.pain = painOf({ ...pain, worseNextDay: !!worse })
  stampWorkout(rec, now)
  return 'saved'
}

const byDayStart = (a, b) => ((a.d || '') < (b.d || '') ? -1 : (a.d || '') > (b.d || '') ? 1 : (a.start || 0) - (b.start || 0))

/**
 * The session to ask "was it worse the next day?" about, when a new one opens on `today`: the
 * last finished session, if it hurt at all, was on an earlier day, and has not been answered.
 * Only the last one: a question about a session three workouts back is one nobody can answer.
 * A session being edited or logged into the past asks nothing.
 */
export function painFollowUp(state, today = todayISO()) {
  if (state?.active?.editingWorkoutId != null || state?.active?.backfill) return null
  const done = (Array.isArray(state?.workouts) ? state.workouts : []).filter(w => w && typeof w === 'object' && typeof w.d === 'string' && w.d <= today)
  if (!done.length) return null
  const last = [...done].sort(byDayStart)[done.length - 1]
  const pain = painOf(last.pain)
  if (!pain || pain.during === 0 || typeof pain.worseNextDay === 'boolean') return null
  return last.d < today ? last : null
}
