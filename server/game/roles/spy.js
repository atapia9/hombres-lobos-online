import { ROLES, TEAMS } from '../constants.js';

/**
 * Niña que espía: silently watches the wolves. When their turn ends she learns
 * who they chose and whether they agreed, but not who the wolves are (D-5).
 */
export const spy = Object.freeze({
  id: ROLES.SPY,
  label: 'Niña que espía',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [],
});

export function recordSpyReport(state, { targetId, unanimous }) {
  if (!state.players.some((p) => p.alive && p.role === ROLES.SPY)) return;
  state.spyReports.push({ round: state.round, targetId, unanimous });
}
