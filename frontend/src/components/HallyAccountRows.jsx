import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useHally } from '../store/useHally.js'
import { joinTrainer, unlink } from '../lib/hally-coaching.js'
import { fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Row, Button, TextField } from './ui.jsx'

// Hally: the rows of Settings → Account that are about the trainer link.
//
//   - a trainer gets "My clients";
//   - a client sees who their trainer is, what that person can see, and the way out;
//   - a profile without a trainer can join one with a code.
//
// One component so views/Settings.jsx carries one line of it.

// What the link means, said to the person whose training is being read. It sits behind the row
// rather than in a footnote: this is the consent, and the way to withdraw it is the same sheet.
function TrainerSheet({ coach, close }) {
  const toast = useUI(s => s.toast)
  const [asking, setAsking] = useState(false)
  const leave = () => unlink()
    .then(() => { useHally.getState().refresh(); toast(t('You no longer have a trainer')); close() })
    .catch(e => toast(e.message))
  return <>
    <h3>{t('{0} is your trainer', coach.name)}</h3>
    {coach.since && <div className="dim small" style={{ marginBottom: 8 }}>{t('Since {0}', fmtDate(coach.since.slice(0, 10), true, true))}</div>}
    <p className="muted">{t('{0} can see your sessions with their sets, your notes, your body weight, your routines and what you report about pain. They cannot see your photos or videos, and cannot change anything in your account.', coach.name)}</p>
    {asking ? <>
      <p className="muted">{t('They stop seeing your training right away. Your data stays with you. To come back you need a new code from them.')}</p>
      <Button variant="danger" onClick={leave}>{t('Leave my trainer')}</Button>
      <div style={{ height: 8 }} />
      <Button onClick={() => setAsking(false)}>{t('Cancel')}</Button>
    </> : <>
      <Button variant="primary" onClick={close}>{t('Done')}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={() => setAsking(true)}>{t('Leave my trainer')}</Button>
    </>}
  </>
}

function JoinSheet({ close }) {
  const toast = useUI(s => s.toast)
  const input = useRef(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  useEffect(() => { input.current?.focus?.() }, [])
  const go = () => {
    if (!code.trim() || busy) return
    setBusy(true); setWrong(false)
    joinTrainer(code.trim())
      .then(r => { useHally.getState().refresh(); toast(t('You now train with {0}', r.coach?.name || '')); close() })
      .catch(e => { setBusy(false); if (e.status === 403 || e.status === 400) setWrong(true); else toast(e.message) })
  }
  return <>
    <h3>{t('Join your trainer')}</h3>
    <p className="muted">{t('Enter the code your trainer gave you. From then on they can see your sessions, your notes and what you report about pain, so they can follow your training.')}</p>
    <TextField ref={input} value={code} maxLength={32} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
      placeholder={t('Trainer code')} aria-label={t('Trainer code')}
      style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }}
      onChange={e => { setCode(e.target.value.toUpperCase()); setWrong(false) }}
      onKeyDown={e => { if (e.key === 'Enter') go() }} />
    {wrong && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 6 }}>{t('That code is not valid. Ask your trainer for a new one.')}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!code.trim() || busy} onClick={go}>{t('Join')}</Button>
  </>
}

export default function HallyAccountRows() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const me = useHally(s => s.me)
  const loaded = useHally(s => s.loaded)
  // Asked again on every visit: the answer changes on the server (a role given, a client let go).
  useEffect(() => { if (user) useHally.getState().refresh() }, [user?.id])
  if (!user) return null
  const openSheet = useUI.getState().openSheet
  return <>
    {me.trainer && <Row icon="person" iconTint="var(--acc)" title={t('My clients')} value={me.clients || null} accessory="chevron" onClick={() => nav('/entrenador')} />}
    {me.coach && <Row icon="personCircle" iconTint="var(--green)" title={t('Your trainer')} value={me.coach.name} accessory="chevron"
      onClick={() => openSheet(close => <TrainerSheet coach={me.coach} close={close} />)} />}
    {/* Only once the server has answered: offered on a kept answer, it would invite a client who
        already has a trainer to type a code. */}
    {loaded && !me.coach && <Row icon="link" iconTint="var(--blue)" title={t('I have a code from my trainer')} accessory="chevron"
      onClick={() => openSheet(close => <JoinSheet close={close} />)} />}
  </>
}
