# 🗺️ ESTADO DEL PROYECTO: INTERFAZ LOCAL & n8n

*   **Última actualización:** 2026-09-12 — ver Sección J.3 (corrección de topología de workflows + Fix 1: migración de credencial Drive ARES→infoacivet en 7 nodos, **completo y verificado contra la API viva de n8n**). Sección J.2 (2026-09-10): Sprint 6 v2 (persistencia del PDF en Drive + índice en Sheets + alerta de fallo). Sección J (2026-09-09): primera versión del Sprint 6 (PDF + mail), también en STAGING. 2026-09-08: Sección I (integración de datos ecocardiográficos SPA → n8n → Supabase). Secciones F-G del 2026-09-03. El resto del documento (Secciones A-E, pendientes) no se tocó desde 2026-08-25 y quedó desactualizado respecto a commits posteriores sobre el bookmarklet — no auditados.
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

### I. Datos Ecocardiográficos — SPA → n8n → Supabase (2026-09-08)

Arquitectura elegida: **Combined Payload** (el bloque eco viaja dentro del payload principal; n8n resuelve `atencion_id` internamente). Se descartó el webhook aparte porque el SPA no tiene forma de conocer el `atencion_id` — el webhook actual responde en rama paralela y nunca devuelve el id de la atención.

*   **Tabla `datos_ecocardiografia`:** ya existía (creada fuera de las migraciones nativas, sin registro en `supabase_migrations`). ~72 columnas de datos, PK = `atencion_id` (sin columna `id` propia), FK a `atenciones_cardiologia(id)` ON DELETE CASCADE, RLS ON / 0 políticas (service_role bypassa, igual que las otras 3). Documentada ahora en `supabase/schema.sql`.
*   **SPA (`interface/index.html` + `app.js` + `assets/styles.css`):** el "MÓDULO DE PRUEBA" sin comitear se reemplazó por la Sección 8 de `app.js` + el bloque `<details id="bloque-ecocardiografia">`. Flujo: cargar PDF → "Extraer datos del PDF" (PDF.js + heurística de regex) autollena los campos `#eco-<columna>` → campos quedan `disabled` → "Editar campos" los habilita → "Enviar" arma `payload.datos_ecocardiografia` con las 72 columnas (null las vacías / sin UI, o `null` el bloque entero si no se cargó nada).
*   **Unificación del bloque de estudios (2026-09-08, mismo día):** se **eliminó** el `<details id="bloque-metrico">` ("Apéndice Métrico") y todo se movió a `#bloque-ecocardiografia`, ahora titulado "Estudios complementarios (Ecocardiograma / Electro)". `MAPEO_METRICAS` / `leerBloqueMetrico` borrados de `app.js` (Sección 4 quedó libre); `payload.bloque_metrico` ya no se emite (n8n nunca lo consumió — `metricas` se arma con la salida de la IA). Campos eco que faltaban se agregaron a `#bloque-ecocardiografia`: `eco-ai_ao_area`, `eco-dvid_indexado` (LVIDDn), `eco-volumen_ai_indexado` (LAVI) — el resto (dvid, dvs, sivd, ppvid, FS, FE Teichholz/Simpson, vel E, AI/Ao) ya estaba. Los 4 campos de electrocardiograma (`eco-ekg_fc`/`ekg_ritmo`/`ekg_eje`/`ekg_p_ms`) viven en el mismo bloque visual pero **no** tienen columna en `datos_ecocardiografia`: `leerBloqueEKG()` los manda en `payload.bloque_ekg`, que n8n ignora por ahora (igual que hacía con `bloque_metrico`). **Sin cambios en n8n en esta pasada.**
*   **n8n (`5gGWXOjY2BBOAfuw`, versionCounter 10 → 11, sigue `active`):** 2 nodos nuevos al final de la cadena Supabase — `IF - ¿Trae Ecocardiografía?` (chequea `Boolean(body.datos_ecocardiografia)`) → rama true → `Insert Datos Ecocardiografía` (`POST .../datos_ecocardiografia?on_conflict=atencion_id`, upsert, `onError: continueRegularOutput`, credencial service_role `EPCExaKpytpqeH99`). `atencion_id` sale de `$('Insert Atención Cardiología').item.json.id`. Respaldo en `n8n/workflow_v5_supabase.sanitized.json`.
*   **Prueba E2E sintética (2026-09-08):** POST al webhook de producción con `datos_ecocardiografia` poblado (`id_myvete: TEST-QA-ECO-0908`) → `200 OK` → fila en `datos_ecocardiografia` con `atencion_id` correcto y valores correctos. UPSERT verificado aparte. Datos de prueba borrados (delete del tutor → cascada; base vuelta a su estado previo: 1 atención preexistente, 0 filas eco).
*   **Índices calculados + regex ECG (2026-09-08, mismo día):** `calcularIndicesEco(datos, peso)` en `app.js` deriva 3 columnas desde `#paciente-peso`:
    *   `dvid_indexado = dvid / peso^0.294` (Cornell, LVIDDn; `dvid` en cm);
    *   `volumen_ai_indexado = volumen_ai_simp_simpson / peso` (LAVI en mL/kg — se confirmó mL/kg, NO /BSA, para respetar la etiqueta histórica del campo);
    *   `masa_vi_indexada = masa_vi / BSA` (g/m²), `BSA = 0.1017·peso^0.6667` (Meeh-Rubner).
    Se recalculan tras `autollenarCamposEco()` y en el evento `input` de `#paciente-peso`. Si falta el crudo, ese índice no se toca (no pisa carga manual); si el peso es ≤0 o no numérico, no se calcula ninguno. Campo nuevo en la UI: `#eco-masa_vi_indexada`. Los 3 índices siguen teniendo también su regex de PDF como respaldo cuando no hay peso.
    `MAPEO_EXTRACCION_PDF` ajustado para el formato real del PDF de ECG: `ekg_fc` ("FC promedio : 138bpm" — exige `bpm` pegado para no confundir con la FC de constantes), `ekg_eje` ("Eje QRS : 63°" — exige `°`), `ekg_ritmo` (texto, "Ritmo: …", corta en el salto de columna), `ekg_p_ms` ("Duración de P : 42 ms"). Nuevo soporte de campos de texto en `ecoExtraerPorRegex` (`tipo: 'texto'`).
