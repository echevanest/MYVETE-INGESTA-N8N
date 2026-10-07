# `descripciones` y `patrones` — quién las escribe y cómo

Decisiones de Marcelo del 2026-10-07 (8.7s, 8.7t y 8.7u). **Nada de esto está
implementado:** las dos tablas existen desde el 2026-10-03 y están vacías. Lo
único hecho es la columna `patrones.origen` (8.7u). La implementación es de
8.1 / 8.2.

La estructura de las tablas está en `supabase/schema.sql`.

Cada sección separa lo **decidido** (Marcelo) de lo **propuesto** (CODE, sin
confirmar) y de lo que sigue **sin definir**.

## 0. Qué va en 8.1 y qué en 8.2

**Decidido:** el aprendizaje activo (sección 5) va en 8.2. Los patrones
iniciales se cargan a mano, sin esperar a que 8.2 migre los perfiles.

**Propuesto (CODE)**, el resto del reparto:

| Tema | Sección | Sub-fase |
|---|---|---|
| Columna `patrones.origen` | 4 | hecha (8.7u) |
| `payload.descripciones` en el SPA | 2 | 8.1 |
| Tramo de n8n: normalizar, insert único, alerta si falla | 2, 3 | 8.1 |
| Patología de la atención (campo en el SPA + dónde se guarda) | 4 | 8.1 |
| Carga a mano de los patrones iniciales (Fase 1) | 4 | 8.1 |
| Corrección automática de `opcion` con disclaimer | 5 | 8.1 |
| Aviso en textos largos | 5 | 8.1 |
| Recálculo de `patrones` desde `descripciones` (Fase 2) | 4, 6 | 8.2 |
| `frecuencia` y `confianza` por aprendizaje (Fase 2) | 6 | 8.2 |
| Aprendizaje activo | 5 | 8.2 (decidido) |
| Migrar los perfiles a Supabase | 4 | 8.2 (ya estaba en el roadmap) |

## 1. Quién escribe

**Decidido: n8n.** El SPA no escribe ninguna de las dos tablas.

- Escribe con la credencial `service_role` que ya usan los nodos de Supabase
  del workflow `MYVETE - Ingesta` (`lkOwTFmVTZu7EMoU`). Las tablas tienen RLS
  habilitado sin políticas, así que ninguna otra vía puede escribirlas.
- `descripciones` cuelga de una atención (`atencion_id`, FK con
  `on delete cascade`): las filas se insertan después de
  `Insert Atención Cardiología`, que es el nodo que devuelve ese `id`.
- `patrones` es un agregado sin FK. El `UNIQUE NULLS NOT DISTINCT
  (patologia, grupo, subgrupo, opcion)` sirve de destino para un upsert.
  `updated_at` no tiene trigger: lo actualiza quien escribe.

## 2. Payload: `payload.descripciones`

**Decidido:**

- Un arreglo de objetos, al mismo nivel que `payload.medicacion`. Cada elemento
  es una fila de `descripciones`.
- **Insert único:** n8n manda el arreglo entero en un solo pedido
  (`POST /rest/v1/descripciones` con un arreglo JSON en el cuerpo). PostgREST
  lo inserta en una transacción: entran todas las filas o ninguna.
- **`orden` es la posición dentro del grupo.** Lo manda el SPA; n8n no lo
  calcula.
- **Si el insert falla, sigue de largo y alerta**, como el tramo del eco
  (`onError: continueRegularOutput` + mail de alerta). No frena el informe ni
  el mail al tutor.

```json
"descripciones": [
  { "grupo": "valvulas", "subgrupo": "mitral", "opcion": "...", "orden": 0 },
  { "grupo": "valvulas", "subgrupo": "mitral", "opcion": "...", "orden": 1 },
  { "grupo": "camaras",  "subgrupo": "vi",     "opcion": "...", "orden": 0 }
]
```

| Clave del payload | Columna de `descripciones` | Notas |
|---|---|---|
| `grupo` | `grupo` (not null) | normalizado (sección 3) |
| `subgrupo` | `subgrupo` | normalizado; vacío o ausente → `NULL` |
| `opcion` | `opcion` (not null) | en minúsculas (sección 3) |
| `orden` | `orden` (default 0) | entero; posición dentro del grupo |
| — | `atencion_id` | lo pone n8n: `id` que devuelve `Insert Atención Cardiología`; el SPA no lo conoce |
| — | `id`, `created_at` | defaults de la base |

**Propuesto (CODE):**

- **Un nodo Code antes del HTTP** (`Preparar descripciones`) que arma el
  arreglo final: normaliza, agrega `atencion_id` y descarta los elementos sin
  `grupo` o sin `opcion` (igual que `medicacion` descarta las filas sin
  fármaco).
- **Un IF antes del tramo**, como el del eco: sin `payload.descripciones`, con
  arreglo vacío o sin `id` de atención, el tramo no corre.
- **La alerta**, con nodos propios (`IF - ¿Persistieron descripciones?` →
  `Preparar alerta descripciones` → `Alertar fallo descripciones`), a los
  mismos destinatarios y con la misma credencial que `Alertar fallo eco`.

