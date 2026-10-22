import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { narratorView, playerView, publicView } from '../../server/game/index.js';
import {
  NARRATOR,
  act,
  as,
  daytime,
  endNight,
  goToNight,
  honestBallots,
  lobby,
  mafiaPick,
  started,
  voteOut,
} from '../helpers.js';

// Keys that carry hidden information. Before the game ends they may only
// appear inside `me` (the player's own secrets) — never in the public part.
const SECRET_KEYS = new Set([
  'role', 'team', 'partnerIds', 'partnerPicks', 'seerResults', 'doctorLastTargetId',
  'abilityTargetId', 'ballotTargetId', 'ballots', 'abilities', 'saved', 'intendedVictimId',
  'log', 'derived', 'initial', 'config',
]);

function secretPaths(value, path = '') {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    return [...(SECRET_KEYS.has(key) ? [here] : []), ...secretPaths(child, here)];
  });
}

/** Asserts that no view leaks hidden information, for the room and every player. */
function assertNoLeaks(state, label) {
  const ended = state.phase === 'ended';
  const allowedPublic = (path) => ended && /^players\.\d+\.role$/.test(path);

  const leaks = secretPaths(publicView(state)).filter((path) => !allowedPublic(path));
  assert.deepEqual(leaks, [], `${label}: public view leaks ${leaks.join(', ')}`);

  for (const p of state.players) {
    const view = playerView(state, p.id);
    const outside = secretPaths(view).filter((path) => !path.startsWith('me.') && !allowedPublic(path));
    assert.deepEqual(outside, [], `${label}: view of ${p.id} leaks ${outside.join(', ')}`);

    if (p.role !== 'mafia') {
      assert.equal(view.me.partnerIds, undefined, `${label}: ${p.id} must not know the mafia`);
      assert.equal(view.me.partnerPicks, undefined);
    }
    if (p.role !== 'seer') assert.equal(view.me.seerResults, undefined);
    if (p.role !== 'doctor') assert.equal(view.me.doctorLastTargetId, undefined);
  }
}

/** Plays a whole game step by step, checking every intermediate state. */
function playAndCheck(steps, initial) {
  let s = initial;
  assertNoLeaks(s, 'start');
  for (const [label, step] of steps) {
    s = step(s);
    assertNoLeaks(s, label);
  }
  return s;
}

describe('views never leak hidden information (ADR-003)', () => {
  it('holds during a full original game', () => {
    const s = playAndCheck([
      ['start', (x) => act(x, { type: 'game:start', actor: NARRATOR })],
      ['day 1', (x) => act(x, { type: 'phase:advance', actor: NARRATOR, to: 'day' })],
      ['accuse', (x) => act(x, { type: 'day:accuse', actor: as('p1'), targetId: 'p3' })],
      ['open vote', (x) => act(x, { type: 'day:openVote', actor: NARRATOR, accusationId: x.day.accusations[0].id })],
      ['ballots', (x) => act(act(x, { type: 'day:vote', actor: as('p1'), guilty: true }), { type: 'day:vote', actor: as('p2'), guilty: true })],
      ['close vote', (x) => act(x, { type: 'day:closeVote', actor: NARRATOR })],
      ['confirm', (x) => act(x, { type: 'day:confirm', actor: NARRATOR, accept: true })],
      ['vote out p4', (x) => voteOut(x, 'p1', 'p4')],
      ['night', (x) => goToNight(x)],
      ['mafia pick', (x) => mafiaPick(x, 'p5')],
      ['honest ballots', (x) => honestBallots(x)],
      ['dawn of day 2', (x) => endNight(x)],
      ['vote out p1', (x) => voteOut(x, 'p3', 'p1')],
      ['vote out p2', (x) => voteOut(x, 'p3', 'p2')],
    ], lobby(7));
    assert.equal(s.winner, 'honest');
  });

  it('holds during a classic game with seer and doctor', () => {
    const s = playAndCheck([
      ['day 1', (x) => act(x, { type: 'phase:advance', actor: NARRATOR, to: 'day' })],
      ['night 1', (x) => goToNight(x)],
      ['mafia pick', (x) => mafiaPick(x, 'p5')],
      ['seer', (x) => act(x, { type: 'night:ability', actor: as('p3'), targetId: 'p1' })],
      ['doctor', (x) => act(x, { type: 'night:ability', actor: as('p4'), targetId: 'p5' })],
      ['honest ballots', (x) => honestBallots(x)],
      ['day 2', (x) => endNight(x)],
      ['vote out p1', (x) => voteOut(x, 'p3', 'p1')],
      ['vote out p2', (x) => voteOut(x, 'p3', 'p2')],
    ], started(6, { mode: 'classic' }));
    assert.equal(s.winner, 'honest');
  });
});

