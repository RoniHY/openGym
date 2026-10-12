import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHally } from '../store/useHally.js'
import { fetchRole, setRole } from '../lib/hally-coaching.js'

// Hally: the trainer role of one profile, inside the admin drill-down (views/Admin.jsx).
// English-only like the rest of that screen, which stays out of the language packs.
//
// It asks the trainer routes for its own state instead of reading it off GET /api/admin/user, so
// upstream's route and its sheet are left as they are. On a server without the trainer layer the
// question fails and nothing is drawn.
export default function HallyTrainerToggle({ id, name }) {
  const [role, setRoleState] = useState(null)
  const toast = useUI(s => s.toast)
  const me = useStore(s => s.user)
  useEffect(() => {
    let gone = false
    fetchRole(id).then(r => { if (!gone) setRoleState(r) }).catch(() => {})
    return () => { gone = true }
  }, [id])
  if (!role || typeof role.trainer !== 'boolean') return null

  const flip = () => setRole(id, !role.trainer)
    .then(r => {
      setRoleState(x => ({ ...x, trainer: !!r.trainer }))
      toast(r.trainer ? name + ' is now a trainer' : name + ' is no longer a trainer')
      // The admin's own menu gains or loses "My clients" at once.
      if (me?.id === id) useHally.getState().refresh()
    })
    .catch(e => toast(e.message))

  return <>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '12px 0 4px' }}>
      {role.trainer && <span className="adm-pill acc">trainer · {role.clients} {role.clients === 1 ? 'client' : 'clients'}</span>}
      {role.coach && <span className="adm-pill">client of {role.coach.name}</span>}
    </div>
    <button className="btn" style={{ margin: '4px 0' }} onClick={flip}>{role.trainer ? 'Remove trainer role' : 'Make trainer'}</button>
    <div className="adm-hint">{role.trainer
      ? 'Removing the role stops them reading their clients at once. The links are kept, so giving it back restores them.'
      : 'A trainer makes invite codes that link new profiles to them, and reads those clients’ sessions, notes and pain. Nothing else: no deleting, no passwords, no log.'}</div>
  </>
}
