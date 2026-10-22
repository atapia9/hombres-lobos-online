// Shared constants for the pure game rules (no I/O). See docs/reglas.md.

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  START: 'start', // roles are shown privately and the wolves recognise each other
  NIGHT: 'night',
  DAWN: 'dawn', // deaths of the night are announced; a dead hunter may shoot
  DAY: 'day',
  ENDED: 'ended',
});

// Fixed night order (docs/reglas.md). "alpha" is a sub-step of the wolves' turn.
export const NIGHT_STEPS = Object.freeze({
  SEER: 'seer',
  PROTECTOR: 'protector',
  WOLVES: 'wolves',
  ALPHA: 'alpha',
  WITCH: 'witch',
  DONE: 'done',
});

export const NIGHT_ORDER = Object.freeze([
  NIGHT_STEPS.SEER,
  NIGHT_STEPS.PROTECTOR,
  NIGHT_STEPS.WOLVES,
  NIGHT_STEPS.ALPHA,
  NIGHT_STEPS.WITCH,
  NIGHT_STEPS.DONE,
]);

export const ROLES = Object.freeze({
  VILLAGER: 'villager',
  SEER: 'seer',
  PROTECTOR: 'protector',
  HUNTER: 'hunter',
  MAYOR: 'mayor',
  SPY: 'spy',
  WITCH: 'witch',
  WOLF: 'wolf',
  ALPHA: 'alpha',
});

export const TEAMS = Object.freeze({
  VILLAGE: 'village',
  WOLVES: 'wolves',
});

export const WINNERS = Object.freeze({
  VILLAGE: 'village',
  WOLVES: 'wolves',
  NONE: 'none', // the narrator ended the game without a winner
});

// Why a player left the game.
export const CAUSES = Object.freeze({
  WOLVES: 'wolves',
  POISON: 'poison',
  VOTE: 'vote',
  HUNTER: 'hunter',
  NARRATOR: 'narrator',
});

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 18;
export const MAX_TIMER_SECONDS = 60 * 60;

/**
 * Reads an own property only. Maps keyed by player id (ballots…) must never
 * return inherited values such as Object.prototype.constructor.
 */
export function own(map, key) {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

const WOLF_ROLES = new Set([ROLES.WOLF, ROLES.ALPHA]);

/** The witch plays for the village (D-3). Only wolf and alpha are wolves. */
export function teamOf(role) {
  return WOLF_ROLES.has(role) ? TEAMS.WOLVES : TEAMS.VILLAGE;
}

export const isWolf = (player) => teamOf(player.role) === TEAMS.WOLVES;
