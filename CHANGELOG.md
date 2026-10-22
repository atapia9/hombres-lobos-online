# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [0.1.0] - 2026-10-22

Primera versión de Hombres Lobos Online, a partir de una copia de [`mafia-online`](https://github.com/atapia9/mafia-online) v0.1.0.

### Added

- **Motor de reglas puro** en `server/game/`:
  - composición configurable de 6 a 18 jugadores, con validación (D-10) y reparto con `crypto.randomInt`;
  - un módulo por rol en `server/game/roles/`: Aldeano, Vidente, Protector, Cazador, Alcalde, Niña que espía, Bruja, Lobo y Lobo alfa;
  - noche en orden fijo (Vidente → Protector → Lobos → Lobo alfa → Bruja), con salto silencioso de los pasos sin actores;
  - víctima de los lobos por unanimidad, con revotación o «sin víctima» decidida por el narrador;
  - votación del día entre acusados, por mayoría relativa, con voto doble y desempate opcional del Alcalde;
  - disparo del Cazador al amanecer o tras la votación;
  - victoria de los lobos por paridad.
- **Eventos de Socket.IO** para la noche (`night:act`, `night:skipStep`, `night:wolvesRevote`) y el Cazador (`hunter:shoot`, `hunter:skip`).
- **Pantalla del narrador:** configurador de roles, pasos de la noche con vista previa del amanecer, controles del Cazador y votación con totales ponderados.
- **Pantalla del jugador:** panel nocturno cubierto e idéntico para todos, formularios por rol, disparo del Cazador y voto entre acusados.
- **Resumen final** con roles revelados, eliminaciones y habilidades por ronda, frase de cierre y crédito a Davýdov y Plotkin.
- **Documentación:** reglas, catálogo de roles, historia de la familia de juegos y registro de decisiones (D-1 a D-14).
- **Pruebas:** 218 pruebas, con una partida completa por Socket.IO y comprobaciones de que ningún secreto llega a quien no le corresponde.

### Changed

- Respecto a `mafia-online`: se retiraron los modos «Original» y «Clásico», la noche convocada por mayoría, las papeletas de todos los jugadores y la puntuación. El máximo de jugadores pasa de 20 a 18.

[Unreleased]: https://github.com/atapia9/hombres-lobos-online/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/atapia9/hombres-lobos-online/releases/tag/v0.1.0
