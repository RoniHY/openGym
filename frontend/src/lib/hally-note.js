// Hally: the session note, read by a trainer.
//
// The note is upstream's own `workouts[].note` (and `active.note` while the session runs): how
// the whole workout went. Hally changes nothing about where it lives. For a client with a trainer
// it is the note that trainer reads, so it is named for what it is, and the finish screen offers
// it once more at the moment there is something to say.
import { t } from './i18n-core.js'
import { hasTrainer } from './hally-coaching.js'
import { sameWorkout } from './workout-date.js'
import { stampWorkout } from './sync-merge.js'
import { NOTE_MAX } from './history.js'

/** The words the app uses for the session note, for a profile that is `me` (GET /api/trainer/me). */
export function noteWords(me) {
  const mine = hasTrainer(me)
  return {
    forTrainer: mine,
    title: mine ? t('Note for your trainer') : t('Session note'),
    placeholder: mine
      ? t('How it went, what felt hard, anything your trainer should know.')
      : t('How the session went as a whole.'),
    action: has => (mine
      ? (has ? t('Edit the note for your trainer') : t('Leave a note for your trainer'))
      : (has ? t('Edit session note') : t('Add session note'))),
  }
}

const clean = text => (typeof text === 'string' ? text.trim().slice(0, NOTE_MAX) : '')
const recordOf = (state, w) => (Array.isArray(state?.workouts) ? state.workouts.find(x => x && sameWorkout(x, w)) : null) || null

/** Whether setWorkoutNote would change the saved workout: asked before the store is told to update. */
export function noteChanges(state, w, text) {
  const rec = recordOf(state, w)
  return !!rec && clean(text) !== (typeof rec.note === 'string' ? rec.note : '')
}

/**
 * Writes the session note of the saved workout `w` inside `state`, the way the history sheet
 * does (sheets.jsx saveNote): trimmed, capped, removed when empty, and stamped only when it
 * changed, since a stamp outranks what another device wrote since. Returns 'saved', 'same' or
 * 'gone'. Mutates `state` — made for useStore's update().
 */
export function setWorkoutNote(state, w, text, now = Date.now()) {
  const rec = recordOf(state, w)
  if (!rec) return 'gone'
  if (!noteChanges(state, w, text)) return 'same'
  const next = clean(text)
  if (next) rec.note = next; else delete rec.note
  stampWorkout(rec, now)
  return 'saved'
}
