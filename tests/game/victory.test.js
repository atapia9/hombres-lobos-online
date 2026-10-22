import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkWinner } from '../../server/game/index.js';
import { advance, firstNight, playNight, started, voteOut } from '../helpers.js';

const p = (role, alive = true) => ({ role, alive });

describe('victory', () => {
  it('the village wins when no wolf is alive', () => {
    assert.equal(checkWinner([p('wolf', false), p('alpha', false), p('villager')]), 'village');
  });

  it('the wolves win when they equal the others', () => {
    assert.equal(checkWinner([p('wolf'), p('villager')]), 'wolves');
    assert.equal(checkWinner([p('wolf'), p('alpha'), p('seer'), p('witch')]), 'wolves');
  });

  it('the game goes on while the wolves are fewer', () => {
    assert.equal(checkWinner([p('wolf'), p('villager'), p('seer')]), null);
  });

  it('a full game: the village votes out both wolves', () => {
    let s = playNight(firstNight(started(6)), { seer: 'p1', protector: 'p5', wolves: 'p5' });
    s = voteOut(advance(s, 'day'), 'p1');
    s = advance(s, 'night');
    s = playNight(s, { seer: 'p2', protector: 'p6', wolves: 'p6' });
    s = voteOut(advance(s, 'day'), 'p2');
    assert.equal(s.phase, 'ended');
    assert.equal(s.winner, 'village');
  });

  it('a full game: the wolves reach parity at dawn', () => {
    let s = playNight(firstNight(started(6)), { seer: 'p5', protector: 'p4', wolves: 'p3' });
    s = voteOut(advance(s, 'day'), 'p6');
    assert.equal(s.phase, 'ended');
    assert.equal(s.winner, 'wolves');
  });
});
