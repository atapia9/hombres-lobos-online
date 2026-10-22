// Test helpers shared by the game-rule tests.

import assert from 'node:assert/strict';
import { applyAction, createGame } from '../server/game/index.js';

/** Deterministic RNG (mulberry32) with the same contract as cryptoRng. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * max);
  };
}

export const NARRATOR = Object.freeze({ kind: 'narrator' });
export const as = (id) => ({ kind: 'player', id });

/**
 * RNG that makes the shuffle keep the join order, so roles are predictable.
 * The deck order is: wolves, alpha, seer, protector, hunter, mayor, spy,
 * witch, villagers. With the default config and 6 players:
 * p1 p2 wolves, p3 seer, p4 protector, p5 p6 villagers.
 */
export const identityRng = (max) => max - 1;

const defaultCtx = { rng: identityRng, now: 1_000 };

/** Applies an action that must succeed and returns the new state. */
export function act(state, action, ctx = {}) {
  const result = applyAction(state, action, { ...defaultCtx, ...ctx });
  if (!result.ok) {
    throw new assert.AssertionError({ message: `${action.type} failed with ${result.error}` });
  }
  return result.state;
}

/** Applies an action that must fail with `code`. Returns the result. */
export function rejects(state, action, code, ctx = {}) {
  const result = applyAction(state, action, { ...defaultCtx, ...ctx });
  assert.equal(result.ok, false, `${action.type} should have failed with ${code}`);
  assert.equal(result.error, code);
  return result;
}

export function lobby(n) {
  let s = createGame();
  for (let i = 1; i <= n; i += 1) {
    s = act(s, { type: 'player:join', actor: as(`p${i}`), name: `Jugador ${i}` });
  }
  return s;
}

/** `roles` switches optional roles, e.g. { witch: true, protector: false }. */
export function started(n = 6, { roles, wolfCount, rng, ...rules } = {}) {
  let s = lobby(n);
  const config = { ...rules };
  if (roles) config.roles = roles;
  if (wolfCount !== undefined) config.wolfCount = wolfCount;
  if (Object.keys(config).length > 0) s = act(s, { type: 'game:configure', actor: NARRATOR, ...config });
  return act(s, { type: 'game:start', actor: NARRATOR }, rng ? { rng } : {});
}

export const alive = (s) => s.players.filter((p) => p.alive).map((p) => p.id);
export const byRole = (s, role) => s.players.filter((p) => p.role === role).map((p) => p.id);
export const playerById = (s, id) => s.players.find((p) => p.id === id);
export const wolvesAlive = (s) => s.players.filter((p) => p.alive && (p.role === 'wolf' || p.role === 'alpha')).map((p) => p.id);

export const advance = (s, to) => act(s, { type: 'phase:advance', actor: NARRATOR, to });
export const nightAct = (s, id, payload) => act(s, { type: 'night:act', actor: as(id), ...payload });

/** Start → night 1. */
export const firstNight = (s) => advance(s, 'night');

/** Every living wolf picks `targetId`. */
export function wolvesPick(s, targetId) {
  for (const id of wolvesAlive(s)) {
    if (s.night.step !== 'wolves') break;
    s = nightAct(s, id, { targetId });
  }
  return s;
}

/**
 * Plays one night. `plan` = { seer, protector, wolves, convert, witch: { heal, poisonTargetId } }.
 * Steps whose actor is missing are skipped by the engine anyway.
 */
export function playNight(s, plan = {}) {
  const actorOf = (step) => s.players.find((p) => p.alive && p.role === step)?.id;
  if (s.night.step === 'seer') s = nightAct(s, actorOf('seer'), { targetId: plan.seer });
  if (s.night.step === 'protector') s = nightAct(s, actorOf('protector'), { targetId: plan.protector });
  if (s.night.step === 'wolves') {
    if (plan.wolves === null) s = act(s, { type: 'night:skipStep', actor: NARRATOR, step: 'wolves' });
    else s = wolvesPick(s, plan.wolves);
  }
  if (s.night.step === 'alpha') s = nightAct(s, actorOf('alpha'), { convert: Boolean(plan.convert) });
  if (s.night.step === 'witch') {
    s = nightAct(s, actorOf('witch'), { heal: false, poisonTargetId: null, ...plan.witch });
  }
  assert.equal(s.night.step, 'done', `night stuck at step ${s.night.step}`);
  return advance(s, 'dawn');
}

/** Accusations for every target → open vote → ballots → close → confirm. */
export function dayVote(s, ballots, { accuser } = {}) {
  const targets = [...new Set(Object.values(ballots).filter(Boolean))];
  for (const targetId of targets) {
    const by = accuser ?? alive(s).find((id) => id !== targetId && !s.day.accusations.some((a) => a.accuserId === id));
    s = act(s, { type: 'day:accuse', actor: as(by), targetId });
  }
  s = act(s, { type: 'day:openVote', actor: NARRATOR });
  for (const [voterId, targetId] of Object.entries(ballots)) {
    s = act(s, { type: 'day:vote', actor: as(voterId), targetId });
  }
  s = act(s, { type: 'day:closeVote', actor: NARRATOR });
  return act(s, { type: 'day:confirm', actor: NARRATOR, accept: true });
}

/** Everyone alive (except the target) votes for `targetId`. */
export function voteOut(s, targetId) {
  const ballots = Object.fromEntries(alive(s).filter((id) => id !== targetId).map((id) => [id, targetId]));
  return dayVote(s, ballots);
}