*   **Pendiente:** corrida real desde el SPA en navegador (subir un PDF real de ecocardiografía, revisar el autollenado y los índices, enviar) — los regex de `MAPEO_EXTRACCION_PDF` se probaron con harness node contra strings sintéticos (incluido el formato de ECG informado), no contra el texto real de un PDF. La convención de unidades (lineales cm / fracciones % / velocidades m/s) es una decisión de esta sesión, no un dato del schema.

---

### J. Sprint 6 — Informe PDF + envío por mail al tutor (2026-09-09) — EN STAGING, SIN VALIDAR

Objetivo del sprint: al enviar el formulario, n8n genera un informe PDF de la consulta y lo manda por mail al tutor. **Nada de esto está en producción todavía** — se armó y quedó en un workflow COPIA para revisión de DeepSy antes de tocar `5gGWXOjY2BBOAfuw`.

**Estado del proyecto confirmado al abrir el sprint (verificado 2026-09-09 contra la API de n8n, no contra dumps):**

*   **Workflow de producción `5gGWXOjY2BBOAfuw`:** `active`, `versionCounter 13`, `updatedAt 2026-09-08T17:46`. Los 8 nodos (incluidos `IF - ¿Trae Ecocardiografía?` + `Insert Datos Ecocardiografía`) **ya están en prod**. El respaldo del repo `n8n/workflow_v5_supabase.sanitized.json` está en vC 11 — 2 saves atrás pero estructuralmente idéntico en los nodos revisados (Respond to Webhook, IF eco, Insert Atención, Insert Datos Eco). **[Corrección 2026-09-12, ver Sección J.3: verificado contra la API viva que este workflow está `active: false` hoy y es CORE/rollback, no producción. No se sabe en qué momento entre el 09-09 y el 09-12 pasó a inactivo — no reconstruible desde este documento.]**
*   **`Respond to Webhook` cuelga en rama paralela desde `IA`** y NO espera a la cadena Supabase → el SPA **nunca recibe `atencion_id`**. Cualquier generación de PDF que necesite datos ya conciliados tiene que ocurrir DENTRO de la cadena Supabase, no en la ruta de respuesta.
*   **SPA:** `consolidarPayloadFinal()` (`interface/app.js:633`) ya emite `datos_ecocardiografia`, `bloque_ekg`, `filiacion.tutor.email` (nullable), `consulta.*`. Sin cambios de SPA necesarios para el Sprint 6. (Ojo: `interface/app.js` / `index.html` / `supabase/schema.sql` tienen cambios SIN COMMITEAR previos a esta sesión — trabajo de visibilidad de campos eco + índices ampliados de la Sección I, no auditado acá.)
*   **NO hay credencial SMTP en n8n.** El envío se hace con el **nodo Gmail (OAuth2)**. Credenciales Gmail disponibles: `Gmail account INFOACIVET` (`eMVAugCGSCpQrcEj`), `Gmail - echevanest@gmail.com` (`rz2DSV3KtfiLr5fV`), `Gmail account 3` (`aYooILceNBCd7ZJF`). **Elegida: `Gmail account INFOACIVET`** (casilla institucional ACIVET).
*   **NO hay PDFMake ni renderer de PDF en la instancia.** El único precedente es `ARES_04_GEN_PDF` (`UZDXleh1j4g6aaPA`): crea un Google Doc vía API → `batchUpdate` insertText → URL `/export?format=pdf`. **Método elegido para el Sprint 6: Google Doc → export PDF** (patrón ARES_04). Credencial Drive: `Google Drive Docs Slides` (`k2oarx2fLAT9LgPw`), la misma que usa ARES_04 (su OAuth cubre el scope de Docs).
*   **E2E real todavía pendiente** (heredado, no del Sprint 6): corrida del bookmarklet real contra MyVete en navegador; corrida real subiendo un PDF de eco desde el SPA. Lo validado es POST sintético al webhook.

