// Shareable end-of-game summary, in Markdown and in WhatsApp-style plain text.
// User-facing text is in Spanish; names are already limited to safe characters (names.js).

import { CAUSES, PHASES, TEAMS, WINNERS, teamOf } from './constants.js';
import { roleLabel } from './roles/index.js';

export const WINNER_LABELS = Object.freeze({
  [WINNERS.VILLAGE]: 'Ganan los Aldeanos',
  [WINNERS.WOLVES]: 'Ganan los Lobos',
  [WINNERS.NONE]: 'Partida terminada sin ganador',
});

export const CLOSING_LINES = Object.freeze({
  [WINNERS.VILLAGE]: 'Amanece sin aullidos: la aldea vuelve a dormir tranquila.',
  [WINNERS.WOLVES]: 'La luna se queda con la aldea: ya nadie puede detener a la manada.',
});

export const CREDIT_LINE = 'Adaptación propia de la familia de juegos Mafia, creada por Dmitri Davýdov (1986–1987), '
  + 'y de su variante Werewolf, de Andrew Plotkin (1997).';

const PHASE_LABELS = Object.freeze({
  [PHASES.NIGHT]: 'Noche',
  [PHASES.DAWN]: 'Amanecer',
  [PHASES.DAY]: 'Día',
  [PHASES.START]: 'Inicio',
});

const DEATH_TEXT = Object.freeze({
  [CAUSES.WOLVES]: 'devorado por los lobos',
  [CAUSES.POISON]: 'envenenado por la Bruja',
});

/** Defense in depth: names cannot contain these characters, but escape them anyway. */
function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]()#+!|<>~]/g, '\\$&');
}

function formatDate(now, timeZone, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(new Date(now));
}

function eliminationItems(state, entry, nameOf) {
  const phase = PHASE_LABELS[entry.phase] ?? '';
  if (entry.type === 'night') {
    if (entry.deaths.length === 0) return [{ phase, name: null, text: 'nadie murió' }];
    return entry.deaths.map((d) => ({ phase, name: nameOf(d.playerId), text: DEATH_TEXT[d.cause] }));
  }
  if (entry.type === 'vote') {
    if (!entry.eliminatedId) {
      return [{ phase, name: null, text: entry.tie ? 'empate en la votación: nadie fue eliminado' : 'nadie fue eliminado en la votación' }];
    }
    const votes = entry.weighted[entry.eliminatedId];
    const tie = entry.tieBrokenByMayor ? ', desempate del Alcalde' : '';
    return [{ phase, name: nameOf(entry.eliminatedId), text: `eliminado por votación (${votes} votos${tie})` }];
  }
  if (entry.type === 'shot') {
    if (!entry.targetId) return [{ phase, name: nameOf(entry.hunterId), text: 'el Cazador no disparó' }];
    return [{ phase, name: nameOf(entry.targetId), text: `abatido por el Cazador ${nameOf(entry.hunterId)}` }];
  }
  if (entry.type === 'retired') {
    return [{ phase, name: nameOf(entry.playerId), text: 'retirado por el narrador' }];
  }
  return [];
}

function abilityItems(state, entry, nameOf) {
  if (entry.type !== 'night') return [];
  const items = [];
  if (entry.seerTargetId) {
    const check = state.seerResults.find((r) => r.round === entry.round && r.targetId === entry.seerTargetId);
    items.push(`Vidente consultó a ${nameOf(entry.seerTargetId)}: ${check?.isWolf ? 'es lobo' : 'no es lobo'}`);
  }
  if (entry.protectorTargetId) {
    const saved = entry.protectedId ? ' y lo salvó de los lobos' : '';
    items.push(`Protector cuidó a ${nameOf(entry.protectorTargetId)}${saved}`);
  }
  if (entry.convertedId) items.push(`Lobo alfa convirtió a ${nameOf(entry.convertedId)} en lobo`);
  if (entry.healedId) items.push(`Bruja salvó a ${nameOf(entry.healedId)} con la poción de vida`);
  if (entry.poisonedId) items.push(`Bruja usó la poción de muerte con ${nameOf(entry.poisonedId)}`);
  if (entry.wolfTargetId === null && !entry.wolvesUnanimous) items.push('Los lobos no se pusieron de acuerdo');
  return items;
}

