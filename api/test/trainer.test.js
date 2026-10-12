/* Hally: the trainer layer's own rules, on a plain db object (trainer.js above its factory). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isTrainer, linksOf, linkClient, unlinkClient, linkInvited, inviteTrainer, linkOfClient, linksOfTrainer,
  isLinked, pruneLinks, forgetCoaching, coachingFile, painOf, noteKey, unreadNotes
} from '../trainer.js';

const dbOf = () => ({
  users: [
    { id: 'pedro', name: 'Pedro', admin: true, trainer: true },
    { id: 'otra', name: 'Otra entrenadora', trainer: true },
    { id: 'ana', name: 'Ana', created: '2026-10-12T10:00:00.000Z' },
    { id: 'beto', name: 'Beto' }
  ],
  invites: []
});

test('only `trainer: true` is a trainer', () => {
  assert.equal(isTrainer({ trainer: true }), true);
  for (const u of [null, undefined, {}, { trainer: 1 }, { trainer: 'yes' }, { admin: true }]) assert.equal(isTrainer(u), false);
});

test('a db.json from before the trainer layer gains an empty coaching list', () => {
  const db = { users: [] };
  assert.deepEqual(linksOf(db), []);
  assert.deepEqual(db.coaching, []);
});

test('linkClient links a client to a trainer, once', () => {
  const db = dbOf();
  const link = linkClient(db, 'pedro', 'ana', 'invite:ABC', '2026-10-12T10:00:00.000Z');
  assert.deepEqual(link, { trainerId: 'pedro', clientId: 'ana', since: '2026-10-12T10:00:00.000Z', via: 'invite:ABC' });
  assert.equal(linkClient(db, 'pedro', 'ana', 'again'), link);
  assert.equal(db.coaching.length, 1);
  assert.equal(isLinked(db, 'pedro', 'ana'), true);
  assert.equal(isLinked(db, 'pedro', 'beto'), false);
  assert.equal(isLinked(db, 'ana', 'pedro'), false);
});

test('linkClient refuses a trainer who is not one, a missing profile and a self-link', () => {
  const db = dbOf();
  assert.equal(linkClient(db, 'ana', 'beto', 'x'), null);
  assert.equal(linkClient(db, 'pedro', 'nadie', 'x'), null);
  assert.equal(linkClient(db, 'nadie', 'ana', 'x'), null);
  assert.equal(linkClient(db, 'pedro', 'pedro', 'x'), null);
  assert.deepEqual(linksOf(db), []);
});

test('a client has one trainer: a new link replaces the old one', () => {
  const db = dbOf();
  linkClient(db, 'pedro', 'ana', 'x');
  linkClient(db, 'otra', 'ana', 'y');
  assert.equal(db.coaching.length, 1);
  assert.equal(linkOfClient(db, 'ana').trainerId, 'otra');
  assert.deepEqual(linksOfTrainer(db, 'pedro'), []);
});

test('unlinkClient ends the link and says whether there was one', () => {
  const db = dbOf();
  linkClient(db, 'pedro', 'ana', 'x');
  assert.equal(unlinkClient(db, 'pedro', 'beto'), false);
  assert.equal(unlinkClient(db, 'pedro', 'ana'), true);
  assert.equal(linkOfClient(db, 'ana'), null);
});

test('an invite made by a trainer links the profile that redeems it; any other invite links nobody', () => {
  const db = dbOf();
  assert.deepEqual(inviteTrainer(db.users[0]), { trainerId: 'pedro' });
  assert.deepEqual(inviteTrainer(db.users[2]), {});
  const ana = db.users[2];
  assert.equal(linkInvited(db, null, ana), null);
  assert.equal(linkInvited(db, { code: 'PLAIN' }, ana), null);
  const link = linkInvited(db, { code: 'ABC', trainerId: 'pedro' }, ana);
  assert.deepEqual(link, { trainerId: 'pedro', clientId: 'ana', since: ana.created, via: 'invite:ABC' });
});

test('a link stops counting while the trainer has lost the role, and counts again with it', () => {
  const db = dbOf();
  linkClient(db, 'pedro', 'ana', 'x');
  delete db.users[0].trainer;
  assert.equal(isLinked(db, 'pedro', 'ana'), false);
  assert.equal(linkOfClient(db, 'ana'), null);
  assert.equal(pruneLinks(db), false);            // kept: the role may come back
  db.users[0].trainer = true;
  assert.equal(isLinked(db, 'pedro', 'ana'), true);
});

test('pruneLinks drops the links of a profile that is gone', () => {
  const db = dbOf();
  linkClient(db, 'pedro', 'ana', 'x');
  linkClient(db, 'pedro', 'beto', 'x');
  db.users = db.users.filter(u => u.id !== 'ana');
  assert.equal(pruneLinks(db), true);
  assert.deepEqual(db.coaching.map(l => l.clientId), ['beto']);
});

test('forgetCoaching removes a deleted client\'s links and file, and a deleted trainer\'s files of every client', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hally-coaching-'));
  try {
    fs.mkdirSync(path.join(dir, 'coaching'));
    const db = dbOf();
    linkClient(db, 'pedro', 'ana', 'x');
    linkClient(db, 'pedro', 'beto', 'x');
    for (const id of ['ana', 'beto']) fs.writeFileSync(coachingFile(dir, id), '{}');
    assert.equal(forgetCoaching(db, dir, 'ana'), 1);
    assert.deepEqual(db.coaching.map(l => l.clientId), ['beto']);
    assert.equal(fs.existsSync(coachingFile(dir, 'ana')), false);
    assert.equal(fs.existsSync(coachingFile(dir, 'beto')), true);
    assert.equal(forgetCoaching(db, dir, 'pedro'), 1);
    assert.deepEqual(db.coaching, []);
    assert.equal(fs.existsSync(coachingFile(dir, 'beto')), false);
    assert.equal(forgetCoaching(db, dir, 'nadie'), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the coaching file of a client cannot leave data/coaching', () => {
  assert.equal(coachingFile('/data', '../../etc/passwd'), path.join('/data', 'coaching', 'etcpasswd.json'));
});

test('painOf reads a session\'s pain and nothing that is not one', () => {
  assert.deepEqual(painOf({ pain: { during: 4, area: ' rodilla derecha ', worseNextDay: true, note: 'al bajar' } }),
    { during: 4, area: 'rodilla derecha', worseNextDay: true, note: 'al bajar' });
  assert.deepEqual(painOf({ pain: { during: 0 } }), { during: 0 });
  assert.deepEqual(painOf({ pain: { during: 2, worseNextDay: 'no', area: '' } }), { during: 2 });
  for (const w of [null, {}, { pain: null }, { pain: 'mucho' }, { pain: [] }, { pain: { during: 11 } }, { pain: { during: -1 } }, { pain: { during: 2.5 } }, { pain: { area: 'rodilla' } }]) {
    assert.equal(painOf(w), null, JSON.stringify(w));
  }
  assert.equal(painOf({ pain: { during: 3, area: 'x'.repeat(100), note: 'y'.repeat(1000) } }).area.length, 40);
  assert.equal(painOf({ pain: { during: 3, area: 'x'.repeat(100), note: 'y'.repeat(1000) } }).note.length, 280);
});

test('a note is unread until its own text has been seen', () => {
  const workouts = [
    { id: 'w1', note: 'Me costó la sentadilla' },
    { id: 'w2', note: '   ' },
    { id: 'w3' },
    { id: 'w4', note: 'Todo bien' }
  ];
  assert.deepEqual(unreadNotes(workouts, {}).map(w => w.id), ['w1', 'w4']);
  assert.deepEqual(unreadNotes(workouts, null).map(w => w.id), ['w1', 'w4']);
  const seen = { w1: noteKey('Me costó la sentadilla'), w4: noteKey('Todo bien') };
  assert.deepEqual(unreadNotes(workouts, seen), []);
  workouts[0].note = 'Me costó la sentadilla, y me dolió la rodilla';
  assert.deepEqual(unreadNotes(workouts, seen).map(w => w.id), ['w1']);
  assert.equal(noteKey(' Todo bien '), noteKey('Todo bien'));
});
