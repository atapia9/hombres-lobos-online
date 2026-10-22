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
 * RNG that makes the shuffle keep the join order, so roles are predictable:
 * p1..pK are the mafia; in classic mode the next one is the seer and the one
 * after that the doctor.
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

export function lobby(n, { mode } = {}) {
  let s = createGame({ mode });
  for (let i = 1; i <= n; i += 1) {
    s = act(s, { type: 'player:join', actor: as(`p${i}`), name: `Jugador ${i}` });
  }
  return s;
}

export function started(n = 6, { mode, mafiaCount, rng } = {}) {
  let s = lobby(n, { mode });
  if (mafiaCount !== undefined) s = act(s, { type: 'game:configure', actor: NARRATOR, mafiaCount });
  return act(s, { type: 'game:start', actor: NARRATOR }, rng ? { rng } : {});
}

export function daytime(n = 6, options = {}) {
  return act(started(n, options), { type: 'phase:advance', actor: NARRATOR, to: 'day' });
}

export const alive = (s) => s.players.filter((p) => p.alive).map((p) => p.id);
export const byRole = (s, role) => s.players.filter((p) => p.role === role).map((p) => p.id);
export const playerById = (s, id) => s.players.find((p) => p.id === id);

/** Accuse → open vote → `guiltyVoters` vote guilty (default: everyone) → close → confirm. */
export function voteOut(s, accuserId, targetId, { guiltyVoters } = {}) {
  s = act(s, { type: 'day:accuse', actor: as(accuserId), targetId });
  const accusation = s.day.accusations.find((a) => a.accuserId === accuserId && a.targetId === targetId);
  s = act(s, { type: 'day:openVote', actor: NARRATOR, accusationId: accusation.id });
  const voters = guiltyVoters ?? alive(s).filter((id) => id !== targetId);
  for (const id of voters) s = act(s, { type: 'day:vote', actor: as(id), guilty: true });
  s = act(s, { type: 'day:closeVote', actor: NARRATOR });
  return act(s, { type: 'day:confirm', actor: NARRATOR, accept: true });
}

/** Original mode: everyone alive asks for the night first. */
export function goToNight(s) {
  if (s.mode === 'original') {
    for (const id of alive(s)) s = act(s, { type: 'night:request', actor: as(id), wanted: true });
  }
  return act(s, { type: 'phase:advance', actor: NARRATOR, to: 'night' });
}

export function honestBallots(s) {
  for (const p of s.players) {
    if (p.alive && p.role === 'honest') s = act(s, { type: 'night:submit', actor: as(p.id), targetId: null });
  }
  return s;
}

export function mafiaPick(s, targetId) {
  for (const p of s.players) {
    if (p.alive && p.role === 'mafia') s = act(s, { type: 'night:submit', actor: as(p.id), targetId });
  }
  return s;
}

export const endNight = (s) => act(s, { type: 'phase:advance', actor: NARRATOR, to: 'day' });