/** Structured summary shared by both text formats. */
export function summaryData(state, { now = 0, timeZone = 'UTC', locale = 'es-MX' } = {}) {
  if (state.phase !== PHASES.ENDED) throw new Error('The summary is only available when the game has ended');
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '?';

  const member = (p) => {
    const parts = [roleLabel(p.role)];
    if (p.originalRole) parts.push(`antes ${roleLabel(p.originalRole)}, convertido en la noche ${p.convertedRound}`);
    parts.push(p.alive ? 'sobrevive' : `fuera en la ronda ${p.eliminatedRound}`);
    return { name: p.name, details: parts.join(', ') };
  };

  const rounds = new Map();
  const roundOf = (r) => {
    if (!rounds.has(r)) rounds.set(r, { round: r, eliminations: [], abilities: [] });
    return rounds.get(r);
  };
  for (const entry of state.history) {
    const eliminations = eliminationItems(state, entry, nameOf);
    const abilities = abilityItems(state, entry, nameOf);
    if (eliminations.length + abilities.length === 0) continue;
    const r = roundOf(entry.round);
    r.eliminations.push(...eliminations);
    r.abilities.push(...abilities);
  }

  const counts = state.initial?.counts ?? {};
  const compositionLabel = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${n} ${roleLabel(id)}`)
    .join(', ');

  return {
    gameNumber: state.gameNumber,
    dateLabel: formatDate(now, timeZone, locale),
    playerCount: state.initial.playerCount,
    compositionLabel,
    winner: state.winner,
    winnerLabel: WINNER_LABELS[state.winner],
    teams: [
      { label: 'Lobos', members: state.players.filter((p) => teamOf(p.role) === TEAMS.WOLVES).map(member) },
      { label: 'Aldeanos', members: state.players.filter((p) => teamOf(p.role) === TEAMS.VILLAGE).map(member) },
    ],
    rounds: [...rounds.values()].sort((a, b) => a.round - b.round),
    closingLine: CLOSING_LINES[state.winner] ?? null,
    credit: CREDIT_LINE,
  };
}

const title = (data) => (data.gameNumber > 1
  ? `Hombres Lobos — Resumen de la partida ${data.gameNumber}`
  : 'Hombres Lobos — Resumen de la partida');

export function toMarkdown(data) {
  const b = (name) => `**${escapeMarkdown(name)}**`;
  const lines = [
    `# ${title(data)}`,
    '',
    `- **Fecha:** ${data.dateLabel}`,
    `- **Jugadores:** ${data.playerCount}`,
    `- **Roles en juego:** ${data.compositionLabel}`,
    '',
    '## Resultado',
    '',
    `**${data.winnerLabel}.**`,
    '',
    '## Roles revelados',
    '',
    ...data.teams.map((t) => `- **${t.label}:** ${t.members.map((m) => `${escapeMarkdown(m.name)} (${m.details})`).join('; ') || '—'}`),
    '',
    '## Ronda por ronda',
    '',
  ];
  if (data.rounds.length === 0) lines.push('Sin eventos.', '');
  for (const r of data.rounds) {
    lines.push(`### Ronda ${r.round}`, '');
    for (const item of r.eliminations) {
      lines.push(`- ${item.phase}: ${item.name ? `${b(item.name)} — ` : ''}${item.text}`);
    }
    if (r.abilities.length > 0) {
      lines.push('', '_Habilidades usadas:_', '');
      for (const text of r.abilities) lines.push(`- ${escapeMarkdown(text)}`);
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
  const lines = [
    `*${title(data).toUpperCase()}*`,
    `Fecha: ${data.dateLabel}`,
    `Jugadores: ${data.playerCount}`,
    `Roles en juego: ${data.compositionLabel}`,
    '',
    `*Resultado:* ${data.winnerLabel}`,
    '',
    '*Roles revelados*',
    ...data.teams.map((t) => `${t.label}: ${t.members.map((m) => `${m.name} (${m.details})`).join('; ') || '—'}`),
    '',
    '*Ronda por ronda*',
  ];
  if (data.rounds.length === 0) lines.push('Sin eventos.');
  for (const r of data.rounds) {
    lines.push(`_Ronda ${r.round}_`);
    for (const item of r.eliminations) lines.push(`• ${item.phase}: ${item.name ? `${b(item.name)} — ` : ''}${item.text}`);
    for (const text of r.abilities) lines.push(`  ◦ ${text}`);
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
