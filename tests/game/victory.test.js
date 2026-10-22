import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkWinner } from '../../server/game/index.js';
import {
  NARRATOR,
  act,
  as,
  daytime,
  endNight,
  goToNight,
  honestBallots,
  mafiaPick,
  playerById,
  rejects,
  started,
  voteOut,
} from '../helpers.js';

const players = (...specs) => specs.map(([role, alive], i) => ({ id: `p${i + 1}`, role, alive }));

describe('checkWinner (R7)', () => {
  it('declares the honest team the winner when no mafioso is alive', () => {
    assert.equal(checkWinner(players(['mafia', false], ['honest', true], ['seer', false])), 'honest');
  });

  it('declares the mafia the winner when no honest player is alive', () => {
    assert.equal(checkWinner(players(['mafia', true], ['honest', false], ['doctor', false])), 'mafia');
  });

  it('has no parity rule: the game goes on while both teams are alive', () => {
    assert.equal(checkWinner(players(['mafia', true], ['mafia', true], ['honest', true])), null);
  });
});

describe('end of the game', () => {
  it('ends with an honest win when the last mafioso is voted out', () => {
    let s = voteOut(daytime(6), 'p3', 'p1');
    assert.equal(s.phase, 'day');
    s = voteOut(s, 'p3', 'p2');
    assert.equal(s.phase, 'ended');
    assert.equal(s.winner, 'honest');
    assert.equal(s.log.at(-1).type, 'game_ended');
  });

  it('ends with a mafia win when the last honest player dies at night', () => {
    let s = voteOut(daytime(6), 'p1', 'p3');
    s = voteOut(s, 'p1', 'p4');
    s = voteOut(s, 'p1', 'p5');
    s = goToNight(s);
    s = endNight(honestBallots(mafiaPick(s, 'p6')));
    assert.equal(s.phase, 'ended');
    assert.equal(s.winner, 'mafia');
    assert.equal(playerById(s, 'p6').eliminatedBy, 'night');
  });

  it('keeps playing when the mafia equal the honest players in number', () => {
    let s = daytime(7);
    for (const target of ['p3', 'p4', 'p5']) s = voteOut(s, 'p1', target);
    assert.equal(s.phase, 'day');
    assert.equal(s.winner, null);
  });

  it('lets the narrator end the game without a winner', () => {
    const s = act(daytime(6), { type: 'game:end', actor: NARRATOR });
    assert.equal(s.phase, 'ended');
    assert.equal(s.winner, 'none');
    assert.ok(Object.values(s.scores).every((points) => points === 0));
    rejects(s, { type: 'game:end', actor: NARRATOR }, 'WRONG_PHASE');
  });

  it('rejects game actions once it has ended', () => {
    const s = act(daytime(6), { type: 'game:end', actor: NARRATOR });
    rejects(s, { type: 'day:accuse', actor: as('p3'), targetId: 'p1' }, 'WRONG_PHASE');
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' }, 'INVALID_TRANSITION');
    rejects(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p1' }, 'WRONG_PHASE');
  });
});

describe('retiring a player during the game (R12)', () => {
  it('counts as an elimination and can end the game', () => {
    let s = act(daytime(6), { type: 'player:remove', actor: NARRATOR, playerId: 'p1' });
    const retired = playerById(s, 'p1');
    assert.equal(retired.alive, false);
    assert.equal(retired.eliminatedBy, 'narrator');
    assert.deepEqual(s.history.at(-1), { round: 1, phase: 'day', type: 'retired', playerId: 'p1' });
    rejects(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p1' }, 'PLAYER_DEAD');
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p2' });
    assert.equal(s.winner, 'honest');
  });

  it('cancels the open vote when the accused is retired', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p3'), targetId: 'p6' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p6' });
    assert.equal(s.day.vote, null);
    assert.ok(s.log.some((e) => e.type === 'vote_cancelled' && e.data.reason === 'accused_removed'));
  });

  it('discards the night ballot of a retired player', () => {
    let s = goToNight(daytime(6));
    s = act(s, { type: 'night:submit', actor: as('p1'), targetId: 'p3' });
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p1' });
    assert.equal(Object.hasOwn(s.night.ballots, 'p1'), false);
  });
});

describe('scoring (R9)', () => {
  it('gives each living mafioso as many points as honest players at the start', () => {
    let s = voteOut(daytime(6), 'p1', 'p3');
    s = voteOut(s, 'p1', 'p4');
    s = voteOut(s, 'p1', 'p5');
    s = voteOut(s, 'p1', 'p6');
    assert.equal(s.winner, 'mafia');
    assert.deepEqual(s.scores, { p1: 4, p2: 4, p3: 0, p4: 0, p5: 0, p6: 0 });
  });

  it('only scores mafiosi who are still alive', () => {
    let s = voteOut(daytime(7), 'p3', 'p2');
    for (const target of ['p3', 'p4', 'p5', 'p6', 'p7']) s = voteOut(s, 'p1', target);
    assert.equal(s.winner, 'mafia');
    assert.equal(s.scores.p1, 5);
    assert.equal(s.scores.p2, 0);
  });

  it('gives each living honest player as many points as honest survivors', () => {
    let s = voteOut(daytime(6), 'p1', 'p6');
    s = voteOut(s, 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    assert.equal(s.winner, 'honest');
    assert.deepEqual(s.scores, { p1: 0, p2: 0, p3: 3, p4: 3, p5: 3, p6: 0 });
  });

  it('counts the seer and doctor as honest players', () => {
    let s = daytime(6, { mode: 'classic' });
    s = voteOut(s, 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    assert.equal(s.winner, 'honest');
    assert.deepEqual(s.scores, { p1: 0, p2: 0, p3: 4, p4: 4, p5: 4, p6: 4 });
  });
});

describe('rematch with the same players (R9)', () => {
  it('goes back to the lobby, keeps the players and accumulates the scores', () => {
    let s = voteOut(daytime(6), 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    s = act(s, { type: 'game:rematch', actor: NARRATOR });
    assert.equal(s.phase, 'lobby');
    assert.equal(s.gameNumber, 2);
    assert.equal(s.round, 0);
    assert.ok(s.players.every((p) => p.alive && p.role === null && p.eliminatedBy === null));
    assert.deepEqual(s.scoreboard, { p1: 0, p2: 0, p3: 4, p4: 4, p5: 4, p6: 4 });
    assert.deepEqual(s.history, []);
    assert.deepEqual(s.log.map((e) => e.type), ['rematch_created']);

    s = act(s, { type: 'game:start', actor: NARRATOR });
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' });
    s = voteOut(s, 'p3', 'p1');
    s = voteOut(s, 'p3', 'p2');
    assert.deepEqual(s.scoreboard, { p1: 0, p2: 0, p3: 8, p4: 8, p5: 8, p6: 8 });
  });

  it('is only available when the game has ended', () => {
    rejects(started(6), { type: 'game:rematch', actor: NARRATOR }, 'WRONG_PHASE');
  });
});
