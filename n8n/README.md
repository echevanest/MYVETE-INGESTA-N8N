# /n8n

Carpeta de documentación de los flujos de trabajo de n8n Cloud usados por este proyecto.

No contiene lógica del proyecto en sí — es el respaldo local de lo que vive en `echevanest.app.n8n.cloud`. Acá van, a medida que se definan e implementen en n8n:

- Plantillas JSON exportadas de cada workflow (respaldo ante cambios o errores en la nube).
- Notas de configuración de nodos que no queden claras solo con el JSON (credenciales referenciadas, nombres de hojas de cálculo, direcciones de correo de destino).

## Estado actual (2026-10-07)

| Workflow | ID | Estado | Rol |
|---|---|---|---|
| `MYVETE - Ingesta` | `lkOwTFmVTZu7EMoU` | `active: false` (sin versión publicada) | Workflow principal (43 nodos desde 8.7h, path `ingesta-filiacion`). Se publica solo para pruebas E2E. |
| `MYVETE - Alta Profesional` | `MlEGaxt7k6H9SAfP` | `active: true` | Alta/upsert de profesionales (Sprint 7) + limpieza de la firma reemplazada (8.7d). |
| `MYVETE - Ingesta (CORE) [BACKUP - NO TOCAR]` | `5gGWXOjY2BBOAfuw` | `active: false` | Backup histórico (8 nodos, path `ingesta-filiacion-v4`). **Ya no es producción** — las secciones de abajo que lo describen como activo son históricas. Sigue mandando `metricas`, columna que ya no existe: si se reactiva, su insert de atención falla. |

### `MYVETE - Ingesta` — Sub-fase 8.7r (2026-10-07)

Respuestas P1-P6 de 8.7q. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 77 → 78, 43 nodos) con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). Cambian 4 nodos; conexiones iguales. **Sin E2E: nada de esto corrió todavía en n8n** (lo hace Marcelo).

*   **`Registrar en Índice`:** `observaciones` suma `Verificar email: dominio parecido a uno conocido` cuando `Preparar Datos para PDF` devuelve `email_estado = 'sospechoso'`. Va al final, después de `Email corregido: X → Y` (los dos casos no se dan juntos). `estado_persistencia` no cambia.
*   **`Insert Atención Cardiología`:** `datos_filiacion.tutor.email` lleva el e-mail que devolvió `Upsert Tutor` (`$('Upsert Tutor').item.json.email`, la fila de `tutores` recién guardada), o sea el corregido. Solo se reemplaza si el payload traía un e-mail no vacío; sin e-mail, `datos_filiacion` queda como llegó. El resto de `datos_filiacion` y las otras 37 columnas no cambian. No lleva copia del bloque `EMAIL-PURO`: lee lo que ya guardó `Upsert Tutor`.
*   **`Preparar Datos para PDF`** (copia en `preparar_datos_pdf.8.7r.js`) y **`Upsert Tutor`** (copia en `upsert_tutor.8.7r.js`): bloque `EMAIL-PURO` con 11 dominios válidos más (`yahoo.com.co`, `yahoo.com.pe`, `yahoo.com.ve`, `yahoo.cl`, `outlook.cl`, `outlook.com.br`, `outlook.pt`, `hotmail.cl`, `hotmail.com.br`, `live.com.mx`, `live.com.pt`). Dejan de ser sospechosos; nada más cambia.
*   **Sin cambios, por decisión de Marcelo:** n8n corrige siempre, aunque el profesional haya reescrito el e-mail en el SPA; `live.com` sigue entre los corregibles.
*   **Verificación:** las expresiones de `Upsert Tutor`, `Insert Atención Cardiología` y `Registrar en Índice` se evaluaron localmente con el motor de expresiones de n8n (`@n8n/tournament`), encadenadas, con el payload de `E2E-8.7o.payload-test.json`; sin corrección, el insert sale idéntico al de 8.7q. La versión viva se releyó por API: idéntica a la probada. **Sin verificar en n8n:** que `Upsert Tutor` devuelva la fila con `email` como se supone (`Upsert Mascota` ya lee `id` de esa misma salida) y las expresiones largas en la nube.
*   **Backups:** `workflow_B.pre-8.7r.json` y `workflow_B.post-8.7r.json`. Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7q (2026-10-07)

Respuestas P1-P6 de 8.7p. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 76 → 77, 43 nodos) con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). Cambian 3 nodos; conexiones iguales. **Sin E2E: nada de esto corrió todavía en n8n** (lo hace Marcelo: un fármaco + un e-mail con typo).

*   **`Upsert Tutor`** (copia de la expresión en `upsert_tutor.8.7q.js`): `tutores.email` se guarda con el dominio corregido. El nodo corre antes que `Preparar Datos para PDF`, así que el `jsonBody` lleva su propia copia del bloque `EMAIL-PURO` dentro de una función. Si no hay corrección, manda el e-mail tal como llega (igual que antes). El `on_conflict` de la URL no cambió.
*   **`Preparar Datos para PDF`** (copia en `preparar_datos_pdf.8.7q.js`):
    *   Bloque `EMAIL-PURO` actualizado: estado nuevo `sospechoso` (se parece a un dominio conocido y no es deducible); `desconocido` queda para los dominios propios. Ninguno de los dos se corrige. La salida suma `email_estado`; **ningún nodo lo lee**.
    *   **TRATAMIENTO:** el estado se muestra solo si es `(Nueva)` o `(Modificada)`; los que continúan salen sin rótulo.
