// Rules shown in both screens: a short summary and the full version for the modal.
// Written in our own words; credit to Dmitri Davýdov, creator of the game.

export const RULES_CREDIT =
  'Mafia fue creado por Dmitri Davýdov, psicólogo y entonces estudiante de la Universidad Estatal de Moscú. ' +
  'Lo concibió en 1986 y la primera partida documentada es de 1987. Este proyecto no reclama ningún derecho sobre el juego.';

export const RULES_SUMMARY = [
  'Dos equipos: Honestos y Mafia. Al empezar, cada quien ve su rol en privado; los mafiosos se reconocen entre sí.',
  'De día se discute libremente. Cualquiera puede acusar y pedir votación: si vota «culpable» la mayoría de los vivos sin contar al acusado, queda eliminado.',
  'Los eliminados no revelan su rol. Puede haber varias eliminaciones en un mismo día.',
  'La noche se convoca por mayoría. Todos entregan papeleta: los honestos marcan «Honesto» y los mafiosos eligen víctima.',
  'La víctima muere solo si todos los mafiosos vivos eligen a la misma persona. El número de papeletas de mafia se anuncia.',
  'Ganan los Honestos si no queda ningún mafioso; gana la Mafia si no queda ningún honesto.',
];

export const RULES_FULL = [
  {
    title: 'Jugadores y equipos',
    items: [
      'Se necesitan al menos 6 jugadores y un narrador, que no juega.',
      'Hay dos equipos: Honestos y Mafia. En el modo original no hay roles especiales.',
      'Mafiosos recomendados: 6–7 jugadores → 2; 8–10 → 3; 11–13 → 4; 14–16 → 5. El narrador puede ajustarlo antes de empezar, siempre con menos mafiosos que honestos.',
    ],
  },
  {
    title: 'Amanecer',
    items: [
      'Cada jugador mira su rol en su teléfono, sin que lo vean los demás.',
      'Los mafiosos ven quiénes son sus compañeros. Es su única ventaja.',
    ],
  },
  {
    title: 'Día',
    items: [
      'La discusión es libre. Cualquiera puede acusar a otro en cualquier momento y el acusado puede defenderse.',
      'Cuando alguien pide votación, el narrador la abre. Votan los vivos, salvo el acusado.',
      'El acusado queda eliminado si vota «culpable» más de la mitad de los vivos sin contarlo a él. No votar cuenta como «no culpable».',
      'Puede haber varias acusaciones y eliminaciones en un mismo día.',
      'Los eliminados no revelan su rol hasta el final y ya no pueden ayudar a nadie.',
    ],
  },
  {
    title: 'Noche',
    items: [
      'La noche es opcional: se convoca cuando la pide la mayoría de los vivos.',
      'Cada vivo entrega una papeleta en secreto: los honestos marcan «Honesto» y cada mafioso escribe el nombre de una víctima.',
      'La víctima muere solo si todos los mafiosos vivos eligen a la misma persona. Si queda un solo mafioso, su elección basta.',
      'Al amanecer se anuncia quién murió y cuántas papeletas de mafia hubo, lo que revela cuántos mafiosos siguen vivos.',
    ],
  },
  {
    title: 'Victoria',
    items: [
      'Ganan los Honestos cuando no queda ningún mafioso vivo.',
      'Gana la Mafia cuando no queda ningún honesto vivo.',
    ],
  },
  {
    title: 'Puntuación (opcional)',
    items: [
      'Si gana la Mafia, cada mafioso vivo suma tantos puntos como honestos había al empezar.',
      'Si ganan los Honestos, cada honesto vivo suma tantos puntos como honestos sobrevivieron.',
      'Con «Nueva partida con los mismos jugadores» los puntos se acumulan.',
    ],
  },
];

export const CLASSIC_RULES = {
  title: 'Variante «Clásico con roles» (no forma parte del original)',
  note: 'Adaptación posterior inspirada en Werewolf (Andrew Plotkin, 1997). Se activa al crear la sala.',
  items: [
    'Hay noche en cada ronda, sin necesidad de votarla.',
    'Los mafiosos ven en vivo lo que eligen sus compañeros, pero la víctima sigue necesitando unanimidad.',
    'Vidente: cada noche consulta a un jugador y descubre en privado si es de la Mafia o Honesto.',
    'Doctor: cada noche protege a un jugador (puede ser él mismo, pero no al mismo dos noches seguidas). Si protege a la víctima, nadie muere.',
    'No se anuncia el número de papeletas de mafia.',
  ],
};
