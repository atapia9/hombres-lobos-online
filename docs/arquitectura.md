# Arquitectura

El proyecto tiene dos piezas:

- **Servidor**: Node.js 24, Express 5 y Socket.IO 4.8. Guarda las salas, aplica las reglas y decide qué ve cada persona.
- **Cliente estático** (`public/`): HTML, CSS y JavaScript en módulos ES, sin frameworks ni paso de compilación. Lo sirve el propio servidor en local, y GitHub Pages lo publica tal cual.

```
 Teléfonos de los jugadores          Pantalla del narrador
  jugador.html                        narrador.html
        │  Socket.IO (WebSocket)            │
        └──────────────┬───────────────────┘
                       ▼
        server/net/handlers.js  ← valida, autoriza, limita frecuencia
                       │ applyAction(state, action)
                       ▼
        server/game/  (reglas puras, sin E/S)
                       │ publicView / playerView / narratorView
                       ▼
        state:public → sala · state:private → cada jugador · state:narrator → narrador
```

## Servidor

| Archivo | Qué hace |
|---|---|
| `server/index.js` | Punto de entrada (`npm start`). Lee la configuración y arranca. |
| `server/app.js` | Crea Express (Helmet, `/health`, archivos de `public/`) y Socket.IO (CORS, comprobación de `Origin`, mensajes de 16 KB como máximo). |
| `server/config.js` | Lee `PORT`, `CORS_ORIGIN` y `NODE_ENV`, y decide qué orígenes se aceptan. |
| `server/rooms.js` | Almacén de salas **en memoria**: códigos, asientos, tokens y solicitudes para recuperar un asiento. Borra las salas inactivas durante 6 horas. |
| `server/security.js` | Códigos de sala, tokens de 128 bits, ids de jugador y comparación de tokens en tiempo constante. |
| `server/net/handlers.js` | Eventos de Socket.IO (ADR-005): valida, autoriza, aplica la acción y reparte las vistas. |
| `server/net/validate.js` | Esquemas de validación escritos a mano. Solo conserva las claves conocidas. |
| `server/net/rateLimit.js` | *Token bucket* por conexión. |

### Reglas puras (`server/game/`)

El juego es un reductor: `applyAction(state, action, ctx)` devuelve `{ ok, state, events }` o `{ ok: false, error }`.

- Nunca modifica el estado de entrada.
- El azar (`ctx.rng`) y la hora (`ctx.now`) llegan como parámetros, así que las pruebas son deterministas.

| Archivo | Contenido |
|---|---|
| `constants.js` | Modos, fases, roles y límites. |
| `roles.js` | Tabla de mafiosos y reparto aleatorio (Fisher–Yates sobre `crypto.randomInt`). |
| `names.js` | Limpieza de nombres: lista de caracteres permitidos, NFC y 20 caracteres como máximo. |
| `day.js` | Umbral de la votación y de la petición de noche. |
| `night.js` | Resolución de la noche: unanimidad, papeletas de mafia, Doctor. |
| `victory.js` | Victoria y puntuación. |
| `game.js` | Máquina de estados: `lobby → dawn → day ⇄ night → ended`. |
| `views.js` | Las únicas proyecciones que salen del servidor (ADR-003). |
| `summary.js` | Resumen final en Markdown y en texto para WhatsApp. |

### Qué ve cada uno

| Evento | Destino | Contenido |
|---|---|---|
| `state:public` | toda la sala | Fase, ronda, jugadores (sin roles hasta el final), votación en curso (solo conteos), papeletas entregadas (solo el número). |
| `state:private` | un jugador | `{ me }`: su rol, sus compañeros si es mafioso, los resultados de la Vidente, su voto y su papeleta. |
| `state:narrator` | el narrador | Todo: roles, votos, papeletas, registro y resumen. |

Las pruebas recorren partidas completas, tanto con las vistas como con los mensajes reales de la red. Comprueban que ningún jugador recibe información secreta fuera de su `me`, ni por el nombre del campo ni por su valor.

### Seguridad

