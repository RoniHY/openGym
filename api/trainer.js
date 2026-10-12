/* Hally: the trainer layer.
 *
 * A human trainer following their own clients. Three things live here and nowhere else:
 *
 *   - the role: `users[].trainer === true` in db.json, set by an admin (the pattern of `admin`);
 *   - the link: `db.coaching[] = { trainerId, clientId, since, via }`, one trainer per client.
 *     It is made when a profile is created with an invite code a trainer made (the code is the
 *     consent), or when an existing profile redeems such a code. Either side can end it;
 *   - the guard: `requireTrainerOf`, which lets a trainer read a client linked to them and
 *     nobody else. Not admin: a trainer cannot delete accounts, reset passwords or read the log.
 *
 * What a trainer reads is the client's own document (state-<uid>.json), through the same
 * sanitising the admin drill-down uses. Nothing here writes into it: PUT /api/data replaces the
 * whole document from the client's device, so anything a trainer wrote there could be lost to
 * the client's next sync. What the trainer writes goes to data/coaching/<clientId>.json — for
 * now only which session notes they have read.
 *
 * Written as a factory taking server.js's own helpers, like coach/routes.js: they are closures
 * over the db and the session secret, and this keeps server.js to one line and this file
 * testable against fakes. The functions above the factory are pure, on a db object.
 *
 * These routes are documented in docs/hally/API.md rather than api/openapi.yaml, which stays
 * upstream's file.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './durable.js';

const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export const isTrainer = user => !!user && user.trainer === true;

/** `db.coaching`, made if the file predates it. Entries that are not objects are dropped. */
export function linksOf(db) {
  if (!Array.isArray(db.coaching)) db.coaching = [];
  return db.coaching;
}

/** A link counts while both profiles exist and the trainer still holds the role. */
const live = (db, link) => {
  if (!record(link)) return false;
  const trainer = db.users.find(u => u.id === link.trainerId);
  return isTrainer(trainer) && db.users.some(u => u.id === link.clientId);
};

/** The link of `clientId` to their trainer, or null. */
export const linkOfClient = (db, clientId) => linksOf(db).find(l => live(db, l) && l.clientId === clientId) || null;

/** Every live link of `trainerId`. */
export const linksOfTrainer = (db, trainerId) => linksOf(db).filter(l => live(db, l) && l.trainerId === trainerId);

export const isLinked = (db, trainerId, clientId) => linksOfTrainer(db, trainerId).some(l => l.clientId === clientId);

/**
 * Links `clientId` to `trainerId`. Returns the link, or null when it cannot be made: the trainer
 * is not one, either profile is missing, or it would link a profile to itself. A client has one
 * trainer: a link to another one is replaced.
 */
export function linkClient(db, trainerId, clientId, via, now = new Date().toISOString()) {
  const trainer = db.users.find(u => u.id === trainerId);
  const client = db.users.find(u => u.id === clientId);
  if (!isTrainer(trainer) || !client || trainerId === clientId) return null;
  const links = linksOf(db);
  const same = links.find(l => record(l) && l.trainerId === trainerId && l.clientId === clientId);
  if (same) return same;
  db.coaching = links.filter(l => record(l) && l.clientId !== clientId);
  const link = { trainerId, clientId, since: now, via: str(via).slice(0, 40) || 'invite' };
  db.coaching.push(link);
  return link;
}

/** Ends the link between the two. Returns whether there was one. */
export function unlinkClient(db, trainerId, clientId) {
  const links = linksOf(db);
  db.coaching = links.filter(l => !(record(l) && l.trainerId === trainerId && l.clientId === clientId));
  return db.coaching.length !== links.length;
}

/**
 * The one line server.js calls where a signup burns its invite: a code a trainer made links the
 * new profile to that trainer. A code from an admin who is not a trainer carries no `trainerId`
 * and links nobody.
 */
export function linkInvited(db, invite, user) {
  if (!record(invite) || !invite.trainerId || !user) return null;
  return linkClient(db, invite.trainerId, user.id, 'invite:' + invite.code, user.created);
}

/** What an invite made by `user` carries beyond upstream's fields. */
export const inviteTrainer = user => (isTrainer(user) ? { trainerId: user.id } : {});

const safeId = uid => str(uid).replace(/[^a-zA-Z0-9_-]/g, '');
/** Where the trainer's side of one client is kept: data/coaching/<clientId>.json. */
export const coachingFile = (dataDir, clientId) => path.join(dataDir, 'coaching', safeId(clientId) + '.json');

/**
 * The one line server.js calls where an admin deletes an account: its links go, and so does what
 * a trainer kept about it — or, when it was a trainer, what it kept about each of its clients.
 */
