import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHally } from '../store/useHally.js'
import { hasTrainer } from '../lib/hally-coaching.js'
import {
  PAIN_MAX, PAIN_OK_MAX, PAIN_AREA_MAX, PAIN_NOTE_MAX,
  workoutPain, setWorkoutPain, painChanges, setWorseNextDay, painFollowUp,
} from '../lib/hally-pain.js'
import { noteWords, noteChanges, setWorkoutNote } from '../lib/hally-note.js'
import { NOTE_MAX } from '../lib/history.js'
import { sameWorkout } from '../lib/workout-date.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Button, TextField, TextArea } from './ui.jsx'
import '../hally.css'

// Hally: the two moments the app asks about pain.
//
//   PainStep      on the finish screen: how much it hurt during the session, where, and a note.
//   PainFollowUp  when the next session opens: was it worse the day after?
//
// Both write onto the saved workout through lib/hally-pain.js, which holds the rules and the
// tests. Nothing here decides anything.

const SCALE = Array.from({ length: PAIN_MAX + 1 }, (_, n) => n)
const tone = n => (n > 6 ? ' high' : n > PAIN_OK_MAX ? ' mid' : '')

// The rule, in the words of whoever the client would turn to: their trainer if they have one.
export function painRule(withTrainer) {
  return withTrainer
    ? t('Up to 3/10 during the session, and no worse the next day, is fine. Past that, tell your trainer.')
    : t('Up to 3/10 during the session, and no worse the next day, is fine. Past that, ease off and see a professional.')
}

/**
 * The pain step of the finish screen. The workout is already saved when this shows, so every
 * answer goes straight onto its record: the number at the tap, the two texts when the field is
 * left (and when the screen closes with one still focused).
 */
export function PainStep({ w }) {
  const rec = useStore(s => (Array.isArray(s.S.workouts) ? s.S.workouts.find(x => x && sameWorkout(x, w)) : null))
  const update = useStore(s => s.update)
  const withTrainer = useHally(s => hasTrainer(s.me))
  const saved = workoutPain(rec)
  const [during, setDuring] = useState(saved ? saved.during : null)
  const [area, setArea] = useState(saved?.area || '')
  const [note, setNote] = useState(saved?.note || '')
  // What the fields hold right now, for the write on unmount: its closure is the first render's.
  const live = useRef({ during, area, note })
  live.current = { during, area, note }

  const write = (n, a, x) => {
    const pain = n == null ? null : { during: n, ...(n > 0 ? { area: a, note: x } : {}) }
    // Only a real change reaches the store: every update is a save and a sync.
    if (painChanges(useStore.getState().S, w, pain)) update(s => { setWorkoutPain(s, w, pain) })
  }
  const pick = n => {
    // A second tap on the chosen number takes the answer back.
    const next = during === n ? null : n
    setDuring(next)
    write(next, area, note)
  }
  const commit = () => write(during, area, note)
  useEffect(() => () => { const now = live.current; if (now.during != null) write(now.during, now.area, now.note) }, [])
  if (!rec) return null

  return <div className="hally-step">
    <h4 className="sec">{t('Did anything hurt?')}</h4>
    <div className="hally-scale" role="radiogroup" aria-label={t('Pain during the session, from 0 to 10')}>
      {SCALE.map(n => <button key={n} type="button" role="radio" aria-checked={during === n}
        className={during === n ? 'on' + tone(n) : ''} onClick={() => pick(n)}>{n}</button>)}
    </div>
    <div className="small dim">{t('0 is nothing, 10 is the worst pain you can imagine.')}</div>
    {during > 0 && <>
      <TextField value={area} maxLength={PAIN_AREA_MAX} placeholder={t('Where? For example: right knee')} aria-label={t('Where it hurt')}
        onChange={e => setArea(e.target.value)} onBlur={commit} />
      <TextArea rows={2} value={note} maxLength={PAIN_NOTE_MAX} placeholder={t('How was it? (optional)')} aria-label={t('About the pain')}
        onChange={e => setNote(e.target.value)} onBlur={commit} />
    </>}
    {during > PAIN_OK_MAX && <p className="hally-rule tell" role="status">{withTrainer
      ? t('That is more than 3/10: tell your trainer.')
      : t('That is more than 3/10: ease off and see a professional.')}</p>}
    <p className="hally-rule">{painRule(withTrainer)}</p>
  </div>
}

