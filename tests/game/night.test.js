import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_ORDER, publicView, resolveNight } from '../../server/game/index.js';
import {
  NARRATOR, act, advance, as, firstNight, nightAct, playNight, rejects, started,
} from '../helpers.js';

// 9 players with every night role: p1 p2 wolves, p3 alpha, p4 seer, p5 protector, p6 witch, p7..p9 villagers.
const full = () => started(9, { roles: { alpha: true, witch: true } });

describe('night: fixed order', () => {
  it('is seer → protector → wolves → alpha → witch', () => {
    assert.deepEqual(NIGHT_ORDER, ['seer', 'protector', 'wolves', 'alpha', 'witch', 'done']);
    let s = firstNight(full());
    const seen = [s.night.step];
    s = nightAct(s, 'p4', { targetId: 'p1' }); seen.push(s.night.step);
    s = nightAct(s, 'p5', { targetId: 'p9' }); seen.push(s.night.step);
    for (const id of ['p1', 'p2', 'p3']) s = nightAct(s, id, { targetId: 'p7' });
    seen.push(s.night.step);
    s = nightAct(s, 'p3', { convert: false }); seen.push(s.night.step);
    s = nightAct(s, 'p6', { heal: false, poisonTargetId: null }); seen.push(s.night.step);
    assert.deepEqual(seen, ['seer', 'protector', 'wolves', 'alpha', 'witch', 'done']);
  });

  it('a role cannot act out of turn', () => {
    const s = firstNight(full());
    rejects(s, { type: 'night:act', actor: as('p5'), targetId: 'p9' }, 'NOT_YOUR_TURN');
    rejects(s, { type: 'night:act', actor: as('p1'), targetId: 'p9' }, 'NOT_YOUR_TURN');
  });

  it('steps without a living actor are skipped (D-13)', () => {
    const s = firstNight(started(6, { roles: { seer: false, protector: false } }));
    assert.equal(s.night.step, 'wolves');
  });

  it('the public view never shows the current step', () => {
    const s = firstNight(full());
    const view = publicView(s);
    assert.equal(view.night, undefined);
    assert.ok(!JSON.stringify(view).includes('"step"'));
  });

  it('dawn needs the night to be done', () => {
    const s = firstNight(full());
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'dawn' }, 'NIGHT_IN_PROGRESS');
  });

  it('the narrator can skip a step, naming it to avoid races', () => {
    let s = firstNight(full());
    rejects(s, { type: 'night:skipStep', actor: NARRATOR, step: 'wolves' }, 'STEP_CHANGED');
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'seer' });
    assert.equal(s.night.step, 'protector');
    assert.equal(s.night.seerTargetId, null);
  });

  it('removing the only actor of the current step moves the night on', () => {
    let s = firstNight(full());
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p4' });
    assert.equal(s.night.step, 'protector');
  });

  it('removing a wolf re-checks the wolves\' agreement', () => {
    let s = firstNight(full());
    s = nightAct(s, 'p4', { targetId: 'p1' });
    s = nightAct(s, 'p5', { targetId: 'p9' });
    s = nightAct(s, 'p1', { targetId: 'p7' });
    s = nightAct(s, 'p3', { targetId: 'p7' });
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p2' });
    assert.equal(s.night.step, 'alpha');
  });
});

describe('night: resolution', () => {
  it('applies protection, then conversion, then healing, then deaths', () => {
    let s = firstNight(full());
    s = nightAct(s, 'p4', { targetId: 'p1' });
    s = nightAct(s, 'p5', { targetId: 'p8' });
    for (const id of ['p1', 'p2', 'p3']) s = nightAct(s, id, { targetId: 'p7' });
    s = nightAct(s, 'p3', { convert: false });
    s = nightAct(s, 'p6', { heal: false, poisonTargetId: 'p9' });
    const preview = resolveNight(s);
    assert.deepEqual(preview.deaths, [{ playerId: 'p7', cause: 'wolves' }, { playerId: 'p9', cause: 'poison' }]);
    s = advance(s, 'dawn');
    assert.equal(s.phase, 'dawn');
    assert.deepEqual(s.lastNight, { round: 1, deathIds: ['p7', 'p9'] });
    assert.equal(s.players.find((p) => p.id === 'p7').eliminatedPhase, 'night');
  });

  it('nobody dies when the wolves skip', () => {
    const s = playNight(firstNight(full()), { seer: 'p1', protector: 'p9', wolves: null });
    assert.deepEqual(s.lastNight.deathIds, []);
  });

  it('the protector cannot repeat the target of the previous night after a skipped night', () => {
    let s = firstNight(started(8));
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'seer' });
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'protector' });
    s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'wolves' });
    s = advance(s, 'dawn');
    assert.equal(s.protectorLastTargetId, null);
  });
});
