// Client modules without DOM dependencies, tested in Node.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { joinLink, normalizeServerUrl, resolveServerUrl } from '../../public/js/server-url.js';
import {
  describeLastNight,
  describeLogEntry,
  describeStatus,
  formatCountdown,
  groupByRound,
  namer,
  roundTitle,
} from '../../public/js/format.js';
import { KNOWN_ERRORS, errorMessage } from '../../public/js/texts.js';
import { CLASSIC_RULES, RULES_CREDIT, RULES_FULL, RULES_SUMMARY } from '../../public/js/rules.js';
import { qrPath } from '../../public/js/qr.js';
import { encode } from '../../public/vendor/uqr.mjs';
import { applyAction } from '../../server/game/index.js';
import { as, daytime, voteOut } from '../helpers.js';

const root = join(import.meta.dirname, '..', '..');

describe('server URL (ADR-006)', () => {
  it('accepts https anywhere and http only on localhost', () => {
    assert.equal(normalizeServerUrl('https://mafia.onrender.com/path?x=1'), 'https://mafia.onrender.com');
    assert.equal(normalizeServerUrl('http://localhost:3000'), 'http://localhost:3000');
    assert.equal(normalizeServerUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
    assert.equal(normalizeServerUrl('http://evil.example'), null);
    assert.equal(normalizeServerUrl('javascript:alert(1)'), null);
    assert.equal(normalizeServerUrl(''), null);
    assert.equal(normalizeServerUrl(undefined), null);
  });

  it('prefers ?server=, then the saved choice, then config.js, then the page origin', () => {
    const base = { pageOrigin: 'http://localhost:3000' };
    assert.deepEqual(resolveServerUrl({ ...base, search: '?server=https://a.example', saved: 'https://b.example', configured: 'https://c.example' }), { url: 'https://a.example', fromParam: true });
    assert.deepEqual(resolveServerUrl({ ...base, saved: 'https://b.example', configured: 'https://c.example' }), { url: 'https://b.example', fromParam: false });
    assert.deepEqual(resolveServerUrl({ ...base, configured: 'https://c.example' }), { url: 'https://c.example', fromParam: false });
    assert.deepEqual(resolveServerUrl(base), { url: 'http://localhost:3000', fromParam: false });
    assert.deepEqual(resolveServerUrl({ ...base, search: '?server=http://evil.example' }), { url: 'http://localhost:3000', fromParam: false });
  });

  it('builds the join link next to the current page, also under a GitHub Pages path', () => {
    assert.equal(
      joinLink({ pageHref: 'https://atapia9.github.io/mafia-online/narrador.html?x=1#y', code: 'ABCDE', serverUrl: 'https://api.example', defaultServerUrl: 'https://api.example' }),
      'https://atapia9.github.io/mafia-online/jugador.html?sala=ABCDE',
    );
    assert.equal(
      joinLink({ pageHref: 'http://localhost:3000/narrador.html', code: 'ABCDE', serverUrl: 'https://other.example', defaultServerUrl: 'http://localhost:3000' }),
      'http://localhost:3000/jugador.html?sala=ABCDE&server=https%3A%2F%2Fother.example',
    );
  });
});

describe('formatting', () => {
  it('formats countdowns', () => {
    assert.equal(formatCountdown(180_000), '3:00');
    assert.equal(formatCountdown(61_500), '1:02');
    assert.equal(formatCountdown(-5), '0:00');
  });

  it('describes every log entry of a real game in Spanish', () => {
    let s = daytime(7);
    s = applyAction(s, { type: 'night:request', actor: as('p3'), wanted: true }).state;
    s = voteOut(s, 'p3', 'p1');
    const nameOf = namer(s.players);
    for (const entry of s.log) {
      const text = describeLogEntry(entry, nameOf);
      assert.notEqual(text, entry.type, `no description for ${entry.type}`);
      assert.doesNotMatch(text, /undefined|¿\?/, `${entry.type}: ${text}`);
    }
    const started = s.log.find((e) => e.type === 'game_started');
    assert.equal(describeLogEntry(started, nameOf), 'Empieza la partida (Original de Davýdov). Mafia: Jugador 1, Jugador 2.');
  });

  it('describes night, seer and doctor entries', () => {
    const nameOf = namer([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }]);
    assert.equal(describeLogEntry({ type: 'night_resolved', data: { victimId: 'a', mafiaBallots: 2 } }, nameOf), 'Fin de la noche: muere Ana (papeletas de mafia: 2).');
    assert.equal(describeLogEntry({ type: 'night_resolved', data: { victimId: null, saved: true, intendedVictimId: 'b' } }, nameOf), 'Fin de la noche: el Doctor salvó a Beto.');
    assert.equal(describeLogEntry({ type: 'seer_checked', data: { playerId: 'a', targetId: 'b', team: 'mafia' } }, nameOf), 'La Vidente (Ana) consulta a Beto: Mafia.');
    assert.equal(describeLogEntry({ type: 'night_ballot', data: { playerId: 'b', targetId: null } }, nameOf), 'Beto entrega «Honesto».');
  });

  it('groups the log by game and round, keeping order', () => {
    const log = [
      { seq: 1, game: 1, round: 0 }, { seq: 2, game: 1, round: 1 }, { seq: 3, game: 1, round: 1 }, { seq: 4, game: 1, round: 2 },
    ];
    assert.deepEqual(groupByRound(log).map((g) => [g.round, g.entries.map((e) => e.seq)]), [[0, [1]], [1, [2, 3]], [2, [4]]]);
    assert.equal(roundTitle(0), 'Antes de empezar');
    assert.equal(roundTitle(3), 'Ronda 3');
  });

  it('writes the dawn announcement, with the ballot count only in the original mode', () => {
    const nameOf = namer([{ id: 'a', name: 'Ana' }]);
    assert.equal(describeLastNight({ victimId: 'a', mafiaBallots: 2 }, nameOf, 'original'), 'Esta noche murió Ana. Hubo 2 papeletas de mafia.');
    assert.equal(describeLastNight({ victimId: null, mafiaBallots: 1 }, nameOf, 'original'), 'Esta noche no murió nadie. Hubo 1 papeleta de mafia.');
    assert.equal(describeLastNight({ victimId: null }, nameOf, 'classic'), 'Esta noche no murió nadie.');
  });

  it('describes a player status', () => {
    assert.equal(describeStatus({ alive: true }), 'En juego');
    assert.equal(describeStatus({ alive: false, eliminatedRound: 2, eliminatedBy: 'vote' }), 'Fuera (ronda 2, votación)');
  });
});

