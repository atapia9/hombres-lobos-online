import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView, teamOf, villager } from '../../../server/game/index.js';
import { as, firstNight, rejects, started } from '../../helpers.js';

// Default 6-player table with identityRng: p1 p2 wolves, p3 seer, p4 protector, p5 p6 villagers.
describe('role: Aldeano', () => {
  it('belongs to the village and has no night step', () => {
    assert.equal(villager.label, 'Aldeano');
    assert.equal(teamOf('villager'), 'village');
    assert.deepEqual(villager.nightSteps, []);
  });

  it('cannot act at night and only waits', () => {
    const s = firstNight(started(6));
    rejects(s, { type: 'night:act', actor: as('p5'), targetId: 'p1' }, 'NOT_YOUR_TURN');
    assert.equal(playerView(s, 'p5').me.night.turn, false);
  });
});
