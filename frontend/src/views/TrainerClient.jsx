import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHally } from '../store/useHally.js'
import { fetchClient, markSeen, unlink } from '../lib/hally-coaching.js'
import { clientView } from '../lib/hally-client.js'
import { DAYN, fmtAgo, fmtDate, fmtDaysAgo, fmtDur, fmtNum, fmtVol, todayISO } from '../lib/format.js'
import { fmtRest } from '../lib/duration.js'
import { t, tn } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import LineChart from '../components/LineChart.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { painText, unreadText } from './Trainer.jsx'
import '../hally.css'

// Hally: one client, read-only (/entrenador/c/:id).
//
// Their sessions with every set, the effort they logged, the note they left and what they said
// about pain; their body weight; their routines with the exercises. Nothing here changes the
// client's data: the only two things a trainer writes from this screen are which notes they have
// read, and the end of the link. What each line says is decided in lib/hally-client.js.

const PAGE = 15

const painTone = pain => (pain.verdict === 'tell' ? (pain.during > 6 ? ' high' : ' tell') : pain.verdict === 'ok' ? ' ok' : '')
const nextDay = pain => (pain.during === 0 ? null
  : pain.worseNextDay === true ? t('Worse the next day')
    : pain.worseNextDay === false ? t('Not worse the next day')
      : t('Next day: not answered yet'))

export function SessionCard({ s, onRead }) {
  return <div className="card" style={{ marginBottom: 10 }}>
    <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 17 }}>{s.name || t('Workout')}</div>
        <div className="small muted">{[s.d ? fmtDate(s.d, true) : null, s.durMs >= 60000 ? fmtDur(s.durMs) : null, tn('{0} set', '{0} sets', s.sets), s.vol > 0 ? fmtVol(s.vol, s.unit) : null].filter(Boolean).join(' · ')}</div>
      </div>
      {s.prs > 0 && <span className="hally-pill acc" style={{ flex: 'none' }}><Icon name="trophy" />{s.prs} PR</span>}
    </div>

    {s.pain && <div className="hally-pills">
      <span className={'hally-pill' + painTone(s.pain)}>{painText(s.pain)}</span>
      {nextDay(s.pain) && <span className={'hally-pill' + (s.pain.worseNextDay === true ? ' tell' : '')}>{nextDay(s.pain)}</span>}
    </div>}
    {s.pain?.note && <div className="hally-note"><span className="hally-note-l">{t('About the pain')}</span>{s.pain.note}</div>}

    {s.note && <div className={'hally-note' + (s.unread ? ' unread' : '')}>
      <span className="hally-note-l">{t('Note for you')}{s.unread ? ' · ' + t('new') : ''}</span>{s.note}
      {s.unread && onRead && <div style={{ marginTop: 8 }}><Button size="sm" icon="check" onClick={() => onRead([s.id])} style={{ width: 'auto' }}>{t('Mark as read')}</Button></div>}
    </div>}

    <div style={{ marginTop: 10 }}>
      {s.exercises.map(e => <div key={e.key} className="hally-ex">
        <div className="hally-ex-n">{e.superset && <Icon name="link" style={{ fontSize: 13, marginInlineEnd: 5, color: 'var(--label-3)' }} />}{e.name}</div>
        <div className="hally-sets">{e.line || t('No sets logged')}</div>
        {e.note && <div className="small dim" style={{ marginTop: 2 }}>{e.note}</div>}
      </div>)}
    </div>
  </div>
}

export function RoutineCard({ r }) {
  return <div className="card" style={{ marginBottom: 10 }}>
    <div style={{ fontWeight: 600, fontSize: 17 }}>{r.name}</div>
    <div className="small muted">{tn('{0} exercise', '{0} exercises', r.exercises.length)}</div>
    <div style={{ marginTop: 8 }}>
      {r.exercises.map(e => <div key={e.key} className="hally-ex">
        <div className="hally-ex-n">{e.superset && <Icon name="link" style={{ fontSize: 13, marginInlineEnd: 5, color: 'var(--label-3)' }} />}{e.name}</div>
        <div className="hally-sets">{e.line}{e.restSec ? ' · ' + t('rest {0}', fmtRest(e.restSec)) : ''}</div>
        {e.note && <div className="small dim" style={{ marginTop: 2 }}>{e.note}</div>}
      </div>)}
    </div>
  </div>
}

