import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView, spy } from '../../../server/game/index.js';
import { NARRATOR, act, firstNight, nightAct, playNight, started } from '../../helpers.js';

// 9 players with mayor and spy: p1..p3 wolves, p4 seer, p5 protector, p6 mayor, p7 spy, p8 p9 villagers.
const table = () => started(9, { roles: { mayor: true, spy: true } });

describe('role: Niña que espía', () => {
  it('has no action of her own', () => {
    assert.equal(spy.label, 'Niña que espía');
    assert.deepEqual(spy.nightSteps, []);
  });

  it('learns who the wolves chose, but not who the wolves are (D-5)', () => {
    const s = playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p8' });
    const me = playerView(s, 'p7').me;
    assert.deepEqual(me.spyReports, [{ round: 1, targetId: 'p8', unanimous: true }]);
    assert.equal(me.partnerIds, undefined);
    assert.ok(!JSON.stringify(me.spyReports).includes('p1'));
  });

  it('learns when the wolves did not agree', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p4', { targetId: 'p1' });
    s = nightAct(s, 'p5', { targetId: 'p9' });
    s = nightAct(s, 'p1', { targetId: 'p8' });
    s = nightAct(s, 'p2', { targetId: 'p9' });
    s = nightAct(s, 'p3', { targetId: 'p9' });
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'wolves' });
    assert.deepEqual(playerView(s, 'p7').me.spyReports, [{ round: 1, targetId: null, unanimous: false }]);
  });

  it('her reports reach only her', () => {
    const s = playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p8' });
    for (const id of ['p1', 'p4', 'p6', 'p9']) assert.equal(playerView(s, id).me.spyReports, undefined);
  });
});
