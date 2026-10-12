import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [])
vi.mock('./api.js', () => ({ api: (path, opts) => { calls.push([path, opts]); return Promise.resolve({ trainer: true, clients: 2, coach: null }) } }))

import {
  NOBODY, normalizeMe, hasTrainer, isTrainer, readCachedMe, writeCachedMe,
  fetchMe, fetchClient, markSeen, unlink, joinTrainer, newInvite, setRole,
} from './hally-coaching.js'

const storage = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}

describe('normalizeMe', () => {
  it('reads the server answer', () => {
    expect(normalizeMe({ trainer: true, clients: 3, coach: null })).toEqual({ trainer: true, clients: 3, coach: null })
    expect(normalizeMe({ trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro', since: '2026-10-12T10:00:00.000Z' } }))
      .toEqual({ trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro', since: '2026-10-12T10:00:00.000Z' } })
  })

  it('reads anything else as nobody, so no profile is a trainer by accident', () => {
    for (const x of [null, undefined, 'ok', 7, [], {}, { trainer: 'yes' }, { trainer: 1, clients: -2, coach: 'Pedro' }, { coach: { name: 'sin id' } }]) {
      expect(normalizeMe(x)).toEqual(NOBODY)
    }
  })

  it('says who has a trainer and who is one', () => {
    expect(hasTrainer(normalizeMe({ coach: { id: 'p', name: 'Pedro' } }))).toBe(true)
    expect(hasTrainer(NOBODY)).toBe(false)
    expect(hasTrainer(null)).toBe(false)
    expect(isTrainer(normalizeMe({ trainer: true }))).toBe(true)
    expect(isTrainer(NOBODY)).toBe(false)
  })
})

describe('the answer kept between visits', () => {
  it('comes back for the profile it was given to, and for no other', () => {
    const s = storage()
    writeCachedMe('ana', { trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro' } }, s)
    expect(readCachedMe('ana', s).coach.name).toBe('Pedro')
    expect(readCachedMe('beto', s)).toBe(null)
  })

  it('is dropped on sign-out and survives a storage that throws or holds rubbish', () => {
    const s = storage()
    writeCachedMe('ana', { trainer: true }, s)
    writeCachedMe(null, null, s)
    expect(readCachedMe('ana', s)).toBe(null)
    s.setItem('hally_me_v1', '{ not json')
    expect(readCachedMe('ana', s)).toBe(null)
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') }, removeItem: () => {} }
    expect(readCachedMe('ana', broken)).toBe(null)
    expect(() => writeCachedMe('ana', NOBODY, broken)).not.toThrow()
  })
})

describe('the calls', () => {
  it('go to the trainer routes with the body each one expects', async () => {
    calls.length = 0
    expect(await fetchMe()).toEqual({ trainer: true, clients: 2, coach: null })
    await fetchClient('a b/c')
    await markSeen('ana')
    await markSeen('ana', ['w1'])
    await unlink()
    await unlink('ana')
    await joinTrainer('ABC')
    await newInvite()
    await setRole('ana', 1)
    expect(calls.map(([p, o]) => [p, o?.method, o?.body])).toEqual([
      ['/api/trainer/me', undefined, undefined],
      ['/api/trainer/client?id=a%20b%2Fc', undefined, undefined],
      ['/api/trainer/seen', 'POST', '{"clientId":"ana"}'],
      ['/api/trainer/seen', 'POST', '{"clientId":"ana","ids":["w1"]}'],
      ['/api/trainer/unlink', 'POST', '{}'],
      ['/api/trainer/unlink', 'POST', '{"clientId":"ana"}'],
      ['/api/trainer/join', 'POST', '{"code":"ABC"}'],
      ['/api/trainer/invites/new', 'POST', '{"note":""}'],
      ['/api/trainer/role', 'POST', '{"id":"ana","trainer":true}'],
    ])
  })
})
