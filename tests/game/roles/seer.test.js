import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView } from '../../../server/game/index.js';
import { advance, as, firstNight, nightAct, playNight, rejects, started, voteOut } from '../../helpers.js';

// p1 p2 wolves, p3 seer, p4 protector, p5 p6 villagers.
describe('role: Vidente', () => {
  it('acts first and learns whether the player is a wolf', () => {
    let s = firstNight(started(6));
    assert.equal(s.night.step, 'seer');
    s = nightAct(s, 'p3', { targetId: 'p1' });
    assert.equal(s.night.step, 'protector');
    assert.deepEqual(playerView(s, 'p3').me.seerResults, [{ round: 1, targetId: 'p1', isWolf: true }]);
  });

  it('sees "not a wolf" for villagers', () => {
    const s = nightAct(firstNight(started(6)), 'p3', { targetId: 'p5' });
    assert.equal(s.seerResults[0].isWolf, false);
  });

  it('cannot check themselves or a dead player', () => {
    const s = firstNight(started(6));
    rejects(s, { type: 'night:act', actor: as('p3'), targetId: 'p3' }, 'TARGET_INVALID');
    rejects(s, { type: 'night:act', actor: as('p3'), targetId: 'nobody' }, 'TARGET_INVALID');
  });

  it('acts only once per night', () => {
    const s = nightAct(firstNight(started(6)), 'p3', { targetId: 'p1' });
    rejects(s, { type: 'night:act', actor: as('p3'), targetId: 'p2' }, 'NOT_YOUR_TURN');
  });

  it('the result reaches only the seer', () => {
    const s = nightAct(firstNight(started(6)), 'p3', { targetId: 'p1' });
    for (const id of ['p1', 'p2', 'p4', 'p5']) assert.equal(playerView(s, id).me.seerResults, undefined);
  });

  it('a dead seer is skipped silently', () => {
    let s = firstNight(started(6));
    s = playNight(s, { seer: 'p5', protector: 'p4', wolves: 'p3' });
    s = advance(s, 'day');
    s = voteOut(s, 'p1');
    s = advance(s, 'night');
    assert.equal(s.night.step, 'protector', 'the seer step was skipped');
  });
});
