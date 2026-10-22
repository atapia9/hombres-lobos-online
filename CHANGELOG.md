# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

## [0.1.0] - 2026-10-21

### Added

- **Reglas del modo original de Davýdov** en `server/game/`:
  - tabla de mafiosos y reparto aleatorio con `crypto.randomInt`;
  - votación por mayoría de los vivos sin contar al acusado;
  - noche convocada por mayoría y víctima por unanimidad de la mafia;
  - anuncio de las papeletas de mafia, victoria sin regla de paridad y puntuación;
  - nueva partida con puntuación acumulada.
- **Variante «Clásico con roles»** (no original): Vidente y Doctor.
- **Vistas por destinatario** (`publicView`, `playerView`, `narratorView`), con pruebas que impiden filtrar roles.
- **Resumen final** en Markdown y en texto para WhatsApp, con la frase de cierre y el crédito al autor.
- **Servidor** con Express 5 y Socket.IO 4.8:
  - validación de entradas, límite de frecuencia, comprobación de `Origin` y cabeceras de Helmet;
  - reconexión con token, reemplazo de la pestaña anterior y recuperación de asiento aprobada por el narrador.
- **Pantalla del narrador:**
  - sala con código, enlace y QR, y lobby;
  - control de fases, temporizador, votos en vivo y papeletas;
  - registro por ronda;
  - resumen con «Copiar», «Descargar .md» e imagen PNG.
- **Pantalla del jugador:**
  - unirse sin cuenta y rol privado tapado por defecto;
  - acciones del día y papeleta nocturna con el mismo aspecto para todos;
  - reconexión al cerrar la pestaña.
- **Reglas en ambas pantallas:** resumen y modal completo.
- **Bots** de desarrollo (`npm run bots`).
- **GitHub Actions:** pruebas en cada push y despliegue del cliente en GitHub Pages.
- **Render:** Blueprint para desplegar el servidor (`render.yaml`).
- **Documentación:** README, reglas, arquitectura, despliegue, historia y decisiones (ADR).

[Unreleased]: https://github.com/atapia9/mafia-online/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/atapia9/mafia-online/releases/tag/v0.1.0
