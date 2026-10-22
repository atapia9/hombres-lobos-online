import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame } from '../../server/game/index.js';
import { NARRATOR, act, as, lobby, rejects, started } from '../helpers.js';

describe('createGame', () => {
  it('starts in the lobby with default settings', () => {
    const s = createGame();
    assert.equal(s.mode, 'original');
    assert.equal(s.phase, 'lobby');
    assert.equal(s.round, 0);
    assert.deepEqual(s.players, []);
    assert.deepEqual(s.config, { mafiaCount: null, showVotes: true, showScore: true });
  });

  it('rejects unknown modes', () => {
    assert.throws(() => createGame({ mode: 'werewolf' }), TypeError);
  });
});

describe('applyAction', () => {
  it('never mutates the input state', () => {
    const s = lobby(6);
    const snapshot = structuredClone(s);
    act(s, { type: 'game:start', actor: NARRATOR });
    act(s, { type: 'player:join', actor: as('p7'), name: 'Siete' });
    rejects(s, { type: 'player:join', actor: as('p8'), name: 'jugador 1' }, 'NAME_TAKEN');
    assert.deepEqual(s, snapshot);
  });

  it('rejects unknown or malformed actions', () => {
    const s = createGame();
    assert.deepEqual(applyAction(s, null), { ok: false, error: 'INVALID_PAYLOAD' });
    rejects(s, { type: 'fly' }, 'UNKNOWN_ACTION');
    rejects(s, { type: '__proto__' }, 'UNKNOWN_ACTION');
    rejects(s, { type: 'toString' }, 'UNKNOWN_ACTION');
  });

  it('checks who is acting', () => {
    const s = started(6);
    rejects(s, { type: 'phase:advance', actor: as('p1'), to: 'day' }, 'NOT_NARRATOR');
    rejects(s, { type: 'phase:advance', to: 'day' }, 'NOT_NARRATOR');
    rejects(s, { type: 'day:accuse', actor: NARRATOR, targetId: 'p2' }, 'NOT_PLAYER');
    rejects(s, { type: 'day:accuse', actor: as('ghost'), targetId: 'p2' }, 'UNKNOWN_PLAYER');
  });

  it('records every successful action in an ordered log with round and phase', () => {
    const s = act(started(6), { type: 'phase:advance', actor: NARRATOR, to: 'day' }, { now: 5_000 });
    const types = s.log.map((e) => e.type);
    assert.deepEqual(types.slice(-2), ['game_started', 'phase_changed']);
    const seqs = s.log.map((e) => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
    const last = s.log.at(-1);
    assert.equal(last.round, 1);
    assert.equal(last.phase, 'day');
    assert.equal(last.at, 5_000);
  });

  it('returns the events produced by the action', () => {
    const result = applyAction(lobby(6), { type: 'game:start', actor: NARRATOR });
    assert.equal(result.ok, true);
    assert.deepEqual(result.events.map((e) => e.type), ['game_started']);
  });
});

describe('lobby', () => {
  it('adds players with cleaned names', () => {
    const s = act(createGame(), { type: 'player:join', actor: as('a1'), name: '  Ana   María ' });
    assert.equal(s.players[0].name, 'Ana María');
    assert.equal(s.players[0].alive, true);
    assert.equal(s.players[0].role, null);
  });

  it('keeps names unique ignoring case', () => {
    rejects(lobby(2), { type: 'player:join', actor: as('x'), name: 'JUGADOR 1' }, 'NAME_TAKEN');
  });

  it('rejects invalid names, invalid ids and duplicate ids', () => {
    const s = lobby(1);
    rejects(s, { type: 'player:join', actor: as('x'), name: '<>' }, 'NAME_INVALID');
    rejects(s, { type: 'player:join', actor: as('bad id!'), name: 'Ok' }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'player:join', actor: as('p1'), name: 'Otro' }, 'ALREADY_JOINED');
  });

  it('accepts at most 20 players', () => {
    rejects(lobby(20), { type: 'player:join', actor: as('p21'), name: 'Veintiuno' }, 'ROOM_FULL');
  });

  it('does not accept new players once the game has started', () => {
    rejects(started(6), { type: 'player:join', actor: as('p7'), name: 'Tarde' }, 'GAME_IN_PROGRESS');
  });

  it('lets players leave and the narrator kick them before the game starts', () => {
    let s = lobby(4);
    s = act(s, { type: 'player:leave', actor: as('p1') });
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p2' });
    assert.deepEqual(s.players.map((p) => p.id), ['p3', 'p4']);
    assert.equal(Object.hasOwn(s.scoreboard, 'p1'), false);
    rejects(started(6), { type: 'player:leave', actor: as('p1') }, 'WRONG_PHASE');
  });
});

