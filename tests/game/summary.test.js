import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_LINE, buildSummary } from '../../server/game/index.js';
import {
  NARRATOR,
  act,
  as,
  daytime,
  endNight,
  goToNight,
  honestBallots,
  mafiaPick,
  started,
  voteOut,
} from '../helpers.js';

const NOW = Date.UTC(2026, 9, 21, 12);

/** Original game, 7 players (p1, p2 mafia): honest win over three rounds. */
function honestWin() {
  let s = daytime(7);
  s = voteOut(s, 'p1', 'p7');
  s = endNight(honestBallots(mafiaPick(goToNight(s), 'p6')));
  s = voteOut(s, 'p3', 'p1');
  s = endNight(honestBallots(goToNight(s)));
  return voteOut(s, 'p3', 'p2');
}

/** Original game, 6 players: the mafia vote out every honest player. */
function mafiaWin() {
  let s = daytime(6);
  for (const target of ['p3', 'p4', 'p5', 'p6']) s = voteOut(s, 'p1', target);
  return s;
}

describe('buildSummary', () => {
  it('is only available once the game has ended', () => {
    assert.throws(() => buildSummary(started(6)), /ended/);
  });

  it('includes the winner, roles, eliminations by round, score, closing line and credit (Markdown)', () => {
    const { markdown } = buildSummary(honestWin(), { now: NOW });
    const expected = [
      '# Mafia — Resumen de la partida',
      '- **Fecha:** 21 de octubre de 2026',
      '- **Modo:** Original de Davýdov',
      '- **Jugadores:** 7 (2 en la mafia)',
      '**Ganan los Honestos.**',
      '- **Mafia:** Jugador 1 (fuera en la ronda 2), Jugador 2 (fuera en la ronda 3)',
      '### Ronda 1',
      '- Día: **Jugador 7** — eliminación por votación: 6 de 6 votos «culpable» (se necesitaban 4)',
      '- Noche: **Jugador 6** — muerte a manos de la mafia (papeletas de mafia: 2)',
      '### Ronda 2',
      '- Noche: nadie murió (papeletas de mafia: 0)',
      '### Ronda 3',
      '## Puntuación',
      '| Jugador 3 | 3 |',
      '> La ciudad despierta en paz: no queda ningún mafioso.',
      `> _${CREDIT_LINE}_`,
    ];
    for (const line of expected) assert.ok(markdown.includes(line), `missing: ${line}\n\n${markdown}`);
  });

  it('uses WhatsApp formatting in the plain-text version', () => {
    const { whatsapp } = buildSummary(honestWin(), { now: NOW });
    assert.ok(whatsapp.startsWith('*MAFIA — Resumen de la partida*'));
    assert.ok(whatsapp.includes('*Resultado:* Ganan los Honestos'));
    assert.ok(whatsapp.includes('• Día: *Jugador 7* — eliminación por votación'));
    assert.ok(whatsapp.includes('_La ciudad despierta en paz: no queda ningún mafioso._'));
    assert.ok(whatsapp.endsWith(CREDIT_LINE));
    assert.doesNotMatch(whatsapp, /^#/m, 'no Markdown headings');
    assert.doesNotMatch(whatsapp, /\*\*/, 'no Markdown bold');
    assert.doesNotMatch(whatsapp, /\|/, 'no tables');
  });

  it('uses the mafia closing line when the mafia win', () => {
    const { markdown, whatsapp } = buildSummary(mafiaWin(), { now: NOW });
    assert.ok(markdown.includes('**Gana la Mafia.**'));
    assert.ok(markdown.includes('> La ciudad guarda silencio: la mafia se queda con todo.'));
    assert.ok(markdown.includes('| Jugador 1 | 4 |'));
    assert.ok(whatsapp.includes('_La ciudad guarda silencio: la mafia se queda con todo._'));
  });

  it('keeps only the credit line when the game ends without a winner', () => {
    const s = act(daytime(6), { type: 'game:end', actor: NARRATOR });
    const { markdown, whatsapp, data } = buildSummary(s, { now: NOW });
    assert.equal(data.closingLine, null);
    assert.ok(markdown.includes('**Partida terminada sin ganador.**'));
    assert.ok(markdown.includes('Sin eliminaciones.'));
    assert.ok(markdown.includes(`> _${CREDIT_LINE}_`));
    assert.ok(whatsapp.endsWith(CREDIT_LINE));
  });

  it('marks the classic variant as not original and names the special roles', () => {
    let s = mafiaPick(goToNight(daytime(6, { mode: 'classic' })), 'p5');
    s = endNight(act(s, { type: 'night:ability', actor: as('p4'), targetId: 'p5' }));
    s = voteOut(s, 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    const { markdown } = buildSummary(s, { now: NOW });
    assert.ok(markdown.includes('Clásico con roles (variante posterior inspirada en Werewolf; no forma parte del original)'));
    assert.ok(markdown.includes('Jugador 3 (sobrevive, Vidente)'));
    assert.ok(markdown.includes('Jugador 4 (sobrevive, Doctor)'));
    assert.ok(markdown.includes('- Noche: **Jugador 5** — se salvó gracias al Doctor'));
    assert.doesNotMatch(markdown, /papeletas de mafia/);
  });

  it('lists players retired by the narrator', () => {
    let s = act(daytime(6), { type: 'player:remove', actor: NARRATOR, playerId: 'p6' });
    s = act(s, { type: 'game:end', actor: NARRATOR });
    assert.ok(buildSummary(s, { now: NOW }).markdown.includes('- Día: **Jugador 6** — retiro por decisión del narrador'));
  });

  it('omits the score when the narrator hides it', () => {
    let s = act(daytime(6), { type: 'game:configure', actor: NARRATOR, showScore: false });
    for (const target of ['p3', 'p4', 'p5', 'p6']) s = voteOut(s, 'p1', target);
    const { markdown, whatsapp } = buildSummary(s, { now: NOW });
    assert.doesNotMatch(markdown, /Puntuación/);
    assert.doesNotMatch(whatsapp, /Puntuación/);
  });

  it('adds the cumulative total after a rematch', () => {
    let s = act(mafiaWin(), { type: 'game:rematch', actor: NARRATOR });
    s = act(act(s, { type: 'game:start', actor: NARRATOR }), { type: 'phase:advance', actor: NARRATOR, to: 'day' });
    for (const target of ['p3', 'p4', 'p5', 'p6']) s = voteOut(s, 'p1', target);
    const { markdown, whatsapp } = buildSummary(s, { now: NOW });
    assert.ok(markdown.includes('# Mafia — Resumen de la partida 2'));
    assert.ok(markdown.includes('| Jugador | Puntos | Total |'));
    assert.ok(markdown.includes('| Jugador 1 | 4 | 8 |'));
    assert.ok(whatsapp.includes('Jugador 1: 4 (total 8)'));
  });

  it('formats the date in the requested time zone', () => {
    const lateNight = Date.UTC(2026, 9, 22, 3); // 21 Oct, 21:00 in Mexico City
    const { data } = buildSummary(mafiaWin(), { now: lateNight, timeZone: 'America/Mexico_City' });
    assert.equal(data.dateLabel, '21 de octubre de 2026');
  });
});