*   **`Registrar en Índice`:** `observaciones` suma al final `Email corregido: X → Y` cuando `Preparar Datos para PDF` corrigió el e-mail (lo lee con `.first()`). `estado_persistencia` no cambia: una corrección sola deja `OK` con la observación.
*   **Tres copias del bloque `EMAIL-PURO`:** `interface/app.js`, `Preparar Datos para PDF` y `Upsert Tutor`. `tests/email.test.mjs` comprueba que sean iguales; si cambia una, cambian las tres.
*   **Verificación:** las dos expresiones se evaluaron localmente con el motor de expresiones de n8n (`@n8n/tournament`) y el nodo Code con el payload de `E2E-8.7o.payload-test.json` (sin corrección ni fármacos que continúan, el informe sale idéntico al de 8.7p). La versión viva se releyó por API: idéntica a la probada. **Sin verificar en n8n:** que la expresión larga de `Upsert Tutor` evalúe igual en la nube y la lectura de `Preparar Datos para PDF` desde `Registrar en Índice`.
*   **Backups:** `workflow_B.pre-8.7q.json` y `workflow_B.post-8.7q.json`. Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7p (2026-10-05)

Medicación (Fase 1) y corrección del dominio del e-mail. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 75 → 76, 43 nodos) con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). Cambian 2 nodos; conexiones iguales. **Sin E2E: nada de esto corrió todavía en n8n.**

*   **`Insert Atención Cardiología`:** suma `medicacion` (38 columnas): el arreglo de `body.medicacion` sin las filas sin nombre de fármaco; `[]` si no viene. La columna se creó antes del PUT (`supabase/migrations/20261005_medicacion.sql`): con el orden inverso, el insert de la atención falla.
*   **`Preparar Datos para PDF`** (copia en `preparar_datos_pdf.8.7p.js`):
    *   Sección nueva **TRATAMIENTO**, después de INDICACIONES: `- Medicamento - dosis - intervalo (Continúa | Nueva | Modificada)`. Sin fármacos, la sección no sale. Los eliminados no viajan en el payload.
    *   Corrección del dominio del e-mail del tutor: el bloque `EMAIL-PURO` es copia textual del de `interface/app.js` (`tests/email.test.mjs` comprueba que sean iguales). Solo corrige lo deducible; el resto sigue como llegó. La salida suma `email_recibido` y `email_corregido`; `email` es el corregido, y es el que leen `IF - ¿Tutor con email?`, `Enviar informe al tutor`, `Buscar rebote inmediato` y `Verificación final`.
    *   **No cambia:** `Upsert Tutor` guarda el e-mail como llega; la planilla no anota que hubo corrección; un dominio desconocido no dispara ninguna alerta en n8n. (Los dos primeros puntos cambiaron en 8.7q.)
*   **Rebote (solo lectura):** `Buscar rebote inmediato` sigue buscando `subject:"Delivery Status Notification (Failure)"` de `mailer-daemon@googlemail.com`; `Esperar rebote`, 20 s; `Evaluar rebote` y `Verificación final`, idénticos a las copias de 8.7h. Los `(Delay)` no se miran.
*   **Verificación:** los 2 nodos se probaron localmente con los datos de la ejecución 3090; la versión viva se releyó por API: idéntica a la probada.
*   **Backups:** `workflow_B.pre-8.7p.json` y `workflow_B.post-8.7p.json`. Sin secretos.

### `MYVETE - Ingesta` — E2E 8.7o (2026-10-05)

Publicado, una corrida con `E2E-8.7o.payload-test.json` (ejecución 3090, `success`) y despublicado (`active: false`, `activeVersionId: null`). Sin `PUT`: la versión es la de 8.7m. Resultado y lo que quedó sin cubrir en `E2E-8.7o.md`. **Backup:** `workflow_B.post-8.7o.json`.

### `MYVETE - Ingesta` — Sub-fase 8.7m (2026-10-04)

`method: GET` explícito en `Exportar PDF (autenticado)` y `Buscar colisiones PDF`, los dos `httpRequest` que no lo traían (8.7l los había dejado sin tocar). `PUT /workflows/lkOwTFmVTZu7EMoU` con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E.**

*   GET ya era el valor por defecto de esos nodos: no cambia el comportamiento. Los 14 `httpRequest` del workflow tienen ahora `method` escrito.
*   El resto de los parámetros de los dos nodos y las conexiones quedaron iguales (comparado contra el backup previo).
*   **Backups:** `workflow_B.pre-8.7m.json` y `workflow_B.post-8.7m.json`. Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7l (2026-10-04)

Defaults explícitos en el loop de rebote. `PUT /workflows/lkOwTFmVTZu7EMoU` con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E.**

*   **`Esperar rebote`:** vuelve a decir `unit: seconds` (estaba solo `amount: 20`).
*   **`Buscar rebote inmediato`:** vuelve a decir `method: GET` (no traía `method`).
*   **Por qué faltaban:** `seconds` y `GET` son los valores por defecto de esos nodos, y n8n no los escribe en el JSON cuando el workflow se guarda desde el editor. El comportamiento era el mismo; ahora queda escrito. **Un guardado desde el editor los puede volver a sacar** sin que eso cambie nada.
*   **Sin tocar:** `Exportar PDF (autenticado)` y `Buscar colisiones PDF` tampoco traen `method` (ya era así en `workflow_B.post-8.7h.json`); usan el GET por defecto. Se explicitaron en 8.7m.
*   **Backups:** `workflow_B.pre-8.7l.json` y `workflow_B.post-8.7l.json`. Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7k (2026-10-04)

Dos cambios de texto, sin nodos nuevos ni cambios de conexiones. `PUT /workflows/lkOwTFmVTZu7EMoU` con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E: nada de esto corrió todavía en n8n.**

