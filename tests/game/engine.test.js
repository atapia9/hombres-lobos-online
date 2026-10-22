import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame } from '../../server/game/index.js';
import {
  NARRATOR, act, advance, as, firstNight, lobby, playNight, rejects, started, voteOut,
} from '../helpers.js';

describe('engine: lobby', () => {
  it('players join with unique, clean names', () => {
    let s = act(createGame(), { type: 'player:join', actor: as('a1'), name: '  Ana  ' });
    assert.equal(s.players[0].name, 'Ana');
    rejects(s, { type: 'player:join', actor: as('a2'), name: 'ana' }, 'NAME_TAKEN');
    rejects(s, { type: 'player:join', actor: as('a2'), name: '<>' }, 'NAME_INVALID');
    rejects(s, { type: 'player:join', actor: as('__proto__'), name: 'X' }, 'INVALID_PAYLOAD');
  });

  it('the room holds at most 18 players', () => {
    rejects(lobby(18), { type: 'player:join', actor: as('p19'), name: 'Otro' }, 'ROOM_FULL');
  });

  it('nobody joins once the game started', () => {
    rejects(started(6), { type: 'player:join', actor: as('x'), name: 'Tarde' }, 'GAME_IN_PROGRESS');
  });

  it('unknown actions and actors are rejected', () => {
    assert.deepEqual(applyAction(createGame(), { type: 'nope' }), { ok: false, error: 'UNKNOWN_ACTION' });
    rejects(started(6), { type: 'night:act', actor: as('ghost'), targetId: 'p1' }, 'UNKNOWN_PLAYER');
  });

  it('never mutates the input state', () => {
    const s = lobby(6);
    const before = structuredClone(s);
    act(s, { type: 'game:start', actor: NARRATOR });
    assert.deepEqual(s, before);
  });
});

describe('engine: phases', () => {
  it('start → night 1 → dawn 1 → day 1 → night 2', () => {
    let s = started(6);
    assert.equal(s.phase, 'start');
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' }, 'INVALID_TRANSITION');
    s = firstNight(s);
    assert.equal(s.phase, 'night');
    assert.equal(s.round, 1);
    s = playNight(s, { seer: 'p1', protector: 'p5', wolves: 'p5' });
    assert.equal(s.phase, 'dawn');
    s = advance(s, 'day');
    s = advance(s, 'night');
    assert.equal(s.round, 2);
  });

  it('only the narrator moves phases', () => {
    rejects(started(6), { type: 'phase:advance', actor: as('p1'), to: 'night' }, 'NOT_NARRATOR');
  });

  it('the timer is set and cleared by the narrator', () => {
    let s = firstNight(started(6));
    s = act(s, { type: 'timer:set', actor: NARRATOR, seconds: 90 }, { now: 5_000 });
    assert.deepEqual(s.timer, { seconds: 90, endsAt: 95_000 });
    s = act(s, { type: 'timer:set', actor: NARRATOR, seconds: 0 });
    assert.equal(s.timer, null);
  });

  it('the narrator may end the game without a winner, and start a rematch', () => {
    let s = act(firstNight(started(6)), { type: 'game:end', actor: NARRATOR });
    assert.equal(s.winner, 'none');
    s = act(s, { type: 'game:rematch', actor: NARRATOR });
    assert.equal(s.phase, 'lobby');
    assert.equal(s.gameNumber, 2);
    assert.ok(s.players.every((p) => p.role === null && p.alive));
  });

  it('a retired player counts as eliminated and can end the game', () => {
    let s = act(started(6), { type: 'player:remove', actor: NARRATOR, playerId: 'p1' });
    assert.equal(s.players[0].eliminatedBy, 'narrator');
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p2' });
    assert.equal(s.winner, 'village');
  });

  it('every action is logged for the narrator, in order', () => {
    const s = voteOut(advance(playNight(firstNight(started(6)), { seer: 'p1', protector: 'p5', wolves: 'p5' }), 'day'), 'p1');
    const seqs = s.log.map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
    assert.ok(s.log.some((e) => e.type === 'seer_checked'));
    assert.ok(s.log.some((e) => e.type === 'night_resolved'));
  });
});