**Sin definir:**

- Si `orden` reinicia por `grupo` o por `grupo` + `subgrupo`. El ejemplo de
  arriba supone por grupo.

## 3. Normalización

**Decidido:** se normaliza todo, en el código que escribe, antes de insertar o
hacer upsert. La base no lo fuerza (sin CHECK: las columnas son texto libre y
las listas de `schema.sql` son los valores previstos, no una validación).

| Columna | Tablas | Regla |
|---|---|---|
| `patologia` | `patrones` | MAYÚSCULAS + espacios al borde + acentos + espacios internos |
| `grupo` | `descripciones`, `patrones` | minúsculas + espacios al borde + acentos + espacios internos |
| `subgrupo` | `descripciones`, `patrones` | igual que `grupo`; puede ser `NULL` |
| `opcion` | `descripciones`, `patrones` | **solo minúsculas**: acentos y espacios se conservan |

**Propuesto (CODE), el detalle de cada paso** para `patologia`, `grupo` y
`subgrupo`:

1. **Espacios al borde:** se quitan (`trim`).
2. **Acentos:** se quitan (`á` → `a`, `ü` → `u`). Con el método habitual
   (`normalize('NFD')` y quitar las marcas) la `ñ` pasa a `n`.
3. **Espacios internos:** cada tramo de espacios pasa a un guion bajo, que es
   como están escritos los valores previstos (`tetralogia_fallot`).
4. **Mayúsculas o minúsculas**, según la columna.

| Entrada | Columna | Resultado |
|---|---|---|
| `" Tetralogía  Fallot "` | `patologia` | `TETRALOGIA_FALLOT` |
| `"Estenosis Pulmonar"` | `grupo` | `estenosis_pulmonar` |
| `"Tricuspídea"` | `subgrupo` | `tricuspidea` |
| `""` | `subgrupo` | `NULL` |
| `"Insuficiencia Mitral Leve"` | `opcion` | `insuficiencia mitral leve` |

- **Dónde vive la función:** en n8n solo, dentro de `Preparar descripciones`.
  n8n es quien escribe y es la única barrera; el SPA manda `grupo` y `subgrupo`
  desde constantes del código. Pasaría a compartirse (como el bloque de e-mail)
  el día que el SPA tenga que comparar texto contra `patrones`.
- **Por qué importa:** para el UNIQUE de `patrones`, `CMD` y `cmd` son dos
  filas distintas. Sin normalizar, la frecuencia de una misma opción se reparte
  entre filas.
- **`patologia` y `grupo` no se unifican:** son entidades distintas. Hay grupos
  sin patología equivalente (`valvulas`, `camaras`, `funcion`) y los que se
  parecen no comparten nombre (grupo `estenosis_pulmonar`, patología `EP`).

**Sin definir:**

- Si a `opcion` se le quitan también los espacios al borde y los espacios
  repetidos. "Solo minúsculas" al pie de la letra los deja, y `"leve"` y
  `"leve "` serían dos filas de `patrones`.

## 4. Patrones

**Decidido:**

- **Fase 1: se cargan a mano.** No se espera a 8.2.
- **Fase 2:** se depuran con el aprendizaje.
- **Columna `origen`** en `patrones`: `manual` / `aprendido`. Agregada el
  2026-10-07 (`supabase/migrations/20261007_patrones_origen.sql`): `text`,
  default `'manual'`, admite NULL, sin CHECK.
- **Patología de la atención:** se autocompleta si hay datos; si no, queda
  vacía y los profesionales la van completando.

**Por qué a mano (estado verificado el 2026-10-07):**

- **Los perfiles no están en Supabase.** Viven en el SPA: `PERFILES_BASE` en
  `interface/app.js` (3 perfiles: 2 de canino, 1 de felino) más los
  personalizados en el `localStorage` de cada navegador (`perfiles_${especie}`).
  Migrarlos es el punto 8.2 de `SPRINT-08-ESTADO.md`.
- **Los botones rápidos no son un dato aparte:** son los primeros 6 perfiles de
  la especie (`MAX_BOTONES_RAPIDOS`).
- **Un perfil no trae lo que `patrones` necesita.** Guarda `fc`, `fr`, `pas`,
  `pam`, `pad` y un texto de `anamnesis`. No tiene `patologia`, `grupo`,
  `subgrupo` ni `opcion`.

**Propuesto (CODE), Fase 1 (carga a mano):**

- Marcelo pasa la lista (patología, grupo, subgrupo, opción). Se escribe como
  un archivo `.sql` en `supabase/migrations/`, ya normalizado, y se ejecuta por
  la API de administración con el procedimiento de `docs/SUPABASE-DDL.md`.
  Queda versionado y se puede revisar antes de ejecutar.
- Las filas entran con `origen = 'manual'` (es el default).

  ```sql
  insert into public.patrones (patologia, grupo, subgrupo, opcion)
  values ('MMVD', 'valvulas', 'mitral', '...')
  on conflict on constraint patrones_unique do nothing;
  ```

**Propuesto (CODE), Fase 2 (depuración):**