describe('error messages', () => {
  it('has a Spanish message for every error code the server can return', async () => {
    const files = ['server/game/game.js', 'server/net/handlers.js', 'server/game/roles.js'];
    const codes = new Set();
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8');
      for (const [, code] of source.matchAll(/(?:return|failure\()\s*'([A-Z_]{4,})'/g)) codes.add(code);
    }
    assert.ok(codes.size > 30);
    const missing = [...codes].filter((code) => !KNOWN_ERRORS.includes(code));
    assert.deepEqual(missing, []);
  });

  it('falls back to a generic message', () => {
    assert.match(errorMessage('SOMETHING_NEW'), /SOMETHING_NEW/);
  });
});

describe('rules text', () => {
  it('credits Davýdov with the documented dates and never calls him a sociologist', () => {
    const all = JSON.stringify({ RULES_CREDIT, RULES_FULL, RULES_SUMMARY, CLASSIC_RULES });
    assert.match(RULES_CREDIT, /Dmitri Davýdov/);
    assert.match(RULES_CREDIT, /psicólogo/);
    assert.match(RULES_CREDIT, /1986/);
    assert.match(RULES_CREDIT, /1987/);
    assert.doesNotMatch(all, /sociólog/i);
  });

  it('marks the classic variant as not part of the original', () => {
    assert.match(CLASSIC_RULES.title, /no forma parte del original/);
    assert.match(CLASSIC_RULES.note, /Werewolf \(Andrew Plotkin, 1997\)/);
  });

  it('states the mafia count table of the original', () => {
    assert.ok(RULES_FULL.some((s) => s.items.some((i) => i.includes('6–7 jugadores → 2; 8–10 → 3; 11–13 → 4; 14–16 → 5'))));
  });
});

describe('QR code', () => {
  it('draws one square per dark module', () => {
    assert.equal(qrPath([[true, false], [false, true]]), 'M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('encodes a join link into a square matrix with a border', () => {
    const { size, data } = encode('https://atapia9.github.io/mafia-online/jugador.html?sala=ABCDE', { ecc: 'M', border: 2 });
    assert.equal(data.length, size);
    assert.ok(data.every((row) => row.length === size));
    assert.ok(data[0].every((cell) => cell === false), 'quiet zone');
  });
});

describe('static pages', () => {
  it('load scripts as modules and contain no inline scripts (CSP script-src self)', async () => {
    for (const page of ['index.html', 'narrador.html']) {
      const html = await readFile(join(root, 'public', page), 'utf8');
      assert.match(html, /<html lang="es">/);
      assert.match(html, /<meta name="viewport"/);
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
      assert.deepEqual(inline, [], `${page} has inline scripts`);
      assert.doesNotMatch(html, /\son[a-z]+=/i, `${page} has inline event handlers`);
    }
  });

  it('never use innerHTML in client code (user text goes through textContent)', async () => {
    for (const file of ['dom.js', 'narrator.js', 'rules-ui.js', 'qr.js', 'summary-image.js', 'net.js', 'landing.js']) {
      const source = (await readFile(join(root, 'public/js', file), 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, ''); // comments may mention the forbidden APIs
      assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
    }
  });
});

