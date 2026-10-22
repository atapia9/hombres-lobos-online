import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { narratorView, playerView, publicView } from '../../server/game/index.js';
import { leakedPaths } from '../leaks.js';
import {
  NARRATOR, act, advance, as, firstNight, lobby, nightAct, playNight, started, voteOut,
} from '../helpers.js';

// 12 players, every role: p1..p3 wolves, p4 alpha, p5 seer, p6 protector, p7 hunter,
// p8 mayor, p9 spy, p10 witch, p11 p12 villagers.
const ALL = { alpha: true, seer: true, protector: true, hunter: true, mayor: true, spy: true, witch: true };
const table = (rules) => started(12, { roles: ALL, wolfCount: 3, ...rules });

/** Collects the state after every action of a long game. */
function snapshots(rules) {
  const states = [];
  const keep = (s) => { states.push(s); return s; };
  let s = keep(table(rules));
  s = keep(firstNight(s));
  s = keep(nightAct(s, 'p5', { targetId: 'p1' }));
  s = keep(nightAct(s, 'p6', { targetId: 'p12' }));
  for (const id of ['p1', 'p2', 'p3', 'p4']) s = keep(nightAct(s, id, { targetId: 'p7' }));
  s = keep(nightAct(s, 'p4', { convert: false }));
  s = keep(nightAct(s, 'p10', { heal: false, poisonTargetId: 'p11' }));
  s = keep(advance(s, 'dawn'));
  s = keep(act(s, { type: 'hunter:shoot', actor: as('p7'), targetId: 'p1' }));
  s = keep(advance(s, 'day'));
  s = keep(voteOut(s, 'p2'));
  s = keep(advance(s, 'night'));
  s = keep(playNight(s, { seer: 'p3', protector: 'p8', wolves: 'p9', convert: true }));
  s = keep(advance(s, 'day'));
  s = keep(voteOut(s, 'p3'));
  s = keep(advance(s, 'night'));
  s = keep(playNight(s, { seer: 'p4', protector: 'p5', wolves: 'p12' }));
  s = keep(advance(s, 'day'));
  s = keep(voteOut(s, 'p4'));
  s = keep(advance(s, 'night'));
  s = keep(playNight(s, { seer: 'p9', protector: 'p6', wolves: 'p8' }));
  if (s.phase !== 'ended') s = keep(voteOut(advance(s, 'day'), 'p9'));
  return states;
}

describe('views: nothing secret leaves its owner (ADR-002)', () => {
  const states = snapshots();

  it('the scripted game reaches the end', () => {
    assert.equal(states.at(-1).phase, 'ended');
    assert.equal(states.at(-1).winner, 'village');
  });

  it('the public view never carries roles, targets or the night step', () => {
    for (const s of states) assert.deepEqual(leakedPaths(publicView(s)), [], `phase ${s.phase}`);
  });

  it('a player view carries secrets only under `me`', () => {
    for (const s of states) {
      for (const p of s.players) assert.deepEqual(leakedPaths(playerView(s, p.id)), [], `${p.id} in ${s.phase}`);
    }
  });

  it('dead roles are public only when the narrator enables it (D-12)', () => {
    const hidden = states.find((s) => s.phase === 'day');
    assert.ok(publicView(hidden).players.every((p) => p.role === undefined));
    const revealed = snapshots({ revealDeadRoles: true }).find((s) => s.phase === 'day');
    const dead = publicView(revealed).players.filter((p) => !p.alive);
    assert.ok(dead.length > 0 && dead.every((p) => typeof p.role === 'string'));
    assert.deepEqual(leakedPaths(publicView(revealed), { revealDead: true }), []);
  });

  it('every role is revealed at the end', () => {
    const view = publicView(states.at(-1));
    assert.ok(view.players.every((p) => typeof p.role === 'string'));
    assert.equal(view.players.find((p) => p.id === 'p9').originalRole, 'spy');
  });
});

describe('views: per-player secrets', () => {
  it('only the hunter is told to shoot', () => {
    let s = table();
    s = playNight(firstNight(s), { seer: 'p1', protector: 'p12', wolves: 'p7' });
    assert.equal(playerView(s, 'p7').me.mustShoot, true);
    assert.equal(playerView(s, 'p8').me.mustShoot, undefined);
    assert.deepEqual(publicView(s).pendingShot, { hunterId: 'p7' });
  });

  it('a player sees their own turn and nobody else\'s', () => {
    const s = firstNight(table());
    assert.equal(playerView(s, 'p5').me.night.turn, true);
    assert.equal(playerView(s, 'p6').me.night.turn, false);
    assert.equal(playerView(s, 'p5').me.night.step, 'seer');
    assert.equal(playerView(s, 'p6').me.night.step, null);
  });

  it('unknown players get no view', () => {
    assert.equal(playerView(table(), 'ghost'), null);
  });
});

describe('views: narrator', () => {
  it('shows the composition and setup errors in the lobby', () => {
    let s = lobby(6);
    s = act(s, { type: 'game:configure', actor: NARRATOR, wolfCount: 3 });
    const { derived } = narratorView(s);
    assert.equal(derived.setupError, 'TOO_MANY_WOLVES');
    assert.equal(derived.composition.wolfTotal, 3);
    assert.equal(derived.recommendedWolfTotal, 2);
  });

  it('shows the night step, its actors and a preview of the outcome', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p5', { targetId: 'p1' });
    const { derived } = narratorView(s);
    assert.equal(derived.night.step, 'protector');
    assert.deepEqual(derived.night.actorIds, ['p6']);
    assert.deepEqual(derived.night.preview.deaths, []);
  });

  it('shows the weighted live vote', () => {
    let s = advance(playNight(firstNight(table()), { seer: 'p1', protector: 'p12', wolves: 'p12' }), 'day');
    s = act(s, { type: 'day:accuse', actor: as('p5'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = act(s, { type: 'day:vote', actor: as('p8'), targetId: 'p1' });
    assert.deepEqual(narratorView(s).derived.liveVote.weighted, { p1: 2 });
  });
});
