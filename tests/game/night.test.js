import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nightProgress } from '../../server/game/index.js';
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
  voteOut,
} from '../helpers.js';

// With the identity RNG, original mode with 6 players: p1, p2 mafia; p3–p6 honest.
// Classic mode with 6 players: p1, p2 mafia; p3 seer; p4 doctor; p5, p6 honest.
const nightOf = (n = 6, options) => goToNight(daytime(n, options));
const submit = (s, id, targetId) => act(s, { type: 'night:submit', actor: as(id), targetId });
const ability = (s, id, targetId) => act(s, { type: 'night:ability', actor: as(id), targetId });

describe('original night (R5)', () => {
  it('kills the victim when every living mafioso picks the same player', () => {
    let s = honestBallots(mafiaPick(nightOf(), 'p3'));
    s = endNight(s);
    const victim = playerById(s, 'p3');
    assert.equal(victim.alive, false);
    assert.equal(victim.eliminatedBy, 'night');
    assert.equal(victim.eliminatedRound, 1);
    assert.equal(s.phase, 'day');
    assert.equal(s.round, 2);
    assert.deepEqual(s.lastNight, { round: 1, victimId: 'p3', intendedVictimId: 'p3', saved: false, mafiaBallots: 2 });
  });

  it('kills nobody when the mafiosi disagree', () => {
    let s = submit(submit(nightOf(), 'p1', 'p3'), 'p2', 'p4');
    s = endNight(honestBallots(s));
    assert.equal(s.players.filter((p) => !p.alive).length, 0);
    assert.equal(s.lastNight.victimId, null);
    assert.equal(s.lastNight.mafiaBallots, 2);
  });

  it('lets a single surviving mafioso decide alone', () => {
    let s = voteOut(daytime(7), 'p3', 'p2');
    s = goToNight(s);
    s = endNight(honestBallots(submit(s, 'p1', 'p4')));
    assert.equal(playerById(s, 'p4').alive, false);
    assert.equal(s.lastNight.mafiaBallots, 1);
  });

  it('treats a missing mafia ballot as no agreement, so nobody dies', () => {
    const s = endNight(submit(nightOf(), 'p1', 'p3'));
    assert.equal(playerById(s, 'p3').alive, true);
    assert.equal(s.lastNight.mafiaBallots, 1);
  });

  it('lets the narrator close the night with ballots missing', () => {
    const s = endNight(nightOf());
    assert.equal(s.phase, 'day');
    assert.equal(s.lastNight.victimId, null);
    assert.equal(s.lastNight.mafiaBallots, 0);
  });

  it('requires mafiosi to pick a living player who is not in the mafia', () => {
    let s = nightOf(7);
    rejects(s, { type: 'night:submit', actor: as('p1'), targetId: null }, 'MAFIA_MUST_CHOOSE');
    rejects(s, { type: 'night:submit', actor: as('p1') }, 'MAFIA_MUST_CHOOSE');
    rejects(s, { type: 'night:submit', actor: as('p1'), targetId: 'p1' }, 'TARGET_INVALID');
    rejects(s, { type: 'night:submit', actor: as('p1'), targetId: 'p2' }, 'TARGET_INVALID');
    rejects(s, { type: 'night:submit', actor: as('p1'), targetId: 'nobody' }, 'TARGET_INVALID');
    s = act(s, { type: 'player:remove', actor: NARRATOR, playerId: 'p7' });
    rejects(s, { type: 'night:submit', actor: as('p1'), targetId: 'p7' }, 'TARGET_INVALID');
  });

  it('only lets honest players submit "Honesto"', () => {
    const s = nightOf();
    rejects(s, { type: 'night:submit', actor: as('p3'), targetId: 'p1' }, 'HONEST_CANNOT_CHOOSE');
    rejects(s, { type: 'night:submit', actor: as('p3') }, 'HONEST_CANNOT_CHOOSE');
    assert.equal(submit(s, 'p3', null).night.ballots.p3, null);
  });

  it('lets a mafioso change the pick until the night is closed', () => {
    let s = submit(nightOf(), 'p1', 'p3');
    s = submit(s, 'p1', 'p4');
    assert.equal(s.night.ballots.p1, 'p4');
  });

  it('tracks how many living players have submitted', () => {
    let s = nightOf();
    assert.deepEqual(nightProgress(s), { submitted: 0, expected: 6 });
    s = honestBallots(s);
    assert.deepEqual(nightProgress(s), { submitted: 4, expected: 6 });
  });

  it('does not let eliminated players act at night', () => {
    const s = goToNight(voteOut(daytime(7), 'p1', 'p3'));
    rejects(s, { type: 'night:submit', actor: as('p3'), targetId: null }, 'PLAYER_DEAD');
  });

  it('has no special abilities', () => {
    rejects(nightOf(), { type: 'night:ability', actor: as('p3'), targetId: 'p1' }, 'ABILITY_NOT_AVAILABLE');
  });

  it('ignores night actions during the day', () => {
    rejects(daytime(6), { type: 'night:submit', actor: as('p3'), targetId: null }, 'WRONG_PHASE');
  });
});

