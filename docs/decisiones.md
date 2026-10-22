# Registro de decisiones (ADR) — Hombres Lobos Online

> Estado: **APROBADO** el 2026-10-21: D-1 a D-14 con las opciones propuestas (D-6, opción A; D-14, conservar el historial). Repositorio público con licencia MIT.
> Fecha: 2026-10-21 · Implementado en la versión 0.1.0.

Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre].

---

## Base: copia de `atapia9/mafia-online`

Este proyecto parte de una **copia** de `mafia-online` (30 commits, v0.1.0). La copia se clonó y se le **quitó el remoto `origin`**, así que ningún `push` puede llegar al repo de Mafia. El repo de Mafia no se modifica.

Qué se reutiliza casi tal cual y qué se adapta:

| Pieza de Mafia | Destino en Hombres Lobos | Cambio |
|---|---|---|
| `server/app.js`, `index.js`, `config.js`, `security.js`, `rooms.js` | igual | Renombrar textos; `MAX_PLAYERS` 20 → 18 |
| `server/net/handlers.js`, `validate.js`, `rateLimit.js` | igual | Nuevos eventos: acciones por paso de la noche, pociones, disparo del Cazador, conversión del alfa |
| `server/game/game.js` (reductor) | `server/game/engine.js` | Fases y ciclo; añade pasos de noche y estados pendientes (disparo del Cazador) |
| `server/game/night.js` (noche simultánea) | `server/game/night.js` | **Reescritura**: noche en orden fijo Vidente → Protector → Lobos → Bruja |
| `server/game/roles.js` (Mafia, honrado, vidente, doctor) | `server/game/roles/*.js` + `setup.js` | Un módulo por rol; composición configurable en vez de modos ORIGINAL/CLASSIC |
| `server/game/day.js` (acusación + veredicto por mayoría) | `server/game/day.js` | Según D-6; Alcalde vale 2 |
| `server/game/victory.js` (sin regla de paridad, con puntuación) | `server/game/victory.js` | Lobos ganan con **paridad**; se quita la puntuación |
| `server/game/views.js` (vista por destinatario) | igual | Nuevas vistas privadas: vidente, protector, bruja, niña, canal de lobos |
| `server/game/summary.js` + `public/js/summary-image.js` | igual | Roles, habilidades usadas, frase de cierre; Markdown + WhatsApp + canvas |
| `public/` (narrador, jugador, QR con `uqr`, reglas, reconexión por token) | igual | Textos, temática, acciones por rol, configurador de roles |
| `tests/` (unitarias, integración, `leaks.js` anti-fugas) | igual | Ampliar a cada rol; mantener la prueba de fugas |
| `.github/workflows/ci.yml`, `pages.yml`, `render.yaml` | igual | Renombrar servicio y URLs |
| `docs/historia.md` | igual | Añadir Werewolf (Plotkin, 1997) y esta adaptación |
| `docs/decisiones.md` de Mafia | se **reemplaza** por este documento | — |

Consecuencia: varios ADR de abajo ya están resueltos en el código copiado (seguridad, reconexión por token, vistas sin fugas, QR, CI). Se conservan y solo se ajustan.

---

## 0. Verificación del entorno (hecha el 2026-10-21)

| Elemento | Encontrado | Fuente |
|---|---|---|
| Node instalado | v24.14.0 | `node --version` |
| Node LTS actual | **v24.22.1 "Krypton"** (Node 26 aún no es LTS) | nodejs.org/dist/index.json |
| npm | 11.9.0 | `npm --version` |
| GitHub CLI | 2.101.0, sesión iniciada como `atapia9` | `gh auth status` |
| socket.io / socket.io-client | 4.8.4 (requiere Node ≥ 10.2) | npm registry |
| express | 5.3.0 | npm registry |
| Acciones de Pages | `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`, `checkout@v7`, `setup-node@v7` | releases en GitHub |

