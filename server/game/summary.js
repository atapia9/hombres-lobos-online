// Shareable end-of-game summary (ADR-011), in Markdown and in WhatsApp-style plain text.
// User-facing text is in Spanish; names are already limited to safe characters (names.js).

import { MODES, PHASES, ROLES, TEAMS, WINNERS, teamOf } from './constants.js';

export const MODE_LABELS = Object.freeze({
  [MODES.ORIGINAL]: 'Original de Davýdov',
  [MODES.CLASSIC]: 'Clásico con roles (variante posterior inspirada en Werewolf; no forma parte del original)',
});

export const WINNER_LABELS = Object.freeze({
  [WINNERS.HONEST]: 'Ganan los Honestos',
  [WINNERS.MAFIA]: 'Gana la Mafia',
  [WINNERS.NONE]: 'Partida terminada sin ganador',
});

// R11: closing lines approved for the summary.
export const CLOSING_LINES = Object.freeze({
  [WINNERS.HONEST]: 'La ciudad despierta en paz: no queda ningún mafioso.',
  [WINNERS.MAFIA]: 'La ciudad guarda silencio: la mafia se queda con todo.',
});

export const CREDIT_LINE = 'Mafia es un juego creado por Dmitri Davýdov (1986–1987).';

const ROLE_LABELS = Object.freeze({
  [ROLES.SEER]: 'Vidente',
  [ROLES.DOCTOR]: 'Doctor',
});

const PHASE_LABELS = Object.freeze({
  [PHASES.DAWN]: 'Amanecer',
  [PHASES.DAY]: 'Día',
  [PHASES.NIGHT]: 'Noche',
});

/** Defense in depth: names cannot contain these characters, but escape them anyway. */
function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]()#+!|<>~]/g, '\\$&');
}

function formatDate(now, timeZone, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(new Date(now));
}

function eventItems(state, entry) {
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '?';
  const phase = PHASE_LABELS[entry.phase] ?? '';
  const ballots = state.mode === MODES.ORIGINAL ? ` (papeletas de mafia: ${entry.mafiaBallots})` : '';

  if (entry.type === 'vote') {
    if (!entry.passed) return []; // acquittals are not eliminations
    return [{
      phase,
      name: nameOf(entry.accusedId),
      text: `eliminación por votación: ${entry.guiltyCount} de ${entry.eligibleCount} votos «culpable» (se necesitaban ${entry.required})`,
    }];
  }
  if (entry.type === 'night') {
    if (entry.victimId) return [{ phase, name: nameOf(entry.victimId), text: `muerte a manos de la mafia${ballots}` }];
    if (entry.saved) return [{ phase, name: nameOf(entry.intendedVictimId), text: 'se salvó gracias al Doctor' }];
    return [{ phase, name: null, text: `nadie murió${ballots}` }];
  }
  if (entry.type === 'retired') {
    return [{ phase, name: nameOf(entry.playerId), text: 'retiro por decisión del narrador' }];
  }
  return [];
}

