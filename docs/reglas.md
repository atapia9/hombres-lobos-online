# Reglas de Hombres Lobos Online

Estas son las reglas de **esta adaptación**. Están escritas por el proyecto y no reproducen las de ningún producto comercial. Las decisiones que concretan los puntos ambiguos están en [`decisiones.md`](decisiones.md) (D-1 a D-14). La ficha de cada rol está en [`roles.md`](roles.md).

## Jugadores y equipos

- De **6 a 18 jugadores**, más un **narrador** que no juega. Lo ideal son 8–12.
- Dos equipos:
  - **Aldeanos:** ganan si eliminan a todos los lobos.
  - **Lobos:** ganan si igualan o superan en número a los demás jugadores vivos.
- La Bruja juega con los Aldeanos (D-3).

## Composición

El narrador elige en la sala de espera qué roles especiales entran (Vidente, Protector, Bruja, Cazador, Alcalde, Niña que espía, Lobo alfa) y cuántos lobos comunes hay. El resto de la mesa son Aldeanos.

La aplicación **bloquea** el inicio si (D-10):

- hay menos de 6 o más de 18 jugadores;
- no hay ningún lobo;
- hay más de `⌈n/3⌉` lobos (contando al Lobo alfa);
- hay más roles que jugadores.

Y **avisa**, sin bloquear, si hay menos de `⌊n/4⌋` lobos. La recomendación es `⌊n/3⌋` lobos en total.

Cada rol especial aparece como mucho una vez. La composición es pública: todos saben qué roles hay en juego, no quién los tiene.

Los roles se reparten al azar con `crypto.randomInt` (Fisher–Yates).

## Ciclo de juego

```
Inicio → Noche 1 → Amanecer 1 → Día 1 → Noche 2 → …  hasta que gane un equipo
```

Una **ronda** es una noche, su amanecer y el día siguiente. La partida empieza de noche (D-11).

### 1. Inicio

Cada jugador ve su rol en privado, en su teléfono. Los lobos ven quiénes son sus compañeros y quién es el Lobo alfa.

### 2. Noche (orden fijo)

| Paso | Quién | Qué hace |
|---|---|---|
| 1 | Vidente | Elige a un jugador (no a sí misma) y sabe si es lobo o no. |
| 2 | Protector | Elige a un jugador para protegerlo de la víctima de los lobos. No puede elegir a la **misma persona dos noches seguidas**, tampoco a sí mismo (D-2). |
| 3 | Lobos | Eligen una víctima (nunca a un lobo). Muere solo si **todos los lobos vivos** eligen a la misma persona; si queda un solo lobo, su elección basta. Pueden cambiar de elección mientras el paso está abierto. |
| 3b | Lobo alfa | Si los lobos fijaron una víctima y el alfa no ha usado su habilidad, decide si la **convierte** en lobo en vez de matarla (D-4). |
| 4 | Bruja | Ve a la víctima efectiva (si la hay) y puede usar su poción de vida, su poción de muerte, ambas o ninguna (D-3). |
| — | Amanecer | El narrador cierra la noche. |

Reglas del orden (D-13):

- Cada paso termina cuando sus actores vivos han actuado.
- Si el rol del paso no existe, está muerto o no puede hacer nada (por ejemplo, la Bruja sin pociones útiles), el servidor salta el paso. Nadie lo nota, porque todas las pantallas de noche son privadas y todos los vivos ven el mismo panel cubierto.
- El narrador puede saltar el paso en curso. Para el paso de los lobos, saltar significa «sin víctima».

**Si los lobos no se ponen de acuerdo** (D-1): cuando todos han votado pero no coinciden, el narrador lo ve y puede pedirles que voten de nuevo o declarar que esa noche no hay víctima. El narrador **nunca** elige la víctima.

**Resolución de la noche**, en este orden:

1. **Protección:** si el Protector eligió a la víctima de los lobos, nadie muere por los lobos.
2. **Conversión:** si el alfa decidió convertir y la víctima no estaba protegida, la víctima se vuelve Lobo y no muere.
3. **Curación:** si la Bruja usó la poción de vida, la víctima se salva.
4. **Muertes:** muere la víctima de los lobos (si sigue siéndolo) y la persona envenenada por la Bruja. El Protector no protege del veneno.

### 3. Amanecer

- El narrador anuncia quién murió. **No se dice cómo** ni se revela el rol, salvo que el narrador active «Revelar el rol de cada jugador al morir» (D-12).
- Si murió el **Cazador**, dispara ahora: elige a otro jugador vivo, que muere con él (D-9). El narrador puede omitir el disparo si el Cazador no puede hacerlo.
- El día no empieza hasta resolver el disparo.

### 4. Día

1. **Discusión libre**, con temporizador opcional.
2. **Acusaciones:** cualquier jugador vivo acusa a otro desde su teléfono. Cada uno mantiene como mucho una acusación (una nueva reemplaza a la anterior). El narrador puede descartar acusaciones.
3. **Votación** (D-6, opción A): el narrador la abre entre todos los acusados. Cada jugador vivo marca a **uno** de los acusados (nunca a sí mismo) o se abstiene, y puede cambiar su voto mientras siga abierta.
4. **Resultado:** sale quien tenga más votos. El voto del **Alcalde vale doble** (D-7). Si hay empate, nadie sale; con la opción «El Alcalde desempata», sale el empatado por el que votó el Alcalde vivo, si votó por alguno de ellos.
5. El narrador **confirma** el resultado o **anula** la votación (anular permite repetirla). Solo hay una votación confirmada por día.
6. Si el eliminado es el Cazador, dispara de inmediato.
7. El narrador pasa a la noche.

Al cerrar la votación, todos ven el resultado. Si la opción «Mostrar a todos quién votó a quién» está activa, ven también quién votó por cada acusado (sin los pesos del Alcalde; los totales ponderados solo los ve el narrador).

## Victoria

Se comprueba cada vez que alguien muere:

- **Aldeanos:** no queda ningún lobo vivo.
- **Lobos:** los lobos vivos son tantos o más que los demás jugadores vivos.
- Si hay un disparo del Cazador pendiente, la victoria se decide **después** del disparo.

El narrador también puede terminar la partida sin ganador. Al terminar, todos ven todos los roles y el narrador puede copiar o descargar el resumen.

## Otras reglas

- **Retirar a un jugador:** el narrador puede retirar a alguien durante la partida. Cuenta como una eliminación, no revela su rol y no activa el disparo del Cazador.
- **Muertos:** no actúan, no votan y no deben revelar su rol.
- **Reconexión:** quien cierra la pestaña vuelve a su asiento con el mismo navegador. Desde otro dispositivo, entra con su nombre y el narrador aprueba que recupere su asiento.
- **Nueva partida:** «Nueva partida con los mismos jugadores» vuelve a la sala de espera con la misma configuración.

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