Notas:
- Recomiendo actualizar Node local a 24.22.x (mismo LTS, parches de seguridad). El CI usará `node-version: 24`.
- La guía de GitHub Pages todavía muestra `upload-pages-artifact@v4` / `deploy-pages@v4` en sus ejemplos, pero ya existen v5. Usaré la versión mayor más reciente y revisaré sus notas de cambio antes de escribir `pages.yml`.
- API de Socket.IO v4 confirmada en la documentación oficial (server-api, rooms): `io.use`, `socket.use`, `socket.join`, `socket.leave`, `socket.data`, `io.to(room).emit`, `socket.emit`, `io.fetchSockets`. Solo usaré estos.

---

## ADR-001 — Arquitectura general

- **Motor puro** en `server/game/`: funciones sin E/S que reciben un estado y una acción y devuelven un estado nuevo más una lista de eventos (`{ state, events }`). No conoce Socket.IO. Toda la aleatoriedad se inyecta (`rng`), así las pruebas son deterministas y en producción se usa `crypto.randomInt`.
- **Capa de red** en `server/index.js` + `server/net/`: Express 5 sirve `public/`, Socket.IO 4.8 recibe intenciones, las valida, llama al motor y envía a cada destinatario **su propia vista** del estado (pública / jugador concreto / narrador).
- **Cliente** vanilla en módulos ES. `public/config.js` define `SERVER_URL`; se puede sobrescribir con `?server=https://...`.

```
cliente ──intención──▶ validación + rate limit ──▶ motor puro ──▶ estado nuevo
                                                                  │
   ◀── state:private (me) / state:public (sala) / state:narrator ◀┘
        playerView          publicView           narratorView
```

## ADR-002 — Visibilidad de la información (seguridad)

Lo que sale del servidor se construye **solo** con tres funciones de proyección de `server/game/views.js`: `publicView` (toda la sala), `playerView` (un jugador: la vista pública más su `me`) y `narratorView` (todo). `server/net/handlers.js` envía cada una a su destinatario. Así es imposible mandar por error un dato que la proyección no incluye. Reglas:
- El rol de un jugador solo se envía a su propio socket.
- El resultado de la vidente, la protección y las pociones solo se envían a su dueño (y al narrador).
- El estado público (`publicView(state)`) se construye con una función de proyección que nunca incluye roles, salvo los revelados por configuración o al final.
- Una prueba automática verifica, en una partida completa, que ningún socket de jugador recibe datos secretos ajenos.

## ADR-003 — Identidad y reconexión

- Al unirse, el servidor genera un `playerToken` aleatorio de 128 bits (`crypto.randomBytes`, en `server/security.js`) que el cliente guarda en el navegador junto con el código de sala.
- Para reconectar: código de sala + token → se recupera rol y estado. Sin token, el nombre por sí solo **no** recupera la sesión (evita suplantación); el narrador puede reasignar un jugador desconectado a un nuevo dispositivo.
- El narrador tiene su propio `narratorToken`.
- No uso `connectionStateRecovery` de Socket.IO: el estado se reenvía completo al reconectar, lo cual es más simple y robusto con salas en memoria.

## ADR-004 — Validación y límite de frecuencia

- Validación manual de cada carga útil (tipos, longitudes, ids existentes, fase correcta, jugador vivo, rol correcto). Nombres: 1–20 caracteres, recortados y escapados al pintarse (`textContent`, nunca `innerHTML`).
- Límite de frecuencia: cubeta de fichas por socket implementada con `socket.use` (sin dependencia extra); quien insiste en superarla queda desconectado.
- `helmet` (8.3.0) para cabeceras HTTP y CORS de Socket.IO restringido a `CORS_ORIGIN`.

## ADR-005 — Persistencia

Salas en memoria (`Map`), con limpieza de salas inactivas tras 6 h. Limitaciones documentadas: se pierden al reiniciar y no escalan a varias instancias. Mejora futura: SQLite (una instancia) o Redis + `@socket.io/redis-adapter` (varias instancias).

## ADR-006 — Pruebas

- `node --test` (sin dependencias) para el motor y cada rol.
- Prueba de integración: levanta el servidor en un puerto libre y simula narrador + 6 jugadores con `socket.io-client` hasta terminar una partida.
- Verificación final en navegador con al menos 5 jugadores simulados (pestañas), como pide el flujo.

## ADR-007 — Despliegue

