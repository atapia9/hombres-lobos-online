import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mayor, tallyVote, voteWeight } from '../../../server/game/index.js';
import { advance, dayVote, firstNight, playNight, started } from '../../helpers.js';

// 9 players with mayor and spy: p1..p3 wolves, p4 seer, p5 protector, p6 mayor, p7 spy, p8 p9 villagers.
const day1 = (rules = {}) => advance(
  playNight(firstNight(started(9, { roles: { mayor: true, spy: true }, ...rules })), { seer: 'p1', protector: 'p9', wolves: 'p9' }),
  'day',
);

describe('role: Alcalde', () => {
  it('is a secret village role whose vote counts twice (D-7)', () => {
    assert.equal(mayor.label, 'Alcalde');
    assert.equal(voteWeight({ alive: true, role: 'mayor' }), 2);
    assert.equal(voteWeight({ alive: true, role: 'villager' }), 1);
  });

  it('two votes from the mayor beat one from anyone else', () => {
    const s = dayVote(day1(), { p6: 'p1', p8: 'p2' });
    assert.equal(s.history.at(-1).eliminatedId, 'p1');
    assert.deepEqual(s.history.at(-1).weighted, { p1: 2, p2: 1 });
  });

  it('a tie eliminates nobody by default', () => {
    const s = dayVote(day1(), { p6: 'p1', p8: 'p2', p9: 'p2' });
    assert.equal(s.history.at(-1).eliminatedId, null);
    assert.equal(s.history.at(-1).tie, true);
  });

  it('breaks ties when the narrator enables it', () => {
    const s = dayVote(day1({ mayorBreaksTies: true }), { p6: 'p1', p8: 'p2', p9: 'p2' });
    assert.equal(s.history.at(-1).eliminatedId, 'p1');
    assert.equal(s.history.at(-1).tieBrokenByMayor, true);
  });

  it('cannot break a tie between candidates they did not vote for', () => {
    const players = [
      { id: 'm', alive: true, role: 'mayor' }, { id: 'a', alive: true, role: 'villager' },
      { id: 'b', alive: true, role: 'villager' }, { id: 'c', alive: true, role: 'villager' },
      { id: 'd', alive: true, role: 'villager' }, { id: 'e', alive: true, role: 'villager' },
      { id: 'f', alive: true, role: 'villager' },
    ];
    // a = 3, b = 3, c = 2 (the mayor's double vote).
    const vote = { candidateIds: ['a', 'b', 'c'], ballots: { m: 'c', a: 'b', b: 'a', c: 'a', d: 'b', e: 'a', f: 'b' } };
    const result = tallyVote(vote, players, { mayorBreaksTies: true });
    assert.deepEqual(result.leaderIds, ['a', 'b']);
    assert.equal(result.eliminatedId, null);
  });

  it('a dead mayor counts as nobody', () => {
    assert.equal(voteWeight({ alive: false, role: 'mayor' }), 1);
  });
});