**Lo que se construyó (workflow COPIA, NO producción):**

*   **Workflow STAGING:** `lkOwTFmVTZu7EMoU` — "MYVETE - Ingesta (COPIA Sprint 6 - PDF+Mail) [STAGING]". `active: false`. Webhook path `ingesta-filiacion-v6-test` (distinto de prod para no colisionar). Respaldo en `n8n/workflow_v6_pdf_mail.STAGING.json`.
*   **7 nodos nuevos** colgados de la salida de `Insert Atención Cardiología` (segunda conexión, EN PARALELO a la rama del IF de eco — no aguas abajo de ella; el PDF usa `payload.datos_ecocardiografia` del webhook, no la fila de la DB):
    1.  **`Preparar Datos para PDF`** (`n8n-nodes-base.code` v2) — lee EXPLÍCITO de `$('Webhook').item.json.body` y `$('IA - Estructurar Anamnesis')` (en esa posición `$input` sería la fila de Supabase, no el payload). Combina payload + salida IA, filtra campos NULL/vacíos (regla "solo campos medidos"), separa `valoresMedidos` / `valoresIndexados` / `scores`, arma el string `doc_content` con secciones que se omiten si están vacías. Bloque ECG **comentado** (preparado para la próxima iteración). Fallback `mascota.peso ?? mascota.pesoActual`.
    2.  **`Crear Google Doc`** — `POST https://docs.googleapis.com/v1/documents`, título `Informe cardiologico - <paciente> - <fecha>`.
    3.  **`Insertar contenido en Doc`** — `POST .../documents/{documentId}:batchUpdate`, `insertText` en index 1 con `doc_content`.
    4.  **`Exportar PDF (autenticado)`** — `GET https://www.googleapis.com/drive/v3/files/{documentId}/export?mimeType=application/pdf`, `responseFormat: file` → binario en propiedad `data`. **NO se hace público el Doc** (a diferencia de ARES_04) porque el informe tiene datos personales del tutor.
    5.  **`IF - ¿Tutor con email?`** — condición: email existe Y ≠ `N/D`.
    6.  **`Enviar informe al tutor`** (`n8n-nodes-base.gmail` v2.1) — cred `Gmail account INFOACIVET`, `sendTo` = email del tutor, PDF adjunto desde la propiedad binaria `data`.
    7.  **`Archivar Google Doc`** — `PATCH .../files/{documentId}` con `{ trashed: true }` (borra la copia con PII del Drive después del envío; también corre por la rama false del IF).
