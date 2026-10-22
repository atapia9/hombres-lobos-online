// Pure helpers for the player screen (no DOM), unit-tested in Node.
// `state` is the merged player state: the public view plus `me` (own secrets only).

import { ROLE_LABELS, TEAM_LABELS } from './texts.js';

export const ROOM_CODE_INPUT = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** Cleans what the player typed in the code field. Returns the code or null. */
export function parseRoomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return ROOM_CODE_INPUT.test(code) ? code : null;
}

const ROLE_TEXTS = {
  mafia: 'Eres de la Mafia. Elimina a los honestos sin que te descubran. Solo muere alguien de noche si todos los mafiosos vivos eligen a la misma persona.',
  honest: 'Eres Honesto. Descubre a los mafiosos y elimínalos por votación durante el día.',
  seer: 'Eres la Vidente, del equipo honesto. Cada noche puedes consultar a un jugador y saber si es de la Mafia.',
  doctor: 'Eres el Doctor, del equipo honesto. Cada noche proteges a un jugador; si la mafia lo elige, se salva.',
};

/** What the hidden role card shows. Null before the game starts. */
export function roleCard(state) {
  const { me } = state;
  if (!me?.role) return null;
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '¿?';
  const lines = [ROLE_TEXTS[me.role]];

  if (me.role === 'mafia') {
    const partners = (me.partnerIds ?? []).map(nameOf);
    lines.push(partners.length
      ? `Tus compañeros: ${partners.join(', ')}.`
      : 'Eres el único mafioso de la partida.');
  }
  if (me.role === 'seer') {
    const results = (me.seerResults ?? []).map((r) => `Ronda ${r.round}: ${nameOf(r.targetId)} es ${r.team === 'mafia' ? 'de la Mafia' : 'Honesto'}.`);
    lines.push(...(results.length ? results : ['Todavía no has consultado a nadie.']));
  }
  if (me.role === 'doctor' && me.doctorLastTargetId) {
    lines.push(`Anoche protegiste a ${nameOf(me.doctorLastTargetId)}: esta noche no puedes repetir.`);
  }
  return { title: ROLE_LABELS[me.role], team: TEAM_LABELS[me.team], role: me.role, lines };
}

/**
 * The night ballot. Every living player sees the same kind of list (ADR-010):
 * "Honesto" plus the living players, with the options that don't apply disabled.
 */
export function nightChoices(state) {
  const { me } = state;
  if (!me?.alive) return { kind: 'none', options: [], instruction: 'Estás fuera de la partida: esta noche no entregas papeleta.' };
  const alive = state.players.filter((p) => p.alive);
  const partners = new Set(me.partnerIds ?? []);
  const classic = state.mode === 'classic';
  const usesAbility = classic && (me.role === 'seer' || me.role === 'doctor');

  if (usesAbility) {
    const seer = me.role === 'seer';
    const options = alive
      .filter((p) => !seer || p.id !== me.id)
      .map((p) => ({
        value: p.id,
        label: p.id === me.id ? `${p.name} (tú)` : p.name,
        disabled: !seer && p.id === me.doctorLastTargetId,
        note: !seer && p.id === me.doctorLastTargetId ? 'protegido anoche' : null,
      }));
    return {
      kind: seer ? 'seer' : 'doctor',
      options,
      current: me.abilityTargetId ?? null,
      submitted: Boolean(me.abilityTargetId),
      locked: seer && Boolean(me.abilityTargetId),
      action: seer ? 'Consultar' : 'Proteger',
      instruction: seer
        ? 'Elige a quién consultar. Solo tú verás el resultado, y solo puedes consultar una vez por noche.'
        : 'Elige a quién proteger esta noche. Puedes protegerte a ti, pero no a la misma persona dos noches seguidas.',
    };
  }

  const mafia = me.role === 'mafia';
  const options = [
    { value: null, label: 'Honesto', disabled: mafia, note: mafia ? 'la mafia elige víctima' : null },
    ...alive
      .filter((p) => p.id !== me.id)
      .map((p) => ({
        value: p.id,
        label: p.name,
        disabled: !mafia || partners.has(p.id),
        note: mafia && partners.has(p.id) ? 'compañero' : null,
      })),
  ];
  const partnerPicks = mafia && classic
    ? Object.entries(me.partnerPicks ?? {}).map(([id, target]) => ({
      name: state.players.find((p) => p.id === id)?.name ?? '¿?',
      target: target ? state.players.find((p) => p.id === target)?.name ?? '¿?' : null,
    }))
    : [];
  return {
    kind: 'ballot',
    options,
    current: me.ballotSubmitted ? me.ballotTargetId : undefined,
    submitted: Boolean(me.ballotSubmitted),
    locked: false,
    action: 'Entregar papeleta',
    instruction: mafia
      ? 'Elige a tu víctima. Solo muere si todos los mafiosos vivos eligen a la misma persona.'
      : 'Marca «Honesto» y entrega tu papeleta.',
    partnerPicks,
  };
}

/** Living players this player may accuse (everyone alive but themself). */
export function accuseOptions(state) {
  if (!state.me?.alive) return [];
  return state.players.filter((p) => p.alive && p.id !== state.me.id);
}

/** What the player sees about the current vote. */
export function voteView(state) {
  const { vote, me } = state;
  if (!vote) return null;
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '¿?';
  const accused = nameOf(vote.accusedId);
  return {
    accused,
    accuser: nameOf(vote.accuserId),
    open: vote.status === 'open',
    isAccused: me?.id === vote.accusedId,
    canVote: Boolean(me?.alive) && me?.id !== vote.accusedId && vote.status === 'open',
    myVote: me?.vote ?? null,
    progress: `Han votado ${vote.votedCount} de ${vote.eligibleCount}. Se necesitan ${vote.required} votos «culpable».`,
    result: vote.result
      ? {
        passed: vote.result.passed,
        text: vote.result.passed
          ? `${accused} queda eliminado si el narrador lo confirma: ${vote.result.guiltyCount} votos «culpable» de ${vote.eligibleCount}.`
          : `${accused} se salva: ${vote.result.guiltyCount} votos «culpable» de ${vote.eligibleCount} (se necesitaban ${vote.required}).`,
        guiltyVoters: vote.result.guiltyVoterIds.map(nameOf),
      }
      : null,
  };
}

/** End-of-game message from the player's point of view. */
export function endMessage(state) {
  if (state.phase !== 'ended') return null;
  if (state.winner === 'none') return 'La partida terminó sin ganador.';
  const won = state.me?.team === state.winner;
  return won ? '¡Tu equipo ganó!' : 'Tu equipo perdió esta vez.';
}
