# Reglas

Mafia es un juego creado por **Dmitri Davýdov** (1986–1987). Ver [`historia.md`](historia.md).

Este documento resume con nuestras propias palabras las reglas del modo original, tal como las implementa el proyecto. No es una traducción del texto «The Original Mafia Rules» del autor: Davýdov reclama derechos sobre ese texto.

Las secciones marcadas con 🛠 explican cómo resuelve la aplicación cada punto. Las decisiones están en [`decisiones.md`](decisiones.md), identificadas como R1 a R13.

## Índice

1. [Modo original de Davýdov](#modo-original-de-davýdov)
2. [Variante «Clásico con roles»](#variante-clásico-con-roles-no-forma-parte-del-original)

---

## Modo original de Davýdov

### Jugadores y equipos

- Se necesitan **al menos 6 jugadores** y un narrador, que no juega.
- Solo hay dos equipos: **Honestos** y **Mafia**. No hay roles especiales.
- Número de mafiosos recomendado:

  | Jugadores | 6–7 | 8–10 | 11–13 | 14–16 |
  |---|---|---|---|---|
  | Mafiosos | 2 | 3 | 4 | 5 |

- El narrador puede ajustar el número antes de empezar.

🛠 La aplicación admite hasta 20 jugadores. Entre 17 y 20 extiende la misma tabla, con la fórmula ⌊(n+1)/3⌋. El narrador puede elegir entre 1 y ⌊(n−1)/2⌋ mafiosos, para que siempre haya menos mafiosos que honestos (R8). Los roles se reparten al azar en el servidor con `crypto.randomInt`.

### Amanecer

- Cada jugador ve su rol en privado y después todos «cierran los ojos».
- **Reconocimiento:** los mafiosos se reconocen entre sí. Es su única ventaja.

🛠 El rol aparece tapado en el teléfono hasta que el jugador lo muestra, y se vuelve a tapar solo. A cada mafioso se le muestran sus compañeros.

### Día

- La discusión es libre. Cualquier jugador puede acusar a otro en cualquier momento, y el acusado puede defenderse.
- Cuando alguien pide votación, se vota. El acusado queda eliminado si vota «culpable» **la mayoría de los jugadores, sin contar al acusado**.
- Puede haber varias acusaciones y eliminaciones en un mismo día.
- Los eliminados **no revelan su rol** y no pueden ayudar a nadie.

🛠 Cómo funciona en la aplicación:
- Solo votan los vivos, y el acusado no vota.
- Hacen falta más de la mitad de los votos posibles: no votar cuenta como «no culpable» (R2).

  | Vivos | Votantes | Votos «culpable» necesarios |
  |---:|---:|---:|
  | 7 | 6 | 4 |
  | 5 | 4 | 3 |
  | 4 | 3 | 2 |
  | 2 | 1 | 1 |

- El jugador acusa desde su teléfono y el narrador abre la votación. Hay una votación a la vez (R3).
- Mientras se vota solo se ve cuántos han votado. Al cerrar, todos ven quién votó «culpable», como en una votación a mano alzada (R10).
- El narrador confirma el resultado o anula la votación. Una votación anulada no tiene ningún efecto y queda en el registro.

### Noche de la mafia (opcional)

- Se convoca por **mayoría de los vivos**.
- Cada participante elige en privado: los honestos eligen «Honesto» y los mafiosos eligen una víctima.
- La víctima muere solo si **todos los mafiosos vivos eligen el mismo nombre**. Si queda un solo mafioso vivo, su elección basta.
- El número de votos de mafia revela cuántos mafiosos siguen vivos.

🛠 Cómo funciona en la aplicación:
- **Convocar la noche:** cada vivo puede pedirla; el botón del narrador se activa cuando la pide más de la mitad de los vivos (R4).
- **Papeleta:** todos los vivos entregan una con el mismo aspecto en pantalla. Un mafioso no puede marcar «Honesto» ni elegirse a sí mismo o a un compañero (R5).
- **Papeletas que faltan:** si el narrador cierra la noche antes de tiempo, la de un honesto cuenta como «Honesto» y la de un mafioso como «sin víctima». En ese caso esa noche no muere nadie.
- **Anuncio al amanecer:** se dice quién murió y **cuántas papeletas de mafia hubo**.

### Victoria

- Ganan los **Honestos** si no queda ningún mafioso vivo.
- Gana la **Mafia** si todos los honestos han sido eliminados.

🛠 Cómo funciona en la aplicación:
- **Sin paridad:** la mafia no gana por igualar en número a los honestos (R7).
- **Terminar sin ganador:** el narrador puede hacerlo si la partida se bloquea.
- **Retirar a un jugador:** durante la partida cuenta como una eliminación (R12).

### Puntuación (opcional)

- Si gana la Mafia, cada mafioso vivo suma tantos puntos como honestos había al inicio.
- Si ganan los Honestos, cada honesto vivo suma tantos puntos como honestos sobrevivieron.

🛠 Con «Nueva partida con los mismos jugadores», la puntuación se acumula en la sala (R9). El narrador puede ocultarla del resumen.

### Rondas

🛠 En la aplicación, una **ronda** es un ciclo de Día y Noche, y la **partida** es el juego completo. Quien queda eliminado sigue fuera hasta el final de la partida (R1).

---

## Variante «Clásico con roles» (no forma parte del original)

Es una adaptación posterior, inspirada en Werewolf (Andrew Plotkin, 1997). Se activa al crear la sala y la interfaz la marca como variante.

- Hay noche en **cada ronda**, sin votarla (V1).
- La mafia sigue necesitando **unanimidad**. En esta variante, cada mafioso ve en vivo lo que eligen sus compañeros (V2).
- **Vidente:** cada noche consulta a un jugador vivo y descubre en privado si es de la Mafia o Honesto. Solo puede consultar una vez por noche (V3).
- **Doctor:** cada noche protege a un jugador vivo. Puede protegerse a sí mismo, pero no al mismo jugador dos noches seguidas. Si protege a la víctima, nadie muere (V4).
- La Vidente y el Doctor salen del equipo honesto. La variante está disponible desde 6 jugadores (V5).
- No se revela el rol de los muertos y no se anuncia el número de papeletas de mafia (V6).
- La victoria y la puntuación funcionan igual que en el modo original (V7).

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