describe('publicView', () => {
  it('shows the room without roles before the game ends', () => {
    const view = publicView(started(6));
    assert.equal(view.phase, 'dawn');
    assert.equal(view.mafiaCount, 2);
    assert.ok(view.players.every((p) => !Object.hasOwn(p, 'role')));
  });

  it('shows the mafia count from the table in the lobby', () => {
    assert.equal(publicView(lobby(8)).mafiaCount, 3);
  });

  it('reveals every role once the game has ended', () => {
    const s = act(daytime(6), { type: 'game:end', actor: NARRATOR });
    const roles = publicView(s).players.map((p) => p.role);
    assert.deepEqual(roles, ['mafia', 'mafia', 'honest', 'honest', 'honest', 'honest']);
  });

  it('shows only vote progress while open, and who voted guilty once closed (R10)', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    s = act(s, { type: 'day:vote', actor: as('p2'), guilty: false });
    s = act(s, { type: 'day:vote', actor: as('p3'), guilty: true });
    const open = publicView(s).vote;
    assert.deepEqual(open, {
      id: open.id, accusedId: 'p1', accuserId: 'p3', status: 'open', votedCount: 2, eligibleCount: 5, required: 3,
    });
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    assert.deepEqual(publicView(s).vote.result, {
      guiltyCount: 1, notGuiltyCount: 1, abstainedCount: 3, passed: false, guiltyVoterIds: ['p3'],
    });
  });

  it('announces the number of mafia ballots in the original mode (R5)', () => {
    const s = endNight(honestBallots(mafiaPick(goToNight(daytime(6)), 'p3')));
    assert.deepEqual(publicView(s).lastNight, { round: 1, victimId: 'p3', mafiaBallots: 2 });
  });

  it('announces neither the ballot count nor the doctor\'s save in the classic variant (V6)', () => {
    let s = mafiaPick(goToNight(daytime(6, { mode: 'classic' })), 'p5');
    s = endNight(act(s, { type: 'night:ability', actor: as('p4'), targetId: 'p5' }));
    assert.deepEqual(publicView(s).lastNight, { round: 1, victimId: null });
    assert.deepEqual(publicView(s).history, [{ round: 1, phase: 'night', type: 'night', victimId: null }]);
  });

  it('shows night progress as counts only', () => {
    const s = honestBallots(goToNight(daytime(6)));
    assert.deepEqual(publicView(s).night, { submitted: 4, expected: 6 });
  });

  it('shows the night requests during the day in the original mode', () => {
    const s = act(daytime(6), { type: 'night:request', actor: as('p2'), wanted: true });
    assert.deepEqual(publicView(s).nightRequests, { playerIds: ['p2'], count: 1, needed: 4 });
    assert.equal(publicView(daytime(6, { mode: 'classic' })).nightRequests, null);
  });

  it('hides the scores when the narrator turns them off', () => {
    let s = act(daytime(6), { type: 'game:configure', actor: NARRATOR, showScore: false });
    s = act(s, { type: 'game:end', actor: NARRATOR });
    assert.equal(publicView(s).scores, null);
    assert.equal(publicView(s).scoreboard, null);
  });
});

