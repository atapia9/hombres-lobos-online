// Player screen logic, fed with real views from the game rules.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playerView } from '../../server/game/index.js';
import {
  accuseOptions,
  endMessage,
  nightChoices,
  parseRoomCode,
  roleCard,
  voteView,
} from '../../public/js/player-logic.js';
import { NARRATOR, act, as, daytime, goToNight, started, voteOut } from '../helpers.js';

// Identity RNG in the helpers: original 6 players → p1, p2 mafia; classic → p3 seer, p4 doctor.
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
  it('tells mafiosi who their partners are', () => {
    const card = roleCard(view(started(7), 'p1'));
    assert.equal(card.title, 'Mafioso');
    assert.equal(card.team, 'Mafia');
    assert.ok(card.lines.includes('Tus compañeros: Jugador 2.'));
  });

  it('never mentions other players to honest players', () => {
    const card = roleCard(view(started(7), 'p5'));
    assert.equal(card.title, 'Honesto');
    assert.equal(card.lines.length, 1);
    assert.doesNotMatch(card.lines.join(' '), /Jugador/);
  });

  it('lists the seer\'s results', () => {
    let s = goToNight(daytime(6, { mode: 'classic' }));
    s = act(s, { type: 'night:ability', actor: as('p3'), targetId: 'p2' });
    assert.ok(roleCard(view(s, 'p3')).lines.includes('Ronda 1: Jugador 2 es de la Mafia.'));
  });

  it('is null in the lobby', () => {
    assert.equal(roleCard({ players: [], me: { role: null } }), null);
  });
});

describe('night ballot (R5, ADR-010)', () => {
  it('offers every living player the same list: "Honesto" plus the others', () => {
    const s = goToNight(daytime(6));
    const honest = nightChoices(view(s, 'p4'));
    const mafia = nightChoices(view(s, 'p1'));
    assert.deepEqual(honest.options.map((o) => o.label), ['Honesto', 'Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 5', 'Jugador 6']);
    assert.equal(mafia.options.length, honest.options.length);
    assert.equal(honest.kind, 'ballot');
    assert.equal(mafia.kind, 'ballot');
  });

  it('lets honest players pick only "Honesto"', () => {
    const { options } = nightChoices(view(goToNight(daytime(6)), 'p4'));
    assert.deepEqual(options.filter((o) => !o.disabled).map((o) => o.value), [null]);
  });

  it('lets mafiosi pick only non-mafia players', () => {
    const { options } = nightChoices(view(goToNight(daytime(6)), 'p1'));
    assert.deepEqual(options.filter((o) => !o.disabled).map((o) => o.value), ['p3', 'p4', 'p5', 'p6']);
    assert.equal(options.find((o) => o.value === 'p2').note, 'compañero');
  });

  it('remembers the ballot already handed in', () => {
    let s = goToNight(daytime(6));
    s = act(s, { type: 'night:submit', actor: as('p4'), targetId: null });
    const choices = nightChoices(view(s, 'p4'));
    assert.equal(choices.submitted, true);
    assert.equal(choices.current, null);
    assert.equal(nightChoices(view(s, 'p5')).submitted, false);
    assert.equal(nightChoices(view(s, 'p5')).current, undefined);
  });

  it('shows the partners\' picks to the mafia only in the classic variant', () => {
    let s = goToNight(daytime(6, { mode: 'classic' }));
    s = act(s, { type: 'night:submit', actor: as('p2'), targetId: 'p5' });
    assert.deepEqual(nightChoices(view(s, 'p1')).partnerPicks, [{ name: 'Jugador 2', target: 'Jugador 5' }]);
    let o = goToNight(daytime(6));
    o = act(o, { type: 'night:submit', actor: as('p2'), targetId: 'p5' });
    assert.deepEqual(nightChoices(view(o, 'p1')).partnerPicks, []);
  });

  it('gives the seer one consultation per night, never on themself', () => {
    let s = goToNight(daytime(6, { mode: 'classic' }));
    const before = nightChoices(view(s, 'p3'));
    assert.equal(before.kind, 'seer');
    assert.equal(before.options.some((o) => o.value === 'p3'), false);
    s = act(s, { type: 'night:ability', actor: as('p3'), targetId: 'p1' });
    assert.equal(nightChoices(view(s, 'p3')).locked, true);
  });

  it('blocks the doctor from repeating last night\'s protection', () => {
    let s = goToNight(daytime(6, { mode: 'classic' }));
    s = act(s, { type: 'night:ability', actor: as('p4'), targetId: 'p6' });
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' });
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' });
    const { options, kind } = nightChoices(view(s, 'p4'));
    assert.equal(kind, 'doctor');
    assert.equal(options.find((o) => o.value === 'p6').disabled, true);
    assert.equal(options.find((o) => o.value === 'p4').disabled, false, 'may protect themself');
  });

  it('asks nothing of eliminated players', () => {
    const s = goToNight(voteOut(daytime(7), 'p1', 'p7'));
    assert.equal(nightChoices(view(s, 'p7')).kind, 'none');
  });
});

describe('day actions', () => {
  it('lets living players accuse anyone alive but themselves', () => {
    const s = voteOut(daytime(7), 'p1', 'p7');
    assert.deepEqual(accuseOptions(view(s, 'p3')).map((p) => p.id), ['p1', 'p2', 'p4', 'p5', 'p6']);
    assert.deepEqual(accuseOptions(view(s, 'p7')), []);
  });

  it('describes an open vote and who may vote', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    s = act(s, { type: 'day:vote', actor: as('p4'), guilty: true });
    const voter = voteView(view(s, 'p4'));
    assert.equal(voter.canVote, true);
    assert.equal(voter.myVote, true);
    assert.equal(voter.progress, 'Han votado 1 de 5. Se necesitan 3 votos «culpable».');
    const accused = voteView(view(s, 'p1'));
    assert.equal(accused.isAccused, true);
    assert.equal(accused.canVote, false);
  });

  it('shows who voted guilty once the vote is closed', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    for (const id of ['p3', 'p4', 'p5']) s = act(s, { type: 'day:vote', actor: as(id), guilty: true });
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    const closed = voteView(view(s, 'p6'));
    assert.equal(closed.open, false);
    assert.equal(closed.result.passed, true);
    assert.deepEqual(closed.result.guiltyVoters, ['Jugador 3', 'Jugador 4', 'Jugador 5']);
  });
});

describe('end of the game', () => {
  it('tells each player whether their team won', () => {
    let s = voteOut(daytime(6), 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    assert.equal(endMessage(view(s, 'p3')), '¡Tu equipo ganó!');
    assert.equal(endMessage(view(s, 'p1')), 'Tu equipo perdió esta vez.');
    const none = act(daytime(6), { type: 'game:end', actor: NARRATOR });
    assert.equal(endMessage(view(none, 'p1')), 'La partida terminó sin ganador.');
  });
});