*   **`IA - Estructurar Anamnesis`:** el system prompt suma que el diagnóstico no se extrae ni se infiere de la anamnesis, que `diagnostico_sugerido` va siempre en null y que no entra en `resumen_anamnesis`. El esquema de salida no cambia (la clave sigue existiendo). El SPA muestra el aviso "No incluir el diagnóstico" bajo el campo.
*   **`Preparar Datos para PDF`:** la línea "Estadio ACVIM" ya no lleva "(indicado por el profesional)" cuando `acvim_origen = 'manual'`; sale solo el valor. `acvim_origen` se sigue guardando en Supabase.
*   **Sin tocar:** el respaldo `examen.diagnostico || informe.diagnostico_sugerido` sigue en el código de `Preparar Datos para PDF`. Con la IA devolviendo null no aporta nada; depende del prompt, no de una garantía en código.
*   **Diferencias previas al PUT:** respecto de `workflow_B.post-8.7h.json`, el workflow vivo ya traía cambios de posición en 26 nodos y dos parámetros sin su valor por defecto explícito (`Esperar rebote` sin `unit`, `Buscar rebote inmediato` sin `method`). No son de 8.7k; quedaron tal cual.
*   **FR en el informe:** con el default nuevo del SPA, la línea sale `FR: 20 rpm (Eupneico)` si no se cambia.
*   **Backups:** `workflow_B.pre-8.7k.json` (antes del PUT) y `workflow_B.post-8.7k.json` (vivo después del PUT). Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7h (2026-10-02)

Ventana del rebote a 2 minutos, salidas rápidas del loop y validación del e-mail. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 44 → 45, 42 → 43 nodos), con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E: nada de esto corrió todavía en n8n.**

*   **Ventana:** `Evaluar rebote` corta a los 2 minutos desde el envío (antes 10): unas 6 vueltas de 20 s. Sin rebote en la ventana, el mail se da por entregado. Copia en `n8n/evaluar_rebote.8.7h.js`.
*   **Gmail no aceptó el mail:** nodo nuevo `IF - ¿Gmail aceptó el mail?` después de `Iniciar verificación de rebote`. Verdadero entra al loop; falso va directo a `Verificación final` (antes daba una vuelta de 20 s y una búsqueda).
*   **La búsqueda del rebote falla:** con 400, 401 o 403 que no sea de cuota, sale en la primera vuelta; con cuota, 429, 5xx o error de red, sale a los 3 fallos seguidos (cerca de un minuto y medio, porque cada búsqueda fallida reintenta 3 veces). Una búsqueda buena en el medio reinicia la cuenta. Si ninguna búsqueda anduvo, la planilla anota "Mail enviado; no se pudo verificar el rebote (motivo)"; no cuenta como fallo del mail. El código HTTP sale del principio de `error.cause.message` ("403 - …"), que es donde lo deja n8n (visto en la ejecución 3050).
*   **E-mail mal formado:** `IF - ¿Tutor con email?` suma una tercera condición, el formato `algo@algo.algo` sin espacios (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Si no cumple, no se envía. `Verificación final` (copia en `n8n/verificacion_final.8.7h.js`) distingue los dos casos de esa rama falsa: sin e-mail o `N/D` no es fallo; mal formado es fallo del mail (`mail_ok` falso, planilla `FALLO`, `Alertar fallo mail` con el e-mail recibido). La misma regla está en el SPA (`EMAIL_VALIDO` en `interface/app.js`), que no deja enviar; la de n8n queda como segunda barrera.
*   **Verificación:** la rama del mail entera (los 4 IF y los 3 nodos Code) se simuló localmente con los datos de la ejecución 3050 y 13 casos, incluido el 403 de cuota real de esa ejecución. La versión viva se releyó por API: idéntica a la probada. **Sin verificar en n8n:** el loop, la expresión con la expresión regular dentro del IF y la cuenta de fallos seguidos (depende de leer corridas anteriores con `first(0, runIndex)`; si eso no anduviera, la salida por 3 fallos no se dispara y el loop corta igual a los 2 minutos).
*   **Backups:** `workflow_B.pre-8.7h.json` (antes del PUT) y `workflow_B.post-8.7h.json` (vivo después del PUT). Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7g (2026-10-02)

**La ventana de 10 minutos de esta sub-fase pasó a 2 minutos en 8.7h.**

Alerta de fallo de mail y verificación del rebote repetida hasta 10 minutos. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 43 → 44, 37 → 42 nodos), con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E: nada de esto corrió todavía en n8n.**

