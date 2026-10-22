// Pure formatting helpers (no DOM), unit-tested in Node.

import { CAUSE_LABELS, NIGHT_STEP_LABELS, PHASE_LABELS, ROLE_LABELS, WINNER_LABELS } from './texts.js';

/** "m:ss" for a countdown; never negative. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Name lookup that never throws. */
export function namer(players) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return (id) => names.get(id) ?? '¿?';
}

const list = (ids, nameOf) => ids.map(nameOf).join(', ');

/** One readable line per log entry, for the narrator's event log (it may name roles). */
export function describeLogEntry(entry, nameOf) {
  const d = entry.data ?? {};
  switch (entry.type) {
    case 'player_joined': return `${d.name} se unió a la sala.`;
    case 'player_left': return `${nameOf(d.playerId)} salió de la sala.`;
    case 'player_kicked': return `${nameOf(d.playerId)} fue expulsado de la sala.`;
    case 'config_changed': return describeConfig(d);
    case 'game_started': {
      const byRole = {};
      for (const [id, role] of Object.entries(d.roles ?? {})) (byRole[role] ??= []).push(id);
      const parts = Object.entries(byRole).map(([role, ids]) => `${ROLE_LABELS[role]}: ${list(ids, nameOf)}`);
      return `Empieza la partida y se reparten los roles. ${parts.join('. ')}.`;
    }
    case 'phase_changed': return `Cambio de fase: ${PHASE_LABELS[d.from]} → ${PHASE_LABELS[d.to]}.`;
    case 'night_step': return d.skipped
      ? `${NIGHT_STEP_LABELS[d.from]}: se salta (nadie actúa).`
      : `${NIGHT_STEP_LABELS[d.to]}.`;
    case 'night_step_skipped': return `El narrador saltó el paso: ${NIGHT_STEP_LABELS[d.step]}.`;
    case 'seer_checked': return `La Vidente (${nameOf(d.playerId)}) consulta a ${nameOf(d.targetId)}: ${d.isWolf ? 'es lobo' : 'no es lobo'}.`;
    case 'player_protected': return `El Protector (${nameOf(d.playerId)}) protege a ${nameOf(d.targetId)}.`;
    case 'wolf_voted': return `${nameOf(d.playerId)} (lobo) elige a ${nameOf(d.targetId)}.`;
    case 'wolves_revote': return 'El narrador pide a los lobos que vuelvan a votar.';
    case 'alpha_chose': return `El Lobo alfa (${nameOf(d.playerId)}) decide ${d.convert ? 'convertir' : 'matar'} a la víctima.`;
    case 'player_converted': return `${nameOf(d.playerId)} (${ROLE_LABELS[d.from]}) se convierte en lobo.`;
    case 'witch_acted': {
      const parts = [];
      if (d.heal) parts.push(`salva a ${nameOf(d.victimId)}`);
      if (d.poisonTargetId) parts.push(`envenena a ${nameOf(d.poisonTargetId)}`);
      return `La Bruja (${nameOf(d.playerId)}) ${parts.length ? parts.join(' y ') : 'no usa pociones'}.`;
    }
    case 'night_resolved': {
      const deaths = (d.deaths ?? []).map((x) => `${nameOf(x.playerId)} (${CAUSE_LABELS[x.cause]})`);
      return `Fin de la noche: ${deaths.length ? `mueren ${deaths.join(', ')}` : 'no muere nadie'}.`;
    }
    case 'player_eliminated': return `${nameOf(d.playerId)} (${ROLE_LABELS[d.role] ?? '¿?'}): ${CAUSE_LABELS[d.cause] ?? 'fuera de la partida'}.`;
    case 'hunter_pending': return `${nameOf(d.hunterId)} era el Cazador: tiene que disparar.`;
    case 'hunter_shot': return `El Cazador (${nameOf(d.hunterId)}) dispara a ${nameOf(d.targetId)}.`;
    case 'hunter_skipped': return `El narrador omite el disparo del Cazador (${nameOf(d.hunterId)}).`;
    case 'timer_set': return d.seconds > 0 ? `Temporizador de ${formatCountdown(d.seconds * 1000)}.` : 'Temporizador quitado.';
    case 'accusation_made': return `${nameOf(d.accuserId)} acusa a ${nameOf(d.targetId)}.`;
    case 'accusation_dismissed': return 'El narrador descartó una acusación.';
    case 'vote_opened': return `Se abre la votación entre: ${list(d.candidateIds ?? [], nameOf)}.`;
    case 'vote_cast': {
      if (d.targetId === undefined) return `${nameOf(d.playerId)} retiró su voto.`;
      return d.targetId === null ? `${nameOf(d.playerId)} se abstiene.` : `${nameOf(d.playerId)} vota contra ${nameOf(d.targetId)}.`;
    }
    case 'vote_closed': return `Votación cerrada: ${describeVoteResult(d.result ?? {}, nameOf)}`;
    case 'vote_confirmed': return d.eliminatedId ? `Resultado confirmado: sale ${nameOf(d.eliminatedId)}.` : 'Resultado confirmado: nadie sale.';
    case 'vote_cancelled': return d.reason === 'no_candidates' ? 'Votación cancelada: ya no quedan acusados.' : 'El narrador anuló la votación.';
    case 'game_ended': return `Fin de la partida: ${WINNER_LABELS[d.winner] ?? d.winner}.`;
    case 'rematch_created': return `Nueva partida con los mismos jugadores (partida ${d.gameNumber}).`;
    default: return entry.type;
  }
}

