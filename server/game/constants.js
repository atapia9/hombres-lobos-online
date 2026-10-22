// Shared constants for the pure game rules (no I/O).

export const MODES = Object.freeze({
  ORIGINAL: 'original', // Davidoff's original rules: two teams, no special roles
  CLASSIC: 'classic', // later variant inspired by Werewolf: adds seer and doctor
});

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  DAWN: 'dawn', // roles are shown privately and the mafia recognise each other
  DAY: 'day',
  NIGHT: 'night',
  ENDED: 'ended',
});

export const ROLES = Object.freeze({
  MAFIA: 'mafia',
  HONEST: 'honest',
  SEER: 'seer', // classic variant only
  DOCTOR: 'doctor', // classic variant only
});

export const TEAMS = Object.freeze({
  MAFIA: 'mafia',
  HONEST: 'honest',
});

export const WINNERS = Object.freeze({
  HONEST: 'honest',
  MAFIA: 'mafia',
  NONE: 'none', // the narrator ended the game without a winner
});

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 20;
export const MAX_TIMER_SECONDS = 60 * 60;

export function isMode(value) {
  return Object.values(MODES).includes(value);
}

/**
 * Reads an own property only. Maps keyed by player id (ballots, scores…) must
 * never return inherited values such as Object.prototype.constructor.
 */
export function own(map, key) {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** Seer and doctor play for the honest team. */
export function teamOf(role) {
  return role === ROLES.MAFIA ? TEAMS.MAFIA : TEAMS.HONEST;
}