*   **Los 5 nodos HTTP/Gmail nuevos con `onError: continueRegularOutput`** — un fallo de PDF/mail no rompe los inserts previos ni la respuesta HTTP (ya emitida en paralelo). Blast radius máximo: "no se envió el mail".

**PENDIENTE para retomar (en orden):**

1.  **Revisión de DeepSy** del diseño de los 7 nodos (`n8n/workflow_v6_pdf_mail.STAGING.json` + esta sección). Decisiones a confirmar/vetar: (a) rama colgada de `Insert Atención Cardiología` en paralelo al IF de eco; (b) Doc privado + export autenticado + papelera, en vez de Doc público; (c) PDF como texto plano en Google Doc (NO la maqueta visual de `MODELOS DE INFORMES/informe JOSEMA.pdf` — para ese aspecto haría falta un Doc-plantilla con `{{placeholders}}` que alguien arme y comparta); (d) remitente `INFOACIVET`.
2.  **Prueba E2E sintética en STAGING:** activar `lkOwTFmVTZu7EMoU`, `POST` a `https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v6-test` con payload de prueba (incluir `filiacion.tutor.email` = una casilla propia, p. ej. `echevanest@gmail.com`, **no** un email inventado), verificar: Doc creado → PDF exportado → mail recibido con adjunto → Doc en papelera. Desactivar la copia al terminar. **OJO: esto envía un mail real por la casilla INFOACIVET y crea/descarta un Doc en esa cuenta de Google.**
3.  **Ajuste de la plantilla** (`doc_content` en el nodo `Preparar Datos para PDF`) según feedback del PDF de prueba y, si se decide, migración a Doc-plantilla con placeholders para el diseño de `informe JOSEMA.pdf`.
4.  **Portar a producción `5gGWXOjY2BBOAfuw`:** antes de tocar, `GET` del workflow de prod → guardar como `n8n/workflow_v6_pdf.prod.pre.json` y commitear (rollback). Agregar los 7 nodos + la segunda conexión desde `Insert Atención Cardiología`. Publicar. Actualizar `n8n/workflow_v5_supabase.sanitized.json` → `v6`.
5.  **Iteración ECG:** descomentar el bloque `ekg` en `Preparar Datos para PDF` y agregar la sección "ELECTROCARDIOGRAMA" al `doc_content` (los 4 campos ya llegan en `payload.bloque_ekg`, que n8n hoy ignora).
6.  **Auditoría (opcional):** columnas `informe_enviado_at` / `informe_email_to` / `informe_pdf_url` en `atenciones_cardiologia` + un `PATCH` final al registro. El `informe_borrador` jsonb ya persiste el objeto IA, así que el PDF es reproducible desde la DB aunque falle el envío.

