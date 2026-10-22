# Catálogo de roles

Cada rol es un módulo en [`server/game/roles/`](../server/game/roles/) con su prueba en [`tests/game/roles/`](../tests/game/roles/). Los nombres son propios de este proyecto.

| Rol | Equipo | Único | Actúa de noche | Módulo |
|---|---|---|---|---|
| Aldeano | Aldeanos | No | No | `villager.js` |
| Vidente | Aldeanos | Sí | Paso 1 | `seer.js` |
| Protector | Aldeanos | Sí | Paso 2 | `protector.js` |
| Cazador | Aldeanos | Sí | No (al morir) | `hunter.js` |
| Alcalde | Aldeanos | Sí | No (de día) | `mayor.js` |
| Niña que espía | Aldeanos | Sí | No (recibe información) | `spy.js` |
| Bruja | Aldeanos (D-3) | Sí | Paso 4 | `witch.js` |
| Lobo | Lobos | No | Paso 3 | `wolf.js` |
| Lobo alfa | Lobos | Sí | Pasos 3 y 3b | `alpha.js` |

Enamorados: previstos para la versión 0.2.0 (D-8).

---

## Aldeano

- **Quién lo usa:** cualquier jugador al que no le toque otro rol.
- **Cuándo actúa:** solo de día: acusa y vota.
- **Qué información recibe:** ninguna especial. De noche ve «Esperando».
- **Si está muerto:** ya no acusa ni vota.

## Vidente

- **Quién lo usa:** un jugador, si el narrador activa el rol.
- **Cuándo actúa:** paso 1 de cada noche. Elige a un jugador vivo que no sea ella misma, una vez por noche.
- **Qué información recibe:** en privado, si ese jugador **es lobo o no** en ese momento. Si después lo convierte el alfa, una consulta posterior sí lo verá como lobo. Sus resultados se acumulan en su tarjeta de rol.
- **Si está muerta:** su paso se salta en silencio.

## Protector

- **Quién lo usa:** un jugador, si el narrador activa el rol.
- **Cuándo actúa:** paso 2 de cada noche. Elige a un jugador vivo, incluido él mismo.
- **Restricción:** no puede elegir a la **misma persona dos noches seguidas**, tampoco a sí mismo (D-2). Si una noche no protegió a nadie, a la siguiente puede elegir a cualquiera.
- **Efecto:** si protege a la víctima de los lobos, no muere ni puede ser convertida. **No** protege del veneno de la Bruja ni del disparo del Cazador.
- **Qué información recibe:** a quién protegió anoche. No sabe si salvó a alguien.
- **Si está muerto:** su paso se salta en silencio.

## Cazador

- **Quién lo usa:** un jugador, si el narrador activa el rol.
- **Cuándo actúa:** al morir, por los lobos, por el veneno o por votación (D-9):
  - de noche: dispara al amanecer, después de anunciar las muertes;
  - por votación: dispara de inmediato.
- **Efecto:** elige a otro jugador vivo, que muere. El día (o la noche) no avanza hasta que dispara o el narrador omite el disparo. La victoria se comprueba después del disparo.
- **Qué información recibe:** el aviso de que debe disparar. Al disparar, todos saben que era el Cazador.
- **Si lo retira el narrador:** no dispara. **Si lo convierte el alfa:** deja de ser Cazador y no dispara.

## Alcalde

- **Quién lo usa:** un jugador, si el narrador activa el rol. Es un rol **secreto** (D-7).
- **Cuándo actúa:** en la votación del día.
- **Efecto:** su voto vale **2**. Con la opción «El Alcalde desempata», si hay empate y él votó por uno de los empatados, sale ese jugador.
- **Qué información recibe:** ninguna especial. Los totales ponderados solo los ve el narrador; los jugadores ven quién votó a quién, sin pesos. Un desempate sí lo delata, y es inevitable.
- **Si está muerto:** su voto ya no cuenta. **Si lo convierte el alfa:** pierde el voto doble.

## Niña que espía

- **Quién lo usa:** un jugador, si el narrador activa el rol.
- **Cuándo actúa:** no elige nada: observa en silencio cada noche (D-5).
- **Qué información recibe:** cuando termina el turno de los lobos, a **quién eligieron** y si **coincidieron**. Nunca quiénes son los lobos.
- **Si está muerta:** deja de recibir informes.

## Bruja

- **Quién lo usa:** un jugador, si el narrador activa el rol. Juega con los Aldeanos (D-3).
- **Cuándo actúa:** paso 4 de la noche, solo si puede usar alguna poción.
- **Pociones** (una vez cada una en toda la partida):
  - **Vida:** salva a la víctima efectiva de la noche. Puede salvarse a sí misma.
  - **Muerte:** mata a un jugador vivo que no sea ella misma.
  - Puede usar las dos la misma noche.
- **Qué información recibe:** la víctima efectiva, es decir, después de la protección y de la conversión. Si el Protector salvó a la víctima o el alfa la convirtió, ve «no hay víctima».
- **Si está muerta:** su paso se salta en silencio.

## Lobo

- **Quién lo usa:** los jugadores del equipo de los lobos (también quien convierte el alfa).
- **Cuándo actúa:** paso 3 de cada noche, con toda la manada.
- **Efecto:** la víctima muere solo si **todos los lobos vivos** eligen a la misma persona (D-1). No puede elegir a otro lobo.
- **Qué información recibe:** desde el inicio, quiénes son los demás lobos y quién es el alfa; durante su paso, lo que eligen sus compañeros y si no coinciden.
- **Si está muerto:** ya no vota; la unanimidad se calcula con los lobos vivos.

## Lobo alfa

- **Quién lo usa:** un jugador, si el narrador activa el rol. Cuenta como lobo.
- **Cuándo actúa:** vota con la manada en el paso 3 y, una vez por partida, decide en el paso 3b (D-4).
- **Efecto de la conversión:**
  - la víctima no muere y se convierte en **Lobo** común;
  - pierde su habilidad anterior (si era Vidente, Protector, Bruja, Cazador, Alcalde o Niña, deja de serlo);
  - se entera en privado y se une a la manada desde la noche siguiente;
  - el amanecer anuncia que no murió nadie por los lobos.
- **Si la víctima estaba protegida:** no hay conversión y **no gasta** su habilidad. Se le pregunta igual, para no revelar la protección.
- **Qué información recibe:** lo mismo que un lobo, más si su habilidad sigue disponible.
- **Si está muerto:** el paso 3b se salta.

---

_Este material fue elaborado con asistencia de Claude (Anthropic) y revisado por [nombre]._
