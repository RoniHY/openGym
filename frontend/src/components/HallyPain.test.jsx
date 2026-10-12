// @vitest-environment happy-dom
// Hally: the pain step of the finish screen and the next-day question, mounted against a small
// store. What the rules decide is tested in lib/hally-pain.test.js; this is that the taps and
// the typing reach the saved workout.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ toasts: [], updates: 0 }))
vi.mock('../store/useStore.js', async () => {
  const { create } = await import('zustand')
  const useStore = create((set, get) => ({
    S: { workouts: [] },
    user: null,
    update: mut => { const S = JSON.parse(JSON.stringify(get().S)); mut(S); mocks.updates++; set({ S }) },
  }))
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: m => mocks.toasts.push(m) })
  const useUI = selector => (selector ? selector(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({ api: () => Promise.reject(new Error('offline')) }))
vi.mock('../lib/format.js', async orig => ({ ...(await orig()), todayISO: () => '2026-10-12' }))

import { useStore } from '../store/useStore.js'
import { useHally } from '../store/useHally.js'
import { NOBODY } from '../lib/hally-coaching.js'
import HallyFinishStep, { PainFollowUp } from './HallyPain.jsx'

const workout = (id, d, extra = {}) => ({ id, d, start: 1, end: 2, name: 'Pierna', entries: [{ id: '0025', sets: [{ done: true, w: 60, r: 8 }] }], ...extra })
const saved = id => useStore.getState().S.workouts.find(w => w.id === id)

let host, root
const mount = el => { act(() => root.render(el)) }
const radios = () => [...host.querySelectorAll('[role="radio"]')]
const tap = el => act(() => { el.click() })
function type(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const blur = el => act(() => { el.dispatchEvent(new Event('focusout', { bubbles: true })) })

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  mocks.toasts.length = 0
  mocks.updates = 0
  useHally.setState({ me: NOBODY, uid: null, loaded: false })
  useStore.setState({ S: { workouts: [workout('w1', '2026-10-12')] } })
})
afterEach(() => { act(() => root.unmount()) })

describe('the pain step of the finish screen', () => {
  it('offers 0 to 10 with nothing chosen, and shows the rule', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    expect(radios().map(b => b.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    expect(radios().some(b => b.getAttribute('aria-checked') === 'true')).toBe(false)
    expect(host.textContent).toContain('Up to 3/10 during the session, and no worse the next day, is fine.')
    expect('pain' in saved('w1')).toBe(false)
    expect(mocks.updates).toBe(0)
  })

  it('saves the number at the tap, and "nothing hurt" is an answer', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[0])
    expect(saved('w1').pain).toEqual({ during: 0 })
    expect(host.querySelector('input')).toBe(null)        // nothing hurt: nowhere to ask about
    tap(radios()[2])
    expect(saved('w1').pain).toEqual({ during: 2 })
    expect(radios()[2].getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector('.hally-rule.tell')).toBe(null)
  })

  it('asks where and how once it hurt, and saves each when the field is left', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[4])
    const area = host.querySelector('input'), note = host.querySelector('textarea')
    type(area, 'rodilla derecha'); blur(area)
    expect(saved('w1').pain).toEqual({ during: 4, area: 'rodilla derecha' })
    type(note, 'al bajar en la sentadilla'); blur(note)
    expect(saved('w1').pain).toEqual({ during: 4, area: 'rodilla derecha', note: 'al bajar en la sentadilla' })
    // Leaving a field without changing it is not a save.
    const before = mocks.updates
    blur(note)
    expect(mocks.updates).toBe(before)
  })

  it('says to tell the trainer past 3/10, in the words of someone who has one', () => {
    useHally.setState({ me: { trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro', since: null } } })
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[3])
    expect(host.querySelector('.hally-rule.tell')).toBe(null)
    tap(radios()[4])
    expect(host.querySelector('.hally-rule.tell').textContent).toBe('That is more than 3/10: tell your trainer.')
    expect(host.textContent).toContain('Past that, tell your trainer.')
  })

  it('points someone without a trainer to a professional instead', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[7])
    expect(host.querySelector('.hally-rule.tell').textContent).toBe('That is more than 3/10: ease off and see a professional.')
    expect(host.textContent).not.toContain('tell your trainer')
  })

  it('takes the answer back on a second tap', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[5])
    tap(radios()[5])
    expect('pain' in saved('w1')).toBe(false)
  })

  it('saves what was typed when the screen closes with the field still focused', () => {
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    tap(radios()[2])
    type(host.querySelector('input'), 'hombro')
    act(() => root.unmount())
    root = createRoot(host)
    expect(saved('w1').pain).toEqual({ during: 2, area: 'hombro' })
  })

  it('opens on what the workout already says', () => {
    useStore.setState({ S: { workouts: [workout('w1', '2026-10-12', { pain: { during: 6, area: 'espalda baja' } })] } })
    mount(<HallyFinishStep w={{ id: 'w1' }} />)
    expect(radios()[6].getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector('input').value).toBe('espalda baja')
    act(() => root.unmount())
    root = createRoot(host)
    expect(mocks.updates).toBe(0)
  })

  it('draws nothing for a workout that is gone', () => {
    mount(<HallyFinishStep w={{ id: 'nope' }} />)
    expect(host.textContent).toBe('')
  })
})

describe('the next-day question on the workout screen', () => {
  const hurt = () => useStore.setState({ S: { workouts: [workout('w0', '2026-10-10', { pain: { during: 4, area: 'rodilla' } })], active: { id: 'a1' } } })
  const button = label => [...host.querySelectorAll('button')].find(b => b.textContent === label)

  it('asks nothing when the last session did not hurt', () => {
    useStore.setState({ S: { workouts: [workout('w0', '2026-10-10')], active: { id: 'a1' } } })
    mount(<PainFollowUp />)
    expect(host.textContent).toBe('')
  })

  it('asks about the last session, naming what was reported', () => {
    hurt()
    mount(<PainFollowUp />)
    expect(host.textContent).toContain('Was it worse the next day?')
    expect(host.textContent).toContain('you reported pain 4/10 in: rodilla.')
  })

  it('"no" saves the answer and the card goes', () => {
    hurt()
    mount(<PainFollowUp />)
    tap(button('No, same or better'))
    expect(saved('w0').pain).toEqual({ during: 4, area: 'rodilla', worseNextDay: false })
    expect(host.textContent).toBe('')
    expect(mocks.toasts).toEqual(['Noted. That is within what is expected.'])
  })

  it('"yes" saves the answer and says to tell the trainer, until dismissed', () => {
    useHally.setState({ me: { trainer: false, clients: 0, coach: { id: 'p', name: 'Pedro', since: null } } })
    hurt()
    mount(<PainFollowUp />)
    tap(button('Yes, it got worse'))
    expect(saved('w0').pain.worseNextDay).toBe(true)
    expect(host.textContent).toContain('tell your trainer before you load the same today')
    tap(button('Got it'))
    expect(host.textContent).toBe('')
  })
})
