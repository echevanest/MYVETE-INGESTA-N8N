# /n8n

Carpeta de documentación de los flujos de trabajo de n8n Cloud usados por este proyecto.

No contiene lógica del proyecto en sí — es el respaldo local de lo que vive en `echevanest.app.n8n.cloud`. Acá van, a medida que se definan e implementen en n8n:

- Plantillas JSON exportadas de cada workflow (respaldo ante cambios o errores en la nube).
- Notas de configuración de nodos que no queden claras solo con el JSON (credenciales referenciadas, nombres de hojas de cálculo, direcciones de correo de destino).

## Workflow: MYVETE - Ingesta Filiación & Orquestador Core

*   **Instancia:** `echevanest.app.n8n.cloud`
*   **Workflow ID:** `5gGWXOjY2BBOAfuw`
*   **Estado:** Activo (publicado 28/07/2026, nodo IA agregado y activado 31/07/2026)
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
