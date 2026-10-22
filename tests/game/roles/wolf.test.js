import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView, resolveWolfVote } from '../../../server/game/index.js';
import {
  NARRATOR, act, advance, as, firstNight, nightAct, playNight, rejects, started, voteOut,
} from '../../helpers.js';

// p1 p2 wolves, p3 seer, p4 protector, p5 p6 villagers.
const atWolves = (n = 6) => nightAct(nightAct(firstNight(started(n)), 'p3', { targetId: 'p5' }), 'p4', { targetId: 'p3' });

describe('role: Lobo', () => {
  it('wolves recognise each other from the start', () => {
    const s = started(6);
    assert.deepEqual(playerView(s, 'p1').me.partnerIds, ['p2']);
    assert.deepEqual(playerView(s, 'p2').me.partnerIds, ['p1']);
    assert.equal(playerView(s, 'p5').me.partnerIds, undefined);
  });

  it('the victim dies when every living wolf agrees', () => {
    let s = atWolves();
    s = nightAct(s, 'p1', { targetId: 'p6' });
    assert.equal(s.night.step, 'wolves', 'waits for the other wolf');
    assert.deepEqual(playerView(s, 'p2').me.night.wolfPicks, { p1: 'p6', p2: null });
    s = nightAct(s, 'p2', { targetId: 'p6' });
    assert.equal(s.night.step, 'done');
    s = advance(s, 'dawn');
    assert.deepEqual(s.lastNight.deathIds, ['p6']);
  });

  it('a disagreement keeps the step open until they agree or the narrator decides (D-1)', () => {
    let s = atWolves();
    s = nightAct(s, 'p1', { targetId: 'p5' });
    s = nightAct(s, 'p2', { targetId: 'p6' });
    assert.equal(s.night.step, 'wolves');
    assert.equal(playerView(s, 'p1').me.night.wolvesDisagree, true);
    s = act(s, { type: 'night:wolvesRevote', actor: NARRATOR });
    assert.deepEqual(s.night.wolfBallots, {});
    s = nightAct(s, 'p1', { targetId: 'p5' });
    s = nightAct(s, 'p2', { targetId: 'p6' });
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'wolves' });
    s = advance(s, 'dawn');
    assert.deepEqual(s.lastNight.deathIds, [], 'no agreement, no victim');
  });

  it('a wolf may change their pick while the step is open', () => {
    let s = atWolves();
    s = nightAct(s, 'p1', { targetId: 'p5' });
    s = nightAct(s, 'p2', { targetId: 'p6' });
    s = nightAct(s, 'p1', { targetId: 'p6' });
    assert.equal(s.night.step, 'done');
  });

  it('with a single wolf alive, their pick is enough', () => {
    let s = playNight(firstNight(started(6)), { seer: 'p1', protector: 'p4', wolves: 'p6' });
    s = voteOut(advance(s, 'day'), 'p1');
    s = advance(s, 'night');
    s = playNight(s, { seer: 'p2', protector: 'p3', wolves: 'p5' });
    assert.deepEqual(s.lastNight.deathIds, ['p5']);
  });

  it('cannot pick a wolf or a dead player', () => {
    const s = atWolves();
    rejects(s, { type: 'night:act', actor: as('p1'), targetId: 'p2' }, 'TARGET_INVALID');
    rejects(s, { type: 'night:act', actor: as('p1'), targetId: 'p1' }, 'TARGET_INVALID');
  });

  it('non-wolves cannot vote in the wolves\' step', () => {
    rejects(atWolves(), { type: 'night:act', actor: as('p5'), targetId: 'p6' }, 'NOT_YOUR_TURN');
  });

  it('resolveWolfVote needs every living wolf', () => {
    const s = nightAct(atWolves(), 'p1', { targetId: 'p6' });
    assert.deepEqual(resolveWolfVote(s), { allVoted: false, unanimous: false, targetId: null });
  });
});
