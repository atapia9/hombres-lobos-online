import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nightRequestsNeeded, requiredGuiltyVotes } from '../../server/game/index.js';
import { NARRATOR, act, as, daytime, playerById, rejects, voteOut } from '../helpers.js';

/** Opens a vote on `targetId` (accused by `accuserId`) and returns the state. */
function openVote(s, accuserId, targetId) {
  s = act(s, { type: 'day:accuse', actor: as(accuserId), targetId });
  const accusation = s.day.accusations.find((a) => a.targetId === targetId);
  return act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: accusation.id });
}

function castVotes(s, ballots) {
  for (const [id, guilty] of Object.entries(ballots)) s = act(s, { type: 'day:vote', actor: as(id), guilty });
  return s;
}

const close = (s) => act(s, { type: 'day:closeVote', actor: NARRATOR });
const confirm = (s, accept = true) => act(s, { type: 'day:confirm', actor: NARRATOR, accept });

describe('day vote threshold (R2)', () => {
  it('needs more than half of the living players, not counting the accused', () => {
    // living players → voters → guilty votes needed
    const table = [[7, 6, 4], [5, 4, 3], [4, 3, 2], [2, 1, 1]];
    for (const [living, voters, needed] of table) {
      assert.equal(requiredGuiltyVotes(voters), needed, `${living} alive`);
    }
  });

  it('eliminates the accused when the guilty votes reach the majority', () => {
    let s = openVote(daytime(7), 'p3', 'p7');
    s = castVotes(s, { p1: true, p2: true, p3: true, p4: true, p5: false });
    s = confirm(close(s));
    const accused = playerById(s, 'p7');
    assert.equal(accused.alive, false);
    assert.equal(accused.eliminatedBy, 'vote');
    assert.equal(accused.eliminatedRound, 1);
    assert.equal(s.phase, 'day');
    assert.deepEqual(s.history.at(-1), {
      round: 1, phase: 'day', type: 'vote', accusedId: 'p7', accuserId: 'p3',
      passed: true, guiltyCount: 4, eligibleCount: 6, required: 4,
    });
  });

  it('acquits with exactly half of the votes', () => {
    let s = openVote(daytime(7), 'p3', 'p7');
    s = castVotes(s, { p1: true, p2: true, p3: true, p4: false, p5: false, p6: false });
    s = confirm(close(s));
    assert.equal(playerById(s, 'p7').alive, true);
    assert.equal(s.history.at(-1).passed, false);
  });

  it('counts abstentions as not guilty', () => {
    let s = openVote(daytime(7), 'p3', 'p7');
    s = castVotes(s, { p1: true, p2: true, p3: true });
    s = close(s);
    assert.equal(s.day.vote.result.abstainedCount, 3);
    assert.equal(s.day.vote.result.passed, false);
  });
});

