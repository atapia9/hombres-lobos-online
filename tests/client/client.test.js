// Client modules without DOM dependencies, tested in Node.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { joinLink, normalizeServerUrl, resolveServerUrl } from '../../public/js/server-url.js';
import {
  describeDawn,
  describeLogEntry,
  describeStatus,
  formatCountdown,
  groupByRound,
  namer,
  roundTitle,
  describeVoteResult,
} from '../../public/js/format.js';
import { KNOWN_ERRORS, ROLE_LABELS, errorMessage } from '../../public/js/texts.js';
import { RULES_CREDIT, RULES_FULL, RULES_SUMMARY } from '../../public/js/rules.js';
import { qrPath } from '../../public/js/qr.js';
import { encode } from '../../public/vendor/uqr.mjs';
import { NARRATOR, act, advance, as, firstNight, nightAct, started, voteOut } from '../helpers.js';
import { ROLE_CATALOG } from '../../server/game/index.js';

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
      joinLink({ pageHref: 'https://atapia9.github.io/hombres-lobos-online/narrador.html?x=1#y', code: 'ABCDE', serverUrl: 'https://api.example', defaultServerUrl: 'https://api.example' }),
      'https://atapia9.github.io/hombres-lobos-online/jugador.html?sala=ABCDE',
    );
    assert.equal(
      joinLink({ pageHref: 'http://localhost:3000/narrador.html', code: 'ABCDE', serverUrl: 'https://other.example', defaultServerUrl: 'http://localhost:3000' }),
      'http://localhost:3000/jugador.html?sala=ABCDE&server=https%3A%2F%2Fother.example',
    );
  });
});

/** A game that goes through every kind of log entry. */
function eventfulGame() {
  // 9 players: p1 wolf, p2 alpha, p3 seer, p4 protector, p5 hunter, p6 witch, p7..p9 villagers.
  let s = started(9, { roles: { alpha: true, hunter: true, witch: true }, wolfCount: 1 });
  s = act(s, { type: 'timer:set', actor: NARRATOR, seconds: 120 });
  s = firstNight(s);
  s = nightAct(s, 'p3', { targetId: 'p1' });
  s = nightAct(s, 'p4', { targetId: 'p9' });
  s = nightAct(s, 'p1', { targetId: 'p5' });
  s = nightAct(s, 'p2', { targetId: 'p7' });
  s = act(s, { type: 'night:wolvesRevote', actor: NARRATOR });
  s = nightAct(s, 'p1', { targetId: 'p5' });
  s = nightAct(s, 'p2', { targetId: 'p5' });
  s = nightAct(s, 'p2', { convert: false });
  s = nightAct(s, 'p6', { heal: false, poisonTargetId: 'p8' });
  s = advance(s, 'dawn');
  s = act(s, { type: 'hunter:shoot', actor: as('p5'), targetId: 'p9' });
  s = advance(s, 'day');
  s = act(s, { type: 'day:accuse', actor: as('p3'), targetId: 'p6' });
  s = act(s, { type: 'day:dismissAccusation', actor: NARRATOR, accusationId: s.day.accusations[0].id });
  s = voteOut(s, 'p1');
  return s;
}

describe('formatting', () => {
  it('formats countdowns', () => {
    assert.equal(formatCountdown(180_000), '3:00');
    assert.equal(formatCountdown(61_500), '1:02');
    assert.equal(formatCountdown(-5), '0:00');
  });

  it('describes every log entry of a real game in Spanish', () => {
    const s = eventfulGame();
    const nameOf = namer(s.players);
    const types = new Set();
    for (const entry of s.log) {
      types.add(entry.type);
      const text = describeLogEntry(entry, nameOf);
      assert.notEqual(text, entry.type, `no description for ${entry.type}`);
      assert.doesNotMatch(text, /undefined|¿\?/, `${entry.type}: ${text}`);
    }
    for (const type of ['seer_checked', 'player_protected', 'wolves_revote', 'alpha_chose', 'witch_acted', 'hunter_shot', 'vote_closed']) {
      assert.ok(types.has(type), `the scripted game should log ${type}`);
    }
    const startedEntry = s.log.find((e) => e.type === 'game_started');
    assert.match(describeLogEntry(startedEntry, nameOf), /Lobo: Jugador 1\. Lobo alfa: Jugador 2\. Vidente: Jugador 3/);
  });

  it('describes conversions and skipped steps', () => {
    const nameOf = namer([{ id: 'a', name: 'Ana' }]);
    assert.equal(describeLogEntry({ type: 'player_converted', data: { playerId: 'a', from: 'seer' } }, nameOf), 'Ana (Vidente) se convierte en lobo.');
    assert.equal(describeLogEntry({ type: 'night_step', data: { from: 'seer', to: 'protector', skipped: true } }, nameOf), 'Turno de la Vidente: se salta (nadie actúa).');
  });

  it('describes a closed vote with the weighted totals', () => {
    const nameOf = namer([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }]);
    assert.equal(describeVoteResult({ eliminatedId: 'a', weighted: { a: 3, b: 3 }, tieBrokenByMayor: true }, nameOf), 'sale Ana (desempate del Alcalde). Votos: Ana 3, Beto 3.');
    assert.equal(describeVoteResult({ eliminatedId: null, tie: true, weighted: { a: 1, b: 1 } }, nameOf), 'empate, nadie sale. Votos: Ana 1, Beto 1.');
  });

  it('groups the log by game and round, keeping order', () => {
    const log = [
      { seq: 1, game: 1, round: 0 }, { seq: 2, game: 1, round: 1 }, { seq: 3, game: 1, round: 1 }, { seq: 4, game: 1, round: 2 },
    ];
    assert.deepEqual(groupByRound(log).map((g) => [g.round, g.entries.map((e) => e.seq)]), [[0, [1]], [1, [2, 3]], [2, [4]]]);
    assert.equal(roundTitle(0), 'Antes de empezar');
    assert.equal(roundTitle(3), 'Ronda 3');
  });

  it('writes the dawn announcement without saying how anyone died', () => {
    const nameOf = namer([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }]);
    assert.equal(describeDawn({ deathIds: [] }, nameOf), 'La aldea despierta: esta noche no murió nadie.');
    assert.equal(describeDawn({ deathIds: ['a'] }, nameOf), 'La aldea despierta: esta noche murió Ana.');
    assert.equal(describeDawn({ deathIds: ['a', 'b'] }, nameOf), 'La aldea despierta: esta noche murieron Ana y Beto.');
  });

  it('describes a player status without the cause', () => {
    assert.equal(describeStatus({ alive: true }), 'En juego');
    assert.equal(describeStatus({ alive: false, eliminatedRound: 2, eliminatedPhase: 'night' }), 'Fuera (ronda 2, noche)');
  });
});

