# Registro de decisiones técnicas (ADR)

> **Estado:** aceptada el 21 de octubre de 2026. Todas las propuestas se aprobaron sin cambios.
> **Fecha:** 21 de octubre de 2026
>
> _Este documento fue elaborado con asistencia de Claude (Anthropic) y está pendiente de revisión por [nombre]._

### Resolución

| Pregunta | Resolución |
|---|---|
| R5 | Un mafioso no puede marcar "Honesto". Al amanecer se anuncia a todos cuántas papeletas de mafia hubo. |
| R9 | La "Nueva partida con los mismos jugadores", con puntuación acumulada, entra en la v0.1. |
| R11 | Se usan las frases de cierre propuestas. |
| R12 | Durante la partida, "Retirar jugador" cuenta como una eliminación. |
| R13 | La prueba se hace con 3 pestañas reales y 3 jugadores simulados. |
| P1 | El repositorio se hará público en la fase de despliegue. |
| P2 | Licencia MIT. `docs/reglas.md` será un resumen propio con crédito. |
| P3 | El servidor se alojará en Render (plan Free). |
| P4 | **Pendiente:** falta el nombre para la nota de autoría. |

## Cómo leer este documento

1. **[Preguntas para confirmar](#1-preguntas-para-confirmar):** interpretaciones de las reglas y decisiones que necesitan tu visto bueno. Cada una trae una propuesta, así que basta con responder "de acuerdo" o indicar el cambio.
2. **[Verificaciones hechas](#2-verificaciones-hechas):** versiones y APIs consultadas en la documentación oficial.
3. **[Plan de trabajo](#3-plan-de-trabajo):** fases, ramas y criterios para dar cada una por terminada.
4. **[Decisiones técnicas](#4-decisiones-técnicas-adr):** cada ADR con su contexto, la decisión y sus consecuencias.

---

## 1. Preguntas para confirmar

### Fuente de las reglas

No pude consultar el texto original "The Original Mafia Rules", porque el archivo web no es accesible desde este entorno. Por eso las reglas se implementarán según el resumen del encargo. Una fuente secundaria, la [página de variantes de la Graduate Mafia Brotherhood de Princeton](https://fringe.davesource.com/Fringe/Entertainment/Games/Indoors/Mafia/v23.htm), coincide con el resumen en cinco puntos: la mafia se reconoce la primera noche, puede haber varias condenas en un mismo día, la noche se convoca por mayoría, la víctima solo muere si todos los mafiosos eligen al mismo jugador y no hay roles especiales.

### Modo original: interpretación de las reglas

**R1. Qué significa "ronda".**
En el original, "ronda" parece significar una partida completa: el eliminado queda fuera "hasta el final de la ronda" y la puntuación se calcula por ronda. Sin embargo, el encargo también pide un "contador de ronda" y las "eliminaciones por ronda".
**Propuesta:** en la interfaz, **partida** es el juego completo y **ronda** es un ciclo de Día y Noche, numerado desde 1. Quien queda eliminado sigue fuera hasta el final de la partida.

**R2. Umbral de la votación de día.**
Solo votan los vivos y el acusado no vota. El acusado queda eliminado si los votos "culpable" son **más de la mitad de los vivos, sin contar al acusado**. Abstenerse o no votar cuenta como "no culpable", porque se exige la mayoría de los votantes posibles, no la de los votos emitidos.

| Vivos | Votantes | Votos "culpable" necesarios |
|---:|---:|---:|
| 7 | 6 | 4 |
| 5 | 4 | 3 |
| 4 | 3 | 2 |
| 2 | 1 | 1 |

**R3. Cómo se abre una votación.**
Cualquier jugador vivo puede acusar a otro y pedir la votación desde su teléfono. El narrador ve la acusación y abre la votación con un toque. Solo hay una votación activa a la vez. Al cerrarla, el servidor calcula el resultado y el narrador lo confirma.
La discusión y la defensa se hacen de viva voz, en persona o por videollamada, así que la v0.1 no incluye chat.

**R4. Cómo se convoca la noche.**
Durante el día, cada jugador vivo puede activar "Pedir noche". Cuando la piden más de la mitad de los vivos, se habilita el botón "Pasar a noche" del narrador. En el modo original, el narrador **no** puede forzar la noche sin esa mayoría. Si la mayoría no se alcanza, el día continúa.

**R5. La papeleta de noche.**
- Todos los vivos entregan una papeleta: los honestos marcan "Honesto" y los mafiosos eligen una víctima. Según el encargo, un mafioso **no** puede marcar "Honesto". En papel sí podría hacerlo para ocultar cuántos mafiosos quedan. ¿Mantengo la restricción?
- Un mafioso puede elegir a cualquier jugador vivo, salvo a sí mismo y a sus compañeros, a quienes ya conoce.
- Los mafiosos no ven lo que eligen sus compañeros, igual que cuando se escribe en secreto.
- Cuando todos han entregado, el narrador cierra la noche. También puede cerrarla aunque falten papeletas: la papeleta que falte de un honesto cuenta como "Honesto" y la de un mafioso cuenta como "sin víctima", así que esa noche nadie muere.
- Al amanecer se anuncia a todos si alguien murió (y quién) y **cuántas papeletas de mafia hubo**, porque así lo indican las reglas: ese número revela cuántos mafiosos siguen vivos. ¿Confirmas que se muestre a todos?
- La pantalla de noche tiene el mismo aspecto para todos: misma tarjeta y mismo número de toques. Además, aparece tapada por defecto, para que nadie deduzca un rol mirando el teléfono de otro.

**R6. Muertos y eliminados.**
Ni los eliminados de día ni los muertos de noche revelan su rol. Pueden seguir viendo el estado público, pero no votan ni piden la noche. Los roles se muestran a todos únicamente en el resumen final.

**R7. Victoria.**
Se comprueba después de cada eliminación o muerte. Los honestos ganan si no queda ningún mafioso vivo y la mafia gana si no queda ningún honesto vivo.
No hay regla de "paridad", es decir, la mafia no gana por igualar en número a los honestos, porque el original no la tiene. Si la partida se bloquea, el narrador puede usar "Terminar partida sin ganador" y el registro lo anota.

**R8. Número de mafiosos.**
La tabla del encargo coincide exactamente con la fórmula ⌊(n+1)/3⌋ entre 6 y 16 jugadores.
**Propuesta:** mínimo 6 jugadores y máximo 20. Entre 17 y 20 se aplica la misma fórmula. El narrador puede ajustar entre 1 y ⌊(n−1)/2⌋ mafiosos, de modo que siempre haya menos mafiosos que honestos. Si el número queda fuera de ese rango, el botón "Iniciar" se bloquea.

| Jugadores | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Recomendado | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 5 | 6 | 6 | 6 | 7 |
| Máximo permitido | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 | 7 | 7 | 8 | 8 | 9 | 9 |

**R9. Puntuación y partidas sucesivas.**
La puntuación sigue el encargo. Por ejemplo, si la mafia gana una partida que empezó con 9 honestos, cada mafioso vivo suma 9 puntos. Si ganan los honestos y sobreviven 4, cada uno de ellos suma 4. El narrador puede ocultar la puntuación del resumen.
**Propuesta adicional:** un botón "Nueva partida con los mismos jugadores" que vuelve a repartir los roles y acumula la puntuación en la sala, porque en el original se juegan varias rondas y se suman los puntos. ¿Lo incluyo en la v0.1 o lo dejo para más adelante?

**R10. Voto de día público o secreto.**
En el original, el voto de día se hace a mano alzada, es decir, es público.
**Propuesta:** mientras dura la votación, los jugadores solo ven cuántos han votado. Al cerrarla, todos ven el resultado y quién votó "culpable". El narrador ve cada voto en tiempo real y tiene un interruptor para ocultarlo de su propia pantalla, útil si la proyecta.

**R11. Frase de cierre del resumen.**
**Propuesta:**
- Si ganan los Honestos: «La ciudad despierta en paz: no queda ningún mafioso.»
- Si gana la Mafia: «La ciudad guarda silencio: la mafia se queda con todo.»
- Siempre al final: «Mafia es un juego creado por Dmitri Davýdov (1986–1987).»

¿Te sirven estas frases o prefieres otras?

**R12. Expulsar a un jugador durante la partida.**
En el lobby, "Expulsar" saca al jugador de la sala.
**Propuesta:** durante la partida, "Retirar jugador" cuenta como una eliminación. El rol no se revela, la retirada queda en el registro y después se comprueba si alguien ganó. La alternativa es no permitir expulsiones una vez iniciada la partida.

**R13. Prueba en navegador con "tres jugadores".**
Como el mínimo es de 6 jugadores, una partida con solo 3 no puede iniciarse.
**Propuesta:** usar 3 pestañas reales y 3 jugadores simulados con un script de desarrollo (`npm run bots`). La alternativa es abrir 6 pestañas. ¿Cuál prefieres?

### Variante "Clásico con roles" (no forma parte del original)

Esta variante es una adaptación posterior, inspirada en Werewolf (Andrew Plotkin, 1997), y así se indicará en la interfaz y en la documentación. Estas son las reglas que propongo:

- **V1.** Hay noche en cada ronda, sin votación para convocarla.
- **V2.** La mafia sigue necesitando unanimidad, pero en esta variante cada mafioso ve en vivo lo que eligen sus compañeros, como los lobos que "despiertan juntos".
- **V3. Vidente:** cada noche elige a un jugador vivo y recibe en privado si es "Mafia" u "Honesto".
- **V4. Doctor:** cada noche protege a un jugador vivo. Puede protegerse a sí mismo, pero no puede proteger al mismo jugador dos noches seguidas. Si protege a la víctima de la mafia, esa noche nadie muere.
- **V5.** Hay un Vidente y un Doctor, que salen del equipo honesto. La variante está disponible desde 6 jugadores.
- **V6.** No se revela el rol de los muertos, igual que en el original, y tampoco se anuncia cuántas papeletas de mafia hubo.
- **V7.** La victoria y la puntuación funcionan igual que en el modo original.

### Proyecto

**P1. Visibilidad del repositorio.**
Creé el repositorio como **privado**. Tu cuenta es GitHub Free, y en ese plan GitHub Pages solo funciona con repositorios públicos.
**Propuesta:** hacerlo público al llegar a la fase de despliegue, o ahora mismo si lo prefieres.

**P2. Licencia y derechos del juego.**
**Propuesta:** licencia MIT para el código. El README aclarará que Mafia es un juego creado por Dmitri Davýdov y que el proyecto no reclama ningún derecho sobre él.
Davýdov reclama derechos de autor sobre el *texto* de sus reglas ([SVT, 2024](https://www.svt.se/kultur/anklagelsen-forradarna-har-snott-reglerna-fran-spelet-maffia)). Por eso `docs/reglas.md` será un resumen redactado con nuestras palabras y con el crédito correspondiente, no una traducción del texto original.

**P3. Hosting del servidor.**
**Propuesta:** Render, con el plan Free. Admite WebSockets, pero se suspende tras 15 minutos sin tráfico HTTP ni mensajes WebSocket y tarda alrededor de un minuto en volver a arrancar. Al suspenderse se pierden las salas, que viven en memoria.
La cuenta tienes que crearla tú y conectar el repositorio; yo dejo la configuración y los pasos en `docs/despliegue.md`. ¿Te parece bien o tienes otro hosting en mente?

**P4. Nombre para la nota de autoría.**
Los documentos incluirán esta nota: "Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]". ¿Qué nombre pongo?

---

## 2. Verificaciones hechas

Todas se hicieron el 21 de octubre de 2026.

| Componente | Versión o dato | Fuente |
|---|---|---|
| Node.js | Tienes instalada la v24.14.0. La LTS activa es la 24.x "Krypton" (la última es la 24.22.1, del 20 de octubre de 2026). La 26.x todavía no es LTS. Recomiendo actualizar a la 24.22.1. | [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json) |
| `--env-file-if-exists` | Estable desde Node 24.10.0, así que no hace falta `dotenv`. | [Node 24, CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html) |
| `node:crypto` | `randomInt`, `randomBytes` y `timingSafeEqual` están disponibles. | Comprobado en Node 24.14.0 |
| Express | 5.3.0 (9 de octubre de 2026) | npm |
| Socket.IO | 4.8.4 para servidor y cliente (septiembre de 2026) | npm y [socket.io/docs/v4](https://socket.io/docs/v4/) |
| Helmet | 8.3.0 (julio de 2026) | npm |
| uqr (códigos QR) | 0.1.3 (abril de 2026). Tiene licencia MIT, no tiene dependencias y exporta `renderSVG`. | npm y unpkg |
| GitHub Actions | `checkout` v7.0.1, `setup-node` v7.1.0, `configure-pages` v6.0.0, `upload-pages-artifact` v5.0.0 y `deploy-pages` v5.0.1. | Releases oficiales en GitHub |
| GitHub Pages | Pide los permisos `pages: write` e `id-token: write` y usa el entorno `github-pages`. Se activa con `POST /repos/{owner}/{repo}/pages` y `build_type: "workflow"`. | [Workflows personalizados](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [API REST de Pages](https://docs.github.com/en/rest/pages/pages) |
| Render Free | Admite WebSockets. Se suspende tras 15 minutos sin tráfico y tarda alrededor de un minuto en volver a arrancar. | [render.com/docs/free](https://render.com/docs/free), [changelog de febrero de 2026](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages) |

La guía de Pages todavía muestra ejemplos con versiones anteriores de las acciones (`configure-pages@v5`, `upload-pages-artifact@v4` y `deploy-pages@v4`). Usaré las versiones más recientes y revisaré sus notas de versión antes de escribir el workflow.

**APIs de Socket.IO que se usarán.** Todas aparecen en la [referencia oficial de la API del servidor v4](https://socket.io/docs/v4/server-api/) y en sus [opciones](https://socket.io/docs/v4/server-options/):

- `new Server(httpServer, { cors: { origin } })`
- `io.use((socket, next) => …)`
- `socket.use(([event, ...args], next) => …)`, que es el middleware por paquete donde va el limitador de frecuencia
- `socket.join(room)` e `io.to(room).emit(…)`
- `socket.emit(evento, ...args, ack)`, `socket.data` y `socket.handshake.auth`
- `io.in(room).fetchSockets()` y `socket.disconnect(true)`
- La opción `maxHttpBufferSize`, cuyo valor por defecto es 1e6 y que se reducirá (ver ADR-007).

**Cliente de Socket.IO.** La documentación dice que el servidor sirve `/socket.io/socket.io.js`. También sirve `socket.io.esm.min.js`: ese archivo no aparece en la página de instalación del cliente, pero sí en la lista de archivos que sirve `socket.io@4.8.4` en su código fuente (`dist/index.js`). Sin embargo, lo sirve sin cabeceras CORS, y por eso el cliente se copia en `public/vendor/` (ver ADR-006).

**Verificado en la fase 2:**
- La opción `allowRequest(req, callback)` rechaza con 403 los orígenes no permitidos.
- `socket.use(([event, ...args], next) => …)` recibe el ack como último argumento: si no se llama a `next()`, el paquete se descarta.
- El cliente ofrece `socket.timeout(ms).emitWithAck()` (desde la v4.6.0).
- `import.meta.main` funciona en Node 24.

**Reconexión.** No usaré `connectionStateRecovery`, porque sirve para cortes breves y no para cuando se cierra la pestaña. La reconexión se resuelve con un token propio (ADR-008).

---

## 3. Plan de trabajo

Cada fase va en su propia rama y se integra en `main` con un PR. Los commits son pequeños, en inglés y con el estilo Conventional Commits, y antes de cada uno se ejecuta `npm test`.

| Fase | Rama | Contenido | Termina cuando |
|---|---|---|---|
| 0 | `docs/initial-plan` | Este plan | Lo confirmas |
| 1 | `feat/game-logic` | Lógica pura en `server/game/` y pruebas unitarias | `npm test` pasa con pruebas de reparto, votación, noche, victoria, puntuación y vistas sin fugas de roles |
| 2 | `feat/server` | Express, Socket.IO, validación, limitador y reconexión, más pruebas de integración de una sala completa con 6 clientes | Una partida completa pasa en una prueba automatizada y ningún evento lleva roles ajenos |
| 3 | `feat/narrator-ui` | Pantalla del narrador: sala, QR, lobby, fases, votaciones, registro y resumen | Se puede dirigir una partida completa desde el navegador |
| 4 | `feat/player-ui` | Pantalla del jugador: unirse, rol privado, estado, acciones y reconexión | Se puede jugar una partida completa desde el móvil |
| 5 | `docs/ci-pages` | `README`, `docs/*`, `CHANGELOG`, `LICENSE`, `.env.example`, `ci.yml` y `pages.yml` | GitHub Actions pasa en verde y Pages publica el cliente |
| 6 | (sin rama) | Verificación en el navegador según R13 | El flujo completo funciona: crear sala, unirse, repartir roles, jugar un día y una noche y generar el resumen |

### Estructura de carpetas

Es la estructura sugerida en el encargo, con algunos añadidos:

```
mafia-online/
├── server/
│   ├── game/            # pure rules, no I/O
│   │   ├── roles.js     # mafia count table, role assignment
│   │   ├── day.js       # accusations, day vote, night request
│   │   ├── night.js     # night ballots, unanimity, classic abilities
│   │   ├── victory.js   # win check and scoring
│   │   ├── game.js      # state machine: applyAction(state, action)
│   │   ├── views.js     # narratorView / playerView / publicView
│   │   └── summary.js   # Markdown and WhatsApp summary
│   ├── net/             # Socket.IO handlers, validation, rate limit, tokens
│   ├── rooms.js         # in-memory room store and cleanup
│   └── index.js         # Express + Socket.IO bootstrap
├── public/
│   ├── index.html       # landing: narrador o jugador
│   ├── narrador.html
│   ├── jugador.html
│   ├── config.js        # server URL
│   ├── js/              # ES modules (client)
│   ├── css/
│   └── vendor/uqr.mjs   # vendored QR library (MIT)
├── scripts/bots.js      # dev-only simulated players
├── tests/
│   ├── game/            # unit tests
│   └── integration/     # full room over Socket.IO
├── docs/                # reglas, arquitectura, despliegue, historia, decisiones
├── .github/workflows/   # ci.yml, pages.yml
├── README.md, CHANGELOG.md, LICENSE, .env.example
```

### Dependencias

- **Producción:** `express`, `socket.io` y `helmet`.
- **Desarrollo:** `socket.io-client`, que se usa en las pruebas de integración y en `scripts/bots.js`.
- **Copiada en el repositorio:** `uqr`, en `public/vendor/`, para generar el QR en el cliente sin un paso de compilación.

No uso validadores externos ni `dotenv`.

---

## 4. Decisiones técnicas (ADR)

### ADR-001: El servidor es la única autoridad

- **Contexto:** los roles y los votos no pueden depender de lo que diga un cliente.
- **Decisión:** el servidor guarda el estado completo de cada sala y aplica las reglas. Los clientes solo envían intenciones, por ejemplo "voto culpable", y reciben vistas filtradas.
- **Consecuencias:** un cliente modificado no puede ver roles ajenos ni hacer trampa con los votos.

### ADR-002: La lógica del juego es pura, en forma de reductor

- **Decisión:** `applyAction(state, action, ctx)` devuelve `{ state, events }` o un error tipado, sin E/S y sin reloj ni azar implícitos. El generador aleatorio (`ctx.rng`) y la hora (`ctx.now`) se inyectan.
- **Consecuencias:** las pruebas son deterministas y la capa de Socket.IO queda delgada. Los `events` alimentan el registro por ronda.

Las fases de la partida son estas:

```
LOBBY → DAWN (reconocimiento) → DAY ⇄ NIGHT → ENDED
             DAY: idle | voting(accusedId) | pendingConfirm(result)
```

### ADR-003: Una vista distinta para cada destinatario

- **Decisión:** solo tres funciones producen datos de salida.
  - `publicView` va a toda la sala y nunca incluye roles.
  - `playerView(id)` va solo al dueño e incluye su rol, sus compañeros si es mafioso y el resultado del vidente.
  - `narratorView` va solo al narrador e incluye todo, también el registro.

  Ningún manejador emite el estado en bruto.
- **Consecuencias:** hay una prueba que serializa todo lo que recibe cada jugador durante una partida completa y verifica que no aparecen roles ajenos. Los roles se revelan a todos solo cuando la fase es `ENDED`.

### ADR-004: Aleatoriedad y códigos

- **Reparto de roles:** se usa Fisher–Yates con `crypto.randomInt`.
- **Código de sala:** tiene 5 caracteres de un alfabeto sin caracteres ambiguos (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, es decir, sin 0/O ni 1/I/L), lo que da 31⁵ ≈ 28,6 millones de combinaciones. Si un código sale repetido, se genera otro.
- **Tokens del narrador y de cada jugador:** `crypto.randomBytes(16).toString("base64url")`, que se comparan con `timingSafeEqual`.

### ADR-005: Contrato de eventos de Socket.IO

Todos los eventos del cliente al servidor usan un ack que responde `{ ok: true, ... }` o `{ ok: false, error: "CODE" }`. Los eventos sin datos aceptan que no se envíe nada o que llegue `null`. Las claves desconocidas se descartan.

_Actualizado en la fase 2:_ se añadieron `room:leave`, `state:sync`, `seat:approve`, `seat:reject`, `day:dismissAccusation` y `game:rematch`, y los avisos que el servidor envía a un solo socket.

| Cliente → servidor | Quién | Datos |
|---|---|---|
| `room:create` | narrador | `{ mode?, timeZone? }` → `{ code, narratorToken, state }` |
| `narrator:resume` | narrador | `{ code, narratorToken }` → `{ state }` |
| `room:configure` | narrador | `{ mode?, mafiaCount?, showVotes?, showScore? }` |
| `room:kick` | narrador | `{ playerId }`: en el lobby expulsa; durante la partida retira (R12) |
| `seat:approve`, `seat:reject` | narrador | `{ claimId }` (ver ADR-008) |
| `room:join` | jugador | `{ code, name }` → `{ playerId, playerToken, state }` o, con la partida empezada, `{ pending: true, claimId }` |
| `room:rejoin` | jugador | `{ code, playerToken }` → `{ playerId, state }` |
| `room:leave` | jugador | — (solo en el lobby) |
| `state:sync` | ambos | — → `{ state }` |
| `game:start`, `game:end`, `game:rematch` | narrador | — |
| `phase:advance` | narrador | `{ to: "day" \| "night" }` |
| `timer:set` | narrador | `{ seconds }` (0 lo quita) |
| `day:accuse` | jugador | `{ targetId }` |
| `day:dismissAccusation`, `day:openVote` | narrador | `{ accusationId }` |
| `day:vote` | jugador | `{ guilty: true \| false \| null }` (null retira el voto) |
| `day:closeVote` | narrador | — |
| `day:confirm` | narrador | `{ accept }` |
| `night:request` | jugador | `{ wanted }` |
| `night:submit` | jugador | `{ targetId \| null }` (null = Honesto) |
| `night:ability` | jugador (clásico) | `{ targetId }` |

| Servidor → cliente | Destino | Contenido |
|---|---|---|
| `state:public` | sala `room:<code>` | `publicView` más el estado de conexión de cada jugador |
| `state:private` | solo el socket del dueño | `{ code, me }`: únicamente los secretos de ese jugador |
| `state:narrator` | solo el socket del narrador | `narratorView`, conexiones, reclamaciones de asiento y, al terminar, el resumen |
| `seat:granted`, `seat:rejected` | quien reclamó un asiento | El token nuevo y el estado, o el rechazo |
| `session:replaced` | la pestaña anterior | Se abrió la misma sesión en otra pestaña o dispositivo |
| `room:kicked` | el jugador expulsado | — |

### ADR-006: Cliente en módulos ES, sin compilación

- **Decisión:**
  - `public/config.js` exporta `SERVER_URL`. Si está vacío, el cliente usa el mismo origen, que es lo que pasa en local.
  - El parámetro `?server=https://…` tiene prioridad y se recuerda en `localStorage`. Solo se aceptan direcciones `https:`, o `http://localhost` en desarrollo.
  - El cliente de Socket.IO se copia en `public/vendor/socket.io.esm.min.js` con `npm run vendor`. Una prueba comprueba que la copia es idéntica, byte a byte, a la versión instalada en `node_modules`.
  - Si el servidor está dormido, la página muestra "Conectando con el servidor…" y reintenta.
- **Cambio en la fase 2:** la idea inicial era importar el cliente directamente del servidor (`import(\`${SERVER_URL}/socket.io/socket.io.esm.min.js\`)`). Al revisar el código fuente de `socket.io@4.8.4` vi que ese archivo se sirve sin la cabecera `Access-Control-Allow-Origin`, así que el navegador bloquearía el `import()` desde GitHub Pages. Por eso se adoptó la alternativa de copiarlo en `public/vendor/`.
- **Despliegue:** en `pages.yml`, `config.js` se genera a partir de la variable del repositorio `SERVER_URL`, así que no queda ninguna URL fija en el código.

### ADR-007: Seguridad

- **Validación de entradas:** validadores escritos a mano, sin dependencias.
  - El código de sala tiene que cumplir `^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$`. Se acepta escrito en minúsculas y con espacios alrededor. _Corrección de la fase 2:_ el patrón de la propuesta inicial, `[A-HJ-NP-Z2-9]`, dejaba pasar la L.
  - Los ids de jugador los genera el servidor (`p` seguido de 16 caracteres hexadecimales) y nunca vienen del cliente.
  - El nombre se recorta, se normaliza a NFC, se le quitan los caracteres de control y debe tener entre 1 y 20 caracteres. No puede repetirse dentro de la sala, sin distinguir mayúsculas.
  - Los identificadores se buscan siempre en el estado de la sala.
- **Límite de frecuencia:** un *token bucket* por socket, aplicado con `socket.use`, con ráfagas de 20 eventos y 5 eventos por segundo sostenidos. Si un socket lo excede de forma repetida, se desconecta.
- **Límites de recursos:** `maxHttpBufferSize` de 16 KB, como máximo 20 jugadores por sala y un tope global de salas. Las salas inactivas se borran a las 6 horas.
- **Red:** `CORS_ORIGIN` admite una lista separada por comas. Es solo el origen, sin ruta: por ejemplo `https://atapia9.github.io`, no `…/mafia-online`. Helmet aplica una CSP estricta.
- **Cliente:** los datos de los usuarios siempre se pintan con `textContent` y nunca con `innerHTML`.

### ADR-008: Reconexión

- **Decisión:**
  - Al unirse, el jugador recibe un `playerToken` que se guarda en `localStorage` por sala.
  - Si cierra la pestaña y vuelve a entrar con el mismo código, `room:rejoin` le devuelve su rol y su estado. El socket anterior se desconecta.
  - Si perdió el token, por ejemplo porque cambió de navegador, el narrador puede "reasignar asiento" a la nueva conexión. Esto solo funciona con asientos desconectados.
- **Cómo funciona la reasignación (fase 2):**
  1. Con la partida empezada, el jugador entra con el código y su mismo nombre (sin distinguir mayúsculas).
  2. Si ese asiento está desconectado, el servidor crea una reclamación y se la muestra al narrador.
  3. Si el narrador la aprueba, el servidor genera un token nuevo, invalida el anterior y envía `seat:granted` con el rol y el estado.
  4. Si el asiento está conectado, la respuesta es `SEAT_TAKEN`. Si el nombre no existe, es `GAME_IN_PROGRESS`.
  5. La reclamación se descarta si quien la hizo se desconecta. Hay un máximo de 20 reclamaciones por sala.
- **Por qué no se reconecta solo con el nombre:** cualquiera que escribiera ese nombre se quedaría con el rol. Por eso el narrador tiene que aprobarlo.

### ADR-009: Las salas viven en memoria

- **Limitación:** si el servidor se reinicia o Render lo suspende, se pierden las salas. Esto quedará documentado en el README y en `docs/arquitectura.md`.
- **Opción futura:**
  - Mover el almacén de salas a Redis detrás de una interfaz `RoomStore`. Para varias instancias se añadiría `@socket.io/redis-adapter`.
  - Para un solo servidor bastaría con SQLite, después de verificar la estabilidad de `node:sqlite` en la LTS en uso.

### ADR-010: Privacidad del rol en pantalla

- **Decisión:**
  - El rol aparece tapado por defecto. Se ve manteniendo pulsado o con un botón de "Mostrar", y se vuelve a tapar con "Ocultar".
  - Mientras está visible, una franja de aviso recuerda que no hay que enseñarlo.
  - El rol se tapa solo a los 10 segundos y también al cambiar de pestaña, con `visibilitychange`.
  - Las pantallas de noche usan el mismo esquema (R5).

### ADR-011: Resumen final

- **Decisión:** `server/game/summary.js` genera el resumen en Markdown y en texto para WhatsApp, que usa `*negrita*` y `_cursiva_`. Incluye:
  - el ganador;
  - los roles revelados;
  - las eliminaciones por ronda;
  - la puntuación;
  - la frase de cierre.

  El servidor lo envía al narrador al terminar la partida.
- **En el cliente:** botones "Copiar resumen" (`navigator.clipboard.writeText`) y "Descargar .md" (con un `Blob` y un enlace `download`), y una imagen PNG opcional generada en un `<canvas>`.

### ADR-012: Pruebas

- **Pruebas unitarias:** `node --test` con `node:assert/strict` para todo `server/game/`.
- **Pruebas de integración:** levantan el servidor en el puerto 0 y conectan 6 clientes `socket.io-client` para jugar una partida completa. También comprueban que no se filtran roles, que el limitador funciona y que la reconexión recupera el rol.
- **Comando:** `npm test` ejecuta ambas.

### ADR-013: CI y despliegue

- **`ci.yml`:** se ejecuta en cada push y en cada PR. Usa Node 24 con `npm ci` y `npm test`.
- **`pages.yml`:** se ejecuta en cada push a `main` que cambie `public/**`. Genera `config.js` y publica `public/` como artefacto de Pages.
- **Configuración del repositorio:** Pages se activa con `build_type: "workflow"`.

_Implementado en la fase 5:_
- **Versiones de las acciones:** se usan las últimas publicadas, que son posteriores a las de los ejemplos de la guía de GitHub: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` y `actions/deploy-pages@v5`.
  - En `checkout` v7, el cambio incompatible solo afecta a `pull_request_target`, que este proyecto no usa.
  - En `setup-node` v7, el cambio incompatible es la eliminación del `NODE_AUTH_TOKEN` ficticio, y aquí no se publica en npm.
- **Pruebas antes de publicar:** `pages.yml` también ejecuta las pruebas, para no publicar un cliente roto.
- **`config.js`:** lo escribe `scripts/write-config.js` a partir de la variable del repositorio `SERVER_URL`. Solo acepta orígenes `https` (o `localhost`) y se escribe con `JSON.stringify`, nunca con `echo`.
- **Servidor en Render (P3):** se configura con [`render.yaml`](../render.yaml) en el plan `free`.
  - `PORT=10000` es el puerto por defecto de Render.
  - La versión de Node sale de `.nvmrc`.
  - `CORS_ORIGIN` se pide al crear el servicio (`sync: false`).
- **Repositorio público (P1):** se hizo público en esta fase, después de revisar que no hubiera secretos ni datos personales.

### ADR-014: Idioma

- **Decisión:**
  - La interfaz y la documentación van en español.
  - Los identificadores, los comentarios técnicos y los commits van en inglés.
  - Los textos de la interfaz se reúnen en `public/js/texts.js`.

### ADR-015: Variables de entorno

- **Decisión:**
  - `PORT` vale 3000 por defecto.
  - `CORS_ORIGIN` es una lista de orígenes.
  - `NODE_ENV` vale `development` o `production`.
  - Las variables se cargan con `node --env-file-if-exists=.env server/index.js` y `.env.example` las documenta.

### ADR-016: Accesibilidad y diseño responsivo

- **Decisión:**
  - Diseño pensado primero para el móvil.
  - Contraste AA como mínimo y foco visible.
  - Toda la interfaz se puede usar con el teclado.
  - Los botones de votación llevan `aria-label` descriptivo, por ejemplo "Votar culpable contra Ana".
  - Una región `aria-live` anuncia los cambios de fase.
  - Se respeta `prefers-reduced-motion`.
