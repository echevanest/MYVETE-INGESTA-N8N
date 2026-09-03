# 🗺️ ESTADO DEL PROYECTO: INTERFAZ LOCAL & n8n

*   **Última actualización:** 2026-09-03 — ver Sección F más abajo. El resto de este documento (Secciones A-E, pendientes) no se tocó desde 2026-08-25 y quedó desactualizado respecto a 5 commits posteriores sobre el bookmarklet (hasta `e28a652`, 02/09) — no auditados en esta pasada.
*   **Versión de la Arquitectura:** V5.0 — COMPLETADA Y VALIDADA E2E (Streaming de Dictado Interino + Conexión End-to-End n8n Cloud Validada + Nodo IA en producción + Fix de renderizado de `borrador_medico` + Bookmarklet de Filiación: extracción de mascota **y** de tutor validadas E2E contra MyVete real — cobertura de filiación 100%)
*   **Control de versión:** Repositorio Git local inicializado (branch `master`). Commit `8634294` (V4.9 consolidado); extracción de tutor (V5.0), validada E2E, en curso de commit.
*   **Nota sobre "ARCHIVO MAESTRO v5.2":** referenciado en conversación externa (Gemini/Arquitectura) como fuente de un DDL de Supabase — no se encontró ningún archivo con ese nombre en este repo ni en el Google Drive conectado al momento de escribir la Sección F. Si existe, no está compartido con esta sesión.

---

## 🟢 1. COMPONENTES COMPLETADOS (100% Funcionales y Validados)

### A. Sección: Filiación (Tutor y Mascota)
*   **Estructura y Seguridad:** Bloqueada en modo lectura por defecto con botón de edición manual. Normalización de especie y sanitización de formato decimal (ES/AR) operativas.
*   **Comportamiento Standalone:** Validado. Si opera en modo independiente (sin inyección del Bookmarklet de MyVete), los *placeholders* visuales se respetan y no se envían como datos reales, registrando cadenas vacías (`""`) y valores `null` en el JSON sin romper el contrato de datos.

### B. Sección: Consulta de Hoy & Dictado por Voz Interino (29/07/2026)
*   **Buffer Dual de Transcripción (Sección 7 de `app.js`):** Implementada la captura de resultados interinos (`interimResults: true`). 
    *   Los fragmentos confirmados (`isFinal`) se consolidan de forma permanente en `textoBase`.
    *   Los fragmentos interinos se sobrescriben dinámicamente en vivo al final del `<textarea>`, permitiendo al profesional ver la transcripción palabra por palabra mientras habla.
    *   Al detener el reconocimiento (`end`), cualquier residuo no confirmado se descarta limpiamente, garantizando que no se arrastre texto duplicado ni incompleturas.
*   **Feedback Visual Dynamic (`styles.css`):** Incorporadas las clases `.campo-dictado-activo` (borde rojo tenue mientras el micrófono escucha) y `.campo-dictado-interino` (borde pulsante durante la captura de frases sin confirmar).

