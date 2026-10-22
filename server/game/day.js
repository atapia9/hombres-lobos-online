// Day rules: accusation votes and calling the night.

/**
 * Guilty votes needed to eliminate the accused: more than half of the living
 * players, not counting the accused. Abstaining counts as "not guilty".
 */
export function requiredGuiltyVotes(voterCount) {
  return Math.floor(voterCount / 2) + 1;
}

/** Requests needed to call the night: more than half of the living players. */
export function nightRequestsNeeded(aliveCount) {
  return Math.floor(aliveCount / 2) + 1;
}

/** Living players who may vote on an accusation (everyone alive but the accused). */
export function eligibleVoterIds(players, accusedId) {
  return players.filter((p) => p.alive && p.id !== accusedId).map((p) => p.id);
}

/** Counts a vote. `vote.ballots` maps playerId → true (guilty) | false (not guilty). */
export function tallyVote(vote, players) {
  const eligible = eligibleVoterIds(players, vote.accusedId);
  const has = (id) => Object.hasOwn(vote.ballots, id);
  const guiltyVoterIds = eligible.filter((id) => has(id) && vote.ballots[id] === true);
  const notGuiltyVoterIds = eligible.filter((id) => has(id) && vote.ballots[id] === false);
  const required = requiredGuiltyVotes(eligible.length);
  return {
    eligibleCount: eligible.length,
    guiltyCount: guiltyVoterIds.length,
    notGuiltyCount: notGuiltyVoterIds.length,
    abstainedCount: eligible.length - guiltyVoterIds.length - notGuiltyVoterIds.length,
    required,
    passed: guiltyVoterIds.length >= required,
    guiltyVoterIds,
    notGuiltyVoterIds,
  };
}