- `ci.yml`: instala, ejecuta pruebas en Node 24 en cada push/PR.
- `pages.yml`: publica `public/` en GitHub Pages con las acciones oficiales.
- Servidor Node: GitHub Pages no ejecuta servidores. Opciones sin costo a evaluar y documentar en `docs/despliegue.md` (verificando sus planes gratuitos vigentes al momento de desplegar). Ninguna se contrata sin tu visto bueno.

## ADR-008 — QR (opcional)

Se reutiliza lo de Mafia: `uqr` empaquetado en `public/vendor/` y generado en el cliente (sin dependencia en el servidor).

## ADR-009 — Hosting del servidor

Se reutiliza `render.yaml` de Mafia (plan gratuito de Render) con otro nombre de servicio. Antes de desplegar verifico que el plan gratuito siga vigente.

---

## Roles de la versión 0.1.0

| Rol | Equipo | Incluido en 0.1.0 |
|---|---|---|
| Aldeano | Aldeanos | Sí |
| Vidente | Aldeanos | Sí |
| Protector | Aldeanos | Sí |
| Cazador | Aldeanos | Sí |
| Alcalde | Aldeanos | Sí |
| Niña que espía | Aldeanos | Sí |
| Lobo | Lobos | Sí |
| Lobo alfa | Lobos | Sí |
| Bruja | ver D-3 | Sí (está en el orden de la noche) |
| Enamorados | modificador | **Propongo 0.2.0** (ver D-8) |

Cada rol es un módulo en `server/game/roles/<rol>.js` con: `id`, `name`, `team`, `nightStep` (o `null`), `validateAction`, `applyAction`, y su prueba en `tests/roles/<rol>.test.js`.

---

## Puntos ambiguos de la especificación — necesito tu decisión

Las reglas base y el orden de la noche son tuyos, así que no los cambio sin tu confirmación. Para cada punto doy mi propuesta (✅) que aplicaré si la apruebas tal cual.

**D-1. Lobos sin unanimidad.** La especificación dice que la víctima muere solo si todos los lobos vivos coinciden, y también que el narrador "puede resolver empates".
✅ Si no hay unanimidad al cerrar la fase, el narrador ve las elecciones y puede (a) pedir a los lobos que vuelvan a votar o (b) declarar "sin víctima". El narrador **no** elige la víctima por su cuenta.

**D-2. Protector: ¿"misma persona" o "a sí mismo"?** Las reglas base dicen "no puede proteger a la misma persona dos noches seguidas"; la ficha del rol dice "no puede protegerse dos noches seguidas".
✅ No puede proteger a la **misma persona** dos noches seguidas (incluido él mismo). Sí puede protegerse a sí mismo en noches no consecutivas.

**D-3. Equipo de la Bruja.** Está en "Neutrales" pero no tiene condición de victoria propia.
✅ Gana con los **aldeanos** y cuenta como aldeano para la condición de victoria de los lobos. Ve a la víctima efectiva de la noche (después de la protección), puede usar ambas pociones la misma noche y puede salvarse a sí misma.

**D-4. Lobo alfa (para `docs/reglas.md`).**
✅ Una sola vez por partida, después de que los lobos fijan una víctima no protegida, el alfa decide "convertir" en lugar de "matar". La víctima se vuelve **Lobo** común (pierde su habilidad anterior; si era Cazador no dispara), se entera en privado y se une al canal de los lobos desde la noche siguiente. Nadie muere esa noche por los lobos; el amanecer dice "nadie murió". La vidente ve al convertido como lobo desde ese momento. Si la víctima estaba protegida, no hay conversión y el uso no se gasta. Si la Bruja usa la poción de vida esa noche, no tiene efecto sobre la conversión.

**D-5. Niña que espía: ¿qué ve?**
✅ Ve a quién eligieron los lobos y si hubo unanimidad, **pero no los nombres de los lobos**. No puede actuar ni ser descubierta (en línea no hay riesgo físico).

