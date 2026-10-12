// Hally: what "My clients" says about each client.
//
// GET /api/trainer/clients answers one row per client (api/trainer.js clientRow): counts, the
// last session, the last pain record, unread notes, whether they train right now, and a slice of
// their plan. This file turns a row into what the screen shows. The week's count is the app's
// own weekTally (lib/queue.js) run on that slice, so "2 of 3 this week" is by the same rules the
// client reads on their Home, queue and rotation included.
//
// Pure, and tolerant of a row that is not one: the trainer's screen must open on whatever the
// server sent, like the admin's.
import { weekTally } from './queue.js'
import { painOf, painVerdict } from './hally-pain.js'
import { todayISO } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const records = v => (Array.isArray(v) ? v.filter(isMap) : [])
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

/** Whole calendar days from `fromIso` to `toIso` (noon to noon, so a DST night is not a day short). */
export function daysBetween(fromIso, toIso) {
  if (!isIso(fromIso) || !isIso(toIso)) return null
  const at = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((at(toIso) - at(fromIso)) / 86400000)
}

/** The plan slice of a row as a document weekTally can walk. */
export function planState(plan) {
  const p = isMap(plan) ? plan : {}
  return {
    workouts: records(p.workouts).filter(w => isIso(w.d)),
    routines: records(p.routines).filter(r => r.id != null),
    week: isMap(p.week) ? p.week : {},
    queue: isMap(p.queue) ? p.queue : null,
    weekStart: p.weekStart,
  }
}

/** Sessions done against sessions planned in the week `today` is in: `{ done, planned }`. */
export function clientWeek(plan, today = todayISO()) {
  try {
    const tally = weekTally(planState(plan), today)
    return { done: Math.max(0, Number(tally.done) || 0), planned: Math.max(0, Number(tally.planned) || 0) }
  } catch { return { done: 0, planned: 0 } }
}

/** How long a pain record keeps a client on top of the list. */
export const PAIN_RECENT_DAYS = 14

/**
 * One row as the screen shows it:
 *   last     { d, name, daysAgo } of the last session, or null
 *   week     { done, planned }
 *   pain     the last pain record with its date, `daysAgo` and its `verdict`
 *            ('none' | 'ok' | 'tell'), or null when no session says anything
 *   unread   session notes not read yet
 *   live     what they are doing right now, or null
 *   flags    why the trainer should look: 'unread', 'pain'
 */
export function clientSummary(row, today = todayISO()) {
  const r = isMap(row) ? row : {}
  const lw = isMap(r.lastWorkout) && isIso(r.lastWorkout.d) ? r.lastWorkout : null
  const rawPain = painOf(r.lastPain)
  const painDays = rawPain ? daysBetween(r.lastPain.d, today) : null
  const pain = rawPain ? { ...rawPain, d: isIso(r.lastPain.d) ? r.lastPain.d : null, daysAgo: painDays, verdict: painVerdict(rawPain) } : null
  const unread = Math.max(0, Math.floor(Number(r.unreadNotes) || 0))
  const flags = []
  if (unread > 0) flags.push('unread')
  if (pain?.verdict === 'tell' && (painDays == null || painDays <= PAIN_RECENT_DAYS)) flags.push('pain')
  return {
    id: typeof r.id === 'string' ? r.id : '',
    name: typeof r.name === 'string' && r.name ? r.name : '?',
    disabled: r.disabled === true,
    since: typeof r.since === 'string' ? r.since : null,
    sessions: Math.max(0, Math.floor(Number(r.workouts) || 0)),
    last: lw ? { d: lw.d, name: typeof lw.name === 'string' ? lw.name : '', daysAgo: daysBetween(lw.d, today) } : null,
    week: clientWeek(r.plan, today),
    pain,
    unread,
    live: isMap(r.live) ? r.live : null,
    flags,
  }
}

/**
 * The clients in the order to look at them: whoever needs a look first (an unread note, pain past
 * the rule), then whoever is training now, then by name.
 */
export function sortClients(summaries) {
  const rank = s => (s.flags.length ? 0 : s.live ? 1 : 2)
  return [...summaries].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Every row of an answer from GET /api/trainer/clients, summarised and ordered. */
export function clientList(answer, today = todayISO()) {
  return sortClients(records(answer?.clients).map(row => clientSummary(row, today)).filter(s => s.id))
}

/** The totals above the list. */
export function listTotals(summaries) {
  return {
    clients: summaries.length,
    live: summaries.filter(s => s.live).length,
    unread: summaries.reduce((n, s) => n + s.unread, 0),
    pain: summaries.filter(s => s.flags.includes('pain')).length,
  }
}