export function forgetCoaching(db, dataDir, uid) {
  const links = linksOf(db);
  const gone = links.filter(l => record(l) && (l.trainerId === uid || l.clientId === uid));
  db.coaching = links.filter(l => !gone.includes(l));
  for (const clientId of new Set([uid, ...gone.map(l => l.clientId)])) {
    try { fs.unlinkSync(coachingFile(dataDir, clientId)); } catch { /* nothing kept */ }
  }
  return gone.length;
}

/** Drops the dead links: a deleted profile's. A former trainer's stay until the role is back. */
export function pruneLinks(db) {
  const links = linksOf(db);
  db.coaching = links.filter(l => record(l) && db.users.some(u => u.id === l.trainerId) && db.users.some(u => u.id === l.clientId));
  return db.coaching.length !== links.length;
}

/* ---------- what a session says about pain ---------- */
// The client's own app writes `workouts[].pain` (frontend/src/lib/hally-pain.js). Read here with
// the same tolerance the admin routes read everything with: a shape that is not one says nothing.
export function painOf(w) {
  const p = w?.pain;
  if (!record(p)) return null;
  const during = Number(p.during);
  if (!Number.isInteger(during) || during < 0 || during > 10) return null;
  return {
    during,
    ...(str(p.area).trim() ? { area: str(p.area).trim().slice(0, 40) } : {}),
    ...(typeof p.worseNextDay === 'boolean' ? { worseNextDay: p.worseNextDay } : {}),
    ...(str(p.note).trim() ? { note: str(p.note).trim().slice(0, 280) } : {})
  };
}

/* ---------- which session notes the trainer has read ---------- */
// Keyed by the note's text, not by the session alone: a note the client rewrites afterwards is
// unread again.
export const noteKey = note => crypto.createHash('sha256').update(str(note).trim()).digest('base64url').slice(0, 12);
const noteOf = w => str(w?.note).trim();
export const unreadNotes = (workouts, seen) => workouts.filter(w => noteOf(w) && (seen || {})[w.id] !== noteKey(w.note));

