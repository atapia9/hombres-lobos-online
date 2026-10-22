// User-facing texts (ADR-014: the interface is in Spanish). Shared by both screens.

export const PHASE_LABELS = {
  lobby: 'Sala de espera',
  dawn: 'Amanecer',
  day: 'Día',
  night: 'Noche',
  ended: 'Fin de la partida',
};

export const ROLE_LABELS = {
  mafia: 'Mafioso',
  honest: 'Honesto',
  seer: 'Vidente',
  doctor: 'Doctor',
};

export const TEAM_LABELS = {
  mafia: 'Mafia',
  honest: 'Honestos',
};

export const MODE_LABELS = {
  original: 'Original de Davýdov',
  classic: 'Clásico con roles',
};

export const CLASSIC_NOTE =
  'Variante posterior inspirada en Werewolf (Andrew Plotkin, 1997). No forma parte del juego original.';

export const WINNER_LABELS = {
  honest: 'Ganan los Honestos',
  mafia: 'Gana la Mafia',
  none: 'Partida terminada sin ganador',
};

export const ELIMINATION_LABELS = {
  vote: 'eliminado por votación',
  night: 'muerto por la noche',
  narrator: 'retirado por el narrador',
};

export const CREDIT_LINE = 'Mafia es un juego creado por Dmitri Davýdov (1986–1987).';

const ERRORS = {
  ROOM_NOT_FOUND: 'No existe ninguna sala con ese código. Revisa que esté bien escrito.',
  NAME_INVALID: 'Escribe un nombre de 1 a 20 caracteres: letras, números o emoji.',
  NAME_TAKEN: 'Ya hay alguien con ese nombre en la sala. Elige otro.',
  ROOM_FULL: 'La sala está llena (máximo 20 jugadores).',
  GAME_IN_PROGRESS: 'La partida ya empezó y no hay ningún asiento libre con ese nombre.',
  SEAT_TAKEN: 'Ese asiento está en uso desde otro dispositivo.',
  TOO_MANY_CLAIMS: 'Hay demasiadas solicitudes pendientes. Avisa al narrador.',
  ALREADY_JOINED: 'Ya estás en esta sala.',
  INVALID_TOKEN: 'Tu sesión anterior ya no es válida.',
  NOT_ENOUGH_PLAYERS: 'Se necesitan al menos 6 jugadores para empezar.',
  TOO_MANY_PLAYERS: 'El máximo es de 20 jugadores.',
  INVALID_MAFIA_COUNT: 'Ese número de mafiosos no es válido para esta cantidad de jugadores.',
  NIGHT_NOT_REQUESTED: 'Todavía no la pide la mayoría de los vivos.',
  VOTE_IN_PROGRESS: 'Primero termina la votación en curso.',
  VOTE_CLOSED: 'La votación ya está cerrada.',
  NO_ACTIVE_VOTE: 'No hay ninguna votación abierta.',
  CANNOT_VOTE: 'La persona acusada no vota.',
  PLAYER_DEAD: 'Los eliminados ya no participan.',
  TARGET_INVALID: 'No puedes elegir a esa persona.',
  MAFIA_MUST_CHOOSE: 'Como mafioso tienes que elegir una víctima.',
  DOCTOR_REPEAT: 'No puedes proteger a la misma persona dos noches seguidas.',
  ABILITY_USED: 'Ya usaste tu habilidad esta noche.',
  WRONG_PHASE: 'Esa acción no está disponible en esta fase.',
  INVALID_TRANSITION: 'No se puede pasar a esa fase ahora.',
  RATE_LIMITED: 'Demasiadas acciones seguidas. Espera un momento.',
  SERVER_FULL: 'El servidor no admite más salas por ahora. Inténtalo más tarde.',
  CLAIM_EXPIRED: 'La persona que pedía el asiento ya se desconectó.',
  VOTE_NOT_CLOSED: 'Primero cierra la votación.',
  UNKNOWN_ACCUSATION: 'Esa acusación ya no existe.',
  UNKNOWN_CLAIM: 'Esa solicitud ya no existe.',
  UNKNOWN_PLAYER: 'Ese jugador ya no está en la sala.',
  HONEST_CANNOT_CHOOSE: 'Solo puedes entregar «Honesto».',
  USE_ABILITY: 'Usa tu habilidad especial para actuar esta noche.',
  ABILITY_NOT_AVAILABLE: 'No tienes ninguna habilidad especial.',
  NOT_IN_MODE: 'No está disponible en este modo de juego.',
  INVALID_MODE: 'Modo de juego no válido.',
  NOT_IN_ROOM: 'No estás en ninguna sala. Vuelve a entrar con el código.',
  NOT_NARRATOR: 'Solo el narrador puede hacer eso.',
  NOT_PLAYER: 'Solo los jugadores pueden hacer eso.',
  INVALID_PAYLOAD: 'Los datos enviados no son válidos.',
  UNKNOWN_ACTION: 'Acción desconocida.',
  INTERNAL: 'Error interno del servidor. Inténtalo de nuevo.',
  OFFLINE: 'Sin conexión con el servidor. Reintentando…',
  TIMEOUT: 'El servidor tardó demasiado en responder.',
};

/** Codes with a message, for tests. */
export const KNOWN_ERRORS = Object.keys(ERRORS);

export function errorMessage(code) {
  return ERRORS[code] ?? `No se pudo completar la acción (${code ?? 'error desconocido'}).`;
}