describe('classic variant night (V2–V6)', () => {
  const classicNight = () => nightOf(6, { mode: 'classic' });

  it('requires unanimity among the mafia, as in the original', () => {
    let s = submit(submit(classicNight(), 'p1', 'p5'), 'p2', 'p6');
    s = endNight(s);
    assert.equal(s.players.filter((p) => !p.alive).length, 0);
  });

  it('lets the doctor save the victim', () => {
    let s = mafiaPick(classicNight(), 'p5');
    s = ability(s, 'p4', 'p5');
    s = endNight(s);
    assert.equal(playerById(s, 'p5').alive, true);
    assert.equal(s.lastNight.victimId, null);
    assert.equal(s.lastNight.saved, true);
    assert.equal(s.lastNight.intendedVictimId, 'p5');
  });

  it('lets the doctor protect themself but not the same player two nights in a row', () => {
    let s = ability(classicNight(), 'p4', 'p4');
    s = endNight(s);
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' });
    rejects(s, { type: 'night:ability', actor: as('p4'), targetId: 'p4' }, 'DOCTOR_REPEAT');
    s = ability(s, 'p4', 'p5');
    assert.equal(s.night.abilities.p4, 'p5');
  });

  it('lets the doctor change the protection until the night is closed', () => {
    let s = ability(classicNight(), 'p4', 'p5');
    s = ability(s, 'p4', 'p6');
    assert.equal(s.night.abilities.p4, 'p6');
  });

  it('lets the seer learn one player\'s team per night', () => {
    let s = ability(classicNight(), 'p3', 'p1');
    assert.deepEqual(s.seerResults, [{ round: 1, targetId: 'p1', team: 'mafia' }]);
    rejects(s, { type: 'night:ability', actor: as('p3'), targetId: 'p5' }, 'ABILITY_USED');
    rejects(classicNight(), { type: 'night:ability', actor: as('p3'), targetId: 'p3' }, 'TARGET_INVALID');
    s = endNight(s);
    s = act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' });
    s = ability(s, 'p3', 'p4');
    assert.deepEqual(s.seerResults.at(-1), { round: 2, targetId: 'p4', team: 'honest' });
  });

  it('makes the seer and doctor act through their ability, not a ballot', () => {
    const s = classicNight();
    rejects(s, { type: 'night:submit', actor: as('p3'), targetId: null }, 'USE_ABILITY');
    rejects(s, { type: 'night:submit', actor: as('p4'), targetId: null }, 'USE_ABILITY');
    rejects(s, { type: 'night:ability', actor: as('p5'), targetId: 'p1' }, 'ABILITY_NOT_AVAILABLE');
  });

  it('counts abilities in the night progress', () => {
    let s = ability(ability(classicNight(), 'p3', 'p1'), 'p4', 'p5');
    s = honestBallots(s);
    assert.deepEqual(nightProgress(s), { submitted: 4, expected: 6 });
  });
});
