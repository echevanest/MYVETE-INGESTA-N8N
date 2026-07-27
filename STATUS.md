# 🗺️ ESTADO DEL PROYECTO: INTERFAZ LOCAL & n8n

*   **Última actualización:** 2026-07-27
*   **Versión de la Arquitectura:** V4.8 (`interface/app.js` reconstruido — ver nota abajo)
*   **Versión de Medicación:** V2.9
*   **Control de versión:** sin repositorio Git todavía (ni en esta carpeta ni en `AUTOMATIZACIONES_N8N`/`PROYECTOS`/`Documents`) — pendiente de decisión, ver Sección 3.

> **Nota sobre la reconstrucción del 27/07:** `interface/app.js` no existía físicamente en disco pese a que esta misma versión del archivo lo daba por completado (`ReferenceError: consolidarPayloadFinal is not defined`). Se reconstruyó desde cero ese día siguiendo el Contrato de Datos V2.7 y el INFORME_CODE V4.8. Lo que sigue ya refleja esa reconstrucción, no el estado previo al 27/07.

---

## 🟢 1. COMPONENTES COMPLETADOS (100% Funcionales en Local)

### A. Sección: Filiación (Tutor y Mascota)
*   **HTML & CSS:** Estructura grid de visualización de datos de filiación.
*   **Security / UX:** Bloqueada en modo lectura por defecto. Botón `#btn-editar-filiacion` operativo.
*   **Lógica:** Al hacer clic en "Editar", se habilitan los campos y el flag `bloqueFiliacionEditado` conmuta permanentemente a `true` en el payload.
*   **Ingesta `MYVETE_FILIACION` validada en Lenovo (27/07):**
    *   `especie` normaliza el valor entrante (case-insensitive) contra los `value` reales de las `<option>` del `<select>`, en vez de asignación directa — el raspado de MyVete llega capitalizado ("Canino") y no matcheaba con los `value` en minúscula.
    *   `peso` acepta tanto `pesoActual` como `peso`, y sanitiza formato decimal ES/AR (coma → punto, descarta unidades pegadas como "kg").

### B. Sección: Consulta de Hoy
*   **HTML & CSS:** Campos para Constantes Fisiológicas (FC, FR, Mucosas) más los tres campos de texto estructurales (`anamnesis`, `diagnostico`, `indicaciones`).
*   **UI Helper:** Incluido "Motivo de la consulta" en pantalla como helper para el médico (excluido del JSON final por contrato).

### C. Consolidación de Payload (Fase 1)
*   **Lógica:** `consolidarPayloadFinal()` unifica Filiación, Consulta, Medicaciones y Apéndice Métrico (`MAPEO_METRICAS`) en un JSON con 4 claves: `filiacion`, `consulta`, `medicacion`, `bloque_metrico` (forma fijada por el INFORME_CODE V4.8, distinta de la propuesta original de V2.7 con `meta`/`tutor`/`mascota`/`tratamientoCronico` a nivel raíz).
*   **Validación:** El botón `#btn-submit-formulario` valida obligatoriamente que el campo `#consulta-diagnostico` no esté vacío antes de enviar. Muestra un aviso en pantalla mediante `#aviso-formulario` si falla.
*   **Expuesta globalmente:** `window.consolidarPayloadFinal` disponible para pruebas de consola.

### D. Envío del formulario (Fase 2)
*   **Lógica:** El manejador de `#btn-submit-formulario` invoca `consolidarPayloadFinal()` y hace `fetch POST` (JSON) contra `WEBHOOK_URL_N8N`.
*   **Feedback visual:** botón deshabilitado + texto "Enviando..." → "Reporte generado" / "Error de conexión" (con reactivación del botón en error para reintentar).
*   **Guard-rail:** `WEBHOOK_URL_N8N` declarada **vacía a propósito** — no hay workflow publicado en n8n Cloud todavía (`n8n/README.md`: "Sin contenido todavía"). Mientras esté vacía, el botón avisa en pantalla/consola en vez de intentar enviar a una URL inventada.
*   **Relación de ventana corregida:** el despacho usa `window.opener` (no `window.parent`), acorde a que esta ventana se abre como popup desde el bookmarklet (Contrato de Datos V2.7, Sección 0), no como iframe.

---

## 🟡 2. TRABAJO EN PROGRESO (Siguiente Sesión de Desarrollo)

### Paso A: Lógica del Selector de Perfiles Clínicos
*   **Objetivo:** Conectar el listener del desplegable `#control-perfil-clinico` para inyectar dinámicamente los valores clínicos predefinidos (Sano / ACVIM B1 / ACVIM B2) del diccionario `PERFILES_CLINICOS` en los campos correspondientes, permitiendo su modificación posterior.
*   **Estado (27/07):** el listener ya existe en `app.js`, pero `PERFILES_CLINICOS` quedó **vacío a propósito** — no se inventaron valores clínicos. Sigue abierta además la pregunta de `PROPUESTA-MODELO-ELASTICO-V3.5.md` (línea 191): si este atajo de plantilla completa se conserva (alimentado por una hoja `Plantillas` en Sheets) o se abandona a favor de completar cada campo por separado.

### Paso B: Handshake inicial (PostMessage)
*   **Objetivo:** Implementar el handshake de dos pasos descrito en el Contrato de Datos V2.7 (Sección 0.1): la ventana flotante avisa "lista" a `window.opener` al cargar, y recién ahí el bookmarklet responde con el Payload de Apertura completo.
*   **Estado (27/07):** todavía no implementado. Lo que sí existe es el listener pasivo de `MYVETE_FILIACION` (recibe y precarga si algo le llega), pero sin la señal activa de "lista" — sin ella, el emisor no tiene garantía de que el mensaje no se pierda por condición de carrera.

### Paso E: Workflow de n8n
*   **Objetivo:** Armar y publicar el workflow en n8n Cloud que reciba el POST de `#btn-submit-formulario`, y pegar esa URL en `WEBHOOK_URL_N8N` (`interface/app.js`).

---

## 🔴 3. PENDIENTES FUERA DE ALCANCE ACTUAL (Requisitos de Producción)
*   **Seguridad de Canal:** Restringir el `targetOrigin: "*"` en el envío del `postMessage` por el dominio real de producción del sistema base una vez sea definido, para evitar fugas de datos clínicos.
*   **Sincronización Dinámica:** Conexión de selectores a fuentes de datos externas (Google Sheets o Supabase).
*   **Control de versión:** esta carpeta (y todo `PROYECTOS`) no tiene repositorio Git inicializado. Sin eso, no hay respaldo histórico de estos archivos más allá de lo que exista en el disco — el propio `app.js` se perdió una vez sin dejar rastro. Pendiente de que Marcelo decida si se inicializa un repo (local, o con remoto en GitHub) para este proyecto.