**Archivos nuevos/tocados en esta sesión:** `n8n/workflow_v6_pdf_mail.STAGING.json` (nuevo, respaldo de la copia), `STATUS.md` (esta sección), `n8n/README.md` (sección "Workflow STAGING Sprint 6"). **No se tocó producción, ni el SPA, ni Supabase.**

---

### J.2 — Sprint 6 v2: persistencia del PDF en Drive + índice en Sheets + alerta de fallo (2026-09-10) — EN STAGING, SIN VALIDAR

Segunda iteración sobre la COPIA `lkOwTFmVTZu7EMoU` tras revisión de DeepSy. **Producción sigue sin tocar.** El workflow pasó de 15 a **24 nodos** (`active: false`). Respaldo actualizado en `n8n/workflow_v6_pdf_mail.STAGING.json`.

**Decisiones de DeepSy aplicadas:**
*   **B1 (credencial Sheets):** no se pudo leer el scope de `Google Drive Docs Slides` (`k2oarx2fLAT9LgPw`) — la API de n8n devuelve `403` en `GET /credentials/{id}`. Pero **ya existe una credencial dedicada `googleSheetsOAuth2Api`: `Google Sheets account` (`8UcIjrUyUocK69km`)**, en uso productivo por el workflow `ZLCcZ0H7iPgms3EU` ("REGISTRO DATOS PROFESIONALES") con un nodo nativo Google Sheets haciendo *append*. Se usa esa, con el nodo nativo Google Sheets. No hizo falta crear credencial nueva ni apostar al scope de la de Drive.
*   **B2 (granularidad del check):** el `IF - ¿Persistió en Supabase?` verifica **solo el keystone** — que `Insert Atención Cardiología` haya devuelto `id`. Si lo devolvió, `Upsert Tutor`/`Upsert Mascota` necesariamente funcionaron (dependencia FK).
*   **B3 (carpeta + Sheet):** Opción A — Marcelo los crea a mano y pasa los IDs. En el workflow quedan como **placeholders literales**: la cadena `{{FOLDER_ID}}` (2 usos: `Nombrar y mover PDF` addParents, `Buscar colisiones PDF` query `q`) y `{{SHEET_ID}}` (1 uso: `Registrar en Índice` documentId). Cuando lleguen los IDs → *find-and-replace* en el JSON del repo + `PUT` a n8n.
*   **B4 (alerta):** dispara **SIEMPRE que falle la persistencia** (no condicionada a "informe enviado"). El `IF - ¿Persistió?` cuelga de **ambas** ramas del `IF - ¿Tutor con email?`. Mensaje armado por el Code node `Preparar alerta` con estado paso a paso (tutor / mascota / atención / eco / Doc / PDF Drive / mail) + el error crudo de PostgREST.

