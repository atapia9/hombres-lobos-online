import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, normalizeName } from '../../server/game/index.js';

describe('normalizeName', () => {
  it('trims and collapses repeated spaces', () => {
    assert.equal(normalizeName('   Ana    María  '), 'Ana María');
  });

  it('keeps accents, ñ, apostrophes, hyphens and emoji', () => {
    assert.equal(normalizeName('Íñigo'), 'Íñigo');
    assert.equal(normalizeName("O'Connor-Peña"), "O'Connor-Peña");
    assert.equal(normalizeName('Lu 🎩'), 'Lu 🎩');
  });

  it('composes decomposed characters (NFC)', () => {
    const decomposed = 'José';
    assert.equal(normalizeName(decomposed), 'José');
    assert.equal(normalizeName(decomposed).length, 4);
  });

  it('drops markup, formatting symbols, control and bidi characters', () => {
    assert.equal(normalizeName('<b>Beto</b>'), 'bBetob');
    assert.equal(normalizeName('*Carla* _x_ ~y~ `z`'), 'Carla x y z');
    assert.equal(normalizeName('Da\u0000n‮i​el\n'), 'Daniel');
  });

  it('rejects empty, meaningless, too long or non-string names', () => {
    assert.equal(normalizeName(''), null);
    assert.equal(normalizeName('   '), null);
    assert.equal(normalizeName('<>'), null);
    assert.equal(normalizeName('.-.'), null);
    assert.equal(normalizeName('A'.repeat(21)), null);
    assert.equal(normalizeName('x'.repeat(500)), null);
    assert.equal(normalizeName(42), null);
    assert.equal(normalizeName(null), null);
  });

  it('accepts exactly 20 characters, counting emoji as one', () => {
    assert.equal(normalizeName('A'.repeat(20)), 'A'.repeat(20));
    assert.equal(normalizeName(`${'B'.repeat(19)}🎩`), `${'B'.repeat(19)}🎩`);
  });
});

describe('nameKey', () => {
  it('ignores case, including accented capitals', () => {
    assert.equal(nameKey('ÁLVARO'), nameKey('álvaro'));
    assert.notEqual(nameKey('Alvaro'), nameKey('Álvaro'));
  });
});
