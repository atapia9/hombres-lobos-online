# Hombres Lobos Online

[![CI](https://github.com/atapia9/hombres-lobos-online/actions/workflows/ci.yml/badge.svg)](https://github.com/atapia9/hombres-lobos-online/actions/workflows/ci.yml)
[![Pages](https://github.com/atapia9/hombres-lobos-online/actions/workflows/pages.yml/badge.svg)](https://atapia9.github.io/hombres-lobos-online/)

Juego en línea de deducción social de **Lobos contra Aldeanos**, con roles especiales para los dos equipos. Una persona narra desde su pantalla y los demás juegan desde su teléfono, en la misma habitación o por videollamada. Los roles se reparten automáticamente, la información secreta solo llega a su dueño y, al terminar, el narrador obtiene un resumen para compartir.

> **Es una adaptación, no el juego original.** La familia de juegos nace con *Mafia*, de Dmitri Davýdov (concebido en 1986, primera partida documentada en 1987), y su variante *Werewolf*, de Andrew Plotkin (1997). Las reglas y los roles especiales de esta versión son propios. Ver [`docs/historia.md`](docs/historia.md).

- **Jugar:** <https://atapia9.github.io/hombres-lobos-online/>. Requiere un servidor desplegado: ver [`docs/despliegue.md`](docs/despliegue.md).
- **Reglas:** [`docs/reglas.md`](docs/reglas.md) · **Roles:** [`docs/roles.md`](docs/roles.md)

## Qué incluye

- **Roles:** Aldeano, Vidente, Protector, Cazador, Alcalde, Niña que espía y Bruja (Aldeanos); Lobo y Lobo alfa (Lobos). El narrador elige cuáles entran.
- **Noche en orden fijo:** Vidente → Protector → Lobos (→ Lobo alfa) → Bruja. Los pasos sin nadie que actúe se saltan solos, sin que los jugadores lo noten.
- **Día:** acusaciones y votación entre los acusados; sale el más votado, el Alcalde vale doble y un empate no elimina a nadie (o desempata el Alcalde, si se activa).
- **Pantalla del narrador:**
  - sala con código, enlace y QR; lobby con expulsión, configurador de roles y número de lobos;
  - control de fases y temporizador;
  - la noche paso a paso, con lo que eligió cada rol y una vista previa del amanecer;
  - votos en vivo (se pueden ocultar), confirmación de eliminaciones y registro de eventos por ronda;
  - resumen en Markdown y para WhatsApp, con «Copiar resumen», «Descargar .md» e imagen PNG.
- **Pantalla del jugador:**
  - se une con código y nombre, sin cuenta;
  - rol tapado hasta que el jugador lo muestra;
  - de noche, el mismo panel cubierto para todos, con las opciones de su rol cuando le toca;
  - acusar, votar y, si es el Cazador, disparar;
  - reconexión al cerrar la pestaña.
- **Instrucciones** en ambas pantallas: un resumen y un modal con las reglas completas.

## Ejecutar en local

Requisitos: [Node.js 24](https://nodejs.org/) (LTS) y npm.

```bash
git clone https://github.com/atapia9/hombres-lobos-online.git
```

```bash
cd hombres-lobos-online
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
npm run bots -- CÓDIGO 6
```

- `npm test` ejecuta todas las pruebas (`node --test`); `npm run test:game` solo las de las reglas.
- `npm run dev` arranca el servidor y lo reinicia al cambiar archivos.
- `npm run bots` añade jugadores simulados a una sala: usan su habilidad de noche, disparan si son el Cazador y votan. Cambia `CÓDIGO` por el de tu sala; con `--auto` también acusan.

## Desplegar

1. El **cliente** se publica en GitHub Pages con el workflow [`pages.yml`](.github/workflows/pages.yml) en cada push a `main`.
2. El **servidor** se despliega en Render con [`render.yaml`](render.yaml), en el plan gratuito.
3. La URL del servidor se guarda en la variable del repositorio `SERVER_URL`.

Los pasos completos están en [`docs/despliegue.md`](docs/despliegue.md).

## Cómo jugar

1. Quien narra abre la pantalla del narrador y crea la sala.
2. Cada jugador escanea el QR o escribe el código y su nombre.
3. El narrador elige los roles especiales y el número de lobos. Con al menos 6 jugadores, inicia la partida: cada uno mira su rol en privado y los lobos ven a su manada.
4. **De noche**, cada rol actúa en su turno desde su teléfono. Los lobos eligen víctima.
5. **Al amanecer**, el narrador anuncia quién murió.
6. **De día** se discute en voz alta. Cualquiera acusa desde su teléfono y el narrador abre la votación entre los acusados.
7. Se repite hasta que ganen los Aldeanos (no queda ningún lobo) o los Lobos (igualan a los demás). Al terminar, el narrador comparte el resumen.

## Documentación

- [`docs/reglas.md`](docs/reglas.md): reglas base, orden de la noche y victoria.
- [`docs/roles.md`](docs/roles.md): catálogo de roles: quién, cuándo, qué información recibe y qué pasa si muere.
- [`docs/arquitectura.md`](docs/arquitectura.md): servidor, reglas puras, eventos, vistas, seguridad y persistencia.
- [`docs/despliegue.md`](docs/despliegue.md): GitHub Pages y Render.
- [`docs/historia.md`](docs/historia.md): familia de juegos, Davýdov, Werewolf y esta adaptación.
- [`docs/decisiones.md`](docs/decisiones.md): registro de decisiones (ADR) y aclaraciones de reglas D-1 a D-14.
- [`CHANGELOG.md`](CHANGELOG.md): cambios de cada versión.

## Limitaciones conocidas

- **Salas en memoria:** se pierden si el servidor se reinicia o se suspende (el plan gratuito de Render lo hace tras 15 minutos sin tráfico). Hay una propuesta con SQLite o Redis en [`docs/arquitectura.md`](docs/arquitectura.md#persistencia-limitación-actual).
- **Sin chat:** la discusión ocurre de viva voz, en persona o por videollamada.
- **Enamorados:** previstos para la versión 0.2.0.
- **Pruebas en navegador:** se hicieron en un navegador de escritorio, también con tamaño de teléfono. Falta probar en teléfonos reales y con lectores de pantalla.

## Crédito y licencia

**Mafia** es un juego creado por **Dmitri Davýdov**, psicólogo y entonces estudiante de la Universidad Estatal de Moscú. **Werewolf** es la variante de **Andrew Plotkin** (1997). Este proyecto es una adaptación independiente: no reclama ningún derecho sobre esos juegos, sus nombres ni el texto de sus reglas, y no usa nombres, textos ni ilustraciones de productos comerciales.

El código parte de [`mafia-online`](https://github.com/atapia9/mafia-online) y se publica con la [licencia MIT](LICENSE).

Las librerías copiadas en `public/vendor/` conservan su licencia MIT:
- [Socket.IO](https://socket.io/)
- [uqr](https://github.com/unjs/uqr)

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