- **Recalcular, no sumar de a uno.** Cada tanto se arma `patrones` desde
  `descripciones` con un `group by`, en vez de incrementar `frecuencia` en cada
  atención. Recalcular da siempre el mismo resultado; incrementar se desvía si
  una ejecución se repite o si se borra una atención.

  ```sql
  select a.patologia, d.grupo, d.subgrupo, d.opcion, count(*) as frecuencia
  from public.descripciones d
  join public.atenciones_cardiologia a on a.id = d.atencion_id
  where a.patologia is not null
  group by 1, 2, 3, 4;
  ```

- **El recálculo solo toca las filas con `origen = 'aprendido'`** o crea filas
  nuevas con ese origen. Las `manual` no se pisan.
- **Esa consulta hoy no se puede correr:** `atenciones_cardiologia` no tiene
  columna `patologia`. Hace falta agregarla (DDL, con OK previo) y que
  `Insert Atención Cardiología` la guarde, normalizada a MAYÚSCULAS.

**Sin definir:**

- **De dónde se autocompleta la patología:** de la última atención de la
  mascota, del estadio ACVIM / MINE 2 / HP que ya calcula el SPA, del texto del
  diagnóstico, o de una combinación.
- **Dónde se guarda:** falta la columna en `atenciones_cardiologia` y la clave
  en el payload.
- **Si la patología es una sola por atención** o pueden ser varias (un
  paciente con MMVD e hipertensión pulmonar).
- **Si es un desplegable** con las 19 previstas o texto libre.
- Con cuántas atenciones un patrón aprendido pasa a pesar más que uno manual.
- Si una fila `manual` que el aprendizaje confirma cambia de origen o queda
  `manual` con su `frecuencia` actualizada.

## 5. Corrección ortográfica, disclaimer y aprendizaje activo

**Decidido:**

- **`opcion`: se corrige automáticamente**, con un disclaimer ("se
  corrigió…").
- **Textos largos** (anamnesis, diagnóstico, indicaciones): **solo se avisa**,
  no se corrige.
- **Aprendizaje activo:** buscar términos parecidos, agendarlos y preguntar la
  diferencia. **Va en 8.2. No se implementa antes.**

**Propuesto (CODE):**

- **Dónde va el disclaimer:** en el SPA, bajo el campo, en el momento en que se
  corrige. No en el informe: el informe lo lee el tutor y ya hay una regla
  escrita para los otros avisos ("El disclaimer es solo del SPA. El informe PDF
  no lo muestra", `CRITERIOS DE CLASIFICACION.md`). Para que quede rastro, una
  observación en la planilla, como `Email corregido: X → Y`.
- **Cómo se arma:** igual que el aviso del e-mail del tutor (8.7p): texto
  original → texto corregido, y si el profesional vuelve a escribir el
  original, se respeta. Ejemplo: `Se corrigió "tricuspidea" → "tricuspídea".
  Si el original estaba bien, volvé a escribirlo.`
- **Contra qué se corrige `opcion`:** contra una lista cerrada, las opciones
  que ya existen en `patrones` para ese grupo y subgrupo, por distancia de
  letras, como los dominios de e-mail. Solo se corrige si hay un único
  candidato. Un corrector general o la IA sobre texto clínico puede cambiar un
  término correcto por otro parecido (`hipoquinesia` / `hipocinesia`).
- **Aviso en textos largos:** mismo criterio, sin tocar el texto: `Revisá
  "tricuspidea": ¿quisiste escribir "tricuspídea"?`.

**Sin definir:**

- **Si `opcion` es texto libre o sale de un desplegable.** Si sale de un
  desplegable no hay nada que corregir.
- **Cómo llega la lista de opciones al SPA** para corregir: el SPA no lee
  Supabase para datos clínicos (la lectura va por un webhook de n8n, igual que
  el autofill de 8.1).
- **Contra qué lista se avisa en los textos largos:** las opciones de
  `patrones` no cubren el vocabulario de una anamnesis.
- **Aprendizaje activo (8.2):** dónde se agendan los términos parecidos, a
  quién se le pregunta la diferencia y cuándo.

## 6. `frecuencia` y `confianza`

**Decidido:**

- **Fase 1:** a mano.
- **Fase 2:** aprendizaje.
- **`confianza` va de 0 a 1:** atenciones con la opción / atenciones de la
  patología.

**Propuesto (CODE):**

- En la Fase 2, `frecuencia` = cantidad de atenciones de esa patología en las
  que se eligió la opción (el `count(*)` de la consulta de la sección 4), y
  `confianza` = `frecuencia` dividido por el total de atenciones de esa
  patología. Ejemplo: 40 atenciones con MMVD, la opción aparece en 30 →
  `frecuencia` 30, `confianza` 0,75.
- Si la misma opción se elige dos veces en una atención, cuenta una
  (`count(distinct atencion_id)`): si no, `confianza` puede pasar de 1.

**Sin definir:**

- **Qué valores llevan las filas cargadas a mano.** Sin indicación, quedan con
  los defaults: `frecuencia` 0 y `confianza` NULL.
- Si la base tiene que rechazar una `confianza` fuera de 0-1 (hoy la columna es
  `numeric`, sin CHECK).
