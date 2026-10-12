// @vitest-environment happy-dom
// Hally: one client, read-only. The reading of the answer is tested in lib/hally-client.test.js;
// this is that the screen draws it, marks notes as read, and lets the client go.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ answers: {}, gets: [], posts: [], nav: [], toasts: [], confirms: [], id: 'ana' }))
vi.mock('../lib/api.js', () => ({
  api: (path, opts) => {
    const key = path.split('?')[0]
    if (opts?.method === 'POST') mocks.posts.push([key, JSON.parse(opts.body)]); else mocks.gets.push(path)
    const a = mocks.answers[key]
    return a === undefined ? Promise.reject(new Error('not found')) : a instanceof Error ? Promise.reject(a) : Promise.resolve(typeof a === 'function' ? a() : a)
  }
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: { id: 'pedro', name: 'Pedro' }, S: {} })
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
  useParams: () => ({ id: mocks.id }),
  Navigate: ({ to }) => <div data-testid="redirect">{to}</div>,
}))
vi.mock('../sheets.jsx', () => ({ confirmSheet: opts => mocks.confirms.push(opts) }))
vi.mock('../components/LineChart.jsx', () => ({ default: ({ points }) => <div data-testid="chart">{points.length}</div> }))
vi.mock('../lib/format.js', async orig => ({ ...(await orig()), todayISO: () => '2026-10-14' }))

import { useHally } from '../store/useHally.js'
import { EXIDX } from '../lib/exercises.js'
import TrainerClient from './TrainerClient.jsx'

const BENCH = '0025'
const TRAINER = { trainer: true, clients: 1, coach: null }
const session = (id, d, extra = {}) => ({
  id, d, start: Date.parse(d + 'T16:00:00Z'), end: Date.parse(d + 'T17:00:00Z'), name: 'Torso', routineIds: ['r1'],
  entries: [{ id: BENCH, target: { sets: 2, reps: 8, weight: 60, mode: 'reps' }, sets: [{ w: 60, r: 8, done: true, rir: 2 }, { w: 60, r: 7, done: true, rir: 1 }] }],
  prs: [], ...extra,
})
const detail = () => ({
  user: { id: 'ana', name: 'Ana', created: '2026-10-01T00:00:00.000Z', disabled: false },
  since: '2026-10-01T00:00:00.000Z', unit: 'kg', effort: 'rir', lastSync: Date.now() - 3600000, live: null,
  routines: [{ id: 'r1', name: 'Torso', ex: [{ id: BENCH, sets: 3, reps: 12, repsMin: 8, weight: 60, mode: 'reps', restSec: 120, note: 'pausa abajo' }] }],
  plan: { weekStart: 1, week: { 1: ['r1'], 4: ['r1'] }, queue: null },
  customEx: [],
  bodyweight: [{ d: '2026-10-01', w: 63, t: 1 }, { d: '2026-10-12', w: 62.4, t: 2 }],
  workouts: [
    session('w2', '2026-10-13', { note: 'Me costó el press', pain: { during: 4, area: 'hombro', note: 'al bajar' } }),
    session('w1', '2026-10-12', { note: 'Todo bien', pain: { during: 0 } }),
  ],
  unread: ['w2'],
})

let host, root
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
async function mount() {
  act(() => root.render(<TrainerClient />))
  await settle(); await settle()
}
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)
const cards = () => [...host.querySelectorAll('.card')]

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  for (const k of ['gets', 'posts', 'nav', 'toasts', 'confirms']) mocks[k].length = 0
  mocks.id = 'ana'
  mocks.answers = { '/api/trainer/me': TRAINER, '/api/trainer/client': detail() }
  useHally.setState({ me: TRAINER, uid: 'pedro', loaded: true })
})
afterEach(() => { act(() => root.unmount()) })