describe('configuration', () => {
  it('lets the narrator choose the mode and override the mafia count in the lobby', () => {
    let s = lobby(6);
    s = act(s, { type: 'game:configure', actor: NARRATOR, mode: 'classic', mafiaCount: 1 });
    assert.equal(s.mode, 'classic');
    assert.equal(s.config.mafiaCount, 1);
    s = act(s, { type: 'game:configure', actor: NARRATOR, mafiaCount: null });
    assert.equal(s.config.mafiaCount, null);
  });

  it('validates the values', () => {
    const s = lobby(6);
    rejects(s, { type: 'game:configure', actor: NARRATOR, mode: 'werewolf' }, 'INVALID_MODE');
    rejects(s, { type: 'game:configure', actor: NARRATOR, mafiaCount: 0 }, 'INVALID_MAFIA_COUNT');
    rejects(s, { type: 'game:configure', actor: NARRATOR, mafiaCount: '2' }, 'INVALID_MAFIA_COUNT');
    rejects(s, { type: 'game:configure', actor: NARRATOR, showVotes: 'no' }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'game:configure', actor: NARRATOR }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'game:configure', actor: as('p1'), mafiaCount: 2 }, 'NOT_NARRATOR');
  });

  it('locks the mode and mafia count during the game, but not the display options', () => {
    const s = started(6);
    rejects(s, { type: 'game:configure', actor: NARRATOR, mode: 'classic' }, 'WRONG_PHASE');
    rejects(s, { type: 'game:configure', actor: NARRATOR, mafiaCount: 1 }, 'WRONG_PHASE');
    const hidden = act(s, { type: 'game:configure', actor: NARRATOR, showVotes: false });
    assert.equal(hidden.config.showVotes, false);
  });
});

describe('game:start', () => {
  it('requires at least 6 players', () => {
    rejects(lobby(5), { type: 'game:start', actor: NARRATOR }, 'NOT_ENOUGH_PLAYERS');
  });

  it('refuses more mafiosi than allowed', () => {
    const s = act(lobby(6), { type: 'game:configure', actor: NARRATOR, mafiaCount: 3 });
    rejects(s, { type: 'game:start', actor: NARRATOR }, 'INVALID_MAFIA_COUNT');
  });

  it('deals roles using the recommended table and moves to dawn, round 1', () => {
    const s = started(8);
    assert.equal(s.phase, 'dawn');
    assert.equal(s.round, 1);
    assert.equal(s.players.filter((p) => p.role === 'mafia').length, 3);
    assert.deepEqual(s.initial, { playerCount: 8, mafiaCount: 3, honestCount: 5 });
    const entry = s.log.find((e) => e.type === 'game_started');
    assert.equal(Object.keys(entry.data.roles).length, 8);
  });

  it('uses the RNG from the context', () => {
    const a = started(10, { rng: () => 0 });
    const b = started(10);
    assert.notDeepEqual(a.players.map((p) => p.role), b.players.map((p) => p.role));
  });
});

describe('phase transitions', () => {
  it('goes dawn → day and rejects other jumps', () => {
    const s = started(6);
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'INVALID_TRANSITION');
    rejects(lobby(6), { type: 'phase:advance', actor: NARRATOR, to: 'day' }, 'INVALID_TRANSITION');
    const day = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' });
    assert.equal(day.phase, 'day');
    assert.equal(day.round, 1);
    rejects(day, { type: 'phase:advance', actor: NARRATOR, to: 'dawn' }, 'INVALID_TRANSITION');
  });
});

describe('timer', () => {
  it('sets an informative countdown from the context clock', () => {
    const s = act(started(6), { type: 'timer:set', actor: NARRATOR, seconds: 90 }, { now: 10_000 });
    assert.deepEqual(s.timer, { seconds: 90, endsAt: 100_000 });
    const cleared = act(s, { type: 'timer:set', actor: NARRATOR, seconds: 0 });
    assert.equal(cleared.timer, null);
  });

  it('validates the duration and the phase', () => {
    const s = started(6);
    rejects(s, { type: 'timer:set', actor: NARRATOR, seconds: -1 }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'timer:set', actor: NARRATOR, seconds: 3601 }, 'INVALID_PAYLOAD');
    rejects(s, { type: 'timer:set', actor: NARRATOR, seconds: 1.5 }, 'INVALID_PAYLOAD');
    rejects(lobby(6), { type: 'timer:set', actor: NARRATOR, seconds: 60 }, 'WRONG_PHASE');
  });

  it('is cleared when the phase changes', () => {
    let s = act(started(6), { type: 'timer:set', actor: NARRATOR, seconds: 60 });
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' });
    assert.equal(s.timer, null);
  });
});
