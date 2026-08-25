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
*   **Respaldo local:** `n8n/workflow_v4_current.json` (export vía API REST de n8n, no versionar credenciales).
*   **Pendiente:** el flujo persiste solo hasta la respuesta HTTP — no reenvía el payload ni el borrador de IA a ningún destino final (Sheets/Supabase/orquestador real). Eso sigue siendo el próximo paso.