**Cambios estructurales v1 → v2:**
1.  `Upsert Tutor`, `Upsert Mascota`, `Insert Atención Cardiología` → **`onError: continueRegularOutput`** (el informe se emite aunque falle la persistencia; y el `IF - ¿Persistió?` puede leer el resultado desde otra rama sin romper).
2.  `Archivar Google Doc` → renombrado a **`Eliminar Google Doc`**, `PATCH {trashed:true}` → **`DELETE files/{documentId}`**. Ya no cuelga del final: es una rama *fire-and-forget* de `Exportar PDF`.
3.  **`Exportar PDF (autenticado)` hace fan-out a 3 ramas** (n8n copia el item con binario a cada conexión), **en este orden**: `Guardar PDF en Drive (subir)` → `Eliminar Google Doc` → `IF - ¿Tutor con email?`. El orden importa: con `executionOrder: v1` la rama Drive se completa entera (incluido `Registrar en Índice`) antes de la rama de alerta, así que `Preparar alerta` ya tiene el `webViewLink` del PDF y lo incluye en el mail de alerta.
4.  **Rama Drive nueva:** `Guardar PDF en Drive (subir)` (`POST upload/drive/v3/files?uploadType=media`, `Content-Type: application/pdf`, binario `data`) → `Nombrar y mover PDF` (`PATCH files/{id}?addParents={{FOLDER_ID}}&removeParents=root`, body `{name: nombrePdfBase}`) → `Buscar colisiones PDF` (`GET files?q=name='<base>' and '{{FOLDER_ID}}' in parents`) → `IF - ¿Colisión de nombre?` (`files.length > 1`) → **true** `Renombrar PDF (colisión)` (`name: nombrePdfDesambiguado`) → `Registrar en Índice`; **false** → `Registrar en Índice`.
5.  **`Registrar en Índice`** (`n8n-nodes-base.googleSheets` v4.7, cred `8UcIjrUyUocK69km`, `append`, `documentId = {{SHEET_ID}}`, `sheetName = "Hoja 1"`). Columnas: `Nombre Paciente | Nombre Tutor | Apellido Tutor | ID MyVete | ID Supabase | Link PDF | Fecha`. `Link PDF` = `webViewLink` de `Nombrar y mover PDF` (estable ante el rename). `ID Supabase` = `id` de la atención (vacío si falló).
6.  **Rama alerta nueva:** `IF - ¿Tutor con email?` (true→`Enviar informe al tutor`→ , false→ ) `IF - ¿Persistió en Supabase?` → **true** nada · **false** `Preparar alerta` (Code — estado paso a paso + `webViewLink` del PDF) → `Alertar fallo persistencia` (`n8n-nodes-base.gmail`, cred `Gmail - echevanest@gmail.com` `rz2DSV3KtfiLr5fV`, `To: echevanest@gmail.com, infoacivet@gmail.com`, texto plano).
7.  **`Preparar Datos para PDF`:** + parseo `apellidoTutor` / `nombreTutor` desde `"APELLIDO, NOMBRE"` (sin coma → todo a `nombreTutor`); + `mesAnio` (`AGOSTO 2026`); + `nombrePdfBase` (`<PACIENTE><APELLIDO> <MES> <AÑO>`, cada parte normalizada: sin acentos, solo `[A-Z0-9]`); + `nombrePdfDesambiguado` (`<PACIENTE><APELLIDO> (<NOMBRE>) <MES> <AÑO>`).
8.  **SPA:** `interface/app.js` — `"Reporte generado"` → `"Informe enviado"` (única ocurrencia, línea del handler de envío). Solo surte efecto al portar a prod (el SPA apunta al webhook de producción).
9.  Todos los nodos HTTP/Gmail/Sheets nuevos con `onError: continueRegularOutput`.

**PENDIENTE de IDs (bloquea la prueba E2E):**
*   Marcelo crea la carpeta `Informes MYVETE` y el Sheet `Índice de Informes MYVETE` (con la fila de encabezados, en la **misma cuenta de Google** que las credenciales `Google Drive Docs Slides` y `Google Sheets account` de n8n — hay que confirmar en la UI de n8n qué cuenta es cada una) y pasa: `FOLDER_ID` (de `drive.google.com/drive/folders/<ID>`) y `SHEET_ID` (de `docs.google.com/spreadsheets/d/<ID>`).
*   Luego: *find-and-replace* de `{{FOLDER_ID}}` y `{{SHEET_ID}}` en `n8n/workflow_v6_pdf_mail.STAGING.json` → `PUT` a `lkOwTFmVTZu7EMoU`.

**Resuelto por DeepSy (2026-09-10):**
*   **Remitente del mail al tutor:** CONFIRMADO `Gmail account INFOACIVET` (`eMVAugCGSCpQrcEj`) — casilla institucional. El "(Gmail account 3)" del prompt era un error. Sin cambios (el nodo ya lo usaba).
*   **Orden del fan-out de `Exportar PDF`:** se reordenó a Drive-primero (ver punto 3) para que el mail de alerta incluya el `webViewLink` del PDF. `Preparar alerta` ahora emite una línea `PDF del informe: <link>`.

