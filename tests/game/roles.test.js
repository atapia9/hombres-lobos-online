import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRoles,
  maxMafiaCount,
  recommendedMafiaCount,
  shuffle,
  validateSetup,
} from '../../server/game/index.js';
import { seededRng } from '../helpers.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const count = (roles, role) => Object.values(roles).filter((r) => r === role).length;

describe('mafia count', () => {
  it('matches the recommended table of the original rules (6–16 players)', () => {
    const table = { 6: 2, 7: 2, 8: 3, 9: 3, 10: 3, 11: 4, 12: 4, 13: 4, 14: 5, 15: 5, 16: 5 };
    for (const [players, expected] of Object.entries(table)) {
      assert.equal(recommendedMafiaCount(Number(players)), expected, `${players} players`);
    }
  });

  it('extends the same formula to 17–20 players', () => {
    const table = { 17: 6, 18: 6, 19: 6, 20: 7 };
    for (const [players, expected] of Object.entries(table)) {
      assert.equal(recommendedMafiaCount(Number(players)), expected, `${players} players`);
    }
  });

  it('caps the mafia strictly below the number of honest players', () => {
    const table = { 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 5, 13: 6, 16: 7, 20: 9 };
    for (const [players, expected] of Object.entries(table)) {
      assert.equal(maxMafiaCount(Number(players)), expected, `${players} players`);
    }
    for (let n = 6; n <= 20; n += 1) {
      const max = maxMafiaCount(n);
      assert.ok(max < n - max, `${n} players: ${max} mafiosi must be fewer than ${n - max} honest`);
      assert.ok(recommendedMafiaCount(n) <= max, `${n} players: recommendation within the limit`);
    }
  });
});

describe('validateSetup', () => {
  it('accepts a valid setup', () => {
    assert.equal(validateSetup({ playerCount: 6, mafiaCount: 2, mode: 'original' }), null);
    assert.equal(validateSetup({ playerCount: 20, mafiaCount: 9, mode: 'classic' }), null);
  });

  it('requires at least 6 and at most 20 players', () => {
    assert.equal(validateSetup({ playerCount: 5, mafiaCount: 2, mode: 'original' }), 'NOT_ENOUGH_PLAYERS');
    assert.equal(validateSetup({ playerCount: 21, mafiaCount: 7, mode: 'original' }), 'TOO_MANY_PLAYERS');
  });

  it('rejects more mafiosi than allowed, zero mafiosi or non-integers', () => {
    assert.equal(validateSetup({ playerCount: 6, mafiaCount: 3, mode: 'original' }), 'INVALID_MAFIA_COUNT');
    assert.equal(validateSetup({ playerCount: 6, mafiaCount: 0, mode: 'original' }), 'INVALID_MAFIA_COUNT');
    assert.equal(validateSetup({ playerCount: 8, mafiaCount: 2.5, mode: 'original' }), 'INVALID_MAFIA_COUNT');
  });

  it('rejects unknown modes', () => {
    assert.equal(validateSetup({ playerCount: 6, mafiaCount: 2, mode: 'werewolf' }), 'INVALID_MODE');
  });
});

describe('assignRoles', () => {
  it('gives every player exactly one role with the requested counts (original mode)', () => {
    const roles = assignRoles(ids(9), { mafiaCount: 3, mode: 'original' });
    assert.deepEqual(Object.keys(roles).sort(), ids(9).sort());
    assert.equal(count(roles, 'mafia'), 3);
    assert.equal(count(roles, 'honest'), 6);
    assert.equal(count(roles, 'seer') + count(roles, 'doctor'), 0);
  });

  it('takes one seer and one doctor out of the honest team in classic mode', () => {
    const roles = assignRoles(ids(8), { mafiaCount: 3, mode: 'classic' });
    assert.equal(count(roles, 'mafia'), 3);
    assert.equal(count(roles, 'seer'), 1);
    assert.equal(count(roles, 'doctor'), 1);
    assert.equal(count(roles, 'honest'), 3);
  });

  it('refuses setups that break the rules', () => {
    assert.throws(() => assignRoles(ids(6), { mafiaCount: 3, mode: 'original' }), RangeError);
    assert.throws(() => assignRoles(ids(5), { mafiaCount: 1, mode: 'original' }), RangeError);
  });

  it('is deterministic for a given RNG', () => {
    const a = assignRoles(ids(12), { mafiaCount: 4, mode: 'original' }, seededRng(42));
    const b = assignRoles(ids(12), { mafiaCount: 4, mode: 'original' }, seededRng(42));
    assert.deepEqual(a, b);
  });

  it('uses the crypto RNG by default and spreads mafia roles evenly', () => {
    const trials = 3000;
    const players = ids(6);
    const timesMafia = Object.fromEntries(players.map((id) => [id, 0]));
    for (let t = 0; t < trials; t += 1) {
      const roles = assignRoles(players, { mafiaCount: 2, mode: 'original' });
      assert.equal(count(roles, 'mafia'), 2);
      for (const id of players) if (roles[id] === 'mafia') timesMafia[id] += 1;
    }
    // Expected 1000 per player (p = 1/3), standard deviation ≈ 25.8. Allow ±6σ.
    for (const [id, times] of Object.entries(timesMafia)) {
      assert.ok(times > 845 && times < 1155, `${id} was mafia ${times} times out of ${trials}`);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = ids(10);
    const output = shuffle(input, seededRng(7));
    assert.deepEqual(input, ids(10));
    assert.deepEqual([...output].sort(), [...input].sort());
  });

  it('rejects RNGs that return out-of-range values', () => {
    assert.throws(() => shuffle(ids(3), () => 5), RangeError);
    assert.throws(() => shuffle(ids(3), () => 0.5), RangeError);
  });
});