export function trainerRoutes({ json, readBody, readSession, requireAdmin, getDb, saveDb, readState, records, livePresence, lastSyncOf, audit, dataDir, inviteOnly = false }) {
  const db = () => getDb();
  const fileOf = clientId => coachingFile(dataDir, clientId);

  /** data/coaching/<clientId>.json as the trainer `trainerId` left it. Another trainer's marks
   *  (the client changed trainer) are nobody's: the file reads as empty. */
  function readCoaching(clientId, trainerId) {
    let file = null;
    try { file = JSON.parse(fs.readFileSync(fileOf(clientId), 'utf8')); } catch { /* none yet, or unreadable */ }
    if (!record(file) || file.trainerId !== trainerId) return { trainerId, seen: {} };
    return { ...file, seen: record(file.seen) ? file.seen : {} };
  }
  function writeCoaching(clientId, doc) {
    fs.mkdirSync(path.dirname(fileOf(clientId)), { recursive: true, mode: 0o700 });
    atomicWrite(fileOf(clientId), JSON.stringify(doc, null, 2), 0o600);
  }
  const dropCoaching = clientId => { try { fs.unlinkSync(fileOf(clientId)); } catch { /* nothing kept */ } };

  const signedIn = (req, res) => {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    return user;
  };
  const requireTrainer = (req, res) => {
    const user = signedIn(req, res);
    if (!user) return null;
    if (!isTrainer(user)) { json(res, 403, { error: 'forbidden' }); return null; }
    return user;
  };
  /** Guard for a trainer reading one client. A profile that does not exist and one that is not
   *  theirs answer alike, so a trainer cannot tell which ids are taken. Returns { trainer, client }. */
  const requireTrainerOf = (req, res, clientId) => {
    const trainer = signedIn(req, res);
    if (!trainer) return null;
    const client = db().users.find(u => u.id === clientId);
    if (!isTrainer(trainer) || !client || !isLinked(db(), trainer.id, client.id)) {
      audit(req, 'trainer.denied', { ok: false, user: trainer });
      json(res, 403, { error: 'forbidden' });
      return null;
    }
    return { trainer, client };
  };
  const nameOf = uid => db().users.find(u => u.id === uid)?.name || null;
  const freshCode = () => {
    let code;
    do { code = crypto.randomBytes(8).toString('hex').toUpperCase(); } while (db().invites.some(i => i.code === code));
    return code;
  };

  // One row of "My clients". The plan slice is what the app's own weekTally needs
  // (frontend/src/lib/queue.js) to say "2 of 3 this week" by the rules the client sees.
  const RECENT_DAYS = 35;
  function clientRow(link, client) {
    const S = readState(client.id) || {};
    const workouts = records(S.workouts);
    const last = workouts[workouts.length - 1] || null;
    const seen = readCoaching(client.id, link.trainerId).seen;
    const pained = [...workouts].reverse().find(w => painOf(w));
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
    return {
      id: client.id, name: client.name, since: link.since || null, disabled: !!client.disabled,
      workouts: workouts.length,
      lastWorkout: last ? { id: last.id, d: last.d || null, name: str(last.name), end: last.end || null } : null,
      lastPain: pained ? { ...painOf(pained), d: pained.d || null, workoutId: pained.id } : null,
      unreadNotes: unreadNotes(workouts, seen).length,
      lastSync: lastSyncOf(client, S),
      live: livePresence(client.id),
      plan: {
        weekStart: S.weekStart ?? null,
        week: record(S.week) ? S.week : {},
        queue: record(S.queue) ? S.queue : null,
        routines: records(S.routines).map(r => ({ id: r.id, name: r.name })),
        workouts: workouts.filter(w => str(w.d) >= since).map(w => ({
          id: w.id, d: w.d, start: w.start, end: w.end, name: w.name,
          ...(Array.isArray(w.routineIds) ? { routineIds: w.routineIds } : {}),
          ...(w.routineId != null ? { routineId: w.routineId } : {})
        }))
      }
    };
  }

  return {
    /* ------------------------------ everyone ------------------------------ */

    // What the app asks once per sign-in: is this profile a trainer, and does it have one.
    'GET /api/trainer/me': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const link = linkOfClient(db(), user.id);
      json(res, 200, {
        trainer: isTrainer(user),
        clients: isTrainer(user) ? linksOfTrainer(db(), user.id).length : 0,
        coach: link ? { id: link.trainerId, name: nameOf(link.trainerId), since: link.since || null } : null
      });
    },

    // Ends a link, from either side: a trainer names the client, a client names nobody.
    'POST /api/trainer/unlink': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      const clientId = str(body.clientId);
      const link = clientId
        ? linksOf(db()).find(l => record(l) && l.trainerId === user.id && l.clientId === clientId)
        : linksOf(db()).find(l => record(l) && l.clientId === user.id);
      if (!link) return json(res, 404, { error: 'no such link' });
      unlinkClient(db(), link.trainerId, link.clientId);
      saveDb();
      // What the trainer kept about this client was theirs to keep while they were its trainer.
      dropCoaching(link.clientId);
      audit(req, 'trainer.unlink', { user, target: { id: link.clientId, name: nameOf(link.clientId) }, msg: clientId ? 'by-trainer' : 'by-client' });
      json(res, 200, { ok: true });
    },

    // An existing profile joins a trainer with one of their codes. The code is the consent, as at
    // signup, and is burned the same way.
    'POST /api/trainer/join': async (req, res) => {
      const user = signedIn(req, res); if (!user) return;
      const body = await readBody(req);
      const code = str(body.code).trim().toUpperCase();
      const invite = db().invites.find(i => i.code === code && !i.usedBy && !i.revoked && i.trainerId);
      if (!invite) return json(res, 403, { error: 'this code is not valid', code: 'invite' });
      const link = linkClient(db(), invite.trainerId, user.id, 'code:' + invite.code);
      if (!link) return json(res, 400, { error: 'this code cannot link this profile', code: 'invite' });
      invite.usedBy = user.id; invite.usedAt = new Date().toISOString();
      saveDb();
      audit(req, 'trainer.link', { user, target: { id: link.trainerId, name: nameOf(link.trainerId) }, msg: 'code' });
      json(res, 200, { ok: true, coach: { id: link.trainerId, name: nameOf(link.trainerId), since: link.since } });
    },

    /* ------------------------------ trainer ------------------------------ */

    'GET /api/trainer/clients': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const clients = linksOfTrainer(db(), trainer.id)
        .map(link => clientRow(link, db().users.find(u => u.id === link.clientId)))
        .sort((a, b) => str(a.name).localeCompare(str(b.name)));
      json(res, 200, { clients, invite_only: inviteOnly, now: Date.now() });
    },

    // One client, read-only: the admin drill-down's reading of the document (records(), no refs
    // to their photos and videos), plus what a trainer needs and an admin does not — the routines
    // with their exercises, the plan, and the client's own exercises by name.
    'GET /api/trainer/client': async (req, res) => {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const ok = requireTrainerOf(req, res, id); if (!ok) return;
      const { trainer, client } = ok;
      const S = readState(client.id) || {};
      const link = linkOfClient(db(), client.id);
      const workouts = records(S.workouts);
      const seen = readCoaching(client.id, trainer.id).seen;
      json(res, 200, {
        user: { id: client.id, name: client.name, created: client.created || null, disabled: !!client.disabled },
        since: link?.since || null,
        unit: S.unit || 'kg',
        effort: S.effort || 'none',
        lastSync: lastSyncOf(client, S),
        live: livePresence(client.id),
        routines: records(S.routines),
        plan: {
          weekStart: S.weekStart ?? null,
          week: record(S.week) ? S.week : {},
          queue: record(S.queue) ? S.queue : null
        },
        customEx: records(S.customEx).map(({ media, ...x }) => x),
        bodyweight: records(S.bodyweight),
        // records() already copied, so this reverse is ours: newest first for display.
        workouts: [...workouts].reverse().map(({ media, ...w }) => w),
        unread: unreadNotes(workouts, seen).map(w => w.id)
      });
    },

    // Marks session notes as read: the ones named, or every note there is now. What is recorded
    // is the note as it reads on the server at this moment, never what the caller says it read.
    'POST /api/trainer/seen': async (req, res) => {
      const body = await readBody(req);
      const ok = requireTrainerOf(req, res, str(body.clientId)); if (!ok) return;
      const { trainer, client } = ok;
      const only = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null;
      const workouts = records((readState(client.id) || {}).workouts);
      const doc = readCoaching(client.id, trainer.id);
      // Marks of sessions that no longer exist go with this write.
      const kept = {};
      for (const w of workouts) {
        if (!str(w.note).trim() || w.id == null) continue;
        if (!only || only.has(String(w.id))) kept[w.id] = noteKey(w.note);
        else if (doc.seen[w.id]) kept[w.id] = doc.seen[w.id];
      }
      writeCoaching(client.id, { ...doc, trainerId: trainer.id, seen: kept });
      json(res, 200, { ok: true, unread: unreadNotes(workouts, kept).map(w => w.id) });
    },

    // A trainer's own invite codes. On an invite-only instance this is how a client gets in, and
    // the code links the new profile to the trainer who made it.
    'GET /api/trainer/invites': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const invites = db().invites.filter(i => i.trainerId === trainer.id && !i.revoked)
        .map(i => ({ code: i.code, note: i.note || '', created: i.created || null, usedBy: i.usedBy || null, usedByName: i.usedBy ? nameOf(i.usedBy) : null }));
      json(res, 200, { invites, invite_only: inviteOnly });
    },

    'POST /api/trainer/invites/new': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const invite = { code: freshCode(), note: str(body.note).slice(0, 60), createdBy: trainer.id, created: new Date().toISOString(), trainerId: trainer.id };
      db().invites.push(invite);
      saveDb();
      audit(req, 'trainer.invite.create', { user: trainer, msg: invite.code });
      json(res, 200, { invite });
    },

    'POST /api/trainer/invites/revoke': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const body = await readBody(req);
      const code = str(body.code).toUpperCase();
      const inv = db().invites.find(i => i.code === code && i.trainerId === trainer.id);
      if (!inv) return json(res, 404, { error: 'no such code' });
      if (inv.usedBy) return json(res, 400, { error: 'already used, cannot revoke' });
      getDb().invites = db().invites.filter(i => i.code !== inv.code);
      saveDb();
      audit(req, 'trainer.invite.revoke', { user: trainer, msg: inv.code });
      json(res, 200, { ok: true });
    },

    /* ------------------------------ admin ------------------------------ */

    // Who holds the role is the admin's call, like who is disabled.
    'GET /api/trainer/role': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      const u = db().users.find(x => x.id === id);
      if (!u) return json(res, 404, { error: 'no such user' });
      const link = linkOfClient(db(), u.id);
      json(res, 200, {
        id: u.id, trainer: isTrainer(u),
        clients: linksOf(db()).filter(l => record(l) && l.trainerId === u.id && db().users.some(x => x.id === l.clientId)).length,
        coach: link ? { id: link.trainerId, name: nameOf(link.trainerId) } : null
      });
    },

    // Taking the role away does not drop the links: they stop counting (nobody reads anything)
    // and count again if the role comes back, so a slip of the thumb costs nothing.
    'POST /api/trainer/role': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const u = db().users.find(x => x.id === body.id);
      if (!u) return json(res, 404, { error: 'no such user' });
      if (body.trainer) u.trainer = true; else delete u.trainer;
      pruneLinks(db());
      saveDb();
      audit(req, isTrainer(u) ? 'admin.trainer.grant' : 'admin.trainer.revoke', { user: admin, target: u });
      json(res, 200, { ok: true, id: u.id, trainer: isTrainer(u) });
    }
  };
}
