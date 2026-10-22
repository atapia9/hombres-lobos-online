import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRoles, composition, defaultConfig, maxWolfTotal, recommendedWolfTotal, setupWarning, validateSetup,
} from '../../server/game/index.js';
import { NARRATOR, act, lobby, rejects, seededRng } from '../helpers.js';

const cfg = (over = {}) => ({ ...defaultConfig(), ...over, roles: { ...defaultConfig().roles, ...over.roles } });

describe('setup: wolf counts', () => {
  it('recommends about a third of the table and caps at ceil(n/3)', () => {
    assert.deepEqual([6, 8, 9, 12, 18].map(recommendedWolfTotal), [2, 2, 3, 4, 6]);
    assert.deepEqual([6, 7, 8, 12, 18].map(maxWolfTotal), [2, 3, 3, 4, 6]);
  });

  it('fills the rest of the table with villagers', () => {
    const { counts, wolfTotal, villageTotal } = composition(cfg(), 8);
    assert.equal(counts.wolf, 2);
    assert.equal(counts.seer, 1);
    assert.equal(counts.protector, 1);
    assert.equal(counts.villager, 4);
    assert.equal(wolfTotal, 2);
    assert.equal(villageTotal, 6);
  });

  it('counts the alpha inside the recommended wolves', () => {
    const { counts, wolfTotal } = composition(cfg({ roles: { alpha: true } }), 9);
    assert.equal(counts.wolf, 2);
    assert.equal(counts.alpha, 1);
    assert.equal(wolfTotal, 3);
  });
});

describe('setup: validation (D-10)', () => {
  it('rejects too few or too many players', () => {
    assert.equal(validateSetup(cfg(), 5), 'NOT_ENOUGH_PLAYERS');
    assert.equal(validateSetup(cfg(), 19), 'TOO_MANY_PLAYERS');
    assert.equal(validateSetup(cfg(), 6), null);
  });

  it('needs at least one wolf', () => {
    assert.equal(validateSetup(cfg({ wolfCount: 0 }), 8), 'NO_WOLVES');
    assert.equal(validateSetup(cfg({ wolfCount: 0, roles: { alpha: true } }), 8), null);
  });

  it('rejects more than ceil(n/3) wolves', () => {
    assert.equal(validateSetup(cfg({ wolfCount: 3 }), 6), 'TOO_MANY_WOLVES');
  });

  it('rejects more roles than players', () => {
    const all = { seer: true, protector: true, hunter: true, mayor: true, spy: true, witch: true, alpha: true };
    assert.equal(validateSetup(cfg({ wolfCount: 1, roles: all }), 6), 'TOO_MANY_ROLES');
    assert.equal(validateSetup(cfg({ wolfCount: 1, roles: all }), 8), null);
  });

  it('warns, without blocking, when there are few wolves', () => {
    assert.equal(setupWarning(cfg({ wolfCount: 2 }), 12), 'FEW_WOLVES');
    assert.equal(setupWarning(cfg(), 12), null);
  });
});

describe('setup: dealing', () => {
  it('deals exactly the configured roles', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
    const config = cfg({ roles: { witch: true, hunter: true } });
    const roles = assignRoles(ids, config, seededRng(7));
    const tally = {};
    for (const role of Object.values(roles)) tally[role] = (tally[role] ?? 0) + 1;
    assert.deepEqual(tally, { wolf: 3, seer: 1, protector: 1, hunter: 1, witch: 1, villager: 3 });
  });

  it('uses the secure RNG by default and varies between deals', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    const deals = new Set(Array.from({ length: 10 }, () => JSON.stringify(assignRoles(ids, cfg()))));
    assert.ok(deals.size > 1);
  });

  it('refuses to deal an invalid composition', () => {
    assert.throws(() => assignRoles(['a', 'b'], cfg()), RangeError);
  });
});

describe('setup: lobby actions', () => {
  it('blocks the start while the composition is invalid', () => {
    let s = lobby(6);
    s = act(s, { type: 'game:configure', actor: NARRATOR, wolfCount: 3 });
    rejects(s, { type: 'game:start', actor: NARRATOR }, 'TOO_MANY_WOLVES');
    rejects(lobby(5), { type: 'game:start', actor: NARRATOR }, 'NOT_ENOUGH_PLAYERS');
  });

  it('validates the role switches', () => {
    const s = lobby(6);
    rejects(s, { type: 'game:configure', actor: NARRATOR, roles: { villager: true } }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'game:configure', actor: NARRATOR, roles: { witch: 'yes' } }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'game:configure', actor: NARRATOR, wolfCount: -1 }, 'INVALID_WOLF_COUNT');
    const next = act(s, { type: 'game:configure', actor: NARRATOR, roles: { witch: true } });
    assert.equal(next.config.roles.witch, true);
    assert.equal(next.config.roles.seer, true, 'other switches are kept');
  });

  it('only the narrator configures and starts', () => {
    const s = lobby(6);
    rejects(s, { type: 'game:start', actor: { kind: 'player', id: 'p1' } }, 'NOT_NARRATOR');
  });

  it('records the composition when the game starts', () => {
    const s = act(lobby(6), { type: 'game:start', actor: NARRATOR }, { rng: seededRng(1) });
    assert.equal(s.phase, 'start');
    assert.equal(s.round, 1);
    assert.equal(s.initial.wolfTotal, 2);
    assert.equal(s.players.filter((p) => p.role === 'wolf').length, 2);
  });
});
