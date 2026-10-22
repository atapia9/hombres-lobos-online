import { NIGHT_STEPS, ROLES, TEAMS } from '../constants.js';

/**
 * Bruja (plays for the village, D-3): one healing potion and one poison, each
 * usable once per game. She sees the night's effective victim (after the
 * protector and the alpha), may use both potions the same night and may save
 * herself.
 */
export const witch = Object.freeze({
  id: ROLES.WITCH,
  label: 'Bruja',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [NIGHT_STEPS.WITCH],
});

export const healAvailable = (state) => !state.witchPotions.healUsed;
export const poisonAvailable = (state) => !state.witchPotions.poisonUsed;

/** The witch only acts when one of her potions could be used tonight. */
export function witchCanAct(state, effectiveVictimId) {
  return (healAvailable(state) && effectiveVictimId !== null) || poisonAvailable(state);
}

export function brew(state, me, { heal, poisonTargetId }, env, findPlayer, effectiveVictimId) {
  if (typeof heal !== 'boolean') return 'INVALID_PAYLOAD';
  if (poisonTargetId !== null && typeof poisonTargetId !== 'string') return 'INVALID_PAYLOAD';
  if (heal && (!healAvailable(state) || effectiveVictimId === null)) return 'POTION_UNAVAILABLE';
  if (poisonTargetId !== null) {
    if (!poisonAvailable(state)) return 'POTION_UNAVAILABLE';
    const target = findPlayer(state, poisonTargetId);
    if (!target || !target.alive || target.id === me.id) return 'TARGET_INVALID';
  }
  state.night.witch = { heal, poisonTargetId };
  env.emit('witch_acted', { playerId: me.id, heal, poisonTargetId, victimId: effectiveVictimId });
  return undefined;
}

/** Potions are spent when the night is resolved. */
export function spendPotions(state) {
  const choice = state.night.witch;
  if (!choice) return;
  if (choice.heal) state.witchPotions.healUsed = true;
  if (choice.poisonTargetId) state.witchPotions.poisonUsed = true;
}