/**
 * On the workout screen while a session runs: if the one before hurt, asks once whether it was
 * worse the day after. Not a sheet over the session being started, which has its own sheets and
 * its own navigation: a card at the top that goes away with the answer.
 */
export function PainFollowUp() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const withTrainer = useHally(s => hasTrainer(s.me))
  const [said, setSaid] = useState(null)      // 'worse' | 'fine' once answered, until dismissed
  const last = said ? null : painFollowUp(S, todayISO())
  const toast = useUI(s => s.toast)

  if (said === 'worse') return <div className="card hally-followup" role="status">
    <div style={{ fontWeight: 600 }}>{withTrainer
      ? t('Noted. Worse the next day is past what is expected: tell your trainer before you load the same today.')
      : t('Noted. Worse the next day is past what is expected: go lighter today and see a professional if it keeps up.')}</div>
    <div className="row"><Button size="sm" onClick={() => setSaid('fine')}>{t('Got it')}</Button></div>
  </div>
  if (!last) return null

  const pain = workoutPain(last)
  const answer = worse => {
    update(s => { setWorseNextDay(s, last, worse) })
    if (worse) setSaid('worse')
    else { setSaid('fine'); toast(t('Noted. That is within what is expected.')) }
  }
  const when = fmtDate(last.d, true)
  return <div className="card hally-followup" role="group" aria-label={t('Was it worse the next day?')}>
    <div style={{ fontWeight: 600 }}>{t('Was it worse the next day?')}</div>
    <div className="small muted" style={{ marginTop: 4 }}>{pain.area
      ? t('In your session on {0} you reported pain {1}/10 in: {2}.', when, pain.during, pain.area)
      : t('In your session on {0} you reported pain {1}/10.', when, pain.during)}</div>
    <div className="row">
      <Button size="sm" onClick={() => answer(false)}>{t('No, same or better')}</Button>
      <Button size="sm" onClick={() => answer(true)}>{t('Yes, it got worse')}</Button>
    </div>
  </div>
}

/**
 * The note for the trainer, once more on the finish screen: the session is over, which is when
 * there is something to say. It is the session note (it may already hold what was typed during
 * the workout). Only for a client with a trainer; anyone else keeps upstream's note as it is.
 */
export function NoteStep({ w }) {
  const rec = useStore(s => (Array.isArray(s.S.workouts) ? s.S.workouts.find(x => x && sameWorkout(x, w)) : null))
  const me = useHally(s => s.me)
  const words = noteWords(me)
  const [note, setNote] = useState(typeof rec?.note === 'string' ? rec.note : '')
  const live = useRef(note)
  live.current = note
  const write = text => { if (noteChanges(useStore.getState().S, w, text)) useStore.getState().update(s => { setWorkoutNote(s, w, text) }) }
  useEffect(() => () => write(live.current), [])
  if (!rec || !words.forTrainer) return null
  return <div className="hally-step">
    <h4 className="sec">{words.title}</h4>
    <TextArea rows={3} value={note} maxLength={NOTE_MAX} placeholder={words.placeholder} aria-label={words.title}
      onChange={e => setNote(e.target.value)} onBlur={() => write(note)} />
    <div className="small dim" style={{ marginTop: 6 }}>{t('{0} reads this when they review your session.', me.coach.name)}</div>
  </div>
}

/** What sheets.jsx mounts on the finish screen. One component, so it is one line there. */
export default function HallyFinishStep({ w }) {
  return <>
    <PainStep w={w} />
    <NoteStep w={w} />
  </>
}