- **Validación de entradas:** se descartan las claves desconocidas, así que un cliente no puede cambiar la acción ni el actor.
- **Nombres:** se guardan solo letras, números, emoji y `.` `-` `'` `’`.
- **Tokens:** los del narrador y de cada asiento son aleatorios, de 128 bits.
- **Asiento perdido:** si alguien pierde su token, el narrador tiene que aprobar que recupere el asiento (ADR-008).
- **Frecuencia:** hay un límite por conexión, y quien insiste en superarlo queda desconectado.
- **Orígenes:** solo se aceptan conexiones desde el mismo origen y desde `CORS_ORIGIN`.
- **Cabeceras:** Helmet añade las cabeceras de seguridad y una CSP estricta, sin scripts en línea.
- **Cliente:** el texto de los usuarios se pinta siempre con `textContent`. Una prueba impide que aparezca `innerHTML` en el código.

### Persistencia: limitación actual

Las salas viven **en memoria**. Si el servidor se reinicia o se suspende (el plan gratuito de Render lo hace tras 15 minutos sin tráfico), **se pierden todas las salas**.

**Opción futura:**

1. Definir una interfaz `RoomStore` con `get`, `set`, `delete` y `sweep`, y mantener la implementación actual en memoria.
2. Añadir **SQLite** para un solo servidor. Bastaría con guardar el estado serializado de cada sala (`JSON.stringify(room.game)` junto con sus asientos). Antes habría que verificar la estabilidad de `node:sqlite` en la versión LTS en uso, o recurrir a una librería mantenida.
3. Añadir **Redis** para varias instancias: el estado de cada sala se guardaría en Redis y se usaría `@socket.io/redis-adapter` para que los mensajes lleguen a todos los servidores.

El diseño ya lo facilita, porque la lógica del juego es pura y su estado es un objeto serializable.

## Cliente (`public/`)

| Archivo | Qué hace |
|---|---|
| `index.html` | Portada: narrador o jugador. |
| `narrador.html`, `js/narrator.js` | Pantalla del narrador. |
| `jugador.html`, `js/player.js` | Pantalla del jugador. Las tarjetas con secretos están tapadas por defecto (ADR-010). |
| `js/player-logic.js`, `js/format.js` | Lógica sin DOM, probada en Node. |
| `js/net.js`, `js/server-url.js` | Conexión al servidor. La URL sale de `config.js` o del parámetro `?server=`, y solo se acepta https (o http en localhost). |
| `js/dom.js` | Utilidades del DOM. Conservan el foco al redibujar y esperan a que termine un clic antes de hacerlo. |
| `js/rules.js`, `js/rules-ui.js` | Texto de las reglas y modal. |
| `js/qr.js`, `js/summary-image.js` | QR del enlace e imagen PNG del resultado. |
| `config.js` | URL del servidor. Se genera en el despliegue de Pages. |
| `vendor/` | `socket.io-client` y `uqr`, copiados con `npm run vendor`. Las pruebas comprueban que coinciden con `node_modules` (ADR-006). |

### Sesiones del jugador

- **Recargar la pestaña:** el jugador vuelve a su asiento automáticamente, porque `sessionStorage` es propio de cada pestaña.
- **Abrir una pestaña nueva:** se ofrece «Seguir como…» con los asientos guardados en el navegador (`localStorage`). Nunca se ocupa uno sin preguntar, para que varias personas puedan jugar desde el mismo navegador.
- **Otro dispositivo:** el jugador entra con su mismo nombre y el narrador aprueba que recupere su asiento.

## Pruebas

`npm test` ejecuta `node --test` sobre `tests/**/*.test.js`:

- `tests/game/`: las reglas, incluidas las pruebas de fugas en las vistas.
- `tests/server/`: piezas del servidor (tokens, validación, límites, configuración, archivos copiados en `vendor/`).
- `tests/integration/`: salas completas con clientes reales de Socket.IO: partida completa, reconexión, solicitud de asiento, seguridad y orígenes.
- `tests/client/`: módulos del cliente sin DOM, y comprobaciones estáticas de las páginas (sin scripts en línea ni `innerHTML`).

`scripts/bots.js` añade jugadores simulados para probar en el navegador (`npm run bots -- CÓDIGO 3`, o `--auto` para que también acusen).

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