export default function TrainerClient() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const me = useHally(s => s.me)
  const loaded = useHally(s => s.loaded)
  const toast = useUI(s => s.toast)
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState(null)        // { message, status } of the last load, until one works
  const [tab, setTab] = useState('sessions')
  const [shown, setShown] = useState(PAGE)

  const load = () => fetchClient(id)
    .then(d => { setDetail(d); setErr(null) })
    .catch(e => setErr({ message: e.message || t('Could not load'), status: e.status }))
  useEffect(() => { setDetail(null); setShown(PAGE); if (user && me.trainer) load() }, [id, user?.id, me.trainer])
  useEffect(() => { if (user) useHally.getState().refresh() }, [user?.id])

  if (!user) return <Navigate to="/home" replace />
  if (!me.trainer) return loaded ? <Navigate to="/home" replace /> : <div className="narrow"><div className="empty">{t('Loading…')}</div></div>

  const back = () => nav('/entrenador')
  const head = (title, sub) => <div className="hdr">
    <button className="iconbtn" onClick={back} aria-label={t('Back to my clients')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginInlineStart: 8, minWidth: 0 }}><h1 style={{ margin: 0 }}>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {detail && <button className="iconbtn" onClick={load} aria-label={t('Refresh the list')}><Icon name="reset" /></button>}
  </div>

  if (!detail) return <div className="narrow">
    {head(t('My clients'), err ? null : t('Loading…'))}
    {err && <div className="card" role="alert">
      <h2 style={{ margin: 0 }}>{err.status === 403 ? t('This profile is not one of your clients.') : t('Could not load')}</h2>
      {err.status !== 403 && <p className="small muted" style={{ margin: '6px 0 10px' }}>{err.message}</p>}
      <div style={{ height: 10 }} />
      {err.status === 403
        ? <Button onClick={back}>{t('Back to my clients')}</Button>
        : <Button icon="reset" onClick={load}>{t('Try again')}</Button>}
    </div>}
  </div>

  const v = clientView(detail, todayISO())
  const read = ids => markSeen(id, ids)
    .then(r => { setDetail(d => ({ ...d, unread: Array.isArray(r?.unread) ? r.unread : [] })); if (!ids) toast(t('Notes marked as read')) })
    .catch(e => toast(e.message))
  const letGo = () => confirmSheet({
    title: t('Stop training {0}?', v.user.name),
    message: t('You stop seeing their training right away, and what you marked as read is deleted. Their data stays with them. To link again they need a new code from you.'),
    confirmText: t('Stop training {0}', v.user.name), danger: true,
    onConfirm: () => unlink(id)
      .then(() => { useHally.getState().refresh(); toast(t('{0} is no longer your client', v.user.name)); back() })
      .catch(e => toast(e.message)),
  })
  const bwPoints = [...v.bodyweight.entries].reverse().map(e => ({ t: Date.parse(e.d + 'T12:00:00'), y: e.w, d: e.d }))

  return <div className="narrow">
    {head(v.user.name, [v.since ? t('Client since {0}', fmtDate(v.since.slice(0, 10), false, true)) : null,
      v.lastSync ? t('last sync {0}', fmtAgo(v.lastSync)) : t('never synced')].filter(Boolean).join(' · '))}

    {err && <div className="card" role="alert" style={{ borderColor: 'var(--red)' }}>
      <div className="small">{t('The last update failed')}: {err.message}</div>
    </div>}

    <p className="small muted" style={{ margin: '0 0 12px' }}>{t('Read-only: you see what {0} logs, and cannot change it.', v.user.name)}</p>

    {v.user.disabled && <div className="hally-pills" style={{ marginBottom: 12 }}><span className="hally-pill high">{t('Account disabled')}</span></div>}

    {v.live && <div className="card" style={{ borderColor: 'var(--acc)', marginBottom: 12 }}>
      <div className="row" style={{ gap: 6, fontWeight: 600 }}><Icon name="dot" style={{ fontSize: 10, color: 'var(--green)' }} />{t('Training now')} · {v.live.name}</div>
      <div className="small muted">{t('Exercise {0} of {1} · {2} sets', v.live.exIdx || 0, v.live.exTotal || 0, (v.live.setsDone || 0) + '/' + (v.live.setsTotal || 0))}</div>
    </div>}

    <div className="tiles" style={{ marginBottom: 12 }}>
      <div className="tile"><div className="l">{t('Sessions logged')}</div><div className="v">{v.sessions.length}</div></div>
      <div className="tile"><div className="l">{t('This week')}</div><div className="v">{v.week.planned > 0 ? v.week.done + '/' + v.week.planned : v.week.done}</div></div>
      <div className="tile"><div className="l">{t('Body weight')}</div><div className="v">{v.bodyweight.latest ? fmtNum(v.bodyweight.latest.w) + ' ' + v.unit : '–'}</div></div>
      <div className="tile"><div className="l">{t('Last pain')}</div>
        <div className="v" style={v.lastPain?.verdict === 'tell' ? { color: 'var(--orange)' } : null}>{v.lastPain ? v.lastPain.during + '/10' : '–'}</div></div>
    </div>

    {v.unread.length > 0 && <div className="card" style={{ borderColor: 'var(--acc)', marginBottom: 12 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{unreadText(v.unread.length)}</div>
        <Button size="sm" icon="check" onClick={() => read()} style={{ flex: 'none', width: 'auto' }}>{t('Mark all as read')}</Button>
      </div>
    </div>}

    <Segmented value={tab} onChange={setTab} options={[
      { value: 'sessions', label: t('Sessions') },
      { value: 'routines', label: t('Routines') },
      { value: 'weight', label: t('Body weight') },
    ]} />
    <div style={{ height: 12 }} />

    {tab === 'sessions' && <>
      {v.sessions.slice(0, shown).map(s => <SessionCard key={s.id} s={s} onRead={read} />)}
      {!v.sessions.length && <div className="card small muted">{t('No sessions logged yet.')}</div>}
      {v.sessions.length > shown && <Button onClick={() => setShown(n => n + PAGE)}>{t('Show more')}</Button>}
    </>}

    {tab === 'routines' && <>
      {v.weekPlan.length > 0 && <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Week plan')}</div>
        {v.weekPlan.map(d => <div key={d.day} className="row between small" style={{ padding: '3px 0', gap: 12 }}>
          <span className="muted">{t(DAYN[d.day])}</span><span style={{ textAlign: 'end' }}>{d.routines.join(' + ')}</span>
        </div>)}
      </div>}
      {v.routines.map(r => <RoutineCard key={r.id} r={r} />)}
      {!v.routines.length && <div className="card small muted">{t('No routines yet.')}</div>}
    </>}

    {tab === 'weight' && <>
      {bwPoints.length > 1 && <div className="card" style={{ marginBottom: 10 }}>
        <div className="chart"><LineChart points={bwPoints} h={150} unit={v.unit} /></div>
        {v.bodyweight.change != null && <div className="small muted" style={{ marginTop: 6 }}>
          {t('{0} {1} since {2}', (v.bodyweight.change > 0 ? '+' : '') + fmtNum(v.bodyweight.change), v.unit, fmtDate(v.bodyweight.since, false, true))}
        </div>}
      </div>}
      {v.bodyweight.entries.length > 0 && <div className="card">
        {v.bodyweight.entries.slice(0, 30).map(e => <div key={e.d} className="row between small" style={{ padding: '4px 0' }}>
          <span className="muted">{fmtDate(e.d, true, true)}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(e.w)} {v.unit}</span>
        </div>)}
      </div>}
      {!v.bodyweight.entries.length && <div className="card small muted">{t('No weigh-ins yet.')}</div>}
    </>}

    <div style={{ height: 24 }} />
    <Button variant="ghost" className="dim" onClick={letGo}>{t('Stop training {0}', v.user.name)}</Button>
    <div style={{ height: 24 }} />
  </div>
}