**D-6. Votación del día.** "Más votos de culpable (sin contar al acusado)" admite dos lecturas. Mafia usa una tercera: se acusa a una persona y se elimina si los votos "culpable" superan la mitad de los votantes (sin el acusado).
✅ **Opción A (propuesta):** durante el día se pueden hacer varias acusaciones; cuando el narrador abre la votación, cada jugador vivo vota "culpable" a **uno** de los acusados o se abstiene; el acusado no vota en su propio caso. Gana quien tenga más votos de culpable (Alcalde = 2). Empate → nadie, salvo la opción "desempata el Alcalde". El narrador confirma.
**Opción B:** conservar exactamente el modelo de Mafia (un acusado a la vez, mayoría absoluta), añadiendo solo el doble voto del Alcalde. Menos cambios, pero no coincide con "el que tenga más votos".

**D-7. Alcalde: ¿rol secreto o cargo público?**
✅ Rol **secreto** repartido como cualquier otro. Su doble voto se aplica en el servidor; si el narrador muestra los votos en vivo, la ponderación no se exhibe a los jugadores (solo el total). Esto evita que el desempate lo delate… salvo cuando desempata, cosa inevitable y documentada.

**D-8. Enamorados.** Cambia la condición de victoria y puede unir a un lobo y un aldeano.
✅ Dejarlos para **0.2.0**. Si los quieres en 0.1.0: conservan su equipo original y además ganan juntos si son los dos últimos vivos; si uno muere, el otro muere al instante (esto puede encadenar con el Cazador).

**D-9. Cazador que muere de noche.** ✅ Dispara al amanecer, después de anunciar las muertes; si muere por votación, dispara inmediatamente. Su disparo puede provocar la victoria de un bando.

**D-10. Validación de composición.**
✅ Bloquear si: hay 0 lobos, si lobos ≥ no-lobos, si hay más de `ceil(n/3)` lobos, o si un rol único (Vidente, Protector, Bruja, Alcalde, Niña, Alfa, Cazador) aparece más de una vez. Advertir (sin bloquear) si hay menos de `floor(n/4)` lobos.

**D-11. Primera fase.** ✅ La partida empieza de **noche** (Noche 1), como en el ciclo descrito.

**D-12. Revelar el rol del muerto.** ✅ Opción del narrador, desactivada por defecto; al final siempre se revelan todos.

**D-13. Cómo avanza la noche ordenada.** En Mafia todos actúan a la vez. Aquí hay 4 pasos en orden.
✅ Cada paso avanza solo cuando todos sus actores vivos han enviado su acción; el narrador puede saltar un paso. Si el rol del paso no existe o está muerto, el paso se salta en el servidor sin que los jugadores lo noten (todas las pantallas son privadas, así que no se filtra quién vive). Los aldeanos sin habilidad ven "Esperando" durante toda la noche.

**D-14. Historial de git.**
✅ Conservar los 30 commits de Mafia (dejan claro de dónde viene el código) y empezar encima con `chore: fork from mafia-online as hombres-lobos-online`. Alternativa: historial nuevo desde cero, con un commit inicial que diga en el mensaje que es copia de `mafia-online`.

---

## Repositorio y carpeta

- Nombre: `hombres-lobos-online` en la cuenta `atapia9`. Repo **nuevo** (no un fork de GitHub ni un cambio en `mafia-online`).
- Nota: en tu Mac también existe `~/lobos-de-la-aldea` (NestJS, otro proyecto). No lo uso.
- **Visibilidad**: pendiente de tu elección (pública es necesaria para GitHub Pages en cuentas gratuitas).
- **Licencia del código**: propongo MIT. Las reglas y textos propios de `docs/` podrían ir bajo CC BY 4.0; dime si prefieres otra.

## Plan de commits (resumen)

1. `chore: scaffold project` — estructura, `package.json`, `.env.example`, licencia.
2. `docs: add decision record` — este archivo aprobado.
3. `feat(game): ...` — motor puro, un commit por bloque (setup, roles, noche, votación, victoria) con sus pruebas.
4. `feat(server): ...` — Socket.IO, visibilidad, reconexión, rate limit + prueba de integración.
5. `feat(ui): ...` — narrador, jugador, instrucciones, resumen final.
6. `docs: ...` y `ci: ...` — documentación, `ci.yml`, `pages.yml`, `CHANGELOG.md` 0.1.0.

Antes de cada commit: `npm test`.
