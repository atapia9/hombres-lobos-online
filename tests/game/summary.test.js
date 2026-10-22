import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_LINE, buildSummary } from '../../server/game/index.js';
import {
  NARRATOR, act, advance, firstNight, nightAct, playNight, started, voteOut,
} from '../helpers.js';

// 8 players: p1 wolf, p2 alpha, p3 seer, p4 protector, p5 hunter, p6 witch, p7 p8 villagers.
function finishedGame() {
  let s = started(8, { roles: { alpha: true, hunter: true, witch: true } });
  s = firstNight(s);
  s = nightAct(s, 'p3', { targetId: 'p1' });
  s = nightAct(s, 'p4', { targetId: 'p7' });
  s = nightAct(s, 'p1', { targetId: 'p8' });
  s = nightAct(s, 'p2', { targetId: 'p8' });
  s = nightAct(s, 'p2', { convert: false });
  s = nightAct(s, 'p6', { heal: true, poisonTargetId: 'p1' });
  s = advance(s, 'dawn');
  s = voteOut(advance(s, 'day'), 'p5');
  s = act(s, { type: 'hunter:shoot', actor: { kind: 'player', id: 'p5' }, targetId: 'p2' });
  return s;
}

describe('summary', () => {
  const s = finishedGame();
  const { markdown, whatsapp, data } = buildSummary(s, { now: Date.UTC(2026, 9, 21, 12), timeZone: 'America/Mexico_City' });

  it('the scripted game ends with the village winning', () => {
    assert.equal(s.winner, 'village');
  });

  it('has the winner, the roles, each round, the abilities and the closing line', () => {
    assert.match(markdown, /^# Hombres Lobos — Resumen de la partida/);
    assert.match(markdown, /\*\*Ganan los Aldeanos\.\*\*/);
    assert.match(markdown, /Lobo alfa/);
    assert.match(markdown, /envenenado por la Bruja/);
    assert.match(markdown, /eliminado por votación/);
    assert.match(markdown, /abatido por el Cazador Jugador 5/);
    assert.match(markdown, /Vidente consultó a Jugador 1: es lobo/);
    assert.match(markdown, /Bruja salvó a Jugador 8/);
    assert.match(markdown, /la aldea vuelve a dormir tranquila/);
    assert.equal(data.rounds.length, 1);
  });

  it('credits the family of games without claiming it', () => {
    assert.ok(markdown.includes(CREDIT_LINE));
    assert.ok(whatsapp.includes(CREDIT_LINE));
    assert.match(CREDIT_LINE, /Davýdov \(1986–1987\)/);
    assert.match(CREDIT_LINE, /Plotkin \(1997\)/);
  });

  it('the WhatsApp version uses *bold* and no Markdown headings', () => {
    assert.match(whatsapp, /^\*HOMBRES LOBOS — RESUMEN DE LA PARTIDA\*/);
    assert.ok(!whatsapp.includes('#'));
  });

  it('is only available once the game has ended', () => {
    assert.throws(() => buildSummary(started(6)), /ended/);
  });

  it('a game ended by the narrator has no winner and no closing line', () => {
    const ended = act(firstNight(started(6)), { type: 'game:end', actor: NARRATOR });
    const out = buildSummary(ended);
    assert.match(out.markdown, /Partida terminada sin ganador/);
    assert.equal(out.data.closingLine, null);
  });

  it('the alpha\'s conversion appears in the summary', () => {
    let g = started(9, { roles: { alpha: true } });
    g = playNight(firstNight(g), { seer: 'p6', protector: 'p7', wolves: 'p8', convert: true });
    g = act(g, { type: 'game:end', actor: NARRATOR });
    assert.match(buildSummary(g).markdown, /Lobo alfa convirtió a Jugador 8 en lobo/);
    assert.match(buildSummary(g).markdown, /antes Aldeano, convertido en la noche 1/);
  });
});
