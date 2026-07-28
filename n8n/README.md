# /n8n

Carpeta de documentación de los flujos de trabajo de n8n Cloud usados por este proyecto.

No contiene lógica del proyecto en sí — es el respaldo local de lo que vive en `echevanest.app.n8n.cloud`. Acá van, a medida que se definan e implementen en n8n:

- Plantillas JSON exportadas de cada workflow (respaldo ante cambios o errores en la nube).
- Notas de configuración de nodos que no queden claras solo con el JSON (credenciales referenciadas, nombres de hojas de cálculo, direcciones de correo de destino).

## Workflow: MYVETE - Ingesta Filiación & Orquestador Core

*   **Instancia:** `echevanest.app.n8n.cloud`
*   **Workflow ID:** `5gGWXOjY2BBOAfuw`
*   **Estado:** Activo (publicado 28/07/2026)
*   **Production URL:** `https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4`
*   **Nodos:**
    1.  **Webhook** — `POST`, path `ingesta-filiacion-v4`, `responseMode: responseNode`, CORS abierto (`options.allowedOrigins: "*"`) para aceptar el POST desde la ventana popup del bookmarklet (origen `null`/`file://`).
    2.  **Respond to Webhook** — responde `200` con `{ status: "success", message: "Payload A V4.8 recibido correctamente", timestamp: <ISO> }`. El timestamp se genera con `$now.toISO()` (no `.toISOString()` — ese método no existe en el objeto Luxon `$now` de n8n).
*   **Validado end-to-end el 28/07/2026:** POST de prueba devolvió `200` con el JSON esperado; preflight `OPTIONS` devuelve `204`.
*   **Pendiente:** el flujo hoy solo confirma recepción — no persiste ni reenvía el payload a ningún destino (Sheets/Supabase/orquestador real). Eso es el próximo paso cuando se defina el destino final de los datos clínicos.
