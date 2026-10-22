// Pure helpers for the player screen (no DOM), unit-tested in Node.
// `state` is the merged player state: the public view plus `me` (own secrets only).

import { ROLE_LABELS, TEAM_LABELS, WOLF_ROLES } from './texts.js';

export const ROOM_CODE_INPUT = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** Cleans what the player typed in the code field. Returns the code or null. */
export function parseRoomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return ROOM_CODE_INPUT.test(code) ? code : null;
}

const ROLE_TEXTS = {
  villager: 'Eres Aldeano. No tienes habilidad nocturna: escucha, deduce y vota de día para descubrir a los lobos.',
  seer: 'Eres la Vidente, de los Aldeanos. Cada noche consultas a un jugador y sabes si es lobo.',
  protector: 'Eres el Protector, de los Aldeanos. Cada noche proteges a alguien de los lobos. No puedes repetir persona dos noches seguidas.',
  hunter: 'Eres el Cazador, de los Aldeanos. Si mueres, de noche o por votación, eliges a alguien que muere contigo.',
  mayor: 'Eres el Alcalde, de los Aldeanos. Tu voto vale doble. Nadie más lo sabe.',
  spy: 'Eres la Niña que espía, de los Aldeanos. Cada noche sabrás a quién eligieron los lobos, pero no quiénes son.',
  witch: 'Eres la Bruja, de los Aldeanos. Tienes una poción de vida y una de muerte, de un solo uso cada una.',
  wolf: 'Eres Lobo. Cada noche eliges víctima con la manada: solo muere si todos los lobos vivos coinciden.',
  alpha: 'Eres el Lobo alfa. Votas con la manada y, una vez por partida, puedes convertir a la víctima en lobo.',
};

/** What the hidden role card shows. Null before the game starts. */
export function roleCard(state) {
  const { me } = state;
  if (!me?.role) return null;
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '¿?';
  const lines = [ROLE_TEXTS[me.role]];

  if (me.originalRole) {
    lines.unshift(`El Lobo alfa te convirtió en la noche ${me.convertedRound}: antes eras ${ROLE_LABELS[me.originalRole]}. Ahora juegas con los Lobos.`);
  }
  if (WOLF_ROLES.has(me.role)) {
    const partners = (me.partnerIds ?? []).map((id) => (id === me.alphaId ? `${nameOf(id)} (alfa)` : nameOf(id)));
    lines.push(partners.length ? `Tu manada: ${partners.join(', ')}.` : 'Eres el único lobo de la partida.');
  }
  if (me.role === 'alpha') lines.push(me.alphaUsed ? 'Ya usaste tu conversión.' : 'Tu conversión sigue disponible.');
  if (me.role === 'seer') {
    const results = (me.seerResults ?? []).map((r) => `Noche ${r.round}: ${nameOf(r.targetId)} ${r.isWolf ? 'ES lobo' : 'no es lobo'}.`);
    lines.push(...(results.length ? results : ['Todavía no has consultado a nadie.']));
  }
  if (me.role === 'protector' && me.protectorLastTargetId) {
    lines.push(`Anoche protegiste a ${nameOf(me.protectorLastTargetId)}: esta noche no puedes repetir.`);
  }
  if (me.role === 'spy') {
    const reports = (me.spyReports ?? []).map((r) => (r.targetId
      ? `Noche ${r.round}: los lobos eligieron a ${nameOf(r.targetId)}.`
      : `Noche ${r.round}: los lobos no se pusieron de acuerdo.`));
    lines.push(...(reports.length ? reports : ['Todavía no has espiado ninguna noche.']));
  }
  if (me.role === 'witch' && me.potions) {
    const left = [me.potions.heal ? 'vida' : null, me.potions.poison ? 'muerte' : null].filter(Boolean);
    lines.push(left.length ? `Pociones disponibles: ${left.join(' y ')}.` : 'Ya usaste tus dos pociones.');
  }
  return { title: ROLE_LABELS[me.role], team: TEAM_LABELS[me.team], role: me.role, lines };
}

/**
 * What the night panel shows. Every player gets the same covered card, so
 * nobody can tell from across the table who has an action (kind 'wait').
 */
