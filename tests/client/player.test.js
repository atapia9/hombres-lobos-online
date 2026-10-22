// Player screen logic, fed with real views from the game rules.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView } from '../../server/game/index.js';
import {
  accuseOptions, endMessage, hunterPanel, nightPanel, parseRoomCode, roleCard, voteView,
} from '../../public/js/player-logic.js';
import {
  NARRATOR, act, advance, as, firstNight, nightAct, playNight, started, voteOut,
} from '../helpers.js';

// 9 players with identityRng: p1 wolf, p2 alpha, p3 seer, p4 protector, p5 spy, p6 witch, p7..p9 villagers.
const table = () => started(9, { roles: { alpha: true, witch: true, spy: true }, wolfCount: 1 });
const view = (state, id) => playerView(state, id);

describe('room code input', () => {
  it('accepts lower case and spaces, rejects look-alike characters', () => {
    assert.equal(parseRoomCode(' abcde '), 'ABCDE');
    assert.equal(parseRoomCode('ABCD'), null);
    assert.equal(parseRoomCode('ABCDO'), null);
    assert.equal(parseRoomCode('ABCDL'), null);
    assert.equal(parseRoomCode(null), null);
  });
});

describe('role card', () => {
  it('is empty before the game starts', () => {
    assert.equal(roleCard({ me: { role: null }, players: [] }), null);
  });

  it('shows the pack to a wolf, marking the alpha', () => {
    const card = roleCard(view(table(), 'p1'));
    assert.equal(card.title, 'Lobo');
    assert.equal(card.team, 'Lobos');
    assert.ok(card.lines.includes('Tu manada: Jugador 2 (alfa).'));
  });

  it('shows the seer her results', () => {
    const s = nightAct(firstNight(table()), 'p3', { targetId: 'p1' });
    assert.ok(roleCard(view(s, 'p3')).lines.includes('Noche 1: Jugador 1 ES lobo.'));
  });

  it('shows the spy her reports and the witch her potions', () => {
    const s = playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p8', witch: { heal: true } });
    assert.ok(roleCard(view(s, 'p5')).lines.includes('Noche 1: los lobos eligieron a Jugador 8.'));
    assert.ok(roleCard(view(s, 'p6')).lines.includes('Pociones disponibles: muerte.'));
  });

  it('tells a converted player what happened', () => {
    const s = playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p8', convert: true });
    const card = roleCard(view(s, 'p8'));
    assert.equal(card.title, 'Lobo');
    assert.match(card.lines[0], /te convirtió en la noche 1: antes eras Aldeano/);
  });
});

describe('night panel', () => {
  it('everyone without a turn just waits', () => {
    const s = firstNight(table());
    assert.equal(nightPanel(view(s, 'p7')).kind, 'wait');
    assert.equal(nightPanel(view(s, 'p1')).kind, 'wait', 'wolves wait for the seer and protector');
  });

  it('the seer cannot pick herself', () => {
    const panel = nightPanel(view(firstNight(table()), 'p3'));
    assert.equal(panel.kind, 'seer');
    assert.ok(!panel.options.some((o) => o.value === 'p3'));
  });

  it('the protector cannot repeat last night\'s pick', () => {
    let s = playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p8' });
    s = voteOut(advance(s, 'day'), 'p1');
    s = advance(s, 'night');
    s = nightAct(s, 'p3', { targetId: 'p2' });
    const panel = nightPanel(view(s, 'p4'));
    assert.deepEqual(panel.options.find((o) => o.value === 'p9'), { value: 'p9', label: 'Jugador 9', disabled: true, note: 'protegido anoche' });
  });

  it('wolves see each other\'s picks and never their partners as options', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p3', { targetId: 'p1' });
    s = nightAct(s, 'p4', { targetId: 'p9' });
    s = nightAct(s, 'p1', { targetId: 'p7' });
    const panel = nightPanel(view(s, 'p2'));
    assert.equal(panel.kind, 'wolves');
    assert.deepEqual(panel.partnerPicks, [{ name: 'Jugador 1', target: 'Jugador 7' }]);
    assert.ok(!panel.options.some((o) => o.value === 'p1' || o.value === 'p2'));
  });

  it('the alpha decides and the witch sees the victim', () => {
    let s = firstNight(table());
    s = nightAct(s, 'p3', { targetId: 'p1' });
    s = nightAct(s, 'p4', { targetId: 'p9' });
    s = nightAct(s, 'p1', { targetId: 'p7' });
    s = nightAct(s, 'p2', { targetId: 'p7' });
    assert.equal(nightPanel(view(s, 'p2')).targetName, 'Jugador 7');
    s = nightAct(s, 'p2', { convert: false });
    const witch = nightPanel(view(s, 'p6'));
    assert.equal(witch.kind, 'witch');
    assert.equal(witch.victimName, 'Jugador 7');
    assert.equal(witch.canHeal, true);
    assert.equal(witch.canPoison, true);
  });

  it('the dead do not act', () => {
    const s = act(firstNight(table()), { type: 'player:remove', actor: NARRATOR, playerId: 'p7' });
    assert.equal(nightPanel(view(s, 'p7')).kind, 'dead');
  });
});

describe('day', () => {
  const day1 = () => advance(playNight(firstNight(table()), { seer: 'p1', protector: 'p9', wolves: 'p9' }), 'day');

  it('a living player may accuse anyone else alive', () => {
    const options = accuseOptions(view(day1(), 'p3'));
    assert.equal(options.length, 8);
    assert.ok(!options.some((p) => p.id === 'p3'));
  });

  it('shows the candidates, the player\'s ballot and the result', () => {
    let s = act(day1(), { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:accuse', actor: as('p1'), targetId: 'p3' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = act(s, { type: 'day:vote', actor: as('p4'), targetId: 'p1' });
    const open = voteView(view(s, 'p4'));
    assert.deepEqual(open.candidates.map((c) => c.name), ['Jugador 1', 'Jugador 3']);
    assert.deepEqual(open.myBallot, { targetId: 'p1' });
    assert.equal(voteView(view(s, 'p1')).candidates.find((c) => c.isMe).id, 'p1');
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    const closed = voteView(view(s, 'p4'));
    assert.match(closed.result.text, /Jugador 1 sale de la aldea/);
    assert.deepEqual(closed.result.voters[0], { name: 'Jugador 1', voters: ['Jugador 4'] });
  });

  it('only the dead hunter is asked to shoot', () => {
    let s = started(8, { roles: { hunter: true } });
    // p1 p2 wolves, p3 seer, p4 protector, p5 hunter.
    s = playNight(firstNight(s), { seer: 'p1', protector: 'p3', wolves: 'p5' });
    assert.equal(hunterPanel(view(s, 'p5')).options.length, 7, 'every living player');
    assert.equal(hunterPanel(view(s, 'p6')), null);
  });
});

describe('end of the game', () => {
  it('tells each player whether their team won', () => {
    let s = playNight(firstNight(started(6)), { seer: 'p1', protector: 'p5', wolves: 'p5' });
    s = voteOut(advance(s, 'day'), 'p1');
    s = advance(s, 'night');
    s = playNight(s, { seer: 'p2', protector: 'p6', wolves: 'p6' });
    s = voteOut(advance(s, 'day'), 'p2');
    assert.equal(endMessage(view(s, 'p3')), '¡Tu equipo ganó!');
    assert.equal(endMessage(view(s, 'p1')), 'Tu equipo perdió esta vez.');
  });
});
