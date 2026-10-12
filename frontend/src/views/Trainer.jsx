import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHally } from '../store/useHally.js'
import { fetchClients, fetchInvites, newInvite, revokeInvite } from '../lib/hally-coaching.js'
import { clientList, listTotals } from '../lib/hally-trainer.js'
import { fmtDaysAgo, todayISO } from '../lib/format.js'
import { t, tn } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, TextField } from '../components/ui.jsx'
import '../hally.css'

// Hally: "My clients", the trainer's first screen (/entrenador).
//
// One row per client with what decides whether to open it: when they last trained, how the week
// is going against their plan, the last thing they said about pain, a note not read yet, and
// whether they are training this minute. What each of those means is decided in
// lib/hally-trainer.js; the server side is api/trainer.js.

// How often the list asks again while it is on screen: "training now" is the one thing here that
// changes by the minute.
const POLL_MS = 20000

export function painText(pain) {
  if (!pain) return null
  if (pain.during === 0) return t('No pain')
  return pain.area ? t('Pain {0}/10 · {1}', pain.during, pain.area) : t('Pain {0}/10', pain.during)
}
const painTone = pain => (pain.verdict === 'tell' ? (pain.during > 6 ? ' high' : ' tell') : pain.verdict === 'ok' ? ' ok' : '')

export function ClientRow({ c, onOpen }) {
  const week = c.week.planned > 0 ? t('Week {0}/{1}', c.week.done, c.week.planned) : tn('{0} session this week', '{0} sessions this week', c.week.done)
  return <div className="item" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
    onClick={onOpen} onKeyDown={onOpen ? e => { if (e.key === 'Enter') onOpen() } : undefined} style={c.disabled ? { opacity: .55 } : null}>
    <div className="grow">
      <div className="tt" style={{ fontWeight: 600 }}>
        {c.live && <Icon name="dot" style={{ fontSize: 9, color: 'var(--green)', display: 'inline-block', marginInlineEnd: 5 }} />}{c.name}
      </div>
      <div className="ss">{c.live
        ? t('Training now · {0} · {1} sets', c.live.name || '', (c.live.setsDone || 0) + '/' + (c.live.setsTotal || 0))
        : c.last ? t('Last session {0} · {1}', fmtDaysAgo(c.last.d), c.last.name) : t('No sessions yet')}</div>
      <div className="hally-pills">
        <span className={'hally-pill' + (c.week.planned > 0 && c.week.done >= c.week.planned ? ' ok' : '')}>{week}</span>
        {c.pain && <span className={'hally-pill' + painTone(c.pain)}>{painText(c.pain)}{c.pain.d ? ' · ' + fmtDaysAgo(c.pain.d) : ''}
          {c.pain.worseNextDay === true ? ' · ' + t('worse the next day') : ''}</span>}
        {c.unread > 0 && <span className="hally-pill acc"><Icon name="note" />{tn('{0} unread note', '{0} unread notes', c.unread)}</span>}
      </div>
    </div>
    {onOpen && <Icon name="chevronRight" className="chev" />}
  </div>
}

// The trainer's invite codes: how a client gets in on an invite-only instance, and what links
// their new profile to this trainer.
function InvitesCard({ onUsed }) {
  const toast = useUI(s => s.toast)
  const [invites, setInvites] = useState(null)
  const [note, setNote] = useState('')
  const load = () => fetchInvites().then(d => setInvites(Array.isArray(d?.invites) ? d.invites : [])).catch(() => {})
  useEffect(() => { load() }, [])
  // A code that has just been used is a new client on the list above.
  const usedCount = useRef(0)
  useEffect(() => {
    const n = (invites || []).filter(i => i.usedBy).length
    if (n > usedCount.current && usedCount.current > 0) onUsed?.()
    usedCount.current = n
  }, [invites])

  const copy = code => { navigator.clipboard?.writeText(code).catch(() => {}); toast(t('Code copied: {0}', code)) }
  const make = () => newInvite(note.trim())
    .then(({ invite }) => { setNote(''); copy(invite.code); load() })
    .catch(e => toast(e.message))
  const revoke = code => confirmSheet({
    title: t('Cancel code {0}?', code),
    message: t('Whoever has it can no longer use it. Clients who already joined with a code are not affected.'),
    confirmText: t('Cancel code'), danger: true,
    onConfirm: () => revokeInvite(code).then(() => { toast(t('Code cancelled')); load() }).catch(e => toast(e.message)),
  })
  const open = (invites || []).filter(i => !i.usedBy)
  const used = (invites || []).filter(i => i.usedBy)

  return <div className="card">
    <h2 style={{ margin: 0 }}>{t('Invite a client')}</h2>
    <p className="small muted" style={{ margin: '4px 0 10px' }}>{t('Each code works once. Whoever creates their profile with it is linked to you, and from then on you see their sessions, notes and pain.')}</p>
    <div className="row" style={{ gap: 8 }}>
      <TextField value={note} maxLength={60} placeholder={t('Who is it for? (optional)')} aria-label={t('Who is it for? (optional)')}
        onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') make() }} style={{ flex: 1, minWidth: 0 }} />
      <Button variant="primary" size="sm" icon="plus" onClick={make} style={{ flex: 'none', width: 'auto' }}>{t('New code')}</Button>
    </div>
    {open.length > 0 && <>
      <div className="small dim" style={{ margin: '14px 0 4px' }}>{t('Not used yet · tap to copy')}</div>
      {open.map(i => <div key={i.code} className="row between" style={{ padding: '6px 0', gap: 8 }}>
        <button type="button" className="hally-code" onClick={() => copy(i.code)} aria-label={t('Copy code {0}', i.code)}>{i.code}</button>
        <span className="small muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.note}</span>
        <button type="button" className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => revoke(i.code)} aria-label={t('Cancel code {0}?', i.code)}><Icon name="trash" /></button>
      </div>)}
    </>}
    {used.length > 0 && <>
      <div className="small dim" style={{ margin: '14px 0 4px' }}>{t('Already used')}</div>
      {used.map(i => <div key={i.code} className="row between small dim" style={{ padding: '4px 0' }}>
        <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', letterSpacing: '.06em' }}>{i.code}</span><span>→ {i.usedByName || '?'}</span>
      </div>)}
    </>}
  </div>
}