function describeConfig(d) {
  const parts = [];
  if (d.wolfCount !== undefined) parts.push(d.wolfCount === null ? 'lobos recomendados' : `${d.wolfCount} lobos`);
  if (d.roles) {
    const on = Object.entries(d.roles).filter(([, v]) => v).map(([k]) => ROLE_LABELS[k]);
    parts.push(on.length ? `roles: ${on.join(', ')}` : 'sin roles especiales');
  }
  if (d.revealDeadRoles !== undefined) parts.push(d.revealDeadRoles ? 'se revela el rol de los muertos' : 'rol de los muertos oculto');
  if (d.mayorBreaksTies !== undefined) parts.push(d.mayorBreaksTies ? 'el Alcalde desempata' : 'empate = nadie sale');
  if (d.showVotes !== undefined) parts.push(d.showVotes ? 'votos visibles al cerrar' : 'votos ocultos');
  return `Ajustes: ${parts.join(', ')}.`;
}

/** Narrator-side description of a closed vote (uses weighted totals). */
export function describeVoteResult(result, nameOf) {
  const totals = Object.entries(result.weighted ?? {}).map(([id, n]) => `${nameOf(id)} ${n}`).join(', ');
  if (result.eliminatedId) {
    const tie = result.tieBrokenByMayor ? ' (desempate del Alcalde)' : '';
    return `sale ${nameOf(result.eliminatedId)}${tie}. Votos: ${totals || '—'}.`;
  }
  return `${result.tie ? 'empate' : 'sin votos suficientes'}, nadie sale. Votos: ${totals || '—'}.`;
}

/** Groups log entries by game and round, keeping their order. */
export function groupByRound(log) {
  const groups = [];
  for (const entry of log) {
    const last = groups.at(-1);
    if (last && last.game === entry.game && last.round === entry.round) last.entries.push(entry);
    else groups.push({ game: entry.game, round: entry.round, entries: [entry] });
  }
  return groups;
}

export function roundTitle(round) {
  return round === 0 ? 'Antes de empezar' : `Ronda ${round}`;
}

/** What the narrator reads aloud at dawn. Never says how anyone died. */
export function describeDawn(lastNight, nameOf) {
  if (!lastNight) return null;
  const { deathIds } = lastNight;
  if (deathIds.length === 0) return 'La aldea despierta: esta noche no murió nadie.';
  if (deathIds.length === 1) return `La aldea despierta: esta noche murió ${nameOf(deathIds[0])}.`;
  return `La aldea despierta: esta noche murieron ${deathIds.map(nameOf).join(' y ')}.`;
}

const PHASE_SHORT = { night: 'noche', dawn: 'amanecer', day: 'día', start: 'inicio' };

/** Text for a player's status, e.g. "Fuera (ronda 2, noche)". The cause stays secret. */
export function describeStatus(player) {
  if (player.alive) return 'En juego';
  const when = PHASE_SHORT[player.eliminatedPhase];
  return `Fuera (ronda ${player.eliminatedRound}${when ? `, ${when}` : ''})`;
}
