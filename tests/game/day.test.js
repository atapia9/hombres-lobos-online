import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { candidatesFrom, playerView, publicView, tallyVote } from '../../server/game/index.js';
import {
  NARRATOR, act, advance, alive, as, dayVote, firstNight, playNight, rejects, started,
} from '../helpers.js';

// 8 players: p1 p2 wolves, p3 seer, p4 protector, p5..p8 villagers.
const day1 = (rules) => advance(playNight(firstNight(started(8, rules)), { seer: 'p1', protector: 'p8', wolves: 'p8' }), 'day');
const accuse = (s, by, targetId) => act(s, { type: 'day:accuse', actor: as(by), targetId });
const vote = (s, by, targetId) => act(s, { type: 'day:vote', actor: as(by), targetId });

describe('day: accusations', () => {
  it('each player keeps one pending accusation', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = accuse(s, 'p3', 'p2');
    assert.deepEqual(s.day.accusations.map((a) => a.targetId), ['p2']);
    assert.equal(playerView(s, 'p3').me.accusedId, 'p2');
  });

  it('nobody accuses themselves or the dead', () => {
    const s = day1();
    rejects(s, { type: 'day:accuse', actor: as('p3'), targetId: 'p3' }, 'TARGET_INVALID');
    rejects(s, { type: 'day:accuse', actor: as('p3'), targetId: 'ghost' }, 'TARGET_INVALID');
  });

  it('the narrator can dismiss an accusation', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = act(s, { type: 'day:dismissAccusation', actor: NARRATOR, accusationId: s.day.accusations[0].id });
    assert.deepEqual(s.day.accusations, []);
  });

  it('the vote needs at least one accusation', () => {
    rejects(day1(), { type: 'day:openVote', actor: NARRATOR }, 'NO_ACCUSATIONS');
  });

  it('candidates are the distinct living accused', () => {
    const players = [{ id: 'a', alive: true }, { id: 'b', alive: false }];
    assert.deepEqual(candidatesFrom([{ targetId: 'a' }, { targetId: 'a' }, { targetId: 'b' }], players), ['a']);
  });
});

describe('day: vote (D-6, option A)', () => {
  it('the accused with most guilty votes is eliminated', () => {
    const s = dayVote(day1(), { p3: 'p1', p4: 'p1', p5: 'p2', p6: 'p1', p7: 'p2' });
    assert.equal(s.players.find((p) => p.id === 'p1').eliminatedBy, 'vote');
    assert.equal(s.history.at(-1).eliminatedId, 'p1');
  });

  it('a tie eliminates nobody', () => {
    const s = dayVote(day1(), { p3: 'p1', p4: 'p2' });
    assert.equal(s.history.at(-1).eliminatedId, null);
    assert.equal(alive(s).length, 8);
  });

  it('nobody votes for themselves; only candidates can be voted', () => {
    let s = accuse(accuse(day1(), 'p3', 'p1'), 'p1', 'p2');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    rejects(s, { type: 'day:vote', actor: as('p1'), targetId: 'p1' }, 'CANNOT_VOTE_SELF');
    rejects(s, { type: 'day:vote', actor: as('p3'), targetId: 'p5' }, 'TARGET_INVALID');
    s = vote(s, 'p1', 'p2');
    assert.deepEqual(s.day.vote.ballots, { p1: 'p2' });
  });

  it('abstaining (null) counts nobody, and a ballot can be withdrawn', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = vote(s, 'p4', null);
    assert.equal(tallyVote(s.day.vote, s.players).votedCount, 1);
    s = act(s, { type: 'day:vote', actor: as('p4'), withdraw: true });
    assert.equal(tallyVote(s.day.vote, s.players).votedCount, 0);
  });

  it('progress is public while open; voters are shown once closed', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = vote(s, 'p4', 'p1');
    const open = publicView(s).vote;
    assert.equal(open.votedCount, 1);
    assert.equal(open.result, undefined);
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    assert.deepEqual(publicView(s).vote.result.votersByCandidate, { p1: ['p4'] });
  });

  it('the narrator can hide who voted whom', () => {
    let s = accuse(day1({ showVotes: false }), 'p3', 'p1');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = vote(s, 'p4', 'p1');
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    assert.equal(publicView(s).vote.result.votersByCandidate, null);
  });

  it('the narrator confirms; annulling allows a new vote, confirming closes the day\'s vote', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = vote(s, 'p4', 'p1');
    s = act(s, { type: 'day:closeVote', actor: NARRATOR });
    s = act(s, { type: 'day:confirm', actor: NARRATOR, accept: false });
    assert.equal(alive(s).length, 8);
    s = dayVote(s, { p4: 'p1', p5: 'p1' });
    assert.equal(alive(s).length, 7);
    rejects(s, { type: 'day:accuse', actor: as('p4'), targetId: 'p2' }, 'VOTE_CLOSED');
    rejects(s, { type: 'day:openVote', actor: NARRATOR }, 'VOTE_ALREADY_HELD');
  });

  it('the night cannot start during an open vote', () => {
    let s = accuse(day1(), 'p3', 'p1');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    rejects(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' }, 'VOTE_IN_PROGRESS');
  });

  it('a candidate removed during the vote drops out of it', () => {
    let s = accuse(accuse(day1(), 'p3', 'p1'), 'p4', 'p2');
    s = act(s, { type: 'day:openVote', actor: NARRATOR });
    s = vote(s, 'p5', 'p2');
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p2' });
    assert.deepEqual(s.day.vote.candidateIds, ['p1']);
    assert.deepEqual(s.day.vote.ballots, {});
  });
});