export default function Trainer() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const me = useHally(s => s.me)
  const loaded = useHally(s => s.loaded)
  const [answer, setAnswer] = useState(null)
  const [err, setErr] = useState(null)

  // A list that loaded stays up when a later poll fails, with a line saying so (as the admin's).
  const load = () => fetchClients()
    .then(d => {
      if (!Array.isArray(d?.clients)) throw new Error(t('The server answered without a list of clients.'))
      setAnswer(d); setErr(null)
    })
    .catch(e => setErr(e.message || t('Could not load')))
  useEffect(() => {
    if (!user || !me.trainer) return
    load()
    const iv = setInterval(load, POLL_MS)
    return () => clearInterval(iv)
  }, [user?.id, me.trainer])
  // Whether this profile is a trainer may be a kept answer on a first paint; the server decides.
  useEffect(() => { if (user) useHally.getState().refresh() }, [user?.id])

  if (!user) return <Navigate to="/home" replace />
  if (!me.trainer) return loaded ? <Navigate to="/home" replace /> : <div className="narrow"><div className="empty">{t('Loading…')}</div></div>

  const clients = clientList(answer, todayISO())
  const totals = listTotals(clients)
  const refresh = () => { load(); useHally.getState().refresh() }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 8 }}>
        <h1 style={{ margin: 0 }}>{t('My clients')}</h1>
        <div className="sub">{!answer ? (err ? t('Could not load') : t('Loading…'))
          : tn('{0} client', '{0} clients', totals.clients) + (totals.live ? ' · ' + tn('{0} training now', '{0} training now', totals.live) : '')}</div>
      </div>
      <button className="iconbtn" onClick={refresh} aria-label={t('Refresh the list')}><Icon name="reset" /></button>
    </div>

    {err && <div className="card" role="alert" style={{ borderColor: 'var(--red)' }}>
      <div className="row between"><h2 style={{ margin: 0 }}>{answer ? t('The last update failed') : t('Could not load your clients')}</h2>
        <Button size="sm" icon="reset" onClick={load} style={{ flex: 'none', width: 'auto' }}>{t('Try again')}</Button></div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>{err} {answer ? t('The list below is the last one that loaded.') : ''}</p>
    </div>}

    {answer && (totals.unread > 0 || totals.pain > 0) && <div className="hally-pills" style={{ margin: '0 0 12px' }}>
      {totals.unread > 0 && <span className="hally-pill acc"><Icon name="note" />{tn('{0} unread note', '{0} unread notes', totals.unread)}</span>}
      {totals.pain > 0 && <span className="hally-pill tell">{tn('{0} client with pain past 3/10', '{0} clients with pain past 3/10', totals.pain)}</span>}
    </div>}

    {answer && !clients.length && <div className="card">
      <h2 style={{ margin: 0 }}>{t('No clients yet')}</h2>
      <p className="small muted" style={{ margin: '6px 0 0' }}>{t('Make an invite code below and share it. Whoever creates their profile with it shows up here.')}</p>
    </div>}

    {clients.length > 0 && <div className="list" style={{ marginBottom: 14 }}>
      {clients.map(c => <ClientRow key={c.id} c={c} onOpen={() => nav('/entrenador/c/' + encodeURIComponent(c.id))} />)}
    </div>}

    <InvitesCard onUsed={load} />
  </div>
}
