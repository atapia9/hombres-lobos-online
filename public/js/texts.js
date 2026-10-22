// User-facing texts (the interface is in Spanish). Shared by both screens.

export const PHASE_LABELS = {
  lobby: 'Sala de espera',
  start: 'Inicio',
  night: 'Noche',
  dawn: 'Amanecer',
  day: 'Día',
  ended: 'Fin de la partida',
};

export const ROLE_LABELS = {
  villager: 'Aldeano',
  seer: 'Vidente',
  protector: 'Protector',
  hunter: 'Cazador',
  mayor: 'Alcalde',
  spy: 'Niña que espía',
  witch: 'Bruja',
  wolf: 'Lobo',
  alpha: 'Lobo alfa',
};

/** One line per role, for the lobby configurator and the rules. */
export const ROLE_HINTS = {
  villager: 'Sin habilidad. Vota durante el día.',
  seer: 'Cada noche consulta a un jugador y sabe si es lobo.',
  protector: 'Cada noche protege a alguien de los lobos; nunca a la misma persona dos noches seguidas.',
  hunter: 'Si muere, se lleva a otro jugador con él.',
  mayor: 'Su voto vale doble; puede desempatar si lo activas.',
  spy: 'Ve a quién eligieron los lobos, pero no quiénes son.',
  witch: 'Una poción de vida y una de muerte, una vez cada una.',
  wolf: 'Elige víctima con la manada cada noche.',
  alpha: 'Una vez por partida convierte a la víctima en lobo.',
};

/** Order of the role switches in the lobby. */
export const OPTIONAL_ROLE_ORDER = ['seer', 'protector', 'witch', 'hunter', 'mayor', 'spy', 'alpha'];

export const WOLF_ROLES = new Set(['wolf', 'alpha']);
export const teamOfRole = (role) => (WOLF_ROLES.has(role) ? 'wolves' : 'village');

export const TEAM_LABELS = {
  village: 'Aldeanos',
  wolves: 'Lobos',
};

export const WINNER_LABELS = {
  village: 'Ganan los Aldeanos',
  wolves: 'Ganan los Lobos',
  none: 'Partida terminada sin ganador',
};

/** Causes are only known to the narrator (the public view hides them). */
export const CAUSE_LABELS = {
  wolves: 'devorado por los lobos',
  poison: 'envenenado por la Bruja',
  vote: 'eliminado por votación',
  hunter: 'abatido por el Cazador',
  narrator: 'retirado por el narrador',
};

export const NIGHT_STEP_LABELS = {
  seer: 'Turno de la Vidente',
  protector: 'Turno del Protector',
  wolves: 'Turno de los lobos',
  alpha: 'Decisión del Lobo alfa',
  witch: 'Turno de la Bruja',
  done: 'Noche terminada',
};

export const CREDIT_LINE =
  'Adaptación propia de la familia de juegos Mafia, creada por Dmitri Davýdov (1986–1987), y de su variante Werewolf, de Andrew Plotkin (1997).';

export const AI_NOTE = 'Este material fue elaborado con asistencia de Claude (Anthropic).';

const ERRORS = {
  ROOM_NOT_FOUND: 'No existe ninguna sala con ese código. Revisa que esté bien escrito.',
  NAME_INVALID: 'Escribe un nombre de 1 a 20 caracteres: letras, números o emoji.',
  NAME_TAKEN: 'Ya hay alguien con ese nombre en la sala. Elige otro.',
  ROOM_FULL: 'La sala está llena (máximo 18 jugadores).',
  GAME_IN_PROGRESS: 'La partida ya empezó y no hay ningún asiento libre con ese nombre.',
  SEAT_TAKEN: 'Ese asiento está en uso desde otro dispositivo.',
  TOO_MANY_CLAIMS: 'Hay demasiadas solicitudes pendientes. Avisa al narrador.',
  ALREADY_JOINED: 'Ya estás en esta sala.',
  INVALID_TOKEN: 'Tu sesión anterior ya no es válida.',
  NOT_ENOUGH_PLAYERS: 'Se necesitan al menos 6 jugadores para empezar.',
  TOO_MANY_PLAYERS: 'El máximo es de 18 jugadores.',
  INVALID_WOLF_COUNT: 'Ese número de lobos no es válido.',
  NO_WOLVES: 'Tiene que haber al menos un lobo.',
  TOO_MANY_WOLVES: 'Demasiados lobos: el máximo es un tercio de los jugadores (redondeado hacia arriba).',
  TOO_MANY_ROLES: 'Hay más roles que jugadores. Desactiva algún rol o quita lobos.',
  FEW_WOLVES: 'Pocos lobos para tantos jugadores: la aldea lo tendrá fácil.',
  NIGHT_IN_PROGRESS: 'La noche no ha terminado: faltan turnos por jugar o saltar.',
  NIGHT_DONE: 'La noche ya terminó.',
  STEP_CHANGED: 'El turno de la noche ya cambió. Revisa la pantalla.',
  WRONG_STEP: 'Eso no corresponde al turno actual de la noche.',
  NOT_YOUR_TURN: 'Todavía no es tu turno.',
  ALREADY_ACTED: 'Ya actuaste en este turno.',
  HUNTER_PENDING: 'Primero tiene que disparar el Cazador (o el narrador omitir el disparo).',
  NO_PENDING_SHOT: 'No hay ningún disparo pendiente.',
  PROTECTOR_REPEAT: 'No puedes proteger a la misma persona dos noches seguidas.',
  POTION_UNAVAILABLE: 'Esa poción no está disponible.',
  VOTE_IN_PROGRESS: 'Primero termina la votación en curso.',
  VOTE_CLOSED: 'La votación de hoy ya está cerrada.',
  VOTE_ALREADY_HELD: 'Hoy ya hubo votación. Pasa a la noche.',
  NO_ACCUSATIONS: 'Nadie ha sido acusado todavía.',
  NO_ACTIVE_VOTE: 'No hay ninguna votación abierta.',
  CANNOT_VOTE_SELF: 'No puedes votar contra ti.',
  VOTE_NOT_CLOSED: 'Primero cierra la votación.',
  PLAYER_DEAD: 'Los eliminados ya no participan.',
  TARGET_INVALID: 'No puedes elegir a esa persona.',
  WRONG_PHASE: 'Esa acción no está disponible en esta fase.',
  INVALID_TRANSITION: 'No se puede pasar a esa fase ahora.',
  RATE_LIMITED: 'Demasiadas acciones seguidas. Espera un momento.',
  SERVER_FULL: 'El servidor no admite más salas por ahora. Inténtalo más tarde.',
  CLAIM_EXPIRED: 'La persona que pedía el asiento ya se desconectó.',
  UNKNOWN_ACCUSATION: 'Esa acusación ya no existe.',
  UNKNOWN_CLAIM: 'Esa solicitud ya no existe.',
  UNKNOWN_PLAYER: 'Ese jugador ya no está en la sala.',
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
