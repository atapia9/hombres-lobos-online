// Night in a fixed order: seer → protector → wolves (→ alpha) → witch (docs/reglas.md, D-13).
// Each step ends when its living actors have acted. A step without actors is skipped
// on the server; players never see which step is running, so nothing leaks.

import { CAUSES, NIGHT_ORDER, NIGHT_STEPS, ROLES, isWolf } from './constants.js';
import { alphaCanAct } from './roles/alpha.js';
import { recordSpyReport } from './roles/spy.js';
import { witchCanAct } from './roles/witch.js';
import { resolveWolfVote } from './roles/wolf.js';

export function emptyNight() {
  return {
    step: NIGHT_STEPS.SEER,
    seerTargetId: null,
    protectorTargetId: null,
    wolfBallots: {},
    wolfTargetId: null,
    wolvesUnanimous: false,
    alphaChoice: null, // 'convert' | 'kill'
    witch: null, // { heal, poisonTargetId }
    skipped: [], // steps the narrator skipped
  };
}

const livingWith = (state, role) => state.players.find((p) => p.alive && p.role === role) ?? null;

/** Who would act in `step` right now. Empty when the step must be skipped. */
export function stepActorIds(state, step) {
  const ids = (list) => list.map((p) => p.id);
  switch (step) {
    case NIGHT_STEPS.SEER:
      return ids([livingWith(state, ROLES.SEER)].filter(Boolean));
    case NIGHT_STEPS.PROTECTOR:
      return ids([livingWith(state, ROLES.PROTECTOR)].filter(Boolean));
    case NIGHT_STEPS.WOLVES:
      return ids(state.players.filter((p) => p.alive && isWolf(p)));
    case NIGHT_STEPS.ALPHA: {
      const alpha = livingWith(state, ROLES.ALPHA);
      return alpha && alphaCanAct(state) ? [alpha.id] : [];
    }
    case NIGHT_STEPS.WITCH: {
      const witch = livingWith(state, ROLES.WITCH);
      return witch && witchCanAct(state, effectiveVictimId(state)) ? [witch.id] : [];
    }
    default:
      return [];
  }
}

function stepComplete(state, step) {
  const { night } = state;
  if (night.skipped.includes(step)) return true;
  switch (step) {
    case NIGHT_STEPS.SEER: return night.seerTargetId !== null;
    case NIGHT_STEPS.PROTECTOR: return night.protectorTargetId !== null;
    case NIGHT_STEPS.WOLVES: return resolveWolfVote(state).unanimous;
    case NIGHT_STEPS.ALPHA: return night.alphaChoice !== null;
    case NIGHT_STEPS.WITCH: return night.witch !== null;
    default: return true;
  }
}

/** True when every living wolf voted but they disagree (D-1): the narrator decides. */
export function wolvesDisagree(state) {
  if (state.night.step !== NIGHT_STEPS.WOLVES) return false;
  const { allVoted, unanimous } = resolveWolfVote(state);
  return allVoted && !unanimous;
}

function finishStep(state, step) {
  if (step !== NIGHT_STEPS.WOLVES) return;
  const skipped = state.night.skipped.includes(step);
  const { unanimous, targetId } = resolveWolfVote(state);
  state.night.wolvesUnanimous = !skipped && unanimous;
  state.night.wolfTargetId = state.night.wolvesUnanimous ? targetId : null;
  recordSpyReport(state, { targetId: state.night.wolfTargetId, unanimous: state.night.wolvesUnanimous });
}

/**
 * Moves through the night until a step needs someone to act, or the night is
 * done. Safe to call after any change (an action, a skip, a removal).
 */
export function advanceNight(state, env) {
  while (state.night.step !== NIGHT_STEPS.DONE) {
    const { step } = state.night;
    const hasActors = stepActorIds(state, step).length > 0;
    if (hasActors && !stepComplete(state, step)) return;
    finishStep(state, step);
    const next = NIGHT_ORDER[NIGHT_ORDER.indexOf(step) + 1];
    state.night.step = next;
    env.emit('night_step', { from: step, to: next, skipped: !hasActors });
  }
}

/** Victim after the protector and the alpha, before the witch. Null if none. */
export function effectiveVictimId(state) {
  const { wolfTargetId, protectorTargetId, alphaChoice } = state.night;
  if (!wolfTargetId || wolfTargetId === protectorTargetId) return null;
  if (alphaChoice === 'convert') return null;
  return wolfTargetId;
}

/**
 * Pure resolution of the night (used for the narrator's preview and at dawn).
 * Order: protection → conversion → healing → deaths (wolves, then poison).
 */
export function resolveNight(state) {
  const { wolfTargetId, protectorTargetId, alphaChoice, witch } = state.night;
  const protectedId = wolfTargetId && wolfTargetId === protectorTargetId ? wolfTargetId : null;
  const convertedId = wolfTargetId && !protectedId && alphaChoice === 'convert' ? wolfTargetId : null;
  const victimId = effectiveVictimId(state);
  const healedId = victimId && witch?.heal ? victimId : null;

  const deaths = [];
  if (victimId && !healedId) deaths.push({ playerId: victimId, cause: CAUSES.WOLVES });
  const poisonId = witch?.poisonTargetId ?? null;
  if (poisonId && !deaths.some((d) => d.playerId === poisonId)) {
    deaths.push({ playerId: poisonId, cause: CAUSES.POISON });
  }

  return {
    wolfTargetId,
    wolvesUnanimous: state.night.wolvesUnanimous,
    protectedId,
    convertedId,
    healedId,
    poisonedId: poisonId,
    seerTargetId: state.night.seerTargetId,
    protectorTargetId,
    deaths,
  };
}