describe('a client, as their trainer reads them', () => {
  it('asks the server for that client and says it is read-only', async () => {
    await mount()
    expect(mocks.gets).toContain('/api/trainer/client?id=ana')
    expect(host.querySelector('h1').textContent).toBe('Ana')
    expect(host.textContent).toContain('Read-only: you see what Ana logs, and cannot change it.')
    // Nothing on the screen edits the client's data: no input, no field.
    expect(host.querySelector('input, textarea, select')).toBe(null)
  })

  it('sums the client up: sessions, the week against the plan, weight, last pain', async () => {
    await mount()
    const tiles = [...host.querySelectorAll('.tile')].map(x => [x.querySelector('.l').textContent, x.querySelector('.v').textContent])
    expect(tiles).toEqual([['Sessions logged', '2'], ['This week', '2/2'], ['Body weight', '62.4 kg'], ['Last pain', '4/10']])
  })

  it('shows each session with its sets and effort, its note and its pain', async () => {
    await mount()
    const w2 = cards().find(c => c.textContent.includes('Me costó el press'))
    expect(w2.textContent).toContain(EXIDX[BENCH].n)
    expect(w2.querySelector('.hally-sets').textContent).toBe('60×8 (RIR 2)  ·  60×7 (RIR 1)')
    expect([...w2.querySelectorAll('.hally-pill')].map(p => p.textContent)).toEqual(['Pain 4/10 · hombro', 'Next day: not answered yet'])
    expect(w2.querySelector('.hally-pill.tell')).not.toBe(null)
    expect(w2.textContent).toContain('al bajar')
    expect(w2.querySelector('.hally-note.unread').textContent).toContain('Note for you · new')
    const w1 = cards().find(c => c.textContent.includes('Todo bien'))
    expect([...w1.querySelectorAll('.hally-pill')].map(p => p.textContent)).toEqual(['No pain'])
    expect(w1.querySelector('.hally-note.unread')).toBe(null)
  })

  it('marks one note as read, and all of them', async () => {
    await mount()
    expect(host.textContent).toContain('1 unread note')
    mocks.answers['/api/trainer/seen'] = { ok: true, unread: [] }
    act(() => button('Mark as read').click())
    await settle()
    expect(mocks.posts).toEqual([['/api/trainer/seen', { clientId: 'ana', ids: ['w2'] }]])
    expect(host.querySelector('.hally-note.unread')).toBe(null)
    expect(host.textContent).not.toContain('unread note')

    mocks.posts.length = 0
    mocks.answers['/api/trainer/client'] = { ...detail(), unread: ['w1', 'w2'] }
    act(() => host.querySelector('button[aria-label="Refresh the list"]').click())
    await settle()
    expect(host.textContent).toContain('2 unread notes')
    act(() => button('Mark all as read').click())
    await settle()
    expect(mocks.posts).toEqual([['/api/trainer/seen', { clientId: 'ana' }]])
    expect(mocks.toasts).toEqual(['Notes marked as read'])
  })

  it('shows the routines whole, with what each exercise asks for, and the week they sit in', async () => {
    await mount()
    act(() => button('Routines').click())
    expect(host.textContent).toContain('Week plan')
    expect(host.textContent).toContain('Monday')
    expect(host.textContent).toContain('Thursday')
    const routine = cards().find(c => c.querySelector('.hally-sets'))
    expect(routine.textContent).toContain('Torso')
    expect(routine.querySelector('.hally-ex-n').textContent).toBe(EXIDX[BENCH].n)
    expect(routine.querySelector('.hally-sets').textContent).toBe('3 × 8–12 · 60 kg · rest 2:00')
    expect(routine.textContent).toContain('pausa abajo')
  })

  it('shows the body weight with its change', async () => {
    await mount()
    act(() => button('Body weight').click())
    expect(host.querySelector('[data-testid="chart"]').textContent).toBe('2')
    expect(host.textContent).toContain('-0.6 kg since')
    expect(host.textContent).toContain('62.4 kg')
    expect(host.textContent).toContain('63 kg')
  })

  it('lets the client go only after asking, then goes back to the list', async () => {
    await mount()
    act(() => button('Stop training Ana').click())
    expect(mocks.posts).toEqual([])
    expect(mocks.confirms[0].title).toBe('Stop training Ana?')
    mocks.answers['/api/trainer/unlink'] = { ok: true }
    await act(async () => { await mocks.confirms[0].onConfirm() })
    expect(mocks.posts).toEqual([['/api/trainer/unlink', { clientId: 'ana' }]])
    expect(mocks.nav).toEqual(['/entrenador'])
    expect(mocks.toasts).toEqual(['Ana is no longer your client'])
  })

  it('says so when the profile is not their client, and shows nothing of it', async () => {
    mocks.answers['/api/trainer/client'] = Object.assign(new Error('forbidden'), { status: 403 })
    await mount()
    expect(host.querySelector('[role="alert"]').textContent).toContain('This profile is not one of your clients.')
    expect(host.querySelector('[role="alert"]').textContent).not.toContain('forbidden')
    act(() => button('Back to my clients').click())
    expect(mocks.nav).toEqual(['/entrenador'])
  })

  it('offers to try again when the load fails for another reason', async () => {
    mocks.answers['/api/trainer/client'] = new Error('The server did not answer in time.')
    await mount()
    expect(host.querySelector('[role="alert"]').textContent).toContain('The server did not answer in time.')
    mocks.answers['/api/trainer/client'] = detail()
    act(() => button('Try again').click())
    await settle()
    expect(host.querySelector('h1').textContent).toBe('Ana')
  })

  it('sends anyone who is not a trainer home', async () => {
    mocks.answers['/api/trainer/me'] = { trainer: false, clients: 0, coach: null }
    useHally.setState({ me: { trainer: false, clients: 0, coach: null }, loaded: true })
    await mount()
    expect(host.querySelector('[data-testid="redirect"]').textContent).toBe('/home')
    expect(mocks.gets.some(p => p.startsWith('/api/trainer/client'))).toBe(false)
  })

  it('opens on a client with nothing logged', async () => {
    mocks.answers['/api/trainer/client'] = { user: { id: 'ana', name: 'Ana' }, unit: 'kg', routines: [], bodyweight: [], workouts: [], unread: [], plan: {}, customEx: [] }
    await mount()
    expect(host.textContent).toContain('No sessions logged yet.')
    act(() => button('Routines').click())
    expect(host.textContent).toContain('No routines yet.')
    act(() => button('Body weight').click())
    expect(host.textContent).toContain('No weigh-ins yet.')
  })
})
