// Hally: whether the profile signed in is a trainer, and whether it has one.
//
// A store of its own rather than a field of useStore: that one is upstream's, holds the synced
// document, and changes with every release. This one holds a single answer from the server
// (GET /api/trainer/me) and asks again whenever the profile signed in changes.
import { create } from 'zustand'
import { useStore } from './useStore.js'
import { NOBODY, fetchMe, readCachedMe, writeCachedMe } from '../lib/hally-coaching.js'
import { noteWords } from '../lib/hally-note.js'

export const useHally = create((set, get) => ({
  me: NOBODY,
  uid: null,          // the profile `me` was answered for
  loaded: false,      // the server has answered for this profile (as opposed to a kept answer)

  /** Asks the server. Offline, or on a server without the trainer layer, the kept answer stays. */
  async refresh() {
    const user = useStore.getState().user
    if (!user) { set({ me: NOBODY, uid: null, loaded: false }); return NOBODY }
    if (get().uid !== user.id) set({ me: readCachedMe(user.id) || NOBODY, uid: user.id, loaded: false })
    try {
      const me = await fetchMe()
      // The profile may have changed while the request was out.
      if (useStore.getState().user?.id !== user.id) return get().me
      set({ me, uid: user.id, loaded: true })
      writeCachedMe(user.id, me)
      return me
    } catch { return get().me }
  },
}))

/**
 * The words for the session note as the profile signed in should read them (lib/hally-note.js).
 * Read where it is drawn, not subscribed to: the answer is in long before a session is finished.
 */
export const hallyNote = () => noteWords(useHally.getState().me)

// Signing in, signing out, switching profile. Guarded because tests replace useStore with a
// plain function that has no subscribe.
if (typeof useStore.subscribe === 'function') {
  let last = useStore.getState().user?.id || null
  useStore.subscribe(state => {
    const now = state.user?.id || null
    if (now === last) return
    last = now
    useHally.getState().refresh()
  })
  if (last) useHally.getState().refresh()
}