*   **Loop del rebote:** `Enviar informe al tutor` → `Iniciar verificación de rebote` (Code, nuevo: guarda la hora del envío y si Gmail devolvió `id`) → `Esperar rebote` (Wait, 20 s) → `Buscar rebote inmediato` → `Evaluar rebote` (Code, nuevo; copia en `n8n/evaluar_rebote.8.7g.js`) → `IF - ¿Seguir esperando rebote?` (nuevo): verdadero vuelve a `Esperar rebote`, falso sigue a `Verificación final`.
*   **Cuándo sale del loop:** Gmail no aceptó el mail (una sola vuelta), apareció un rebote, o la próxima vuelta ya no entra en los 10 minutos desde el envío (unas 29 vueltas). Sin rebote en 10 minutos, el mail se da por entregado. Si ninguna búsqueda anduvo, la planilla anota "no se pudo verificar el rebote", como antes.
*   **`Buscar rebote inmediato`:** el `after:` de la búsqueda sale ahora de la hora del envío menos 2 minutos (antes, "hace 5 minutos" desde cada búsqueda, que con el loop habría dejado de cubrir el envío).
*   **`Verificación final`:** lee el rebote de `Evaluar rebote` y arma `alerta_mail_asunto` / `alerta_mail_cuerpo`. Copia en `n8n/verificacion_final.8.7g.js`.
*   **Alerta (nodos nuevos):** `IF - ¿Falló el mail?` (`mail_ok` falso: Gmail no devolvió `id` o hubo rebote) → `Alertar fallo mail`, a `echevanest@gmail.com, infoacivet@gmail.com`, credencial `Gmail - echevanest@gmail.com`, asunto "El informe NO se pudo enviar al tutor", cuerpo con paciente, tutor, error, link del PDF y del Google Doc. **Tutor sin email no dispara la alerta.**
*   **Dónde cuelga la alerta:** de `Verificación final`, igual que `Alertar fallo Drive`, y no directamente de `Buscar rebote inmediato`. Si el fallo saliera antes de `Verificación final`, esa ejecución no registraría la fila `FALLO` en la planilla.
*   **Duración:** con tutor con email y sin rebote, la ejecución queda abierta unos 10 minutos (29 esperas de 20 s) y la planilla, el borrado del Doc y las alertas llegan al final. `Respond to Webhook` sale antes, en otra rama: el SPA no espera. El workflow no tiene timeout configurado.
*   **Verificación:** los 3 nodos Code se probaron localmente con los datos de la ejecución 3050 y 6 casos (sin rebote, rebote en la 4.ª vuelta, Gmail no acepta, todas las búsquedas fallan, tutor sin email, búsqueda fallida seguida de rebote). La versión viva se releyó por API: idéntica a la probada. **Sin verificar en n8n:** el loop en sí (vuelta del IF al Wait) y la lectura de corridas anteriores con `first(0, runIndex)`; el rebote se decide con la entrada directa del nodo, que no depende de eso.
*   **Backups:** `workflow_B.pre-8.7g.json` (antes del PUT) y `workflow_B.post-8.7g.json` (vivo después del PUT). Sin secretos.

**Cuenta de Google — auditoría del 2026-10-02 (solo lectura).** Los 9 nodos de Drive/Docs usan `Google Drive - infoacivet (MYVETE)` (`4ugwVBPjLZ0Me9JS`); los 2 del mail al tutor, `Gmail account INFOACIVET`; las 3 alertas (4 desde 8.7g), `Gmail - echevanest@gmail.com`; la planilla, `Google Sheets account`. Son 4 credenciales OAuth2 distintas; la API pública no muestra el `client_id` de ninguna. El 403 de la ejecución 3050 fue del límite `defaultPerMinutePerProject` (12.000 pedidos por minuto para todo el proyecto `498586711441`), y en esa ventana esta instancia corrió una sola ejecución: el proyecto lo comparten muchos usuarios, no es propio. Que sea la app OAuth de n8n Cloud es lo más probable y no está probado; se confirma abriendo la credencial en n8n (si no muestra Client ID, es la de n8n). De las credenciales de Gmail y Sheets no hay ningún dato de proyecto.

### `MYVETE - Ingesta` — Sub-fase 8.7f (2026-10-02)

Correcciones posteriores al E2E del 2026-10-02 (ejecución 3050): la subida del PDF a Drive falló con **403 por cuota de Google** (`Quota exceeded for quota metric 'Queries'… project_number:498586711441`), el resto siguió de largo (`onError: continueRegularOutput`), la ejecución terminó "Succeeded", la planilla dijo `OK` sin `nombre_pdf` ni `link_pdf` y el Google Doc se borró igual. El mail sí salió. `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 42 → 43, 31 → 37 nodos), con el workflow **despublicado** (`active: false`, `activeVersionId: null` antes y después). **Sin E2E: nada de esto corrió todavía en n8n.**

*   **Reintentos en Drive:** `Guardar PDF en Drive (subir)`, `Nombrar y mover PDF`, `Buscar colisiones PDF` y `Renombrar PDF (colisión)` llevan `retryOnFail`, 3 intentos, 4 s entre intentos. Siguen con `onError: continueRegularOutput`: si los 3 fallan, el error sigue de largo y lo detecta la verificación final.
*   **Verificación del mail (nodos nuevos):** después de `Enviar informe al tutor` van `Esperar rebote` (Wait, 20 s) y `Buscar rebote inmediato` (HTTP GET a `gmail/v1/users/me/messages`, credencial `Gmail account INFOACIVET`, que es la casilla que envía). Busca `from:mailer-daemon@googlemail.com subject:"Delivery Status Notification (Failure)" "<email del tutor>" after:<hace 5 min>`. Los `(Delay)` no se miran. Si la búsqueda falla, el mail se da por enviado y la planilla lo anota.
*   **`Verificación final` (Code, nuevo):** lee la salida de los nodos de Drive, del mail y del rebote y resuelve `pdf_ok`, `mail_ok`, `persistio`, `estado_final` y `observaciones`. Copia del código en `n8n/verificacion_final.8.7f.js`. Reglas: el PDF está guardado si la subida devolvió `id` y hay `webViewLink`; el mail está bien si Gmail devolvió `id` y no hubo rebote; **tutor sin email no cuenta como fallo** (se anota en observaciones).
*   **`IF - ¿Se envió el mail Y se guardó el PDF?` (nuevo):** solo por la rama verdadera corre `Eliminar Google Doc`. Si no, el Doc queda en el Drive de infoacivet y su link va a `observaciones` y a la alerta.
*   **`IF - ¿Persistió PDF en Drive?` + `Alertar fallo Drive` (nuevos):** mail a `echevanest@gmail.com, infoacivet@gmail.com` (credencial `Gmail - echevanest@gmail.com`, la de las otras alertas), asunto "El PDF del informe no se pudo guardar en Drive", cuerpo con paciente, error y link al Google Doc.
*   **`Registrar en Índice`:** `estado_persistencia` pasa a ser `OK` solo si se guardó la atención **y** se envió el mail **y** se guardó el PDF; si no, `FALLO`, con el motivo en `observaciones` (antes siempre vacía). Todas las columnas salen de `Verificación final`.
*   **Cambio de topología:** de `Exportar PDF (autenticado)` salen ahora dos ramas (antes tres): Drive y mail. `Eliminar Google Doc`, `Registrar en Índice` e `IF - ¿Persistió en Supabase?` cuelgan de `Verificación final`, al final de la rama del mail. **La rama de Drive tiene que quedar arriba de la del mail en el lienzo:** con `executionOrder: v1` es lo que hace que termine antes. Si alguien las reordena, la verificación lee Drive como "no ejecutado" y marca `FALLO` (no borra el Doc).
*   **Cuenta de Google:** el proyecto `498586711441` del error no se pudo identificar por la API de n8n (no expone el client ID de la credencial). Si es la app OAuth compartida de n8n Cloud, la cuota la consumen otros clientes y la salida de fondo es un cliente OAuth propio. Pendiente de Marcelo.
*   **Backups:** `workflow_B.pre-8.7f.json` (antes del PUT) y `workflow_B.post-8.7f.json` (vivo después del PUT). Sin secretos.

### `MYVETE - Ingesta` — Sub-fase 8.7d (2026-10-01)

Correcciones previas a repetir el E2E que falló el 2026-09-30 (ejecución 2992: el `profesional_id` del SPA ya no existía y el insert de la atención falló por la FK). `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 41 → 42), **sin activar**. Se tocaron 4 nodos; conexiones y credenciales sin cambios:

