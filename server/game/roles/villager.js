import { ROLES, TEAMS } from '../constants.js';

/** Aldeano: no ability. Votes during the day. */
export const villager = Object.freeze({
  id: ROLES.VILLAGER,
  label: 'Aldeano',
  team: TEAMS.VILLAGE,
  unique: false,
  nightSteps: [],
});
