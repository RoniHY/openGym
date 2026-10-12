// Hally: who trains whom, as the app sees it.
//
// The server holds the role and the link (api/trainer.js); GET /api/trainer/me answers both for
// the profile signed in. This file is the reading of that answer and the calls a screen makes,
// with no React and no store in it, so it can be tested as it is. The store that keeps the
// answer is store/useHally.js.
import { api } from './api.js'

/** What a profile is before the server has said anything: nobody's trainer, nobody's client. */
export const NOBODY = Object.freeze({ trainer: false, clients: 0, coach: null })

/**
 * GET /api/trainer/me as the app uses it. Anything that is not the answer (an older server's 404
 * page, a proxy's JSON) reads as NOBODY, so a profile is never shown as a trainer by accident.
 */
export function normalizeMe(answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return NOBODY
  const c = answer.coach
  const coach = c && typeof c === 'object' && typeof c.id === 'string' && c.id
    ? { id: c.id, name: typeof c.name === 'string' && c.name ? c.name : '', since: typeof c.since === 'string' ? c.since : null }
    : null
  const clients = Number.isInteger(answer.clients) && answer.clients > 0 ? answer.clients : 0
  return { trainer: answer.trainer === true, clients, coach }
}

export const hasTrainer = me => !!me?.coach
export const isTrainer = me => me?.trainer === true

// What is kept between visits, so the note is still "for your trainer" in a gym without signal.
// One profile's answer never reads as another's: the key carries the profile it was given to.
const CACHE_KEY = 'hally_me_v1'
export function readCachedMe(uid, storage = globalThis.localStorage) {
  try {
    const kept = JSON.parse(storage.getItem(CACHE_KEY) || 'null')
    return kept && kept.uid === uid ? normalizeMe(kept.me) : null
  } catch { return null }
}
export function writeCachedMe(uid, me, storage = globalThis.localStorage) {
  try {
    if (uid) storage.setItem(CACHE_KEY, JSON.stringify({ uid, me: normalizeMe(me) }))
    else storage.removeItem(CACHE_KEY)
  } catch { /* private mode, a full disk: the next visit asks again */ }
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })

export const fetchMe = () => api('/api/trainer/me').then(normalizeMe)
export const fetchClients = () => api('/api/trainer/clients')
export const fetchClient = id => api('/api/trainer/client?id=' + encodeURIComponent(id))
export const markSeen = (clientId, ids) => post('/api/trainer/seen', ids ? { clientId, ids } : { clientId })
/** Ends a link: a trainer names the client, a client leaving their trainer names nobody. */
export const unlink = clientId => post('/api/trainer/unlink', clientId ? { clientId } : {})
export const joinTrainer = code => post('/api/trainer/join', { code })
export const fetchInvites = () => api('/api/trainer/invites')
export const newInvite = note => post('/api/trainer/invites/new', { note: note || '' })
export const revokeInvite = code => post('/api/trainer/invites/revoke', { code })
export const fetchRole = id => api('/api/trainer/role?id=' + encodeURIComponent(id))
export const setRole = (id, trainer) => post('/api/trainer/role', { id, trainer: !!trainer })
