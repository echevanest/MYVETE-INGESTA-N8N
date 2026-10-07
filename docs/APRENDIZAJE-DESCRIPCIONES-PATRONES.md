# `descripciones` y `patrones` — quién las escribe y cómo

Decisiones de Marcelo del 2026-10-07 (8.7s y 8.7t). **Nada de esto está
implementado:** las dos tablas existen desde el 2026-10-03 y están vacías. La
implementación es de 8.1 / 8.2.

La estructura de las tablas está en `supabase/schema.sql`.

Cada sección separa lo **decidido** (Marcelo) de lo **propuesto** (CODE, sin
confirmar) y de lo que sigue **sin definir**.

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

**Decidido:** un arreglo de objetos, al mismo nivel que `payload.medicacion`.
n8n lo recorre y guarda una fila de `descripciones` por elemento.

```json
"descripciones": [
  { "grupo": "valvulas", "subgrupo": "mitral", "opcion": "...", "orden": 0 },
  { "grupo": "camaras",  "subgrupo": "vi",     "opcion": "...", "orden": 0 }
]
```

| Clave del payload | Columna de `descripciones` | Notas |
|---|---|---|
| `grupo` | `grupo` (not null) | normalizado (sección 3) |
| `subgrupo` | `subgrupo` | normalizado; vacío o ausente → `NULL` |
| `opcion` | `opcion` (not null) | normalizado (sección 3) |
| `orden` | `orden` (default 0) | entero |
| — | `atencion_id` | lo pone n8n: `id` que devuelve `Insert Atención Cardiología`; el SPA no lo conoce |
| — | `id`, `created_at` | defaults de la base |

**Propuesto (CODE):**

- **Un solo pedido para todas las filas.** PostgREST acepta un arreglo JSON en
  el cuerpo del `POST /rest/v1/descripciones` e inserta todas las filas en una
  transacción: entran todas o ninguna. Cumple "una fila por elemento" con un
  nodo HTTP y sin loop. Con un pedido por elemento, un fallo a mitad de camino
  deja la atención con las descripciones a medias.
- **Un nodo Code antes del HTTP** (`Preparar descripciones`) que arma el
  arreglo final: normaliza, agrega `atencion_id` y descarta los elementos sin
  `grupo` o sin `opcion` (igual que `medicacion` descarta las filas sin
  fármaco).
- **Un IF antes del tramo**, como el del eco: sin `payload.descripciones`, con
  arreglo vacío o sin `id` de atención, el tramo no corre. Un POST con `[]` no
  hace falta.
- **`onError: continueRegularOutput` + alerta**, como el tramo del eco: un
  fallo al guardar las descripciones no frena el informe ni el mail.

**Sin definir:**

- **Qué significa `orden`.** El ejemplo trae `orden: 0` en los dos elementos y
  `schema.sql` dice "posición dentro de la atención". Si es la posición en toda
  la atención, lo puede poner n8n con el índice del arreglo y el SPA no lo
  manda. Si es la posición dentro del grupo, lo manda el SPA.
- **Qué alerta dispara un fallo** al guardar (el tramo del eco tiene la suya).

## 3. Normalización

**Decidido:** se normaliza todo, en el código que escribe, antes de insertar o
hacer upsert. La base no lo fuerza (sin CHECK: las columnas son texto libre y
las listas de `schema.sql` son los valores previstos, no una validación).

| Columna | Tablas | Regla |
|---|---|---|
| `patologia` | `patrones` | MAYÚSCULAS + espacios al borde + acentos + espacios internos |
| `grupo` | `descripciones`, `patrones` | minúsculas + espacios al borde + acentos + espacios internos |
| `subgrupo` | `descripciones`, `patrones` | igual que `grupo`; puede ser `NULL` |
| `opcion` | `descripciones`, `patrones` | minúsculas |

**Propuesto (CODE), el detalle de cada paso:**

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

- **Por qué importa:** para el UNIQUE de `patrones`, `CMD` y `cmd` son dos
  filas distintas. Sin normalizar, la frecuencia de una misma opción se reparte
  entre filas.
- **`patologia` y `grupo` no se unifican:** son entidades distintas. Hay grupos
  sin patología equivalente (`valvulas`, `camaras`, `funcion`) y los que se
  parecen no comparten nombre (grupo `estenosis_pulmonar`, patología `EP`).

**Sin definir:**

- **Hasta dónde se normaliza `opcion`.** Lo decidido es minúsculas. Quitarle
  acentos y pasar los espacios a guiones bajos la dejaría ilegible
  (`insuficiencia_mitral_leve`) y `opcion` es el texto que después se le
  vuelve a mostrar al profesional. Propuesta: minúsculas, sin espacios al
  borde y con los espacios internos repetidos reducidos a uno; acentos y
  espacios se conservan.
- **Dónde vive la función** (ver sección 7.2).

## 4. Patrones

**Decidido:**

- **Fase 1:** los patrones se sacan de Supabase (perfiles + botones rápidos).
- **Fase 2:** se depuran con el aprendizaje.

**Estado real al 2026-10-07 (verificado en el código y en Supabase):**

- **Los perfiles no están en Supabase.** Viven en el SPA: `PERFILES_BASE` en
  `interface/app.js` (3 perfiles: 2 de canino, 1 de felino) más los
  personalizados en el `localStorage` de cada navegador (`perfiles_${especie}`).
  Supabase tiene 7 tablas y ninguna es de perfiles. Migrarlos es el punto 8.2
  de `SPRINT-08-ESTADO.md`.
- **Los botones rápidos no son un dato aparte:** son los primeros 6 perfiles de
  la especie (`MAX_BOTONES_RAPIDOS`).
