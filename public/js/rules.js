// Rules shown in both screens: a short summary and the full version for the modal.
// Written in our own words for this adaptation (docs/reglas.md is the reference).

export const RULES_CREDIT =
  'Hombres Lobos Online es una adaptación propia, no el juego original. La familia de juegos nace con Mafia, ' +
  'de Dmitri Davýdov, psicólogo y entonces estudiante de la Universidad Estatal de Moscú: lo concibió en 1986 ' +
  'y la primera partida documentada es de 1987. Andrew Plotkin creó la variante Werewolf en 1997. ' +
  'Los roles especiales y las reglas de esta versión son propios; el proyecto no reclama ningún derecho sobre esos juegos.';

export const RULES_SUMMARY = [
  'Dos equipos: Aldeanos y Lobos. Cada quien ve su rol en privado; los lobos se reconocen entre sí.',
  'Cada noche actúan en orden: Vidente, Protector, Lobos (y el Lobo alfa) y Bruja.',
  'La víctima de los lobos muere solo si todos los lobos vivos eligen a la misma persona.',
  'Al amanecer se anuncia quién murió, sin revelar su rol.',
  'De día se discute y se acusa. En la votación, cada vivo marca a uno de los acusados; sale el más votado. Empate: nadie sale.',
  'Ganan los Aldeanos si no queda ningún lobo; ganan los Lobos si igualan o superan en número a los demás.',
];

export const RULES_FULL = [
  {
    title: 'Jugadores y equipos',
    items: [
      'De 6 a 18 jugadores (lo ideal son 8–12) y un narrador, que no juega.',
      'Aldeanos contra Lobos. El narrador elige qué roles especiales entran; el resto son Aldeanos.',
      'Lobos recomendados: un tercio de la mesa. Como máximo, un tercio redondeado hacia arriba.',
    ],
  },
  {
    title: 'Inicio',
    items: [
      'Cada jugador mira su rol en su teléfono, sin que lo vean los demás.',
      'Los lobos ven quiénes son sus compañeros y quién es el Lobo alfa.',
    ],
  },
  {
    title: 'Noche (orden fijo)',
    items: [
      '1. Vidente: consulta a un jugador y sabe si es lobo o no.',
      '2. Protector: protege a alguien de los lobos. No puede elegir a la misma persona dos noches seguidas (tampoco a sí mismo).',
      '3. Lobos: eligen víctima. Muere solo si todos los lobos vivos coinciden; si queda uno, su elección basta. Si no se ponen de acuerdo, el narrador les pide votar de nuevo o declara que no hay víctima.',
      '3b. Lobo alfa: una vez por partida puede convertir a la víctima en lobo en lugar de matarla. Si la víctima estaba protegida, no hay conversión y no gasta su uso.',
      '4. Bruja: ve a la víctima (si la hay) y puede salvarla con su poción de vida, o matar a alguien con su poción de muerte. Cada poción sirve una sola vez.',
    ],
  },
  {
    title: 'Amanecer',
    items: [
      'El narrador anuncia quién murió durante la noche. No se revela el rol (salvo que el narrador lo active).',
      'Si murió el Cazador, dispara ahora: elige a otro jugador, que muere con él.',
    ],
  },
  {
    title: 'Día',
    items: [
      'Discusión libre, con temporizador opcional. Cualquiera puede acusar a otro jugador.',
      'El narrador abre la votación entre los acusados. Cada vivo marca a uno (nunca a sí mismo) o se abstiene.',
      'Sale quien tenga más votos. El voto del Alcalde vale doble. Empate: nadie sale, salvo que el Alcalde desempate (opción del narrador).',
      'El narrador confirma el resultado. Solo hay una eliminación por votación al día.',
    ],
  },
  {
    title: 'Roles especiales',
    items: [
      'Cazador: si muere, de noche o por votación, se lleva a otro jugador con él.',
      'Alcalde: rol secreto; su voto cuenta doble.',
      'Niña que espía: tras el turno de los lobos sabe a quién eligieron y si coincidieron, pero no quiénes son.',
      'Bruja: juega con los Aldeanos.',
    ],
  },
  {
    title: 'Victoria',
    items: [
      'Ganan los Aldeanos cuando no queda ningún lobo vivo.',
      'Ganan los Lobos cuando igualan o superan en número a los demás jugadores vivos.',
      'Si hay un disparo del Cazador pendiente, la victoria se decide después del disparo.',
    ],
  },
];