describe('playerView', () => {
  it('shows each player their own role', () => {
    const s = started(6);
    assert.equal(playerView(s, 'p1').me.role, 'mafia');
    assert.equal(playerView(s, 'p1').me.team, 'mafia');
    assert.equal(playerView(s, 'p4').me.role, 'honest');
  });

  it('lets mafiosi recognise each other from dawn on', () => {
    const s = started(7);
    assert.deepEqual(playerView(s, 'p1').me.partnerIds, ['p2']);
    assert.deepEqual(playerView(s, 'p2').me.partnerIds, ['p1']);
    assert.equal(playerView(s, 'p3').me.partnerIds, undefined);
  });

  it('shows the player their own vote and night request', () => {
    let s = act(daytime(6), { type: 'night:request', actor: as('p4'), wanted: true });
    s = act(s, { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    s = act(s, { type: 'day:vote', actor: as('p4'), guilty: true });
    assert.equal(playerView(s, 'p4').me.vote, true);
    assert.equal(playerView(s, 'p4').me.nightRequested, true);
    assert.equal(playerView(s, 'p5').me.vote, null);
  });

  it('shows the player their own night ballot', () => {
    let s = goToNight(daytime(6));
    s = act(s, { type: 'night:submit', actor: as('p1'), targetId: 'p4' });
    assert.equal(playerView(s, 'p1').me.ballotSubmitted, true);
    assert.equal(playerView(s, 'p1').me.ballotTargetId, 'p4');
    assert.equal(playerView(s, 'p2').me.ballotSubmitted, false);
  });

  it('hides partners\' night picks in the original mode but shows them in the classic variant (V2)', () => {
    let original = goToNight(daytime(6));
    original = act(original, { type: 'night:submit', actor: as('p2'), targetId: 'p5' });
    assert.equal(playerView(original, 'p1').me.partnerPicks, undefined);

    let classic = goToNight(daytime(6, { mode: 'classic' }));
    classic = act(classic, { type: 'night:submit', actor: as('p2'), targetId: 'p5' });
    assert.deepEqual(playerView(classic, 'p1').me.partnerPicks, { p2: 'p5' });
  });

  it('gives the seer their results and the doctor their last protection', () => {
    let s = goToNight(daytime(6, { mode: 'classic' }));
    s = act(s, { type: 'night:ability', actor: as('p3'), targetId: 'p2' });
    s = act(s, { type: 'night:ability', actor: as('p4'), targetId: 'p6' });
    assert.deepEqual(playerView(s, 'p3').me.seerResults, [{ round: 1, targetId: 'p2', team: 'mafia' }]);
    assert.equal(playerView(s, 'p4').me.abilityTargetId, 'p6');
    s = endNight(s);
    assert.equal(playerView(s, 'p4').me.doctorLastTargetId, 'p6');
  });

  it('returns null for unknown players', () => {
    assert.equal(playerView(started(6), 'ghost'), null);
  });
});

describe('narratorView', () => {
  it('includes every role, the log and helper values for the controls', () => {
    const s = started(8);
    const view = narratorView(s);
    assert.equal(view.players.filter((p) => p.role === 'mafia').length, 3);
    assert.ok(view.log.length > 0);
    assert.equal(view.derived.recommendedMafiaCount, 3);
    assert.equal(view.derived.maxMafiaCount, 3);
  });

  it('explains why the game cannot start yet', () => {
    assert.equal(narratorView(lobby(4)).derived.setupError, 'NOT_ENOUGH_PLAYERS');
    assert.equal(narratorView(lobby(6)).derived.setupError, null);
  });

  it('shows ballots live and previews the night outcome', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p3'), targetId: 'p1' });
    s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    s = act(s, { type: 'day:vote', actor: as('p2'), guilty: false });
    assert.deepEqual(narratorView(s).day.vote.ballots, { p2: false });
    assert.equal(narratorView(s).derived.liveVote.notGuiltyCount, 1);

    const night = mafiaPick(goToNight(daytime(6)), 'p4');
    assert.equal(narratorView(night).derived.nightPreview.victimId, 'p4');
  });

  it('does not share references with the state', () => {
    const s = started(6);
    const view = narratorView(s);
    view.players[0].role = 'honest';
    assert.equal(s.players[0].role, 'mafia');
  });
});
