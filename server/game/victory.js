import { TEAMS, WINNERS, teamOf } from './constants.js';

/**
 * Honest win when no mafioso is alive; mafia win when no honest player is alive.
 * There is no parity rule: the original game has none.
 */
export function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  const mafiaAlive = alive.filter((p) => teamOf(p.role) === TEAMS.MAFIA).length;
  if (mafiaAlive === 0) return WINNERS.HONEST;
  if (alive.length - mafiaAlive === 0) return WINNERS.MAFIA;
  return null;
}

/**
 * Original scoring:
 * - Mafia win: each living mafioso scores the number of honest players at the start.
 * - Honest win: each living honest player scores the number of honest survivors.
 * Returns `{ [playerId]: points }` for every player (0 when they score nothing).
 */
export function computeScores(state, winner = state.winner) {
  const scores = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  if (winner === WINNERS.MAFIA) {
    for (const p of state.players) {
      if (p.alive && teamOf(p.role) === TEAMS.MAFIA) scores[p.id] = state.initial.honestCount;
    }
  } else if (winner === WINNERS.HONEST) {
    const survivors = state.players.filter((p) => p.alive && teamOf(p.role) === TEAMS.HONEST);
    for (const p of survivors) scores[p.id] = survivors.length;
  }
  return scores;
}
