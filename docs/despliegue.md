# Despliegue

Hay dos partes:

1. **Cliente estático en GitHub Pages:** <https://atapia9.github.io/hombres-lobos-online/>
2. **Servidor del juego** (Node + Socket.IO), que necesita un hosting con WebSockets. Aquí se usa Render con el plan gratuito.

La URL del servidor llega al cliente a través de la variable del repositorio `SERVER_URL`.

## 1. GitHub Pages

En una cuenta GitHub Free, Pages solo funciona en repositorios **públicos**.

1. Activa Pages con la fuente **GitHub Actions**: *Settings → Pages → Build and deployment → Source: GitHub Actions*. También puedes hacerlo desde la terminal:

   ```bash
   gh api -X POST repos/atapia9/hombres-lobos-online/pages -f build_type=workflow
   ```

2. Cada push a `main` que cambie `public/`, `scripts/write-config.js` o el propio workflow ejecuta [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). Ese workflow:
   - instala las dependencias y pasa las pruebas;
   - escribe `public/config.js` con el valor de `SERVER_URL` (`scripts/write-config.js` solo acepta `https://`);
   - publica la carpeta `public/`.

3. También puedes lanzarlo a mano: *Actions → Pages → Run workflow*, o con:

   ```bash
   gh workflow run pages.yml
   ```

Mientras `SERVER_URL` no esté definida, `config.js` queda vacío y el cliente intenta usar el mismo origen (GitHub Pages), donde no hay servidor. La página mostrará «No se puede conectar con el servidor» hasta completar el paso 2.

## 2. Servidor en Render (plan gratuito)

El repositorio incluye [`render.yaml`](../render.yaml): un servicio web Node en el plan `free`, con `npm ci --omit=dev`, `npm start`, comprobación de salud en `/health`, `PORT=10000` y `NODE_ENV=production`. La versión de Node sale de `.nvmrc` (24).

1. Crea una cuenta en <https://render.com> y conecta tu cuenta de GitHub.
2. Elige **New → Blueprint** y selecciona el repositorio `atapia9/hombres-lobos-online`. Render leerá `render.yaml`.
3. Cuando te pida `CORS_ORIGIN`, escribe **solo el origen** de Pages, sin la ruta:

   ```
   https://atapia9.github.io
   ```

   Si escribes `https://atapia9.github.io/hombres-lobos-online`, el servidor no arrancará: es un error frecuente y se rechaza a propósito.

4. Espera a que termine el despliegue y copia la URL del servicio, por ejemplo `https://hombres-lobos-online-xxxx.onrender.com`. Comprueba que `https://…/health` responde `{"ok":true,…}`.
5. Guarda esa URL en la variable del repositorio y vuelve a publicar Pages:

   ```bash
   gh variable set SERVER_URL --body "https://hombres-lobos-online-xxxx.onrender.com"
   ```

   ```bash
   gh workflow run pages.yml
   ```

   También puedes hacerlo desde la web: *Settings → Secrets and variables → Actions → Variables*.

### Limitaciones del plan gratuito

- **Suspensión:** el servicio se suspende tras **15 minutos sin tráfico** y tarda alrededor de **un minuto** en despertar. Mientras tanto el cliente muestra «Conectando con el servidor…» y reintenta solo.
- **Salas en memoria:** al suspenderse o reiniciarse **se pierden las salas** (ver [`arquitectura.md`](arquitectura.md#persistencia-limitación-actual)).
- **Sugerencia:** abre la pantalla del narrador un par de minutos antes de jugar para despertar el servidor.

## Otras opciones

- **Otro hosting:** cualquier servicio que ejecute Node 24 y acepte WebSockets sirve. Configura `PORT`, `CORS_ORIGIN` y `NODE_ENV`, y apunta `SERVER_URL` a su URL https.
- **Otro servidor sin volver a publicar:** el cliente acepta `?server=https://…` en la URL de la página y lo recuerda en ese navegador. Hay un botón para volver al servidor predeterminado.

## Probar el cliente de Pages contra un servidor local

Sirve para comprobar el despliegue de Pages sin Render. Los navegadores permiten que una página https se conecte a `http://localhost`.

1. Arranca el servidor permitiendo el origen de Pages:

   ```bash
   CORS_ORIGIN=https://atapia9.github.io npm start
   ```

2. En el mismo equipo, abre esta dirección:

   ```
   https://atapia9.github.io/hombres-lobos-online/narrador.html?server=http://localhost:3000
   ```

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| «No se puede conectar con el servidor» en Pages | `SERVER_URL` no está definida, el servidor está dormido (espera un minuto) o la URL es incorrecta. |
| El handshake responde 403 | El origen de la página no está en `CORS_ORIGIN`. Revisa que sea `https://atapia9.github.io`, sin ruta. |
| El servidor no arranca en Render | `CORS_ORIGIN` lleva una ruta, o `PORT` no es un número. |
| Las salas desaparecen | El servidor se suspendió o se reinició; es la limitación de las salas en memoria. |

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