*   **IF - ¿Trae Ecocardiografía?:** segunda condición (AND): `Insert Atención Cardiología` tiene que haber devuelto `id`. Antes bastaba con que el payload trajera eco, y el insert del eco se intentaba con `atencion_id` nulo aunque la atención hubiera fallado.
*   **Preparar Datos para PDF:**
    *   Unidades: todas las lineales se rotulan en **mm** (`dvid`, `dvs`, `sivd`, `sivs`, `ppvid`, `ppvis`, `ai_lineal`, `ao_lineal`, `dvccd`, `tapse`, `mapse`, además de las del VD). El nodo **no convierte**: el SPA ya manda mm. `DVD/DVI = dvdd / dvid`.
    *   Fecha: sale arriba de "DATOS DEL PACIENTE" y se repite al pie, en la línea de la firma y sobre el margen opuesto (tabulaciones por defecto de Docs: 4 después de la imagen de la firma, 9 si no hay firma). Se calcula con `timeZone: 'America/Argentina/Buenos_Aires'`. `firma_index` sigue apuntando al inicio de esa línea.
*   **Preparar alerta** y **Preparar alerta eco:** informan el estado real de cada nodo. Leían con `$(nodo).item`, que solo resuelve nodos de la propia rama; los de ramas paralelas (eco, Drive) daban `undefined` y la alerta decía "no aplica (sin eco en el payload)", "Guardar PDF Drive: FALLO" y "PDF: no disponible" aunque hubieran corrido bien. Ahora leen con `$(nodo).first(0)`. La alerta del eco ya no afirma que la atención se guardó. Se sumó la línea "Firma en el informe".
*   **Verificación:** los 4 nodos se probaron localmente reproduciendo la ejecución 2992; el acceso con `first(0)` a un nodo de otra rama se confirmó en n8n Cloud con un workflow temporal (creado, llamado una vez y borrado); la versión viva se releyó por API: idéntica a la probada. **Sin verificar:** la posición de la fecha al pie en el PDF real (depende del render de Google Docs).
*   **Acoplamiento con el SPA:** este nodo rotula en mm lo que recibe. Con un SPA anterior a 8.7d (que manda cm), el informe diría "3.11 mm". El SPA de 8.7d tiene que estar desplegado antes del E2E.
*   **Backups:** `workflow_B.pre-8.7d.json` y `workflow_B.post-8.7d.json`. Sin secretos.

### `MYVETE - Alta Profesional` — Sub-fase 8.7d (2026-10-01)

Limpieza de la firma reemplazada, con `service_role`. `PUT /workflows/MlEGaxt7k6H9SAfP` (versionCounter 2 → 3). **OJO: en un workflow activo, el PUT republica solo** — la versión nueva quedó publicada en el acto (`activeVersionId` = `versionId`), sin llamar a `/activate`. Los 5 nodos originales no cambiaron; se sumaron 5:

*   **Buscar firma previa** (HTTP GET, rama paralela desde `Validar payload`, ubicada arriba para que con `executionOrder: v1` corra antes que el upsert): lee la `firma_url` de la fila con la misma matrícula, que es la que el upsert va a pisar. `onError: continueRegularOutput`: si falla, el alta sigue igual.
*   Después de `Respond OK` (el formulario ya recibió su respuesta): **Firma a limpiar** (Code: firma previa distinta de la nueva y dentro del bucket) → **¿Firma vieja en uso?** (HTTP GET a `profesionales` por `firma_url`) → **IF - ¿Firma huérfana?** (200 y cero filas) → **Borrar firma vieja** (HTTP DELETE a Storage).
*   A prueba de fallos: si la búsqueda previa falla, si el upsert no devuelve `id` o si la consulta de uso no responde 200 con lista vacía, no se borra nada.
*   **Verificación:** 6 casos con profesionales y archivos de prueba, primero en una copia temporal del workflow (borrada) y después contra el webhook de producción, antes y después de cerrar las policies: alta nueva, firma reemplazada (se borra la vieja), misma firma, firma vieja en uso por otro profesional (no se borra), firma vieja ya sin uso (se borra) y payload inválido (400). Filas y archivos de prueba borrados; las 7 firmas reales, intactas.
*   **Al verificar un borrado:** la URL pública de Storage pasa por caché y puede seguir respondiendo 200 un rato. Mirar el listado del bucket o `storage.objects`.
*   **Backups:** `workflow_alta_profesional.pre-8.7d.json` (antes) y `workflow_alta_profesional.json` (vivo después).