/** Structured summary shared by both text formats. */
export function summaryData(state, { now = 0, timeZone = 'UTC', locale = 'es-MX' } = {}) {
  if (state.phase !== PHASES.ENDED) throw new Error('The summary is only available when the game has ended');

  const member = (p) => ({
    name: p.name,
    roleLabel: ROLE_LABELS[p.role] ?? null,
    status: p.alive ? 'sobrevive' : `fuera en la ronda ${p.eliminatedRound}`,
  });

  const rounds = new Map();
  for (const entry of state.history) {
    const items = eventItems(state, entry);
    if (items.length === 0) continue;
    if (!rounds.has(entry.round)) rounds.set(entry.round, []);
    rounds.get(entry.round).push(...items);
  }

  const scores = state.config.showScore && state.scores
    ? state.players
      .map((p) => ({ name: p.name, points: state.scores[p.id] ?? 0, total: state.scoreboard[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || b.total - a.total || a.name.localeCompare(b.name, 'es'))
    : null;

  return {
    gameNumber: state.gameNumber,
    dateLabel: formatDate(now, timeZone, locale),
    mode: state.mode,
    modeLabel: MODE_LABELS[state.mode],
    playerCount: state.initial.playerCount,
    mafiaCount: state.initial.mafiaCount,
    winner: state.winner,
    winnerLabel: WINNER_LABELS[state.winner],
    teams: [
      { label: 'Mafia', members: state.players.filter((p) => teamOf(p.role) === TEAMS.MAFIA).map(member) },
      { label: 'Honestos', members: state.players.filter((p) => teamOf(p.role) === TEAMS.HONEST).map(member) },
    ],
    rounds: [...rounds.entries()].sort(([a], [b]) => a - b).map(([round, items]) => ({ round, items })),
    scores,
    showTotals: state.gameNumber > 1,
    closingLine: CLOSING_LINES[state.winner] ?? null,
    credit: CREDIT_LINE,
  };
}

function memberText(m, format) {
  const role = m.roleLabel ? `, ${m.roleLabel}` : '';
  return `${format(m.name)} (${m.status}${role})`;
}

export function toMarkdown(data) {
  const b = (name) => `**${escapeMarkdown(name)}**`;
  const title = data.gameNumber > 1 ? `Mafia — Resumen de la partida ${data.gameNumber}` : 'Mafia — Resumen de la partida';
  const lines = [
    `# ${title}`,
    '',
    `- **Fecha:** ${data.dateLabel}`,
    `- **Modo:** ${data.modeLabel}`,
    `- **Jugadores:** ${data.playerCount} (${data.mafiaCount} en la mafia)`,
    '',
    '## Resultado',
    '',
    `**${data.winnerLabel}.**`,
    '',
    '## Roles',
    '',
    ...data.teams.map((t) => `- **${t.label}:** ${t.members.map((m) => memberText(m, escapeMarkdown)).join(', ') || '—'}`),
    '',
    '## Eliminaciones por ronda',
    '',
  ];

  if (data.rounds.length === 0) lines.push('Sin eliminaciones.', '');
  for (const { round, items } of data.rounds) {
    lines.push(`### Ronda ${round}`, '');
    for (const item of items) {
      lines.push(`- ${item.phase}: ${item.name ? `${b(item.name)} — ` : ''}${item.text}`);
    }
    lines.push('');
  }

  if (data.scores) {
    lines.push('## Puntuación', '');
    lines.push(data.showTotals ? '| Jugador | Puntos | Total |' : '| Jugador | Puntos |');
    lines.push(data.showTotals ? '|---|---:|---:|' : '|---|---:|');
    for (const s of data.scores) {
      const name = escapeMarkdown(s.name);
      lines.push(data.showTotals ? `| ${name} | ${s.points} | ${s.total} |` : `| ${name} | ${s.points} |`);
    }
    lines.push('');
  }

  lines.push('---', '');
  if (data.closingLine) lines.push(`> ${data.closingLine}`, '>');
  lines.push(`> _${data.credit}_`, '');
  return lines.join('\n');
}

/** WhatsApp formatting: *bold*, _italics_. No headings or tables. */
export function toWhatsApp(data) {
  const b = (name) => `*${name}*`;
  const title = data.gameNumber > 1 ? `MAFIA — Resumen de la partida ${data.gameNumber}` : 'MAFIA — Resumen de la partida';
  const lines = [
    `*${title}*`,
    `Fecha: ${data.dateLabel}`,
    `Modo: ${data.modeLabel}`,
    `Jugadores: ${data.playerCount} (${data.mafiaCount} en la mafia)`,
    '',
    `*Resultado:* ${data.winnerLabel}`,
    '',
    '*Roles*',
    ...data.teams.map((t) => `${t.label}: ${t.members.map((m) => memberText(m, String)).join(', ') || '—'}`),
    '',
    '*Eliminaciones por ronda*',
  ];

  if (data.rounds.length === 0) lines.push('Sin eliminaciones.');
  for (const { round, items } of data.rounds) {
    lines.push(`_Ronda ${round}_`);
    for (const item of items) lines.push(`• ${item.phase}: ${item.name ? `${b(item.name)} — ` : ''}${item.text}`);
  }

  if (data.scores) {
    lines.push('', '*Puntuación*');
    for (const s of data.scores) {
      lines.push(data.showTotals ? `${s.name}: ${s.points} (total ${s.total})` : `${s.name}: ${s.points}`);
    }
  }

  lines.push('');
  if (data.closingLine) lines.push(`_${data.closingLine}_`);
  lines.push(data.credit);
  return lines.join('\n');
}

/** Builds both text formats. Throws if the game has not ended. */
export function buildSummary(state, options) {
  const data = summaryData(state, options);
  return { markdown: toMarkdown(data), whatsapp: toWhatsApp(data), data };
}
