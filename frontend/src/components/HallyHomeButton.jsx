import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useHally } from '../store/useHally.js'
import { fetchClients } from '../lib/hally-coaching.js'
import { clientList } from '../lib/hally-trainer.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Hally: the way into "My clients" from Home, for a trainer and nobody else.
//
// An icon next to the gear, with a dot when a client needs a look (a note not read yet, pain past
// the rule). It asks once when Home opens; the list itself keeps asking while it is on screen.
export default function HallyHomeButton() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const trainer = useHally(s => s.me.trainer)
  const [flagged, setFlagged] = useState(false)
  useEffect(() => {
    if (!user || !trainer) return
    let gone = false
    fetchClients().then(d => { if (!gone) setFlagged(clientList(d).some(c => c.flags.length > 0)) }).catch(() => {})
    return () => { gone = true }
  }, [user?.id, trainer])
  if (!user || !trainer) return null
  // The auto margin takes the free space of the header (justify-content: space-between), so this
  // sits beside the gear rather than floating in the middle.
  return <button className="iconbtn" style={{ marginInlineStart: 'auto' }} onClick={() => nav('/entrenador')}
    aria-label={flagged ? t('My clients') + ', ' + t('someone needs a look') : t('My clients')}>
    <Icon name="person" />{flagged && <span className="tab-dot" aria-hidden="true" />}
  </button>
}