- **Un perfil no trae lo que `patrones` necesita.** Guarda `fc`, `fr`, `pas`,
  `pam`, `pad` y un texto de `anamnesis`. No tiene `patologia`, `grupo`,
  `subgrupo` ni `opcion`.

Por eso hoy no hay ninguna consulta que saque patrones de los perfiles: falta
la tabla y falta el dato.

**Propuesto (CODE), qué haría falta para la Fase 1:**

1. Una tabla de perfiles en Supabase (8.2) y, por perfil, su patología y la
   lista de opciones que precarga (`grupo`, `subgrupo`, `opcion`).
2. Con eso, la carga de `patrones` es un upsert contra el UNIQUE que ya existe.
   Forma de la consulta, con nombres de tabla supuestos:

   ```sql
   insert into public.patrones (patologia, grupo, subgrupo, opcion, frecuencia, updated_at)
   select p.patologia, o.grupo, o.subgrupo, o.opcion, 0, now()
   from public.perfiles p
   join public.perfil_opciones o on o.perfil_id = p.id
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
  group by 1, 2, 3, 4;
  ```

- **Esa consulta hoy no se puede correr:** `atenciones_cardiologia` no tiene
  columna `patologia`. Lo más cercano es `diagnostico_raw` (texto libre) y
  `acvim_estadio`.
- **Una columna `origen` en `patrones`** (`manual` / `aprendido`). Sin ella, el
  recálculo pisa los valores cargados a mano en la Fase 1 y no hay forma de
  distinguirlos.

**Sin definir:**

- De dónde sale la `patologia` de una atención (la elige el profesional en el
  SPA o se deriva de otra cosa).
- Con cuántas atenciones un patrón aprendido reemplaza al cargado a mano.

## 5. Corrección ortográfica y disclaimer

**Decidido:** se corrige la ortografía y se avisa con un disclaimer ("se
corrigió…").

**Propuesto (CODE):**

- **Dónde:** en el SPA, bajo el campo, en el momento en que se corrige. No en
  el informe: el informe lo lee el tutor y ya hay una regla escrita para los
  otros avisos ("El disclaimer es solo del SPA. El informe PDF no lo muestra",
  `CRITERIOS DE CLASIFICACION.md`). Para que quede rastro, una observación en
  la planilla, como `Email corregido: X → Y`.
- **Cómo se arma:** igual que el aviso del e-mail del tutor (8.7p): texto
  original → texto corregido, y si el profesional vuelve a escribir el
  original, se respeta. Ejemplo: `Se corrigió "tricuspidea" → "tricuspídea".
  Si el original estaba bien, volvé a escribirlo.`
- **Contra qué se corrige:** contra una lista cerrada (el catálogo de opciones
  conocidas), por distancia de letras, como los dominios de e-mail. Un
  corrector general o la IA sobre texto clínico puede cambiar un término
  correcto por otro parecido (`hipoquinesia` / `hipocinesia`,
  `aquinesia` / `acinesia`).

**Sin definir:**

- **Qué texto se corrige:** `opcion`, la anamnesis, el diagnóstico, las
  indicaciones o todos.
- **Si `opcion` es texto libre o sale de un catálogo.** Si sale de un
  desplegable no hay nada que corregir.
- **Relación con la normalización:** si `opcion` se guarda en minúsculas y sin
  acentos, corregirle la ortografía antes no cambia lo que queda en la base.

## 6. `frecuencia` y `confianza`

**Decidido:**

- **Fase 1:** a mano (o desde perfiles).
- **Fase 2:** aprendizaje.

**Propuesto (CODE):**

- En la Fase 2, `frecuencia` = cantidad de atenciones de esa patología en las
  que se eligió la opción (el `count(*)` de la consulta de la sección 4).
- `confianza` = esa cantidad dividida por el total de atenciones de la
  patología: un número entre 0 y 1.

**Sin definir:**

- La escala de `confianza` (la columna es `numeric`, sin rango).
- Qué valores llevan las filas de la Fase 1 cargadas a mano.

## 7. Opinión de CODE (consulta de 8.7t)

### 7.1 Payload

El arreglo de objetos es la forma correcta. Es la misma de `payload.medicacion`,
cada elemento es una fila de la tabla sin transformar y PostgREST lo inserta
entero en un pedido. Un objeto anidado por grupo (`{ valvulas: { mitral: [...] } }`)
obliga a n8n a aplanarlo y no puede expresar un `subgrupo` nulo sin una clave
inventada. No hay ningún problema con n8n. Los cambios que propongo están en la
sección 2: un solo pedido en vez de uno por elemento, y aclarar `orden`.

### 7.2 Normalización

En n8n solo, en el nodo Code que arma las filas. n8n es quien escribe y es la
única barrera que la base tiene; aunque el SPA normalizara, n8n tendría que
repetirlo. Una función compartida cuesta lo que ya cuesta el bloque de e-mail:
tres copias y un test que comprueba que sean iguales. El SPA no la necesita si
manda `grupo` y `subgrupo` desde constantes del código (ya normalizadas) y no
desde texto tipeado. Pasaría a compartirse el día que el SPA tenga que comparar
texto contra `patrones` para sugerir opciones.

### 7.3 Patrones

Hoy no se pueden sacar de los perfiles: no están en Supabase y no traen
patología ni opciones (sección 4). La Fase 1 depende de 8.2. Para la Fase 2,
recalcular desde `descripciones` y sumar una columna `origen`; antes hay que
resolver de dónde sale la patología de cada atención.

### 7.4 Disclaimer

En el SPA y en la planilla, no en el informe. Armado como el aviso del e-mail y
contra una lista cerrada (sección 5). Falta saber qué texto se corrige.
