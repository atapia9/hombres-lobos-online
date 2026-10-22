// Day vote (D-6, option A): players accuse; the narrator opens a vote among the
// accused; each living player marks one accused as guilty (never themselves) or
// abstains. Most guilty votes is eliminated; the mayor counts double (D-7).
// A tie eliminates nobody, unless the mayor breaks it (narrator option).

import { breakTie, voteWeight } from './roles/mayor.js';

export const emptyDay = () => ({ accusations: [], vote: null, voteHeld: false });

/** Distinct living players with a pending accusation, in accusation order. */
export function candidatesFrom(accusations, players) {
  const alive = new Set(players.filter((p) => p.alive).map((p) => p.id));
  return [...new Set(accusations.map((a) => a.targetId))].filter((id) => alive.has(id));
}

/** Living players allowed to vote. */
export function eligibleVoterIds(players) {
  return players.filter((p) => p.alive).map((p) => p.id);
}

/**
 * Counts the vote. `vote.ballots` maps voterId → candidateId | null (abstain).
 * `weighted` holds the real totals (narrator only); `votersByCandidate` is what
 * a show of hands reveals.
 */
export function tallyVote(vote, players, { mayorBreaksTies = false } = {}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const weighted = Object.fromEntries(vote.candidateIds.map((id) => [id, 0]));
  const votersByCandidate = Object.fromEntries(vote.candidateIds.map((id) => [id, []]));
  let votedCount = 0;

  for (const voterId of eligibleVoterIds(players)) {
    if (!Object.hasOwn(vote.ballots, voterId)) continue;
    votedCount += 1;
    const pick = vote.ballots[voterId];
    if (pick === null || !Object.hasOwn(weighted, pick)) continue;
    weighted[pick] += voteWeight(byId.get(voterId));
    votersByCandidate[pick].push(voterId);
  }

  const top = Math.max(0, ...Object.values(weighted));
  const leaderIds = top > 0 ? vote.candidateIds.filter((id) => weighted[id] === top) : [];
  let eliminatedId = leaderIds.length === 1 ? leaderIds[0] : null;
  const tie = leaderIds.length > 1;
  let tieBrokenByMayor = false;
  if (tie && mayorBreaksTies) {
    eliminatedId = breakTie(players, vote.ballots, leaderIds);
    tieBrokenByMayor = eliminatedId !== null;
  }

  return {
    eligibleCount: eligibleVoterIds(players).length,
    votedCount,
    weighted,
    votersByCandidate,
    leaderIds,
    tie,
    tieBrokenByMayor,
    eliminatedId,
  };
}
