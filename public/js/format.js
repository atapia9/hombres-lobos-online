// Pure formatting helpers (no DOM), unit-tested in Node.

import { ELIMINATION_LABELS, MODE_LABELS, PHASE_LABELS, ROLE_LABELS, WINNER_LABELS } from './texts.js';

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

/** One readable line per log entry, for the narrator's event log. */
export function describeLogEntry(entry, nameOf) {
  const d = entry.data ?? {};
  switch (entry.type) {
    case 'player_joined': return `${d.name} se unió a la sala.`;
    case 'player_left': return `${nameOf(d.playerId)} salió de la sala.`;
    case 'player_kicked': return `${nameOf(d.playerId)} fue expulsado de la sala.`;
    case 'config_changed': return describeConfig(d);
    case 'game_started': {
      const mafia = Object.entries(d.roles ?? {}).filter(([, role]) => role === 'mafia').map(([id]) => nameOf(id));
      const special = Object.entries(d.roles ?? {})
        .filter(([, role]) => role === 'seer' || role === 'doctor')
        .map(([id, role]) => `${ROLE_LABELS[role]}: ${nameOf(id)}`);
      return [`Empieza la partida (${MODE_LABELS[d.mode]}). Mafia: ${mafia.join(', ')}.`, ...special].join(' ');
    }
    case 'phase_changed': return `Cambio de fase: ${PHASE_LABELS[d.from]} → ${PHASE_LABELS[d.to]}.`;
    case 'timer_set': return d.seconds > 0 ? `Temporizador de ${formatCountdown(d.seconds * 1000)}.` : 'Temporizador quitado.';
    case 'accusation_made': return `${nameOf(d.accuserId)} acusa a ${nameOf(d.targetId)}.`;
    case 'accusation_dismissed': return 'El narrador descartó una acusación.';
    case 'vote_opened': return `Se abre la votación contra ${nameOf(d.accusedId)}.`;
    case 'vote_cast': {
      if (d.guilty === null) return `${nameOf(d.playerId)} retiró su voto.`;
      return `${nameOf(d.playerId)} vota ${d.guilty ? '«culpable»' : '«no culpable»'}.`;
    }
    case 'vote_closed': {
      const r = d.result ?? {};
      return `Votación cerrada: ${r.guiltyCount} «culpable» de ${r.eligibleCount} (se necesitaban ${r.required}).`;
    }
    case 'vote_confirmed': return d.passed ? `Resultado confirmado: ${nameOf(d.accusedId)} queda eliminado.` : `Resultado confirmado: ${nameOf(d.accusedId)} queda absuelto.`;
    case 'vote_cancelled': return d.reason === 'accused_removed' ? 'Votación cancelada: la persona acusada ya no está.' : 'El narrador anuló la votación.';
    case 'player_eliminated': return `${nameOf(d.playerId)}: ${ELIMINATION_LABELS[d.cause] ?? 'fuera de la partida'}.`;
    case 'night_requested': return `${nameOf(d.playerId)} ${d.wanted ? 'pide' : 'ya no pide'} la noche (${d.count}/${d.needed}).`;
    case 'night_ballot': return d.targetId ? `${nameOf(d.playerId)} elige a ${nameOf(d.targetId)}.` : `${nameOf(d.playerId)} entrega «Honesto».`;
    case 'seer_checked': return `La Vidente (${nameOf(d.playerId)}) consulta a ${nameOf(d.targetId)}: ${d.team === 'mafia' ? 'Mafia' : 'Honesto'}.`;
    case 'doctor_protected': return `El Doctor (${nameOf(d.playerId)}) protege a ${nameOf(d.targetId)}.`;
    case 'night_resolved': {
      if (d.victimId) return `Fin de la noche: muere ${nameOf(d.victimId)} (papeletas de mafia: ${d.mafiaBallots}).`;
      if (d.saved) return `Fin de la noche: el Doctor salvó a ${nameOf(d.intendedVictimId)}.`;
      return `Fin de la noche: nadie muere (papeletas de mafia: ${d.mafiaBallots}).`;
    }
    case 'game_ended': return `Fin de la partida: ${WINNER_LABELS[d.winner] ?? d.winner}.`;
    case 'rematch_created': return `Nueva partida con los mismos jugadores (partida ${d.gameNumber}).`;
    default: return entry.type;
  }
}

function describeConfig(d) {
  const parts = [];
  if (d.mode) parts.push(`modo ${MODE_LABELS[d.mode]}`);
  if (d.mafiaCount !== undefined) parts.push(d.mafiaCount === null ? 'mafiosos según la tabla' : `${d.mafiaCount} mafiosos`);
  if (d.showVotes !== undefined) parts.push(d.showVotes ? 'votos visibles' : 'votos ocultos');
  if (d.showScore !== undefined) parts.push(d.showScore ? 'puntuación visible' : 'puntuación oculta');
  return `Ajustes: ${parts.join(', ')}.`;
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

/** What the narrator reads aloud at dawn. */
export function describeLastNight(lastNight, nameOf, mode) {
  if (!lastNight) return null;
  const death = lastNight.victimId ? `Esta noche murió ${nameOf(lastNight.victimId)}.` : 'Esta noche no murió nadie.';
  if (mode === 'original' && typeof lastNight.mafiaBallots === 'number') {
    const n = lastNight.mafiaBallots;
    return `${death} Hubo ${n} ${n === 1 ? 'papeleta' : 'papeletas'} de mafia.`;
  }
  return death;
}

/** Text for a player's status, e.g. "Fuera (ronda 2, votación)". */
export function describeStatus(player) {
  if (player.alive) return 'En juego';
  const cause = { vote: 'votación', night: 'noche', narrator: 'retiro' }[player.eliminatedBy] ?? '';
  return `Fuera (ronda ${player.eliminatedRound}${cause ? `, ${cause}` : ''})`;
}