**PENDIENTE de validar en la E2E:**
*   **Params de nodos Google contra la API real:** los nodos HTTP a Drive (`uploadType=media`, `addParents/removeParents`, `q` de búsqueda) y el nodo nativo Sheets se escribieron sin poder ejecutarlos (faltan los IDs). Sanity-check en la UI de n8n al cargar los IDs, antes de la E2E.
*   **Cuenta de `Google Sheets account` vs `Google Drive Docs Slides`:** si son cuentas de Google distintas, el índice y los PDF quedan en Drives separados (funciona, pero el "Link PDF" apunta a otro Drive y el Sheet no se puede anidar en la carpeta).

**NO se corrió la prueba E2E** (esperando IDs). Sigue pendiente todo lo de J: E2E sintética en staging, ajuste de plantilla `doc_content`, iteración ECG, portar a producción.

**Archivos tocados en esta iteración:** `n8n/workflow_v6_pdf_mail.STAGING.json` (regenerado, 24 nodos, con placeholders), `interface/app.js` (texto del botón), `STATUS.md` (esta subsección). Workflow `lkOwTFmVTZu7EMoU` actualizado vía `PUT` a la API de n8n (`active: false`). **Producción, Supabase y el resto del SPA sin tocar.**

---

### J.3 — Corrección de topología + Fix 1: migración de credencial Drive (2026-09-12)

**Corrección de topología (reemplaza el marco de J/J.2 sobre "producción"):** hubo un malentendido — no hay UN workflow con una copia de staging encima, hay DOS workflows con roles distintos, ninguno publicado hoy:

*   **Workflow A — CORE (`5gGWXOjY2BBOAfuw`, "MYVETE - Ingesta Filiación & Orquestador Core"):** congelado, punto de rollback. Verificado contra la API viva 2026-09-12: `active: false`, 8 nodos, `updatedAt 2026-09-08T17:46` (sin cambios desde entonces). **No es producción** pese a lo escrito en la Sección J — ver nota agregada ahí.
*   **Workflow B — candidato a producción (`lkOwTFmVTZu7EMoU`, "MYVETE - Ingesta (COPIA Sprint 6 - PDF+Mail) [STAGING]"):** tiene todo el Sprint 6 (24 nodos). Verificado 2026-09-12: `active: false`.
*   **No hay producción activa hoy.** Plan de consolidación (decisión del dueño del proyecto): aplicar fixes pendientes a B → Prueba A → Prueba B → publicar B → validar en producción real 3-7 días → recién entonces borrar A → confirmar que solo queda B en n8n.

**Hallazgo B (placeholders `{{FOLDER_ID}}`/`{{SHEET_ID}}`) — resuelto como falso positivo del lado del repo, no de n8n:** el workflow B vivo en n8n **ya tenía los IDs reales** (`FOLDER_ID = 1_lcbkiJK5ql_1sCNB3kkhDOES7Xgv7Vn`, `SHEET_ID = 1Zxn38DFlpGBlIKSsh_94ZfdnWHC5D3j9y9eiOTGwCxU`, verificado con `GET /workflows/lkOwTFmVTZu7EMoU`); era el archivo `n8n/workflow_v6_pdf_mail.STAGING.json` del repo el que había quedado desactualizado desde J.2 (nunca se re-exportó después del find-and-replace hecho directo en n8n). El punto 2 de "PENDIENTE de IDs" en J.2 está entonces completo, solo faltaba sincronizar el repo — ya resuelto (ver más abajo).

