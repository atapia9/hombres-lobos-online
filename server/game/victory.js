import { WINNERS, isWolf } from './constants.js';

/**
 * Village wins when no wolf is alive. Wolves win when they equal or outnumber
 * the other living players (docs/reglas.md).
 */
export function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter(isWolf).length;
  if (wolves === 0) return WINNERS.VILLAGE;
  if (wolves >= alive.length - wolves) return WINNERS.WOLVES;
  return null;
}