### `MYVETE - Ingesta` — Sub-fase 8.7c (2026-09-29)

Interpretación diagnóstica (la calcula el SPA desde 8.7b, ver `CRITERIOS DE CLASIFICACION.md`). `PUT /workflows/lkOwTFmVTZu7EMoU`, **sin activar**. El prompt original apuntaba a `5gGWXOjY2BBOAfuw`, pero ese es el backup CORE ("NO TOCAR") y no tiene el nodo "Preparar Datos para PDF"; los backups `workflow_B.*` siempre fueron de `lkOwTFmVTZu7EMoU`. Solo se tocaron 2 nodos (conexiones sin cambios):

*   **Insert Atención Cardiología:** suma 12 columnas desde `body.examen_clinico` (37 en total): `acvim_estadio`, `acvim_origen`, `mine2_puntaje` (integer o null), `mine2_clasificacion`, `hp_clasificacion`, `hp_sospecha` (boolean o null), `hp_signos` y `clasificacion_advertencias` (objeto o null), `hp_n_sitios` (integer o null), `morfo_aortica`, `morfo_pulmonar`, `eco_pulmonar_hallazgos` (array o null).
*   **Preparar Datos para PDF:**
    *   "SCORES / CLASIFICACION" se reemplaza por **INTERPRETACIÓN DIAGNÓSTICA**: estadio ACVIM (+ "indicado por el profesional" solo si `acvim_origen = 'manual'`), MINE 2 `n/11 - severidad` (+ "B2 avanzado"), HP (probabilidad, TRV y sitios; **no se informa** si `hp_sospecha` no es `true`), relación DVD/DVI sin unidad y morfologías aórtica y pulmonar.
    *   Sección nueva **ECOGRAFÍA PULMONAR** (solo si `eco_pulmonar_hallazgos` trae hallazgos).
    *   No se muestran disclaimers, `clasificacion_advertencias` ni el origen del valor.
    *   `obtenerUnidad`: todas las velocidades en cm/s, AT/ET en ms, VD en mm; sin `hp_gradiente`. Etiquetas nuevas: TRV, gradiente tricuspídeo, AT, ET, AT:ET, Vel. RP, DVDd, DVDs, PLVDd, PLVDs, Ao/AP, VP/AP, RPAD, DVCCd.
*   **Insert Datos Ecocardiografía:** sin cambios (verificado en vivo: reenvía el objeto entero con `Object.assign`).
*   **Verificación:** los 2 nodos se probaron localmente con un payload real del SPA (generado en jsdom) y la versión viva se releyó por API: idéntica a la probada.
*   **Backups:** `workflow_B.pre-8.7c.json` (antes del PUT) y `workflow_B.post-8.7c.json` (vivo después del PUT). Sin secretos.

### `MYVETE - Ingesta` — Sprint 8.0, Prompt 2c (2026-09-23)

Adaptado al payload nuevo del SPA (`body.examen_clinico`, ver `SPRINT-08-ESTADO.md`). Cambio vía `PUT /workflows/lkOwTFmVTZu7EMoU` (versionCounter 40), **sin activar ni publicar**. Solo se tocaron 3 nodos:

*   **IA - Estructurar Anamnesis:** el user prompt lee `body.examen_clinico.anamnesis` / `.diagnostico` (antes `body.consulta.*`). System prompt y schema `borrador_medico_v4` sin cambios. Nota en el nodo: los `fc/fr/pas/pam/pad/mucosas` que devuelve la IA **no son fuente de verdad**, solo quedan dentro de `informe_borrador`.
*   **Insert Atención Cardiología:** mapea 25 columnas de `atenciones_cardiologia` — `profesional_id`, `mascota_id`, `datos_filiacion`, `informe_borrador`, `anamnesis_raw`/`diagnostico_raw`/`indicaciones_raw` y las 18 del examen clínico (`sensorio`, `mucosas`, `pulso_femoral`, `reflejo_tusigeno`, `hidratacion`, `tllc`, `sucusion`, `auscultacion_pulmonar_patron`/`_amplitud`/`_sltb`, `fr_numero`, `fr_tipo`, `auscultacion_cardiaca`, `fc_numero`, `soplos`, `pas`, `pam`, `pad`). Todo desde `$('Webhook').item.json.body.examen_clinico` (no `$json`, que en ese nodo es la salida de Upsert Mascota). `auscultacion_cardiaca` y `soplos` van como arrays JSON (`[]` si vienen vacíos); el resto, `null` si falta. **Ya no manda `metricas`** (columna eliminada en el Prompt 2a).
*   **Preparar Datos para PDF:** FC/FR/PAS/PAM/PAD/mucosas salen **solo** de `examen_clinico` (se eliminó el fallback a la IA, que además tenía prioridad sobre el SPA — hallazgo H2). La IA sigue aportando `resumen_anamnesis` y, como respaldo, diagnóstico/indicaciones sugeridos. Informe:
    *   Sección nueva **MOTIVO DE LA CONSULTA** (el motivo no tiene columna en Supabase, va solo al informe).
    *   **CONSTANTES FISIOLOGICAS:** la línea de FR incluye el tipo (`FR: 20 rpm (Polipnea)`).
    *   Sección nueva **EXAMEN CLÍNICO**, después de las constantes, en el orden del SPA: sensorio, pulso femoral, reflejo tusígeno, hidratación, TLLC, sucusión, auscultación pulmonar (patrón/amplitud/SLTB), auscultación cardíaca (lista separada por comas) y soplos (uno por línea, ordenados por `orden`, formato `SOPLO SISTÓLICO MITRAL 3/6`). Los valores vacíos/null no se imprimen; mucosas y FR no se repiten.
