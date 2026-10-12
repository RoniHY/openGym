// @vitest-environment happy-dom
// Hally: "My clients". The reading of each row is tested in lib/hally-trainer.test.js; this is
// that the screen opens for a trainer and nobody else, and draws what the server answered.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ answers: {}, posts: [], nav: [], toasts: [], confirms: [] }))
vi.mock('../lib/api.js', () => ({
  api: (path, opts) => {
    const key = path.split('?')[0]
    if (opts?.method === 'POST') mocks.posts.push([key, JSON.parse(opts.body)])
    const a = mocks.answers[key]
    return a === undefined ? Promise.reject(new Error('not found')) : a instanceof Error ? Promise.reject(a) : Promise.resolve(typeof a === 'function' ? a() : a)
  }
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: { id: 'pedro', name: 'Pedro', admin: true }, S: {} })
  const useStore = selector => (selector ? selector(snap()) : snap())
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: m => mocks.toasts.push(m), openSheet: () => {} })
  const useUI = selector => (selector ? selector(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({
  useNavigate: () => to => mocks.nav.push(to),
  Navigate: ({ to }) => <div data-testid="redirect">{to}</div>,
}))
vi.mock('../sheets.jsx', () => ({ confirmSheet: opts => mocks.confirms.push(opts) }))
vi.mock('../lib/format.js', async orig => ({ ...(await orig()), todayISO: () => '2026-10-14' }))

import { useHally } from '../store/useHally.js'
import Trainer from './Trainer.jsx'

const TRAINER = { trainer: true, clients: 2, coach: null }
const plan = { weekStart: 1, week: { 1: ['r1'], 3: ['r1'], 5: ['r1'] }, queue: null, routines: [{ id: 'r1', name: 'Pierna' }], workouts: [{ id: 'w1', d: '2026-10-12', start: 1, end: 2, name: 'Pierna', routineIds: ['r1'] }] }
const clients = () => ({
  now: 1, invite_only: true,
  clients: [
    { id: 'ana', name: 'Ana', workouts: 4, lastWorkout: { id: 'w1', d: '2026-10-12', name: 'Pierna', end: 2 }, lastPain: { during: 5, area: 'rodilla', d: '2026-10-12', workoutId: 'w1' }, unreadNotes: 1, live: null, plan },
    { id: 'beto', name: 'Beto', workouts: 0, lastWorkout: null, lastPain: null, unreadNotes: 0, live: { name: 'Torso', setsDone: 3, setsTotal: 12 }, plan: { ...plan, workouts: [] } },
  ],
})

let host, root
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
async function mount() {
  act(() => root.render(<Trainer />))
  await settle(); await settle()
}
const rows = () => [...host.querySelectorAll('.list > .item')]

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  for (const k of ['posts', 'nav', 'toasts', 'confirms']) mocks[k].length = 0
  mocks.answers = { '/api/trainer/me': TRAINER, '/api/trainer/clients': clients(), '/api/trainer/invites': { invites: [], invite_only: true } }
  useHally.setState({ me: TRAINER, uid: 'pedro', loaded: true })
})
afterEach(() => { act(() => root.unmount()) })

describe('My clients', () => {
  it('sends anyone who is not a trainer home, once the server has said so', async () => {
    mocks.answers['/api/trainer/me'] = { trainer: false, clients: 0, coach: null }
    useHally.setState({ me: { trainer: false, clients: 0, coach: null }, loaded: false })
    await mount()
    expect(host.querySelector('[data-testid="redirect"]').textContent).toBe('/home')
    expect(rows()).toHaveLength(0)
  })

  it('lists each client with their last session, week, pain, unread note and whether they train now', async () => {
    await mount()
    expect(host.querySelector('h1').textContent).toBe('My clients')
    expect(host.querySelector('.hdr .sub').textContent).toBe('2 clients · 1 training now')
    const [ana, beto] = rows()
    // Ana first: an unread note and pain past the rule both ask for a look.
    expect(ana.querySelector('.tt').textContent).toBe('Ana')
    expect(ana.querySelector('.ss').textContent).toContain('Last session')
    expect(ana.querySelector('.ss').textContent).toContain('Pierna')
    expect([...ana.querySelectorAll('.hally-pill')].map(p => p.textContent)).toEqual([
      'Week 1/3', expect.stringMatching(/^Pain 5\/10 · rodilla · /), '1 unread note',
    ])
    expect(ana.querySelector('.hally-pill.tell')).not.toBe(null)
    expect(beto.querySelector('.ss').textContent).toBe('Training now · Torso · 3/12 sets')
    expect([...beto.querySelectorAll('.hally-pill')].map(p => p.textContent)).toEqual(['Week 0/3'])
  })

  it('opens a client on a tap', async () => {
    await mount()
    act(() => rows()[0].click())
    expect(mocks.nav).toEqual(['/entrenador/c/ana'])
  })

  it('says so when there are no clients yet, and still offers a code', async () => {
    mocks.answers['/api/trainer/clients'] = { clients: [], now: 1 }
    await mount()
    expect(host.textContent).toContain('No clients yet')
    expect(host.textContent).toContain('Invite a client')
  })

  it('says why when the list cannot load, without leaving "Loading…" up for good', async () => {
    mocks.answers['/api/trainer/clients'] = new Error('The server did not answer in time.')
    await mount()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Could not load your clients')
    expect(host.querySelector('[role="alert"]').textContent).toContain('The server did not answer in time.')
    mocks.answers['/api/trainer/clients'] = { not: 'a list' }
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Try again').click())
    await settle()
    expect(host.querySelector('[role="alert"]').textContent).toContain('The server answered without a list of clients.')
  })

  it('makes an invite code with a note and copies it', async () => {
    const copied = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: c => { copied.push(c); return Promise.resolve() } } })
    mocks.answers['/api/trainer/invites/new'] = { invite: { code: 'ABCD1234ABCD1234', note: 'Alery', trainerId: 'pedro' } }
    await mount()
    const field = host.querySelector('input')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ' Alery ')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mocks.answers['/api/trainer/invites'] = { invites: [{ code: 'ABCD1234ABCD1234', note: 'Alery', usedBy: null }] }
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'New code').click())
    await settle(); await settle()
    expect(mocks.posts).toEqual([['/api/trainer/invites/new', { note: 'Alery' }]])
    expect(copied).toEqual(['ABCD1234ABCD1234'])
    expect(host.querySelector('.hally-code').textContent).toBe('ABCD1234ABCD1234')
    expect(mocks.toasts).toEqual(['Code copied: ABCD1234ABCD1234'])
  })

  it('shows who used a code, and asks before cancelling an unused one', async () => {
    mocks.answers['/api/trainer/invites'] = { invites: [
      { code: 'USED000000000000', note: '', usedBy: 'ana', usedByName: 'Ana' },
      { code: 'OPEN000000000000', note: 'Para Beto', usedBy: null },
    ] }
    await mount()
    expect(host.textContent).toContain('USED000000000000→ Ana')
    act(() => host.querySelector('button[aria-label="Cancel code OPEN000000000000?"]').click())
    expect(mocks.confirms).toHaveLength(1)
    expect(mocks.confirms[0].title).toBe('Cancel code OPEN000000000000?')
    mocks.answers['/api/trainer/invites/revoke'] = { ok: true }
    await act(async () => { await mocks.confirms[0].onConfirm() })
    expect(mocks.posts).toEqual([['/api/trainer/invites/revoke', { code: 'OPEN000000000000' }]])
  })
})
