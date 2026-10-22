import { MODES, ROLES, own } from './constants.js';

/** Living players with a special night ability (classic variant only). */
export function usesAbility(state, player) {
  return state.mode === MODES.CLASSIC && (player.role === ROLES.SEER || player.role === ROLES.DOCTOR);
}

/** How many living players have already acted this night. */
export function nightProgress(state) {
  const alive = state.players.filter((p) => p.alive);
  const acted = alive.filter((p) =>
    usesAbility(state, p)
      ? Object.hasOwn(state.night.abilities, p.id)
      : Object.hasOwn(state.night.ballots, p.id),
  );
  return { submitted: acted.length, expected: alive.length };
}

/**
 * Resolves the night without changing the state.
 * - The victim dies only if every living mafioso picked the same player
 *   (with a single mafioso alive, that pick is enough).
 * - A missing mafia ballot means there is no agreement, so nobody dies.
 * - `mafiaBallots` is the number of ballots with a name on them, which
 *   reveals how many mafiosi are still alive (announced in the original mode).
 * - Classic variant: the doctor's protection cancels the kill.
 */
export function resolveNight(state) {
  const alive = state.players.filter((p) => p.alive);
  const picks = alive
    .filter((p) => p.role === ROLES.MAFIA)
    .map((p) => (Object.hasOwn(state.night.ballots, p.id) ? state.night.ballots[p.id] : null));
  const mafiaBallots = picks.filter((target) => target !== null).length;
  const unanimous = picks.length > 0 && picks.every((target) => target !== null && target === picks[0]);
  const intendedVictimId = unanimous && alive.some((p) => p.id === picks[0]) ? picks[0] : null;

  let saved = false;
  if (intendedVictimId && state.mode === MODES.CLASSIC) {
    const doctor = alive.find((p) => p.role === ROLES.DOCTOR);
    saved = Boolean(doctor) && own(state.night.abilities, doctor.id) === intendedVictimId;
  }

  return {
    victimId: saved ? null : intendedVictimId,
    intendedVictimId,
    saved,
    mafiaBallots,
  };
}