### C. Consolidación de Payload y Conectividad HTTP End-to-End (29/07/2026)
*   **Tubería Integrada:** Se realizó la prueba de transmisión completa desde la SPA local (`http://localhost:8080/interface/index.html`) hacia n8n Cloud.
*   **Validación de Ejecución (#2346):**
    *   **Estado:** `Succeeded in 60ms` en modo de producción (`executionMode: "production"`).
    *   **URL Objetivo:** `https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4`
    *   **Integridad de Datos:** Anamnesis y diagnóstico dictados por voz fueron compilados por `consolidarPayloadFinal()` y entregados con 100% de fidelidad, sin interferencia de datos interinos ni ruidos de transmisión.
    *   **Respuesta del Servidor:** HTTP 200 OK en 11 ms devuelto por el nodo `Respond to Webhook`.

---

### D. Integración de IA / LLM en Workflow n8n (31/07/2026)
*   **Nodo `IA - Estructurar Anamnesis`** (`@n8n/n8n-nodes-langchain.openAi`, modelo `gpt-4.1-mini`) intercalado entre `Webhook` y `Respond to Webhook` en producción. Retry on Fail activo (3 intentos, 5 s de espera). Extrae de la anamnesis dictada un borrador estructurado (`fc`, `fr`, `pas`, `pam`, `pad`, `mucosas`, `sintomas_detectados`, `cumplimiento_tratamiento`, `diagnostico_sugerido`, `indicaciones_sugeridas`, `resumen_anamnesis`) sin inventar datos. Detalle completo en `n8n/README.md`.
*   **Respuesta del Webhook:** ahora incluye la clave `borrador_medico` (objeto JSON con el schema de arriba, no un string), además de `status`, `message` y `timestamp`. Confirmado con sanity check por backend el 24/08/2026 (POST sintético directo al webhook vía curl, HTTP 200 en ~8.6 s, extracción correcta de métricas y sin datos inventados en campos no mencionados).
*   **SPA (`app.js` / `index.html`):** el handler de envío ahora lee `data.borrador_medico` de la respuesta y lo muestra editable en la sección `#bloque-resumen` (antes oculta y sin usar, con un `<textarea id="resumen-clinico-texto">` nuevo). Se corrigió un bug en `mostrarBorradorMedico()`: el código original esperaba `borrador_medico` como string JSON y hacía `JSON.parse()`, pero el sanity check reveló que n8n lo entrega como objeto — sin el fix se habría renderizado el literal `[object Object]`.
*   **Nota de alcance:** lo validado end-to-end hasta ahora es la ruta backend (curl → n8n → respuesta). La prueba manual de dictado por voz en el navegador (`http://localhost:8080/interface/index.html`, confirmar apertura visual de `#bloque-resumen` y contenido de `#resumen-clinico-texto`) quedó en manos del usuario y su resultado no llegó a reportarse en esta sesión — pendiente de confirmar en la próxima.

---

### E. Bookmarklet de Filiación (`bookmarklet/launcher.js`) — Mascota Y Tutor validados E2E (V5.0, 25/08/2026)
*   **Estado mascota:** Extracción de mascota (`nombre`/`especie`/`raza`) **validada visualmente contra el DOM real de MyVete**, con handshake y `postMessage` hacia la SPA local 100% funcionando.
*   **Bug encontrado y corregido (paciente "Mentira"):** el `.find()` original sobre `querySelectorAll('div')` tomaba el primer `div` con una coma en su `innerText`, recorriendo en orden de documento. Un `div` contenedor ubicado antes del bloque de perfil (que también envuelve los datos de contacto del tutor) concatena todo su texto interno y ganaba la búsqueda por tener una coma "de casualidad" — resultado observado: `raza` = `"Yanina1164885523benitezocampo@hotmail.comMentira17 años y 8 mes"`.
*   **Fix aplicado (doble blindaje):** (1) se descartan los `div` que tengan `div` anidados, quedándose solo con nodos hoja; (2) se exige que el primer segmento tras el `split(',')` coincida con una especie conocida (`canino`, `felino`, `equino`, `ave`, `aviar`, `exotico`). Confirmado sin contaminación en "Mentira" (post-fix) y en "Molly" (Canino/Caniche).
*   **Selectores confirmados — mascota:** vía `.patient-info h1`; especie/raza vía el `div` hoja interno cuyo texto combina "Especie, Raza, Color" separado por comas (el color se descarta, no forma parte del contrato de datos).
*   **Estado tutor:** implementadas `encontrarSeccionDatosCliente()`, `extraerValorPorEtiqueta()` y `rasparTutor()` en `launcher.js`, con el mismo blindaje anti-contaminación que mascota (nodos hoja únicamente + búsqueda acotada a la sección "Datos del Cliente", nunca a `document` completo, para no confundir el "Nombre:" del tutor con el de la mascota). **Validado E2E en consola contra un paciente real** ("Adragna, Florencia"): `nombre: "ADRAGNA, FLORENCIA"`, `telefono: "1135626139"` (regex OK), `email: "florgirl@live.com"` (regex OK).
*   **Bug encontrado y corregido en la primera corrida E2E de tutor:** la primera versión de `encontrarSeccionDatosCliente()` restringía la búsqueda del encabezado a etiquetas de título estándar (`h1..h5`, `legend`, `.panel-heading`, etc.), pero en el DOM real de MyVete el texto "Datos del Cliente" vive en un `SPAN` sin clase de título — resultado: `Sección 'Datos del Cliente' encontrada: false`. Fix: se desacopló la búsqueda del tipo de etiqueta HTML, escaneando todos los elementos del `body` por `innerText` normalizado exacto y, ante varios candidatos, priorizando el más específico (menos elementos descendientes) — mismo criterio anti-contaminación ya usado para mascota.
*   **Selectores confirmados — tutor:** encabezado = cualquier elemento (no atado a tag de título) cuyo `innerText` normalizado sea exacto `"datos del cliente"`; contenedor = se sube desde ese encabezado hasta el primer ancestro cuyo `innerText` incluya tanto "Teléfono celular" como "Email personal"; `nombre`/`telefono`/`email` vía el `DIV.col-sm-8.col-xs-12` hoja posterior (en orden de documento) al `DIV` hoja con el texto de etiqueta ("Nombre:", "Teléfono celular:", "Email personal:"). Validación de forma antes de aceptar el valor: teléfono con `/^[+\d][\d\s\-()]{5,}$/`, email con `/\S+@\S+\.\S+/`; si la sección no se detecta o el valor no matchea el regex, el campo cae a `null` (fallback de seguridad, nunca rompe el flujo).
*   **Contrato `postMessage` oficial (bookmarklet → SPA), calzado con el listener ya existente en `interface/app.js` Sección 2:**
    ```json
    {
      "type": "MYVETE_FILIACION",
      "payload": {
        "tutor": { "nombre": "string|null", "telefono": "string|null", "email": "string|null" },
        "mascota": { "nombre": "string|null", "especie": "string|null", "raza": "string|null", "pesoActual": "number|null" }
      }
    }
    ```
    Nota: esta forma (payload con `tutor`/`mascota` a nivel raíz) es la que efectivamente consume `app.js` hoy — distinta de la envoltura `meta`/`tutor`/`mascota` propuesta originalmente en `CONTRATO-DE-DATOS-V2.7.md` Sección 1.2, que queda como diseño no implementado.
*   **`window.open()` síncrono:** se dispara en el mismo hilo del clic (sin pasos async antes), respetando la mitigación de bloqueo de pop-ups de la Sección 4.1 del informe de arquitectura.
*   **Reintentos en vez de handshake:** como `app.js` todavía no emite señal de "ventana lista" (handshake de la Sección 0.1 del Contrato de Datos V2.7, ver pendiente #5 abajo), el mensaje se reenvía cada 400ms durante 5 intentos (~2s) en lugar de un único `postMessage` a ciegas. Es seguro porque `app.js` solo asigna valores a campos (idempotente).

---

### F. Supabase — verificación de schema y reactivación del proyecto (2026-09-03)

*   **Proyecto:** `myvete-cardiologia` (`tuedigqvvkvgongpcnjx`, región `sa-east-1`) — estaba `INACTIVE` (pausado por inactividad, plan free); reactivado con `restore_project` en esta sesión.
*   **Corrección de un diagnóstico previo en esta misma sesión:** inmediatamente después del restore, una consulta a `information_schema.tables` devolvió el schema `public` vacío — esto era una lectura obsoleta contra una réplica que todavía no había terminado de sincronizar tras el restore, no el estado real. Un intento posterior de `CREATE TABLE tutores` falló con `"relation tutores already exists"`, lo cual reveló el error. **No se perdió ni se sobrescribió nada** — la migración fallida no llegó a ejecutar ninguna sentencia después de la primera.
*   **Estado real del schema (confirmado por introspección de `information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`):** las tablas `tutores`, `mascotas` y `atenciones_cardiologia` **ya existían**, creadas por 6 migraciones nativas de Supabase entre el 25/08 y el 01/09/2026 (`list_migrations`), no documentadas hasta ahora en ningún archivo de este repo. Detalle completo, columna por columna, en `supabase/schema.sql` (nuevo).
*   **`id_myvete` en `tutores`: SÍ existe y SÍ tiene índice UNIQUE** (migración `add_id_myvete_to_tutores`, 2026-09-01) — contrario a lo que se asumió al abrir esta conversación. El nodo `Upsert Tutor` de n8n todavía no lo usa (sigue en `on_conflict=email` y no incluye `id_myvete` en el body enviado).
*   **Hallazgo crítico — RLS sin políticas:** las 3 tablas tienen Row Level Security habilitado (migración `activar_rls`, 25/08) pero **cero políticas** (`pg_policies` vacío). Con RLS ON y sin políticas, Postgres deniega todo acceso por defecto, incluido el rol `anon` que usan los nodos de n8n vía la apikey publicable de Supabase. Consistente con que las 3 tablas tengan **0 filas** hoy. Sin resolver una política (o decidir otro mecanismo de acceso), ningún Upsert/Insert del workflow puede funcionar aunque el resto esté bien.
*   **Hallazgo — discrepancia de versión en el dump de n8n:** `workflow_backup_updated.json` (local, gitignoreado) trae dos definiciones distintas del mismo workflow: el bloque top-level `nodes`/`connections` incluye los 3 nodos Supabase, pero el bloque `activeVersion` embebido (que representaría la versión publicada) **no los tiene** — solo `Webhook → IA → Respond to Webhook`. No se pudo confirmar cuál de los dos corre hoy en producción sin acceso a la API de n8n o a un log de ejecución reciente. Ver `n8n/README.md` sección "Nodos Supabase".
*   **Archivos nuevos en el repo:** `supabase/schema.sql` (schema real introspectado), `n8n/workflow_v5_supabase.sanitized.json` (copia sanitizada — apikey redactada — del dump con los 3 nodos Supabase, antes solo local).
*   **No se crearon tablas ni se agregaron políticas RLS en esta sesión** más allá de lo documentado — la política de acceso es una decisión de seguridad pendiente de confirmar con el equipo.

### G. Ejecución de los pendientes de la Sección F (2026-09-03, misma sesión)

Con `.secrets/n8n_api_key.txt` y `.secrets/supabase service role key.txt` (compartidas explícitamente por el usuario en esta conversación) se pudo llamar directo a la API REST de n8n (`echevanest.app.n8n.cloud/api/v1`), algo que no estaba disponible al escribir la Sección F.

*   **Corrección sobre la Sección F:** al releer el workflow por API (no el dump local desactualizado), el bloque `activeVersion` y el top-level `nodes` **coinciden** — ambos ya tenían los 3 nodos Supabase (`versionCounter: 9` al momento de leer, actualizado 2026-09-01T14:46). La "discrepancia" reportada antes era del dump local viejo, no del estado real. Confirmado también que el pipeline ya recibía y descartaba tráfico real (no una falla silenciosa de "nunca se activó").
*   **RLS resuelto — no con una política abierta a `anon`, sino con `service_role`:** se creó una credencial `httpHeaderAuth` nueva en n8n (`Supabase myvete-cardiologia (service_role, apikey header)`, id `EPCExaKpytpqeH99`) con la apikey secreta en el header `apikey`, y se repuntaron los 3 nodos HTTP Request (`Upsert Tutor`, `Upsert Mascota`, `Insert Atención Cardiología`) a esa credencial vía `PUT /api/v1/workflows/5gGWXOjY2BBOAfuw`. RLS sigue habilitado en las 3 tablas **sin ninguna política para `anon`** — que es el estado correcto: la apikey publicable (no secreta por diseño) sigue sin poder leer/escribir nada. La credencial vieja (`oE2InT94nrwQQmcX`, apikey publicable) quedó sin usar, no se borró.
*   **`Upsert Tutor` corregido:** `on_conflict` ahora es condicional por expresión n8n (`id_myvete` si el payload lo trae, si no `email`), y el `jsonBody` ya incluye `id_myvete`.
*   **`Insert Atención Cardiología` corregido:** `jsonBody` ahora incluye `anamnesis_raw`, `diagnostico_raw`, `indicaciones_raw` desde `body.consulta.*` (columnas agregadas a `atenciones_cardiologia` por migración `add_raw_dictation_columns_atenciones_cardiologia`).
*   **Prueba E2E — POST sintético al webhook de producción** (no bookmarklet real, ver pendiente abajo): `200 OK`, `borrador_medico` correcto. Verificado en Supabase: 1 fila en `tutores` (conciliada por `id_myvete`), 1 fila en `mascotas` (FK a tutor correcto), 1 fila en `atenciones_cardiologia` con `metricas`/`informe_borrador`/`anamnesis_raw`/`diagnostico_raw`/`indicaciones_raw` todos poblados. Datos de prueba (`id_myvete: TEST-QA-CODE-0001`) borrados después de verificar.
*   **Corrección adicional sobre la Sección F:** el conteo "0 filas" reportado ahí también era una lectura obsoleta post-restore. Al consultar las tablas después de esta prueba, apareció una fila preexistente del 26/08 (tutor "Test Diagnostico 3" / mascota "Firulais Test 3", no creada en esta sesión) — se dejó intacta, no es de esta sesión limpiarla.
*   **No se hizo:** prueba con el bookmarklet real contra MyVete (sin acceso a una sesión logueada en `app.myvete.com` desde esta sesión) — sigue pendiente que alguien la corra en navegador.

### H. `src/app.js` movido a `experiments/widget-inyectado/` (2026-09-04)

Apareció sin comitear en el repo (visto por primera vez en la Sección F). Era un prototipo de estrategia de distribución alternativa — widget standalone inyectado directo en la página de MyVete (bucket público de Supabase Storage + `<script>` tag), en vez del bookmarklet+popup actual — creado el 27/08 y nunca actualizado desde entonces. Quedó desactualizado frente a la interfaz oficial: sin `id_myvete` en el payload, sin `consulta.diagnostico`/`consulta.indicaciones`, con scraping genérico nunca validado contra el DOM real de MyVete. No se descartó — se movió a `experiments/widget-inyectado/app.js` con un `README.md` que documenta propósito, estado y por qué no se adoptó, por si se retoma como decisión de arquitectura más adelante. `src/` queda eliminado del repo.

---

## 🟡 2. TRABAJO EN PROGRESO (Evolución Actual)

Sin frentes activos por el momento — próximo trabajo en la sección de pendientes abajo.

---

## 🔴 3. PENDIENTES PRÓXIMOS

0. **Prueba E2E real con el bookmarklet contra MyVete** (con un paciente real, en navegador) — lo único de la cadena Supabase que falta validar. La prueba sintética (Sección G) ya confirmó que el pipeline backend completo funciona.
0.1. **Housekeeping menor:** borrar o renombrar la credencial n8n vieja (`oE2InT94nrwQQmcX`, apikey publicable, ya sin uso); limpiar los índices UNIQUE duplicados en `tutores.email` y `mascotas(tutor_id,nombre)` (ver `supabase/schema.sql`).

1. **Confirmar visualmente el renderizado de `borrador_medico`:** repetir la prueba manual de dictado en `http://localhost:8080/interface/index.html` y verificar que `#bloque-resumen` se muestre y `#resumen-clinico-texto` traiga el objeto formateado (el fix de `mostrarBorradorMedico()` quedó aplicado pero sin confirmación visual en esta sesión).
2. **Bookmarklet de Filiación — cobertura de casos borde del tutor:** la extracción ya está validada E2E (ver Sección 1.E) contra un paciente con los 3 campos completos. Falta probar al menos un caso con datos de contacto incompletos (p. ej. paciente sin email cargado) para confirmar que el fallback a `null` por campo individual funciona sin romper la extracción de los otros dos campos.
3. **Persistencia del borrador de IA:** el workflow de n8n todavía no reenvía `borrador_medico` ni el payload original a un destino final (Sheets/Supabase/orquestador real) — solo lo devuelve en la respuesta HTTP.
4. **Botón "Confirmar y enviar a MyVete"** en `#bloque-resumen`: falta el `postMessage` que confirme el borrador editado de vuelta al bookmarklet.
5. **Implementación de la Sección C en SPA (Estudios Complementarios):** Maquetado de métricas de Ecocardiograma, Electrocardiograma y Observaciones de Estudios en `index.html` y `app.js`.
6. **Sincronización de Handshake (`PostMessage`):** Protocolo de confirmación de carga de la ventana flotante con el Bookmarklet de MyVete (Sección 5 de `INFORME-ARQUITECTURA-MYVETE-V2.7.md`).
7. **Control de Versiones (Git):** resuelto — archivo de conflicto de sincronización eliminado, cambios de V4.9 consolidados en el commit `762454b`. Falta confirmar remoto (todavía no configurado/pusheado).