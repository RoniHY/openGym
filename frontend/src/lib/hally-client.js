// Hally: one client, as their trainer reads them.
//
// GET /api/trainer/client answers the client's own document through the admin's sanitising
// (api/trainer.js): sessions newest first, body weight, whole routines, the plan, and their own
// exercises by name. This file turns that into what the detail screen draws, with the helpers the
// client's own screens use for the same lines (setLabel, exLine, sessionSections), so a set reads
// to the trainer exactly as it reads to the client.
//
// Read-only, and tolerant: a document written before the server validated entries still opens.
import { EXIDX } from './exercises.js'
import { exerciseNameFor } from './i18n-core.js'
import { setLabel, exLine, sessionSections, workoutVolume, setsDone } from './history.js'
import { hasCompletedWork } from './workout-model.js'
import { speedUnitOf } from './speed.js'
import { painOf, painVerdict } from './hally-pain.js'
import { planState, clientWeek, daysBetween } from './hally-trainer.js'
import { weekOrder, weekStartOf, todayISO } from './format.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const records = v => (Array.isArray(v) ? v.filter(isMap) : [])
const text = v => (typeof v === 'string' ? v.trim() : '')
const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

/**
 * id → the name to show. The client's own exercises first (they exist only in their document,
 * and reach the trainer as `customEx`), then the catalogue, then the id itself.
 */
export function nameResolver(customEx) {
  const own = new Map(records(customEx).filter(x => x.id != null).map(x => [String(x.id), text(x.n) || text(x.name)]))
  return id => own.get(String(id)) || (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : String(id ?? ''))
}

/** A session the screen can walk: entries is a list and every entry has a list of sets. */
const walkable = w => isMap(w) && Array.isArray(w.entries) && w.entries.every(e => isMap(e) && Array.isArray(e.sets))

/**
 * One session:
 *   exercises  [{ key, name, line, note, superset }] in the order done. `line` is the sets as the
 *              client's history shows them, effort included: "60×8 (RIR 2)  ·  60×7 (RIR 1)"
 *   note       the session note (the note for the trainer), `unread` when not read yet
 *   pain       the pain record with its `verdict`, or null
 */
export function sessionView(saved, { unit = 'kg', speedUnit, nameOf = nameResolver(), unread = [] } = {}) {
  // A row that is not one (a null in a list written before the server filtered them) is dropped
  // here, once: the app's own helpers below read a set without asking what it is.
  const w = { ...saved, entries: saved.entries.map(e => ({ ...e, sets: e.sets.filter(isMap) })) }
  const exercises = []
  for (const section of sessionSections(w.entries)) {
    for (const unitIdx of section.units) {
      for (const i of unitIdx) {
        const e = w.entries[i]
        const done = e.sets.filter(hasCompletedWork)
        exercises.push({
          key: i,
          name: nameOf(e.id),
          line: done.map(s => setLabel(e.id, s, isMap(e.target) ? e.target : undefined, speedUnit)).join('  ·  '),
          note: text(e.note),
          superset: unitIdx.length > 1,
        })
      }
    }
  }
  const pain = painOf(w.pain)
  const start = Number(w.start) || 0, end = Number(w.end) || start
  return {
    id: w.id,
    name: text(w.name),
    d: isIso(w.d) ? w.d : null,
    durMs: Math.max(0, end - start),
    vol: Number.isFinite(Number(w.vol)) ? Number(w.vol) : workoutVolume(w),
    sets: setsDone(w),
    prs: Array.isArray(w.prs) ? w.prs.length : 0,
    bw: Number(w.bw) > 0 ? Number(w.bw) : null,
    unit,
    note: text(w.note),
    unread: !!text(w.note) && unread.map(String).includes(String(w.id)),
    pain: pain ? { ...pain, verdict: painVerdict(pain) } : null,
    exercises,
  }
}

/**
 * A routine as planned: its exercises with what each asks for ("3 × 8–12 · 60 kg"), the rest
 * between sets, the note, and whether it is part of a superset.
 */
export function routineView(r, { unit = 'kg', speedUnit, nameOf = nameResolver() } = {}) {
  const ex = records(r?.ex).filter(e => e.id != null)
  return {
    id: r?.id,
    name: text(r?.name) || '?',
    emoji: text(r?.emoji),
    exercises: ex.map((e, i) => ({
      key: i,
      name: nameOf(e.id),
      line: exLine(e, unit, speedUnit),
      restSec: Number(e.restSec) > 0 ? Number(e.restSec) : null,
      note: text(e.note),
      superset: !!e.sg && (ex[i - 1]?.sg === e.sg || ex[i + 1]?.sg === e.sg),
    })),
  }
}

/** The days of the client's week that hold a plan: `[{ day: 0–6, routines: [names] }]`, in their week order. */
export function weekPlan(plan, routines) {
  const p = planState({ ...(isMap(plan) ? plan : {}), routines })
  const nameOf = id => p.routines.find(r => r.id === id)?.name
  return weekOrder(weekStartOf(p))
    .map(day => ({ day, routines: [].concat(p.week[day] || []).map(nameOf).filter(Boolean) }))
    .filter(d => d.routines.length)
}

/** Weigh-ins newest first, with the change since the first one on record. */
export function bodyweightView(list) {
  const entries = records(list).filter(e => isIso(e.d) && Number(e.w) > 0)
    .map(e => ({ d: e.d, w: Number(e.w) }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
  const latest = entries[0] || null
  const first = entries[entries.length - 1] || null
  return {
    entries,
    latest,
    change: latest && first && first !== latest ? Math.round((latest.w - first.w) * 10) / 10 : null,
    since: first && first !== latest ? first.d : null,
  }
}

/** Everything the detail screen draws, from one answer of GET /api/trainer/client. */
export function clientView(detail, today = todayISO()) {
  const d = isMap(detail) ? detail : {}
  const unit = d.unit === 'lb' ? 'lb' : 'kg'
  const speedUnit = speedUnitOf({ unit })
  const nameOf = nameResolver(d.customEx)
  const unread = Array.isArray(d.unread) ? d.unread : []
  const opts = { unit, speedUnit, nameOf, unread }
  const sessions = (Array.isArray(d.workouts) ? d.workouts : []).filter(walkable).map(w => sessionView(w, opts))
  const routines = records(d.routines).map(r => routineView(r, opts))
  const lastPain = sessions.find(s => s.pain) || null
  return {
    user: isMap(d.user) ? { id: text(d.user.id), name: text(d.user.name) || '?', disabled: d.user.disabled === true } : { id: '', name: '?', disabled: false },
    since: typeof d.since === 'string' ? d.since : null,
    lastSync: Number(d.lastSync) || null,
    live: isMap(d.live) ? d.live : null,
    unit,
    effort: text(d.effort) || 'none',
    sessions,
    unread: sessions.filter(s => s.unread).map(s => s.id),
    routines,
    week: clientWeek({ ...(isMap(d.plan) ? d.plan : {}), routines: d.routines, workouts: d.workouts }, today),
    weekPlan: weekPlan(d.plan, d.routines),
    bodyweight: bodyweightView(d.bodyweight),
    lastPain: lastPain ? { ...lastPain.pain, d: lastPain.d, daysAgo: daysBetween(lastPain.d, today) } : null,
  }
}
