import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView, teamOf } from '../../../server/game/index.js';
import { advance, as, firstNight, nightAct, playNight, rejects, started, voteOut } from '../../helpers.js';

// 8 players with the witch: p1 p2 wolves, p3 seer, p4 protector, p5 witch, p6..p8 villagers.
const table = () => started(8, { roles: { witch: true } });
const nextNight = (s, voted) => advance(voteOut(advance(s, 'day'), voted), 'night');
const toWitch = (s, victim, protectedId = 'p3') => {
  s = nightAct(s, 'p3', { targetId: 'p1' });
  s = nightAct(s, 'p4', { targetId: protectedId });
  s = nightAct(s, 'p1', { targetId: victim });
  return nightAct(s, 'p2', { targetId: victim });
};

describe('role: Bruja', () => {
  it('plays for the village (D-3)', () => {
    assert.equal(teamOf('witch'), 'village');
  });

  it('sees the effective victim and may save them', () => {
    let s = toWitch(firstNight(table()), 'p6');
    assert.equal(s.night.step, 'witch');
    assert.equal(playerView(s, 'p5').me.night.victimId, 'p6');
    s = nightAct(s, 'p5', { heal: true, poisonTargetId: null });
    s = advance(s, 'dawn');
    assert.deepEqual(s.lastNight.deathIds, []);
    assert.deepEqual(playerView(s, 'p5').me.potions, { heal: false, poison: true });
  });

  it('sees no victim when the protector saved them', () => {
    const s = toWitch(firstNight(table()), 'p6', 'p6');
    assert.equal(playerView(s, 'p5').me.night.victimId, null);
    rejects(s, { type: 'night:act', actor: as('p5'), heal: true, poisonTargetId: null }, 'POTION_UNAVAILABLE');
  });

  it('may poison someone, and both potions can be used the same night', () => {
    let s = toWitch(firstNight(table()), 'p6');
    s = nightAct(s, 'p5', { heal: true, poisonTargetId: 'p1' });
    s = advance(s, 'dawn');
    assert.deepEqual(s.lastNight.deathIds, ['p1']);
    assert.equal(s.history[0].deaths[0].cause, 'poison');
  });

  it('may save herself but not poison herself', () => {
    let s = toWitch(firstNight(table()), 'p5');
    rejects(s, { type: 'night:act', actor: as('p5'), heal: false, poisonTargetId: 'p5' }, 'TARGET_INVALID');
    s = nightAct(s, 'p5', { heal: true, poisonTargetId: null });
    assert.deepEqual(advance(s, 'dawn').lastNight.deathIds, []);
  });

  it('each potion works once per game', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p3', wolves: 'p6', witch: { heal: true, poisonTargetId: 'p7' } });
    s = nextNight(s, 'p8');
    s = nightAct(s, 'p3', { targetId: 'p2' });
    s = nightAct(s, 'p4', { targetId: 'p4' });
    s = nightAct(s, 'p1', { targetId: 'p6' });
    s = nightAct(s, 'p2', { targetId: 'p6' });
    assert.equal(s.night.step, 'done', 'no potions left: the witch step is skipped');
  });

  it('the protector does not stop the poison', () => {
    let s = toWitch(firstNight(table()), 'p6', 'p7');
    s = nightAct(s, 'p5', { heal: false, poisonTargetId: 'p7' });
    assert.deepEqual(advance(s, 'dawn').lastNight.deathIds.sort(), ['p6', 'p7']);
  });

  it('validates the payload', () => {
    const s = toWitch(firstNight(table()), 'p6');
    rejects(s, { type: 'night:act', actor: as('p5'), heal: 'no', poisonTargetId: null }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'night:act', actor: as('p5'), heal: false, poisonTargetId: 'ghost' }, 'TARGET_INVALID');
  });

  it('her information reaches only her', () => {
    const s = toWitch(firstNight(table()), 'p6');
    for (const id of ['p1', 'p3', 'p4', 'p6']) {
      assert.equal(playerView(s, id).me.potions, undefined);
      assert.equal(playerView(s, id).me.night?.victimId, undefined);
    }
  });
});