**Fix 1 — COMPLETO (2026-09-12):** migración de credencial Google Drive de `k2oarx2fLAT9LgPw` ("Google Drive Docs Slides", cuenta ARES) a `4ugwVBPjLZ0Me9JS` ("Google Drive - infoacivet (MYVETE)") en 7 nodos del workflow B:
Crear Google Doc, Insertar contenido en Doc, Exportar PDF (autenticado), Eliminar Google Doc, Guardar PDF en Drive (subir), Buscar colisiones PDF, Renombrar PDF (colisión). El nodo "Nombrar y mover PDF" ya tenía `4ugwVBPjLZ0Me9JS` de antes y no se tocó. Aplicado vía `PUT /workflows/lkOwTFmVTZu7EMoU` a la API de n8n; verificado con `GET` antes/después: exactamente esos 7 nodos cambiaron (diff nodo-por-nodo confirmado), `connections` idénticas, `active: false` conservado. Commit local `2236389` (sin push a `origin`).

**Regla de sincronización adoptada:** n8n es la fuente de verdad operativa; el repo (`n8n/workflow_v6_pdf_mail.STAGING.json`) es un espejo — cada `PUT` a n8n va seguido, en el mismo turno, de un `GET` que sobreescribe el archivo del repo y se commitea junto con el cambio. Evita la desincronización que causó el falso positivo del Hallazgo B.

**Fixes pendientes sobre el workflow B (en orden, esperando confirmación/ejecución):**
*   **Fix 2:** actualizar el mapeo de "Registrar en Índice" al esquema nuevo: `fecha | paciente | tutor | veterinario_derivante | nombre_pdf | link_pdf | estado_persistencia | observaciones` (`veterinario_derivante` y `observaciones` mapean a `''` por ahora, Fase 1 los implementa). Reemplaza el esquema de columnas descrito en J.2 punto 5.
*   **Fix 3:** reconectar la credencial Gmail `Gmail account INFOACIVET` (`eMVAugCGSCpQrcEj`, usada en "Enviar informe al tutor") — está desconectada. La otra credencial Gmail en uso, `Gmail - echevanest@gmail.com` (`rz2DSV3KtfiLr5fV`, en "Alertar fallo persistencia"), está OK. Acción de Marcelo, no de CODE.
*   **Fix 4:** limpieza de residuos de la Prueba A (3 filas en Supabase + 1 PDF huérfano en Drive).

Después de los 4 fixes: Prueba A → Prueba B → publicar B → validar en real → borrar A (Workflow CORE).

**Pendientes menores de esta sesión:** commit `2236389` sigue sin pushear a `origin` (esperando autorización explícita); 4 archivos con cambios preexistentes sin commitear detectados por `git status` pero no auditados ni tocados en esta sesión: `STATUS.md` (este mismo archivo, cambios de sesiones previas + esta actualización), `interface/app.js`, `interface/index.html`, `supabase/schema.sql`.

**Archivos tocados en esta sesión:** `n8n/workflow_v6_pdf_mail.STAGING.json` (re-exportado del workflow vivo tras Fix 1, reemplaza el archivo hand-mantenido — ahora es un export completo de la API de n8n con `_nota` actualizada), `STATUS.md` (esta subsección). **No se tocó Supabase, el SPA, ni se publicó ningún workflow.**

---

## 🟡 2. TRABAJO EN PROGRESO (Evolución Actual)

**Sprint 6 — Informe PDF + envío por mail + persistencia Drive/Sheets + alerta (ver Secciones J, J.2, J.3).** Armado en el workflow candidato a producción `lkOwTFmVTZu7EMoU` (24 nodos, `active: false`). `FOLDER_ID`/`SHEET_ID` ya resueltos, Fix 1 (credencial Drive) completo. Falta: Fix 2 (mapeo "Registrar en Índice"), Fix 3 (reconectar Gmail INFOACIVET), Fix 4 (limpieza residuos Prueba A) → Prueba A → Prueba B → publicar como producción → validar 3-7 días en real → borrar workflow CORE (`5gGWXOjY2BBOAfuw`). Ningún workflow está publicado hoy.

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