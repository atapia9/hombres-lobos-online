# Mafia en línea

[![CI](https://github.com/atapia9/mafia-online/actions/workflows/ci.yml/badge.svg)](https://github.com/atapia9/mafia-online/actions/workflows/ci.yml)
[![Pages](https://github.com/atapia9/mafia-online/actions/workflows/pages.yml/badge.svg)](https://atapia9.github.io/mafia-online/)

Versión en línea de **Mafia**, el juego de deducción social creado por **Dmitri Davýdov** (concebido en 1986, primera partida documentada en 1987).

Una persona narra desde su pantalla y los demás juegan desde su teléfono, en la misma habitación o por videollamada. Los roles se reparten automáticamente, nadie ve los roles ajenos y, al terminar, el narrador obtiene un resumen para compartir.

- **Jugar:** <https://atapia9.github.io/mafia-online/>. Requiere un servidor desplegado: ver [`docs/despliegue.md`](docs/despliegue.md).
- **Reglas:** [`docs/reglas.md`](docs/reglas.md)
- **Historia del juego:** [`docs/historia.md`](docs/historia.md)

## Capturas

| Pantalla del narrador | Pantalla del jugador |
|---|---|
| _Captura pendiente_ (`docs/img/narrador.png`) | _Captura pendiente_ (`docs/img/jugador.png`) |

## Qué incluye

- **Modo original de Davýdov:**
  - Honestos contra Mafia, con la tabla de mafiosos recomendada.
  - Votación diurna por mayoría de los vivos sin contar al acusado.
  - Noche convocada por mayoría y víctima solo si la mafia elige por unanimidad.
  - Anuncio del número de papeletas de mafia y puntuación opcional.
- **Variante «Clásico con roles»** (no forma parte del original): añade Vidente y Doctor, inspirados en Werewolf (Andrew Plotkin, 1997).
- **Pantalla del narrador:**
  - Sala con código, enlace y QR, y lobby con expulsión, modo y número de mafiosos.
  - Control de fases y temporizador.
  - Votos en vivo (se pueden ocultar), confirmación de eliminaciones y registro por ronda.
  - Resumen en Markdown y para WhatsApp, con «Copiar resumen», «Descargar .md», imagen PNG y «Nueva partida con los mismos jugadores».
- **Pantalla del jugador:**
  - Se une con código y nombre, sin cuenta.
  - Rol tapado hasta que el jugador lo muestra, con aviso mientras está visible.
  - Acusar, votar, pedir la noche y una papeleta nocturna con el mismo aspecto para todos.
  - Reconexión al cerrar la pestaña.
- **Instrucciones** en ambas pantallas: un resumen y un modal con las reglas completas.

## Ejecutar en local

Requisitos: [Node.js 24](https://nodejs.org/) (LTS) y npm.

```bash
git clone https://github.com/atapia9/mafia-online.git
```

```bash
cd mafia-online
```

```bash
npm install
```

```bash
npm start
```

Abre <http://localhost:3000>:

- `narrador.html` en la pantalla de quien narra;
- `jugador.html` (o el QR de la sala) en cada teléfono.

Los teléfonos de tu red pueden entrar con la IP de tu equipo, por ejemplo `http://192.168.1.20:3000/jugador.html`.

La configuración se lee de variables de entorno. Copia [`.env.example`](.env.example) a `.env` si necesitas cambiarla:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor. |
| `CORS_ORIGIN` | (vacío) | Orígenes que pueden conectarse además del propio servidor, separados por comas y sin ruta, por ejemplo `https://atapia9.github.io`. |
| `NODE_ENV` | `development` | En `production`, la CSP añade `upgrade-insecure-requests`. |

### Para desarrollar

```bash
npm test
```

```bash
npm run dev
```

```bash
npm run bots -- CÓDIGO 3
```

- `npm test` ejecuta todas las pruebas (`node --test`).
- `npm run dev` arranca el servidor y lo reinicia al cambiar archivos.
- `npm run bots` añade jugadores simulados a una sala; cambia `CÓDIGO` por el código de tu sala. Con `--auto`, los bots también acusan.

## Desplegar

1. El **cliente** se publica en GitHub Pages con el workflow [`pages.yml`](.github/workflows/pages.yml) en cada push a `main`.
2. El **servidor** se despliega en Render con [`render.yaml`](render.yaml), en el plan gratuito.
3. La URL del servidor se guarda en la variable del repositorio `SERVER_URL`.

Los pasos completos están en [`docs/despliegue.md`](docs/despliegue.md).

## Cómo jugar

1. Quien narra abre la pantalla del narrador, elige el modo y crea la sala.
2. Cada jugador escanea el QR o escribe el código y su nombre.
3. Con al menos 6 jugadores, el narrador inicia la partida. Cada uno mira su rol en privado y los mafiosos ven a sus compañeros.
4. **De día** se discute en voz alta. Cualquiera acusa desde su teléfono, el narrador abre la votación y todos votan.
5. **De noche**, cuando la pide la mayoría, cada uno entrega su papeleta en secreto: «Honesto» o, si es de la mafia, una víctima.
6. Al terminar, el narrador comparte el resumen.

Las reglas completas están en [`docs/reglas.md`](docs/reglas.md).

## Documentación

- [`docs/reglas.md`](docs/reglas.md): reglas del modo original y de la variante.
- [`docs/arquitectura.md`](docs/arquitectura.md): servidor, reglas puras, vistas, seguridad y persistencia.
- [`docs/despliegue.md`](docs/despliegue.md): GitHub Pages y Render.
- [`docs/historia.md`](docs/historia.md): origen del juego, con sus fuentes.
- [`docs/decisiones.md`](docs/decisiones.md): registro de decisiones técnicas (ADR).
- [`CHANGELOG.md`](CHANGELOG.md): cambios de cada versión.

## Limitaciones conocidas

- **Salas en memoria:** se pierden si el servidor se reinicia o se suspende (el plan gratuito de Render lo hace tras 15 minutos sin uso). Hay una propuesta con SQLite o Redis en [`docs/arquitectura.md`](docs/arquitectura.md#persistencia-limitación-actual).
- **Sin chat:** la discusión ocurre de viva voz, en persona o por videollamada.
- **Pruebas en navegador:** se hicieron en un navegador de escritorio con tamaño de teléfono. Falta probar en teléfonos reales y con lectores de pantalla.

## Crédito y licencia

**Mafia es un juego creado por Dmitri Davýdov.** Este proyecto es una implementación independiente: no reclama ningún derecho sobre el juego original, su nombre ni el texto de sus reglas. Las reglas de este repositorio están redactadas con palabras propias.

El código se publica con la [licencia MIT](LICENSE).

Las librerías copiadas en `public/vendor/` conservan su licencia MIT:
- [Socket.IO](https://socket.io/)
- [uqr](https://github.com/unjs/uqr)

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