*   **Nodos que NO leen el payload viejo** pese a contener la palabra "consulta": `Enviar informe al tutor` y `Preparar alerta` (solo texto del mail), sin cambios.
*   **Verificación:** los nodos Insert y PDF se probaron localmente con un payload real del SPA (mapeo exacto de 25 columnas, IA ignorada para constantes, `firma_index` intacto) y la versión viva se releyó por API (idéntica a la probada). **Falta la prueba E2E real**, que requiere publicar el workflow.
*   **Backups:** `n8n/workflow_v7_pre-2c.json` (estado previo, bajado por API antes del PUT) y `n8n/workflow_v7_post-2c.json` (estado vivo después del PUT). Sin secretos (credenciales solo por id).

---

## Workflow: MYVETE - Ingesta Filiación & Orquestador Core (HISTÓRICO — hoy backup inactivo)

*   **Instancia:** `echevanest.app.n8n.cloud`
*   **Workflow ID:** `5gGWXOjY2BBOAfuw`
*   **Estado:** `active: false` — backup `[BACKUP - NO TOCAR]` desde la transición a producción del 2026-09-13. (Histórico: publicado 28/07/2026, nodo IA agregado y activado 31/07/2026.)
*   **Production URL:** `https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4`
*   **Nodos:**
    1.  **Webhook** — `POST`, path `ingesta-filiacion-v4`, `responseMode: responseNode`, CORS abierto (`options.allowedOrigins: "*"`) para aceptar el POST desde la ventana popup del bookmarklet (origen `null`/`file://`).
    2.  **IA - Estructurar Anamnesis** (`@n8n/n8n-nodes-langchain.openAi`, agregado 31/07/2026) — intercalado entre `Webhook` y `Respond to Webhook`. Modelo `gpt-4.1-mini`, credencial "OpenAi account" (`LChLJhcSz4xuxdIF`). `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 5000` (5 s). Toma `body.filiacion.mascota.especie`, `body.consulta.diagnostico` y `body.consulta.anamnesis`; el system prompt es un extractor clínico veterinario (interpreta jerga de dictado: `frr`/`fr` = frecuencia respiratoria, `fc` = frecuencia cardíaca, `pas`/`pam`/`pad` = presión arterial sistólica/media/diastólica) con salida forzada por `json_schema` (`strict: true`), campos: `fc`, `fr`, `pas`, `pam`, `pad`, `mucosas`, `sintomas_detectados`, `cumplimiento_tratamiento`, `diagnostico_sugerido`, `indicaciones_sugeridas`, `resumen_anamnesis`.
    3.  **Respond to Webhook** — responde `200` con `{ status: "success", message: "Anamnesis procesada correctamente", timestamp: <ISO>, borrador_medico: <objeto JSON> }`. `borrador_medico` sale de `$json.output?.[0]?.content?.[0]?.text`; n8n lo entrega ya como objeto (no como string) en la respuesta HTTP — confirmado con un POST de prueba el 24/08/2026. El timestamp se genera con `$now.toISO()` (no `.toISOString()` — ese método no existe en el objeto Luxon `$now` de n8n).
*   **Validado end-to-end el 28/07/2026:** POST de prueba devolvió `200` con el JSON esperado; preflight `OPTIONS` devuelve `204`.
*   **Respaldo local:** `n8n/workflow_v4_current.json` (export vía API REST de n8n, no versionar credenciales). **Desactualizado** — no incluye los nodos de la sección siguiente.

## Nodos Supabase (Upsert Tutor / Upsert Mascota / Insert Atención Cardiología)

**Estado 2026-09-03: activos en producción, probados E2E, RLS resuelto.** Export real vía API de n8n en `n8n/workflow_v5_supabase.sanitized.json` (reemplaza al dump local `workflow_backup_updated.json`, que queda obsoleto).

*   **Upsert Tutor** — `POST /rest/v1/tutores`, `on_conflict` condicional: `id_myvete` si el payload lo trae, si no `email` (expresión n8n en la URL). Body incluye `id_myvete` desde `body.filiacion.tutor.id_myvete`.
*   **Upsert Mascota** — `POST /rest/v1/mascotas?on_conflict=tutor_id,nombre`, depende de `$('Upsert Tutor').item.json.id`. Sin cambios.
*   **Insert Atención Cardiología** — `POST /rest/v1/atenciones_cardiologia`, guarda `mascota_id`, `datos_filiacion`, `metricas`, `informe_borrador` **+ `anamnesis_raw`/`diagnostico_raw`/`indicaciones_raw`** (texto tal como lo dictó el veterinario, `body.consulta.*` — antes no se guardaba en ningún lado).
*   **IF - ¿Trae Ecocardiografía?** *(agregado 2026-09-08)* — `n8n-nodes-base.if` v2.2. Condición booleana `Boolean($('Webhook').item.json.body.datos_ecocardiografia)`. El SPA manda `datos_ecocardiografia: null` cuando el profesional no cargó ningún dato de eco → rama false, no se inserta fila vacía. Rama true → nodo siguiente.
*   **Insert Datos Ecocardiografía** *(agregado 2026-09-08)* — `POST /rest/v1/datos_ecocardiografia?on_conflict=atencion_id` (UPSERT, `Prefer: resolution=merge-duplicates,return=representation`). `jsonBody` = `Object.assign({}, body.datos_ecocardiografia, { atencion_id: $('Insert Atención Cardiología').item.json.id })` — la PK/FK sale del `id` de la atención recién creada, el SPA nunca lo conoce (decisión "Combined Payload", 2026-09-08). `onError: continueRegularOutput` para que un fallo del tramo eco no marque la ejecución como error ni afecte los 3 inserts previos (que ya corrieron). Misma credencial service_role. Tabla documentada en `supabase/schema.sql`.
*   **Credencial:** los 4 nodos HTTP usan una credencial `httpHeaderAuth` (`Supabase myvete-cardiologia (service_role, apikey header)`, id `EPCExaKpytpqeH99`) con la **service_role key** en el header `apikey`. Antes usaban la apikey publicable/anon (`sb_publishable_...`) — con RLS habilitado y sin políticas eso bloqueaba todo insert. La credencial vieja (`oE2InT94nrwQQmcX`) queda sin usar, no se borró.
*   **Cadena Supabase actual:** `IA → Upsert Tutor → Upsert Mascota → Insert Atención Cardiología → IF - ¿Trae Ecocardiografía? → (true) Insert Datos Ecocardiografía`. `Respond to Webhook` sigue en rama paralela desde `IA` — la respuesta HTTP NO espera a la cadena Supabase.
*   **`payload.bloque_ekg`** *(2026-09-08)* — el SPA unificó el bloque de estudios y ahora manda los 4 campos de electrocardiograma en `body.bloque_ekg` (la tabla eco no tiene columnas EKG). **Ningún nodo lo consume todavía**, igual que pasaba con el viejo `body.bloque_metrico` (que el SPA ya no emite).

