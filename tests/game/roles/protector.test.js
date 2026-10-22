import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView } from '../../../server/game/index.js';
import { advance, as, firstNight, nightAct, playNight, rejects, started, voteOut } from '../../helpers.js';

// p1 p2 wolves, p3 seer, p4 protector, p5 p6 villagers.
const nextNight = (s, voted) => advance(voteOut(advance(s, 'day'), voted), 'night');

describe('role: Protector', () => {
  it('saves the wolves\' victim', () => {
    const s = playNight(firstNight(started(6)), { seer: 'p1', protector: 'p5', wolves: 'p5' });
    assert.deepEqual(s.lastNight.deathIds, []);
    assert.equal(s.history[0].protectedId, 'p5');
  });

  it('may protect themselves', () => {
    const s = playNight(firstNight(started(6)), { seer: 'p1', protector: 'p4', wolves: 'p4' });
    assert.deepEqual(s.lastNight.deathIds, []);
  });

  it('cannot protect the same person two nights in a row, themselves included (D-2)', () => {
    let s = playNight(firstNight(started(8)), { seer: 'p1', protector: 'p4', wolves: 'p5' });
    s = nextNight(s, 'p1');
    s = nightAct(s, 'p3', { targetId: 'p2' });
    rejects(s, { type: 'night:act', actor: as('p4'), targetId: 'p4' }, 'PROTECTOR_REPEAT');
    assert.equal(playerView(s, 'p4').me.protectorLastTargetId, 'p4');
    s = nightAct(s, 'p4', { targetId: 'p6' });
    assert.equal(s.night.step, 'wolves');
  });

  it('may repeat after a night in between', () => {
    let s = playNight(firstNight(started(9)), { seer: 'p1', protector: 'p6', wolves: 'p7' });
    s = nextNight(s, 'p1');
    s = playNight(s, { seer: 'p2', protector: 'p8', wolves: 'p9' });
    s = nextNight(s, 'p2');
    s = nightAct(s, 'p4', { targetId: 'p3' });
    s = nightAct(s, 'p5', { targetId: 'p6' });
    assert.equal(s.night.step, 'wolves');
  });

  it('a dead target cannot be protected', () => {
    let s = playNight(firstNight(started(8)), { seer: 'p1', protector: 'p4', wolves: 'p5' });
    s = nextNight(s, 'p6');
    s = nightAct(s, 'p3', { targetId: 'p1' });
    rejects(s, { type: 'night:act', actor: as('p4'), targetId: 'p5' }, 'TARGET_INVALID');
  });
});