export function nightPanel(state) {
  const { me } = state;
  if (!me?.alive) return { kind: 'dead', instruction: 'Estás fuera de la partida. Espera al amanecer.' };
  const night = me.night;
  if (!night?.turn) {
    return { kind: 'wait', instruction: 'Esperando. Mantén los ojos cerrados (o la vista en tu pantalla) hasta que amanezca.' };
  }
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '¿?';
  const alive = state.players.filter((p) => p.alive);
  const option = (p, extra = {}) => ({ value: p.id, label: p.id === me.id ? `${p.name} (tú)` : p.name, disabled: false, note: null, ...extra });

  switch (night.step) {
    case 'seer':
      return {
        kind: 'seer',
        title: 'Consulta de la Vidente',
        instruction: 'Elige a quién consultar. Solo tú verás si es lobo.',
        action: 'Consultar',
        options: alive.filter((p) => p.id !== me.id).map((p) => option(p)),
      };
    case 'protector':
      return {
        kind: 'protector',
        title: 'Protección',
        instruction: 'Elige a quién proteger de los lobos esta noche. Puedes protegerte, pero no repetir a la persona de anoche.',
        action: 'Proteger',
        options: alive.map((p) => option(p, p.id === me.protectorLastTargetId
          ? { disabled: true, note: 'protegido anoche' }
          : {})),
      };
    case 'wolves': {
      const partners = new Set(me.partnerIds ?? []);
      const picks = Object.entries(night.wolfPicks ?? {})
        .filter(([id]) => id !== me.id)
        .map(([id, target]) => ({ name: nameOf(id), target: target ? nameOf(target) : null }));
      return {
        kind: 'wolves',
        title: 'Víctima de la manada',
        instruction: 'Elige a tu víctima. Solo muere si todos los lobos vivos eligen a la misma persona. Puedes cambiar mientras tanto.',
        action: 'Elegir víctima',
        options: alive.filter((p) => p.id !== me.id && !partners.has(p.id)).map((p) => option(p)),
        current: night.wolfPicks?.[me.id] ?? null,
        partnerPicks: picks,
        disagree: Boolean(night.wolvesDisagree),
      };
    }
    case 'alpha':
      return {
        kind: 'alpha',
        title: 'Decisión del Lobo alfa',
        instruction: `La manada eligió a ${nameOf(night.wolfTargetId)}. ¿Lo conviertes en lobo en lugar de matarlo? Solo puedes hacerlo una vez.`,
        targetName: nameOf(night.wolfTargetId),
      };
    case 'witch':
      return {
        kind: 'witch',
        title: 'Pociones de la Bruja',
        instruction: night.victimId
          ? `Esta noche los lobos atacaron a ${nameOf(night.victimId)}.`
          : 'Esta noche no hay ninguna víctima de los lobos.',
        victimName: night.victimId ? nameOf(night.victimId) : null,
        canHeal: Boolean(me.potions?.heal && night.victimId),
        canPoison: Boolean(me.potions?.poison),
        poisonOptions: alive.filter((p) => p.id !== me.id).map((p) => option(p)),
      };
    default:
      return { kind: 'wait', instruction: 'Esperando.' };
  }
}

/** Living players this player may accuse (everyone alive but themself). */
export function accuseOptions(state) {
  if (!state.me?.alive) return [];
  return state.players.filter((p) => p.alive && p.id !== state.me.id);
}

/** What the player sees about the current vote (D-6, option A). */
export function voteView(state) {
  const { vote, me } = state;
  if (!vote) return null;
  const nameOf = (id) => state.players.find((p) => p.id === id)?.name ?? '¿?';
  const out = {
    open: vote.status === 'open',
    candidates: vote.candidateIds.map((id) => ({ id, name: nameOf(id), isMe: id === me?.id })),
    canVote: Boolean(me?.alive) && vote.status === 'open',
    myBallot: me?.ballot ?? null, // { targetId } | null
    progress: `Han votado ${vote.votedCount} de ${vote.eligibleCount}.`,
    result: null,
  };
  if (vote.result) {
    const r = vote.result;
    let text;
    if (r.eliminatedId) {
      text = `${nameOf(r.eliminatedId)} sale de la aldea si el narrador lo confirma${r.tieBrokenByMayor ? ' (desempate del Alcalde)' : ''}.`;
    } else {
      text = r.tie ? 'Empate: nadie sale.' : 'Nadie recibió votos: nadie sale.';
    }
    out.result = {
      text,
      voters: r.votersByCandidate
        ? Object.entries(r.votersByCandidate).map(([id, voters]) => ({ name: nameOf(id), voters: voters.map(nameOf) }))
        : null,
    };
  }
  return out;
}

/** The hunter's shot, for the player who must take it. Null otherwise. */
export function hunterPanel(state) {
  if (!state.me?.mustShoot) return null;
  return {
    instruction: 'Has muerto, pero eres el Cazador: elige a quién te llevas contigo.',
    options: state.players.filter((p) => p.alive && p.id !== state.me.id).map((p) => ({ value: p.id, label: p.name })),
  };
}

/** End-of-game message from the player's point of view. */
export function endMessage(state) {
  if (state.phase !== 'ended') return null;
  if (state.winner === 'none') return 'La partida terminó sin ganador.';
  const won = state.me?.team === state.winner;
  return won ? '¡Tu equipo ganó!' : 'Tu equipo perdió esta vez.';
}
