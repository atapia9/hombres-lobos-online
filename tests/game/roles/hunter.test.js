import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView } from '../../../server/game/index.js';
import {
  NARRATOR, act, advance, as, firstNight, playNight, rejects, started, voteOut,
} from '../../helpers.js';

// 8 players with the hunter: p1 p2 wolves, p3 seer, p4 protector, p5 hunter, p6..p8 villagers.
const table = () => started(8, { roles: { hunter: true } });
const shoot = (s, targetId) => act(s, { type: 'hunter:shoot', actor: as('p5'), targetId });

describe('role: Cazador', () => {
  it('killed at night, shoots at dawn after the deaths are announced (D-9)', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p3', wolves: 'p5' });
    assert.equal(s.phase, 'dawn');
    assert.deepEqual(s.pendingShot, { hunterId: 'p5', phase: 'night' });
    assert.equal(playerView(s, 'p5').me.mustShoot, true);
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' }, 'HUNTER_PENDING');
    s = shoot(s, 'p1');
    assert.equal(s.players.find((p) => p.id === 'p1').eliminatedBy, 'hunter');
    assert.equal(s.pendingShot, null);
    advance(s, 'day');
  });

  it('voted out, shoots right away', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p3', wolves: 'p6' });
    s = voteOut(advance(s, 'day'), 'p5');
    assert.equal(s.pendingShot.hunterId, 'p5');
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'HUNTER_PENDING');
    s = shoot(s, 'p2');
    advance(s, 'night');
  });

  it('cannot shoot themselves, a dead player, or when not pending', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p3', wolves: 'p5' });
    rejects(s, { type: 'hunter:shoot', actor: as('p5'), targetId: 'p5' }, 'TARGET_INVALID');
    rejects(s, { type: 'hunter:shoot', actor: as('p6'), targetId: 'p1' }, 'NO_PENDING_SHOT');
    s = shoot(s, 'p1');
    rejects(s, { type: 'hunter:shoot', actor: as('p5'), targetId: 'p2' }, 'NO_PENDING_SHOT');
  });

  it('the narrator can skip the shot', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p3', wolves: 'p5' });
    s = act(s, { type: 'hunter:skip', actor: NARRATOR });
    assert.equal(s.pendingShot, null);
    assert.equal(s.history.at(-1).targetId, null);
  });

  it('removal by the narrator does not trigger the shot', () => {
    const s = act(table(), { type: 'player:remove', actor: NARRATOR, playerId: 'p5' });
    assert.equal(s.pendingShot, null);
  });

  it('the victory waits for the shot, and the shot can decide it', () => {
    // 6 players: p1 p2 wolves, p3 hunter, p4 seer... use wolves' parity scenario.
    let s = started(6, { roles: { hunter: true, protector: false } });
    // p1 p2 wolves, p3 seer, p4 hunter, p5 p6 villagers.
    s = playNight(firstNight(s), { seer: 'p5', wolves: 'p6' });
    s = voteOut(advance(s, 'day'), 'p4');
    // 2 wolves vs 2 villagers would be parity, but the hunter shoots first.
    assert.equal(s.phase, 'day');
    s = act(s, { type: 'hunter:shoot', actor: as('p4'), targetId: 'p1' });
    assert.equal(s.phase, 'day', 'one wolf vs two villagers: the game goes on');
  });
});