describe('error messages and labels', () => {
  it('has a Spanish message for every error code the server can return', async () => {
    const roleFiles = Object.keys(ROLE_CATALOG).map((id) => `server/game/roles/${id === 'villager' ? 'villager' : id}.js`);
    const files = ['server/game/engine.js', 'server/game/setup.js', 'server/net/handlers.js', ...roleFiles];
    const codes = new Set();
    for (const file of files) {
      const source = await readFile(join(root, file), 'utf8');
      for (const [, code] of source.matchAll(/(?:return|failure\(|\?)\s*'([A-Z_]{4,})'/g)) codes.add(code);
    }
    assert.ok(codes.size > 40, `found only ${codes.size} codes`);
    const missing = [...codes].filter((code) => !KNOWN_ERRORS.includes(code));
    assert.deepEqual(missing, []);
  });

  it('falls back to a generic message', () => {
    assert.match(errorMessage('SOMETHING_NEW'), /SOMETHING_NEW/);
  });

  it('labels every role with the same name as the server', () => {
    for (const [id, role] of Object.entries(ROLE_CATALOG)) assert.equal(ROLE_LABELS[id], role.label);
  });
});

describe('rules text', () => {
  const all = JSON.stringify({ RULES_CREDIT, RULES_FULL, RULES_SUMMARY });

  it('credits Davýdov and Plotkin with the documented dates and never says "sociólogo"', () => {
    assert.match(RULES_CREDIT, /Dmitri Davýdov/);
    assert.match(RULES_CREDIT, /psicólogo/);
    assert.match(RULES_CREDIT, /Universidad Estatal de Moscú/);
    assert.match(RULES_CREDIT, /1986/);
    assert.match(RULES_CREDIT, /1987/);
    assert.match(RULES_CREDIT, /Andrew Plotkin/);
    assert.match(RULES_CREDIT, /1997/);
    assert.match(RULES_CREDIT, /adaptación propia/);
    assert.doesNotMatch(all, /sociólog/i);
  });

  it('states the fixed night order', () => {
    const night = RULES_FULL.find((section) => section.title.startsWith('Noche')).items.join(' ');
    const order = ['Vidente', 'Protector', 'Lobos', 'Lobo alfa', 'Bruja'].map((word) => night.indexOf(word));
    assert.ok(order.every((pos, i) => pos >= 0 && (i === 0 || pos > order[i - 1])), `order: ${order}`);
  });

  it('does not use commercial product names', () => {
    assert.doesNotMatch(all, /Thiercelieux|One Night|Traitors/i);
  });
});

describe('QR code', () => {
  it('draws one square per dark module', () => {
    assert.equal(qrPath([[true, false], [false, true]]), 'M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('encodes a join link into a square matrix with a border', () => {
    const { size, data } = encode('https://atapia9.github.io/hombres-lobos-online/jugador.html?sala=ABCDE', { ecc: 'M', border: 2 });
    assert.equal(data.length, size);
    assert.ok(data.every((row) => row.length === size));
    assert.ok(data[0].every((cell) => cell === false), 'quiet zone');
  });
});

describe('static pages', () => {
  it('load scripts as modules and contain no inline scripts (CSP script-src self)', async () => {
    for (const page of ['index.html', 'narrador.html', 'jugador.html']) {
      const html = await readFile(join(root, 'public', page), 'utf8');
      assert.match(html, /<html lang="es">/);
      assert.match(html, /<meta name="viewport"/);
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
      assert.deepEqual(inline, [], `${page} has inline scripts`);
      assert.doesNotMatch(html, /\son[a-z]+=/i, `${page} has inline event handlers`);
    }
  });

  it('never use innerHTML in client code (user text goes through textContent)', async () => {
    for (const file of ['dom.js', 'narrator.js', 'player.js', 'player-logic.js', 'rules-ui.js', 'qr.js', 'summary-image.js', 'net.js', 'landing.js', 'storage.js']) {
      const source = (await readFile(join(root, 'public/js', file), 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, ''); // comments may mention the forbidden APIs
      assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
    }
  });
});