describe('accusations and votes (R3)', () => {
  it('lets any living player accuse another living player', () => {
    const s = act(daytime(6), { type: 'day:accuse', actor: as('p4'), targetId: 'p1' });
    assert.equal(s.day.accusations.length, 1);
    assert.equal(s.day.accusations[0].accuserId, 'p4');
    rejects(s, { type: 'day:accuse', actor: as('p4'), targetId: 'p4' }, 'TARGET_INVALID');
    rejects(s, { type: 'day:accuse', actor: as('p4'), targetId: 'nobody' }, 'TARGET_INVALID');
  });

  it('keeps one pending accusation per accuser', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p4'), targetId: 'p1' });
    s = act(s, { type: 'day:accuse', actor: as('p4'), targetId: 'p1' });
    assert.equal(s.day.accusations.length, 1);
    s = act(s, { type: 'day:accuse', actor: as('p4'), targetId: 'p2' });
    assert.deepEqual(s.day.accusations.map((a) => a.targetId), ['p2']);
  });

  it('lets the narrator dismiss an accusation', () => {
    let s = act(daytime(6), { type: 'day:accuse', actor: as('p4'), targetId: 'p1' });
    s = act(s, { type: 'day:dismissAccusation', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    assert.equal(s.day.accusations.length, 0);
  });

  it('runs only one vote at a time and only during the day', () => {
    let s = openVote(daytime(6), 'p3', 'p1');
    s = act(s, { type: 'day:accuse', actor: as('p4'), targetId: 'p2' });
    rejects(s, { type: 'day:openVote', actor: NARRATOR, accusationId: s.day.accusations[0].id }, 'VOTE_IN_PROGRESS');
    rejects(s, { type: 'day:openVote', actor: NARRATOR, accusationId: 'a999' }, 'VOTE_IN_PROGRESS');
    rejects(act(daytime(6), { type: 'game:end', actor: NARRATOR }), { type: 'day:vote', actor: as('p1'), guilty: true }, 'WRONG_PHASE');
  });

  it('does not let the accused vote', () => {
    const s = openVote(daytime(6), 'p3', 'p1');
    rejects(s, { type: 'day:vote', actor: as('p1'), guilty: false }, 'CANNOT_VOTE');
  });

  it('lets voters change or withdraw their ballot while the vote is open', () => {
    let s = openVote(daytime(6), 'p3', 'p1');
    s = castVotes(s, { p2: true });
    s = castVotes(s, { p2: false });
    assert.deepEqual(s.day.vote.ballots, { p2: false });
    s = act(s, { type: 'day:vote', actor: as('p2'), guilty: null });
    assert.deepEqual(s.day.vote.ballots, {});
    rejects(s, { type: 'day:vote', actor: as('p2'), guilty: 'yes' }, 'INVALID_PAYLOAD');
  });

  it('closes the ballot box when the narrator closes the vote', () => {
    const s = close(openVote(daytime(6), 'p3', 'p1'));
    rejects(s, { type: 'day:vote', actor: as('p2'), guilty: true }, 'VOTE_CLOSED');
    rejects(s, { type: 'day:closeVote', actor: NARRATOR }, 'VOTE_CLOSED');
  });

  it('requires closing before confirming', () => {
    const s = openVote(daytime(6), 'p3', 'p1');
    rejects(s, { type: 'day:confirm', actor: NARRATOR, accept: true }, 'VOTE_NOT_CLOSED');
    rejects(daytime(6), { type: 'day:confirm', actor: NARRATOR, accept: true }, 'NO_ACTIVE_VOTE');
    rejects(close(s), { type: 'day:confirm', actor: NARRATOR }, 'INVALID_PAYLOAD');
  });

  it('lets the narrator annul a closed vote without effect', () => {
    let s = openVote(daytime(6), 'p3', 'p1');
    s = castVotes(s, { p2: true, p3: true, p4: true, p5: true });
    s = confirm(close(s), false);
    assert.equal(playerById(s, 'p1').alive, true);
    assert.equal(s.day.vote, null);
    assert.equal(s.history.length, 0);
    assert.equal(s.log.at(-1).type, 'vote_cancelled');
  });

  it('allows several eliminations in the same day', () => {
    let s = daytime(8);
    s = voteOut(s, 'p1', 'p5');
    s = voteOut(s, 'p1', 'p6');
    assert.equal(s.phase, 'day');
    assert.equal(s.round, 1);
    assert.equal(playerById(s, 'p5').alive, false);
    assert.equal(playerById(s, 'p6').alive, false);
  });

  it('leaves eliminated players out of accusations, votes and night requests (R6)', () => {
    let s = voteOut(daytime(7), 'p1', 'p7');
    rejects(s, { type: 'day:accuse', actor: as('p7'), targetId: 'p1' }, 'PLAYER_DEAD');
    rejects(s, { type: 'day:accuse', actor: as('p1'), targetId: 'p7' }, 'TARGET_INVALID');
    rejects(s, { type: 'night:request', actor: as('p7'), wanted: true }, 'PLAYER_DEAD');
    s = openVote(s, 'p3', 'p1');
    rejects(s, { type: 'day:vote', actor: as('p7'), guilty: true }, 'PLAYER_DEAD');
    assert.equal(close(s).day.vote.result.eligibleCount, 5);
  });
});

describe('calling the night (R4)', () => {
  it('needs more than half of the living players', () => {
    assert.equal(nightRequestsNeeded(6), 4);
    assert.equal(nightRequestsNeeded(7), 4);
    assert.equal(nightRequestsNeeded(5), 3);
    assert.equal(nightRequestsNeeded(2), 2);
  });

  it('does not let the narrator force the night without a majority (original mode)', () => {
    let s = daytime(6);
    for (const id of ['p1', 'p2', 'p3']) s = act(s, { type: 'night:request', actor: as(id), wanted: true });
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'NIGHT_NOT_REQUESTED');
    s = act(s, { type: 'night:request', actor: as('p4'), wanted: true });
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' });
    assert.equal(s.phase, 'night');
    assert.equal(s.round, 1);
  });

  it('lets players withdraw their request', () => {
    let s = daytime(6);
    s = act(s, { type: 'night:request', actor: as('p1'), wanted: true });
    s = act(s, { type: 'night:request', actor: as('p1'), wanted: true });
    assert.deepEqual(s.day.nightRequests, ['p1']);
    s = act(s, { type: 'night:request', actor: as('p1'), wanted: false });
    assert.deepEqual(s.day.nightRequests, []);
    rejects(s, { type: 'night:request', actor: as('p1'), wanted: 'yes' }, 'INVALID_PAYLOAD');
  });

  it('only counts requests from living players', () => {
    let s = daytime(7);
    s = act(s, { type: 'night:request', actor: as('p7'), wanted: true });
    s = voteOut(s, 'p1', 'p7');
    for (const id of ['p1', 'p2', 'p3']) s = act(s, { type: 'night:request', actor: as(id), wanted: true });
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'NIGHT_NOT_REQUESTED');
  });

  it('cannot start while a vote is open', () => {
    let s = openVote(daytime(6), 'p3', 'p1');
    for (const id of ['p2', 'p3', 'p4', 'p5', 'p6']) s = act(s, { type: 'night:request', actor: as(id), wanted: true });
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'VOTE_IN_PROGRESS');
  });

  it('happens every round in the classic variant, without requests (V1)', () => {
    const s = daytime(6, { mode: 'classic' });
    rejects(s, { type: 'night:request', actor: as('p1'), wanted: true }, 'NOT_IN_MODE');
    assert.equal(act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }).phase, 'night');
  });
});
