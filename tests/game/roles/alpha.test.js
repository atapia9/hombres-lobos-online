import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alpha, playerView, teamOf } from '../../../server/game/index.js';
import { advance, as, firstNight, nightAct, playNight, rejects, started, voteOut } from '../../helpers.js';

// 9 players with the alpha: p1 p2 wolves, p3 alpha, p4 seer, p5 protector, p6..p9 villagers.
const table = () => started(9, { roles: { alpha: true } });
const nextNight = (s, voted) => advance(voteOut(advance(s, 'day'), voted), 'night');

describe('role: Lobo alfa', () => {
  it('is a wolf and votes with the pack', () => {
    assert.equal(alpha.label, 'Lobo alfa');
    assert.equal(teamOf('alpha'), 'wolves');
    const s = table();
    assert.equal(playerView(s, 'p1').me.alphaId, 'p3');
  });

  it('converts the victim instead of killing them (D-4)', () => {
    let s = playNight(firstNight(table()), { seer: 'p6', protector: 'p7', wolves: 'p4', convert: true });
    assert.deepEqual(s.lastNight.deathIds, [], 'nobody dies');
    const converted = s.players.find((p) => p.id === 'p4');
    assert.equal(converted.role, 'wolf');
    assert.equal(converted.originalRole, 'seer');
    assert.equal(converted.convertedRound, 1);
    assert.equal(s.alphaUsed, true);
    assert.ok(playerView(s, 'p1').me.partnerIds.includes('p4'), 'joins the pack');
    assert.equal(playerView(s, 'p4').me.team, 'wolves');
  });

  it('the converted player loses their ability', () => {
    let s = playNight(firstNight(table()), { seer: 'p6', protector: 'p7', wolves: 'p4', convert: true });
    s = nextNight(s, 'p1');
    assert.equal(s.night.step, 'protector', 'there is no seer any more');
  });

  it('can convert only once', () => {
    let s = playNight(firstNight(table()), { seer: 'p6', protector: 'p7', wolves: 'p8', convert: true });
    s = nextNight(s, 'p1');
    s = playNight(s, { seer: 'p2', protector: 'p6', wolves: 'p7' });
    assert.deepEqual(s.lastNight.deathIds, ['p7'], 'the alpha step was skipped and the victim died');
  });

  it('a protected victim is not converted and the use is not spent', () => {
    const s = playNight(firstNight(table()), { seer: 'p6', protector: 'p8', wolves: 'p8', convert: true });
    assert.equal(s.players.find((p) => p.id === 'p8').role, 'villager');
    assert.equal(s.alphaUsed, false);
  });

  it('is asked even when the victim is protected, so asking leaks nothing', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p4', { targetId: 'p6' });
    s = nightAct(s, 'p5', { targetId: 'p8' });
    for (const id of ['p1', 'p2', 'p3']) s = nightAct(s, id, { targetId: 'p8' });
    assert.equal(s.night.step, 'alpha');
    assert.equal(playerView(s, 'p3').me.night.wolfTargetId, 'p8');
  });

  it('only the alpha decides and the payload must be a boolean', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p4', { targetId: 'p6' });
    s = nightAct(s, 'p5', { targetId: 'p7' });
    for (const id of ['p1', 'p2', 'p3']) s = nightAct(s, id, { targetId: 'p8' });
    rejects(s, { type: 'night:act', actor: as('p1'), convert: true }, 'NOT_YOUR_TURN');
    rejects(s, { type: 'night:act', actor: as('p3'), convert: 'yes' }, 'INVALID_PAYLOAD');
  });

  it('the seer sees the converted player as a wolf from then on', () => {
    let s = playNight(firstNight(table()), { seer: 'p6', protector: 'p7', wolves: 'p8', convert: true });
    s = nextNight(s, 'p1');
    s = nightAct(s, 'p4', { targetId: 'p8' });
    assert.equal(s.seerResults.at(-1).isWolf, true);
  });
});
