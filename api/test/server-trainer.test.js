/* Hally: the trainer routes, against the real server.js in a child (as server-admin-state does).
   What is checked is who may read whom: a trainer their own clients and nobody else, and what a
   client's document looks like by the time it reaches a trainer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { noteKey } from '../trainer.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const GOOD = 'correct horse battery staple';

// Same construction as server.js makeSession(): payload `uid:exp:sv`, HMAC-SHA256 over SECRET.
function cookieOf(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

const PEDRO = 'u_pedro', OTRA = 'u_otra', ANA = 'u_ana', BETO = 'u_beto';
const now = new Date().toISOString();
const baseUsers = () => [
  { id: PEDRO, name: 'Pedro', created: now, admin: true, trainer: true },
  { id: OTRA, name: 'Otra', created: now, trainer: true },
  { id: ANA, name: 'Ana', created: now },
  { id: BETO, name: 'Beto', created: now }
];

async function startServer(t, { users = baseUsers(), coaching = [], invites = [], env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hally-trainer-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites, coaching }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost',
      PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '1', ALLOW_GUEST: '0', ADMIN_UIDS: '', AUDIT_LOG: '1', ...env
    }
  });
  const h = { api: '', log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, as, cookie } = {}) => {
    const r = await fetch(`${h.api}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': '198.51.100.7', ...(as ? { Cookie: cookieOf(as) } : cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = r.headers.getSetCookie().find(c => c.startsWith('gymsid=') && !c.startsWith('gymsid=;'));
    return { status: r.status, body: await r.json(), cookie: set ? set.split(';')[0] : null };
  };
  h.get = (p, as) => h.req('GET', p, { as });
  h.post = (p, body, as) => h.req('POST', p, { body, as });
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  h.plant = (uid, S) => fs.writeFileSync(path.join(dataDir, `state-${uid}.json`), JSON.stringify(S));
  h.coachingFile = uid => path.join(dataDir, 'coaching', uid + '.json');
  h.stackFrames = () => h.log.split('\n').filter(l => /^\s+at /.test(l)).length;
  return h;
}
const link = (trainerId, clientId) => ({ trainerId, clientId, since: now, via: 'test' });
const today = new Date().toISOString().slice(0, 10);
const okW = (id, extra = {}) => ({ id, name: 'Pierna', d: today, start: 1000, end: 2000, routineIds: ['r1'], entries: [{ id: '0001', sets: [{ w: 60, r: 8, done: true, rir: 2 }] }], ...extra });
const okR = { id: 'r1', name: 'Pierna', emoji: '🦵', ex: [{ id: '0001', sets: 3, reps: 8, weight: 60, mode: 'reps' }] };

test('a profile created with a trainer\'s invite code is linked to that trainer', async t => {
  const h = await startServer(t);
  const made = await h.post('/api/trainer/invites/new', { note: 'Cliente demo' }, PEDRO);
  assert.equal(made.status, 200);
  assert.equal(made.body.invite.trainerId, PEDRO);
  const reg = await h.req('POST', '/api/register/password', { body: { name: 'Cliente demo', password: GOOD, code: made.body.invite.code } });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const clientId = reg.body.user.id;
  const db = h.db();
  assert.deepEqual(db.coaching.map(l => [l.trainerId, l.clientId, l.via]), [[PEDRO, clientId, 'invite:' + made.body.invite.code]]);
  assert.equal(db.invites.find(i => i.code === made.body.invite.code).usedBy, clientId);

  const me = await h.req('GET', '/api/trainer/me', { cookie: reg.cookie });
  assert.deepEqual(me.body.coach && { id: me.body.coach.id, name: me.body.coach.name }, { id: PEDRO, name: 'Pedro' });
  assert.equal(me.body.trainer, false);
  const list = await h.get('/api/trainer/clients', PEDRO);
  assert.deepEqual(list.body.clients.map(c => c.name), ['Cliente demo']);
});

test('an admin who is a trainer makes linking codes from the admin dashboard too; a plain admin does not', async t => {
  const h = await startServer(t, { users: [...baseUsers(), { id: 'u_adm', name: 'Solo admin', created: now, admin: true }] });
  const byTrainer = await h.post('/api/admin/invites/new', {}, PEDRO);
  assert.equal(byTrainer.body.invite.trainerId, PEDRO);
  const byAdmin = await h.post('/api/admin/invites/new', {}, 'u_adm');
  assert.equal('trainerId' in byAdmin.body.invite, false);
  const reg = await h.req('POST', '/api/register/password', { body: { name: 'Sin entrenador', password: GOOD, code: byAdmin.body.invite.code } });
  assert.equal(reg.status, 200);
  assert.deepEqual(h.db().coaching, []);
});

test('GET /api/trainer/me says who is a trainer and who has one', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA)] });
  assert.equal((await h.req('GET', '/api/trainer/me')).status, 401);
  assert.deepEqual((await h.get('/api/trainer/me', PEDRO)).body, { trainer: true, clients: 1, coach: null });
  const ana = (await h.get('/api/trainer/me', ANA)).body;
  assert.equal(ana.trainer, false);
  assert.equal(ana.clients, 0);
  assert.deepEqual({ id: ana.coach.id, name: ana.coach.name }, { id: PEDRO, name: 'Pedro' });
  assert.deepEqual((await h.get('/api/trainer/me', BETO)).body, { trainer: false, clients: 0, coach: null });
});

test('a trainer lists their own clients and no one else\'s', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(OTRA, BETO)] });
  assert.equal((await h.req('GET', '/api/trainer/clients')).status, 401);
  assert.equal((await h.get('/api/trainer/clients', ANA)).status, 403);
  assert.deepEqual((await h.get('/api/trainer/clients', PEDRO)).body.clients.map(c => c.id), [ANA]);
  assert.deepEqual((await h.get('/api/trainer/clients', OTRA)).body.clients.map(c => c.id), [BETO]);
});

test('GET /api/trainer/client is for the trainer of that client only, admin or not', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(OTRA, BETO)] });
  h.plant(ANA, { unit: 'kg', workouts: [okW('w1')], routines: [okR] });
  h.plant(BETO, { unit: 'kg', workouts: [okW('w9')], routines: [okR] });
  assert.equal((await h.req('GET', `/api/trainer/client?id=${ANA}`)).status, 401);
  assert.equal((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).status, 200);
  // Pedro is the admin, and still not Beto's trainer: this route is not the admin's.
  for (const [who, whom] of [[PEDRO, BETO], [OTRA, ANA], [ANA, ANA], [ANA, BETO], [BETO, PEDRO], [PEDRO, PEDRO]]) {
    const r = await h.get(`/api/trainer/client?id=${whom}`, who);
    assert.equal(r.status, 403, `${who} reading ${whom}`);
    assert.deepEqual(r.body, { error: 'forbidden' });
  }
  // A profile that does not exist answers like one that is not theirs.
  assert.equal((await h.get('/api/trainer/client?id=u_nadie', PEDRO)).status, 403);
  assert.equal((await h.get('/api/trainer/client', PEDRO)).status, 403);
});

test('the client a trainer reads: sessions with sets, effort, note and pain, body weight, whole routines, no media', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA)] });
  const ref = { kind: 'image', hash: 'a'.repeat(64), mime: 'image/webp', size: 10, width: 8, height: 6, at: 1 };
  h.plant(ANA, {
    unit: 'kg', effort: 'rir', weekStart: 1, week: { 1: ['r1'] },
    workouts: [
      okW('w1', { d: '2026-10-01', note: 'Primera', media: [ref] }),
      okW('w2', { d: '2026-10-05', note: 'Me costó', pain: { during: 4, area: 'rodilla', note: 'al bajar' } })
    ],
    routines: [okR],
    bodyweight: [{ d: '2026-10-01', w: 62.5, t: 1 }],
    customEx: [{ id: 'c1', name: 'Puente con banda', target: 'glutes', media: [ref] }]
  });
  const r = await h.get(`/api/trainer/client?id=${ANA}`, PEDRO);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: ANA, name: 'Ana', created: now, disabled: false });
  assert.deepEqual(r.body.workouts.map(w => w.id), ['w2', 'w1']);                      // newest first
  assert.deepEqual(r.body.workouts[0].entries[0].sets, [{ w: 60, r: 8, done: true, rir: 2 }]);
  assert.equal(r.body.workouts[0].note, 'Me costó');
  assert.deepEqual(r.body.workouts[0].pain, { during: 4, area: 'rodilla', note: 'al bajar' });
  assert.deepEqual(r.body.routines, [okR]);                                              // with their exercises
  assert.deepEqual(r.body.bodyweight, [{ d: '2026-10-01', w: 62.5, t: 1 }]);
  assert.deepEqual(r.body.customEx, [{ id: 'c1', name: 'Puente con banda', target: 'glutes' }]);
  assert.equal(r.body.effort, 'rir');
  assert.deepEqual(r.body.plan, { weekStart: 1, week: { 1: ['r1'] }, queue: null });
  assert.deepEqual(r.body.unread.sort(), ['w1', 'w2']);
  // Their photos and videos are theirs: no ref reaches a trainer, as none reaches an admin.
  assert.equal(JSON.stringify(r.body).includes('a'.repeat(64)), false);
  // Nothing about how they sign in.
  for (const k of ['email', 'password', 'invitedBy', 'admin']) assert.equal(k in r.body.user, false, k);
});

test('a client row carries the last session, the last pain, unread notes and the week\'s plan slice', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(PEDRO, BETO)] });
  h.plant(ANA, {
    weekStart: 1, week: { 1: ['r1'], 3: ['r1'] }, routines: [okR],
    workouts: [
      okW('old', { d: '2025-01-01', pain: { during: 7, area: 'hombro' } }),
      okW('w1', { note: 'Primera', pain: { during: 2, area: 'rodilla', worseNextDay: false } }),
      okW('w2', { note: 'Segunda' })
    ]
  });
  const r = await h.get('/api/trainer/clients', PEDRO);
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.now, 'number');
  assert.equal(r.body.invite_only, true);
  const [ana, beto] = r.body.clients;
  assert.equal(ana.id, ANA);
  assert.equal(ana.workouts, 3);
  assert.deepEqual(ana.lastWorkout, { id: 'w2', d: today, name: 'Pierna', end: 2000 });
  // The most recent session that says anything about pain, not the worst one ever.
  assert.deepEqual(ana.lastPain, { during: 2, area: 'rodilla', worseNextDay: false, d: today, workoutId: 'w1' });
  assert.equal(ana.unreadNotes, 2);
  assert.equal(ana.live, null);
  assert.deepEqual(ana.plan.week, { 1: ['r1'], 3: ['r1'] });
  assert.deepEqual(ana.plan.routines, [{ id: 'r1', name: 'Pierna' }]);
  // Only the recent sessions travel, without their sets.
  assert.deepEqual(ana.plan.workouts.map(w => w.id), ['w1', 'w2']);
  assert.equal('entries' in ana.plan.workouts[0], false);
  // A client who has not logged anything yet is a row all the same.
  assert.deepEqual({ id: beto.id, workouts: beto.workouts, lastWorkout: beto.lastWorkout, lastPain: beto.lastPain, unreadNotes: beto.unreadNotes },
    { id: BETO, workouts: 0, lastWorkout: null, lastPain: null, unreadNotes: 0 });
});

test('a client training now shows in their trainer\'s list', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA)] });
  const beat = await h.post('/api/activity', { active: true, name: 'Pierna', exIdx: 1, exTotal: 4, setsDone: 2, setsTotal: 12, startedAt: Date.now() - 60000 }, ANA);
  assert.equal(beat.status, 200);
  const row = (await h.get('/api/trainer/clients', PEDRO)).body.clients[0];
  assert.equal(row.live?.name, 'Pierna');
  assert.equal((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).body.live?.setsDone, 2);
});

test('the trainer routes read a document nobody validated without throwing', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA)] });
  const docs = [
    { workouts: [null, 'x', [], okW('w1')], routines: [null, 7, okR], bodyweight: [null, 'x'], customEx: [null], week: 'nope', queue: 3 },
    { workouts: { a: 1 }, routines: { a: 1 }, bodyweight: { a: 1 }, customEx: { a: 1 } },
    { workouts: null, routines: null, bodyweight: null },
    { workouts: [{ id: 'w1', pain: 'mucho', note: 7 }, { pain: { during: 99 } }] },
    {}
  ];
  for (const doc of docs) {
    h.plant(ANA, doc);
    const list = await h.get('/api/trainer/clients', PEDRO);
    assert.equal(list.status, 200, JSON.stringify(doc));
    const one = await h.get(`/api/trainer/client?id=${ANA}`, PEDRO);
    assert.equal(one.status, 200, JSON.stringify(doc));
    for (const k of ['workouts', 'routines', 'bodyweight', 'customEx', 'unread']) assert.ok(Array.isArray(one.body[k]), k);
    const seen = await h.post('/api/trainer/seen', { clientId: ANA }, PEDRO);
    assert.equal(seen.status, 200, JSON.stringify(doc));
  }
  fs.writeFileSync(path.join(h.dataDir, `state-${ANA}.json`), '{ not json');
  assert.equal((await h.get('/api/trainer/clients', PEDRO)).status, 200);
  assert.equal((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).status, 200);
  assert.equal(h.stackFrames(), 0, `stack traces in the log:\n${h.log}`);
});

test('read marks: a note is unread until seen, unread again once rewritten, and kept per trainer', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(OTRA, BETO)] });
  h.plant(ANA, { workouts: [okW('w1', { note: 'Primera' }), okW('w2', { note: 'Segunda' }), okW('w3')] });
  assert.equal((await h.post('/api/trainer/seen', { clientId: ANA }, OTRA)).status, 403);
  assert.equal((await h.post('/api/trainer/seen', { clientId: ANA }, ANA)).status, 403);
  assert.equal(fs.existsSync(h.coachingFile(ANA)), false);

  const one = await h.post('/api/trainer/seen', { clientId: ANA, ids: ['w1'] }, PEDRO);
  assert.deepEqual(one.body, { ok: true, unread: ['w2'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(h.coachingFile(ANA), 'utf8')), { trainerId: PEDRO, seen: { w1: noteKey('Primera') } });
  assert.equal((await h.get('/api/trainer/clients', PEDRO)).body.clients[0].unreadNotes, 1);

  const all = await h.post('/api/trainer/seen', { clientId: ANA }, PEDRO);
  assert.deepEqual(all.body.unread, []);
  assert.deepEqual((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).body.unread, []);

  // The client rewrites one note and deletes the other session.
  h.plant(ANA, { workouts: [okW('w1', { note: 'Primera, y me dolió la rodilla' })] });
  assert.deepEqual((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).body.unread, ['w1']);
  await h.post('/api/trainer/seen', { clientId: ANA }, PEDRO);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(h.coachingFile(ANA), 'utf8')).seen), ['w1']);

  assert.deepEqual((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).body.unread, []);

  // Another trainer taking the client over starts with everything unread: the marks were Pedro's.
  const code = (await h.post('/api/trainer/invites/new', {}, OTRA)).body.invite.code;
  assert.equal((await h.post('/api/trainer/join', { code }, ANA)).status, 200);
  assert.equal((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).status, 403);
  assert.deepEqual((await h.get(`/api/trainer/client?id=${ANA}`, OTRA)).body.unread, ['w1']);
  await h.post('/api/trainer/seen', { clientId: ANA }, OTRA);
  assert.equal(JSON.parse(fs.readFileSync(h.coachingFile(ANA), 'utf8')).trainerId, OTRA);
});

test('either side can end the link, and what the trainer kept goes with it', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(PEDRO, BETO)] });
  h.plant(ANA, { workouts: [okW('w1', { note: 'Primera' })] });
  h.plant(BETO, { workouts: [okW('w1', { note: 'Primera' })] });
  await h.post('/api/trainer/seen', { clientId: ANA }, PEDRO);
  await h.post('/api/trainer/seen', { clientId: BETO }, PEDRO);
  assert.equal((await h.req('POST', '/api/trainer/unlink', { body: {} })).status, 401);
  // Someone else's client is not theirs to unlink.
  assert.equal((await h.post('/api/trainer/unlink', { clientId: ANA }, OTRA)).status, 404);
  assert.equal((await h.post('/api/trainer/unlink', { clientId: PEDRO }, ANA)).status, 404);

  // The client leaves.
  assert.equal((await h.post('/api/trainer/unlink', {}, ANA)).status, 200);
  assert.deepEqual(h.db().coaching.map(l => l.clientId), [BETO]);
  assert.equal(fs.existsSync(h.coachingFile(ANA)), false);
  assert.equal((await h.get(`/api/trainer/client?id=${ANA}`, PEDRO)).status, 403);
  assert.equal((await h.get('/api/trainer/me', ANA)).body.coach, null);
  assert.equal((await h.post('/api/trainer/unlink', {}, ANA)).status, 404);

  // The trainer lets a client go.
  assert.equal((await h.post('/api/trainer/unlink', { clientId: BETO }, PEDRO)).status, 200);
  assert.deepEqual(h.db().coaching, []);
  assert.equal(fs.existsSync(h.coachingFile(BETO)), false);
  assert.deepEqual((await h.get('/api/trainer/clients', PEDRO)).body.clients, []);
});

test('an existing profile joins a trainer with one of their codes, once', async t => {
  const h = await startServer(t, { invites: [{ code: 'PLAINCODE0000000', createdBy: 'x', created: now }] });
  const code = (await h.post('/api/trainer/invites/new', {}, PEDRO)).body.invite.code;
  assert.equal((await h.req('POST', '/api/trainer/join', { body: { code } })).status, 401);
  assert.equal((await h.post('/api/trainer/join', { code: 'NOPE' }, ANA)).status, 403);
  // A code that links nobody (an admin's) is not a way to join a trainer.
  assert.equal((await h.post('/api/trainer/join', { code: 'PLAINCODE0000000' }, ANA)).status, 403);
  // The trainer cannot become their own client.
  assert.equal((await h.post('/api/trainer/join', { code }, PEDRO)).status, 400);
  const joined = await h.post('/api/trainer/join', { code: code.toLowerCase() }, ANA);
  assert.equal(joined.status, 200);
  assert.equal(joined.body.coach.name, 'Pedro');
  assert.deepEqual(h.db().coaching.map(l => [l.trainerId, l.clientId]), [[PEDRO, ANA]]);
  assert.equal((await h.post('/api/trainer/join', { code }, BETO)).status, 403);        // burned
});

test('a trainer makes, lists and revokes their own invite codes; nobody else does', async t => {
  const h = await startServer(t);
  assert.equal((await h.post('/api/trainer/invites/new', {}, ANA)).status, 403);
  assert.equal((await h.get('/api/trainer/invites', ANA)).status, 403);
  const mine = (await h.post('/api/trainer/invites/new', { note: 'x'.repeat(100) }, PEDRO)).body.invite;
  assert.equal(mine.note.length, 60);
  assert.match(mine.code, /^[0-9A-F]{16}$/);
  const hers = (await h.post('/api/trainer/invites/new', {}, OTRA)).body.invite;
  assert.deepEqual((await h.get('/api/trainer/invites', PEDRO)).body.invites.map(i => i.code), [mine.code]);
  assert.equal((await h.post('/api/trainer/invites/revoke', { code: hers.code }, PEDRO)).status, 404);
  assert.equal((await h.post('/api/trainer/invites/revoke', { code: mine.code }, PEDRO)).status, 200);
  assert.deepEqual(h.db().invites.map(i => i.code), [hers.code]);
});

test('the role is the admin\'s to give and take; taking it stops every read at once', async t => {
  const h = await startServer(t, { coaching: [link(OTRA, BETO)] });
  assert.equal((await h.post('/api/trainer/role', { id: ANA, trainer: true }, OTRA)).status, 403);
  assert.equal((await h.get(`/api/trainer/role?id=${ANA}`, OTRA)).status, 403);
  assert.equal((await h.post('/api/trainer/role', { id: 'u_nadie', trainer: true }, PEDRO)).status, 404);

  assert.deepEqual((await h.post('/api/trainer/role', { id: ANA, trainer: true }, PEDRO)).body, { ok: true, id: ANA, trainer: true });
  assert.equal(h.db().users.find(u => u.id === ANA).trainer, true);
  assert.equal((await h.get('/api/trainer/clients', ANA)).status, 200);

  assert.deepEqual((await h.get(`/api/trainer/role?id=${OTRA}`, PEDRO)).body, { id: OTRA, trainer: true, clients: 1, coach: null });
  assert.equal((await h.post('/api/trainer/role', { id: OTRA, trainer: false }, PEDRO)).status, 200);
  assert.equal('trainer' in h.db().users.find(u => u.id === OTRA), false);
  assert.equal((await h.get('/api/trainer/clients', OTRA)).status, 403);
  assert.equal((await h.get(`/api/trainer/client?id=${BETO}`, OTRA)).status, 403);
  assert.equal((await h.get('/api/trainer/me', BETO)).body.coach, null);
  // The link is kept, so giving the role back restores it.
  await h.post('/api/trainer/role', { id: OTRA, trainer: true }, PEDRO);
  assert.equal((await h.get(`/api/trainer/client?id=${BETO}`, OTRA)).status, 200);
  const events = fs.readFileSync(path.join(h.dataDir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l).ev);
  assert.ok(events.includes('admin.trainer.grant') && events.includes('admin.trainer.revoke') && events.includes('trainer.denied'), events.join(' '));
});

test('deleting an account removes its links and what a trainer kept about it', async t => {
  const h = await startServer(t, { coaching: [link(PEDRO, ANA), link(OTRA, BETO)] });
  h.plant(ANA, { workouts: [okW('w1', { note: 'Primera' })] });
  h.plant(BETO, { workouts: [okW('w1', { note: 'Primera' })] });
  await h.post('/api/trainer/seen', { clientId: ANA }, PEDRO);
  await h.post('/api/trainer/seen', { clientId: BETO }, OTRA);
  assert.equal((await h.post('/api/admin/user/delete', { id: ANA }, PEDRO)).status, 200);
  assert.deepEqual(h.db().coaching.map(l => l.clientId), [BETO]);
  assert.equal(fs.existsSync(h.coachingFile(ANA)), false);
  // A deleted trainer: the client stays, unlinked, and the trainer's marks about them go.
  assert.equal((await h.post('/api/admin/user/delete', { id: OTRA }, PEDRO)).status, 200);
  assert.deepEqual(h.db().coaching, []);
  assert.equal(fs.existsSync(h.coachingFile(BETO)), false);
  assert.equal((await h.get('/api/trainer/me', BETO)).body.coach, null);
});