~~Discrepancia activeVersion vs top-level nodes~~ — resuelta: se confirmó por API que ambas coinciden hoy (`versionCounter: 10`, activa, con los 3 nodos Supabase en ambos bloques). El dump local viejo estaba desactualizado.

**Prueba E2E (2026-09-03):** POST sintético directo a `https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4` con datos marcados como test (`id_myvete: TEST-QA-CODE-0001`) → `200 OK` con `borrador_medico` correcto → verificado en Supabase: fila en `tutores` (conciliada por `id_myvete`), fila en `mascotas` (FK correcto), fila en `atenciones_cardiologia` con `metricas`, `informe_borrador` y los 3 campos `_raw` poblados. Datos de prueba borrados después de verificar. **No se probó con el bookmarklet real contra MyVete** — sigue pendiente una corrida real en navegador.

**Prueba E2E (2026-09-08) — tramo ecocardiografía:** `PUT /workflows/5gGWXOjY2BBOAfuw` agregó los 2 nodos (versionCounter 10 → 11, workflow sigue `active`). POST sintético al webhook de producción con `datos_ecocardiografia` poblado (`id_myvete: TEST-QA-ECO-0908`) → `200 OK` → fila en `datos_ecocardiografia` con `atencion_id` = id de la atención creada en la misma ejecución y todos los valores correctos. UPSERT verificado por separado (`on_conflict=atencion_id`, re-POST con `dvid` cambiado → fila actualizada, resto preservado). Datos de prueba borrados (delete del tutor → cascada). Falta la corrida real desde el SPA en navegador (subir PDF, autollenar, enviar).

**Estado 2026-09-09:** producción sin cambios respecto al 2026-09-08 (releído por API: `versionCounter 13`, `active`, mismos 8 nodos; el bump 11→13 son re-saves sin cambio estructural en los nodos revisados). El respaldo `workflow_v5_supabase.sanitized.json` queda en vC 11 — desactualizado en el número de versión, no en la estructura.

## Workflow STAGING Sprint 6 — Informe PDF + envío por mail

**NO es producción.** Copia creada 2026-09-09 para armar y revisar el Sprint 6 sin tocar `5gGWXOjY2BBOAfuw`. Detalle y pendientes en `STATUS.md` Sección J.

*   **Workflow ID:** `lkOwTFmVTZu7EMoU` — "MYVETE - Ingesta (COPIA Sprint 6 - PDF+Mail) [STAGING]"
*   **Estado:** `active: false`. Webhook path `ingesta-filiacion-v6-test` (NO `ingesta-filiacion-v4`, para no colisionar con prod).
*   **Respaldo local:** `n8n/workflow_v6_pdf_mail.STAGING.json` (export vía API, credenciales solo por referencia de id).
*   **Base:** los 8 nodos de producción + 7 nodos nuevos colgados de la salida de `Insert Atención Cardiología` (segunda conexión, **en paralelo** a la rama del `IF - ¿Trae Ecocardiografía?`).
*   **Cadena nueva:** `Preparar Datos para PDF` (Code) → `Crear Google Doc` → `Insertar contenido en Doc` (batchUpdate) → `Exportar PDF (autenticado)` (Drive `files/export?mimeType=application/pdf`, binario `data`) → `IF - ¿Tutor con email?` → (true) `Enviar informe al tutor` (Gmail OAuth2 `Gmail account INFOACIVET`, PDF adjunto) → `Archivar Google Doc` (`{trashed:true}`); la rama false del IF va directo a `Archivar Google Doc`.
*   **Método PDF:** Google Doc → export (patrón `ARES_04_GEN_PDF`), credencial `Google Drive Docs Slides` (`k2oarx2fLAT9LgPw`). El Doc **no se hace público** (tiene PII del tutor): se exporta autenticado y se manda a papelera tras el envío.
*   **`onError: continueRegularOutput`** en los 5 nodos HTTP/Gmail nuevos — un fallo de PDF/mail no afecta los inserts previos ni la respuesta HTTP.
*   **Sin validar:** falta la prueba E2E sintética (activar la copia, POST al webhook de test con un email propio, verificar Doc→PDF→mail→papelera). Envía un mail real por INFOACIVET y crea/descarta un Doc en esa cuenta de Google.
*   **ECG:** el bloque `ekg` en `Preparar Datos para PDF` está comentado, listo para la próxima iteración (`payload.bloque_ekg` ya llega, n8n lo ignora hoy).
