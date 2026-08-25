# 🗺️ ESTADO DEL PROYECTO: INTERFAZ LOCAL & n8n

*   **Última actualización:** 2026-08-24
*   **Versión de la Arquitectura:** V4.9 (Streaming de Dictado Interino + Conexión End-to-End n8n Cloud Validada + Nodo IA en producción + Fix de renderizado de `borrador_medico` + Bookmarklet de Filiación implementado)
*   **Control de versión:** Repositorio Git local inicializado (branch `master`). Cambios de hoy sin commitear todavía.

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

### E. Bookmarklet de Filiación (`bookmarklet/launcher.js`) — Implementado (24/08/2026)
*   **Estado:** Implementado (Pendiente de validación visual en entorno real MyVete). Deja de ser un stub con TODOs: el raspado de la Sección 3.2 punto 1 (`INFORME-ARQUITECTURA-MYVETE-V2.7.md`) ya corre sobre selectores DOM reales.
*   **Selectores confirmados:** mascota vía `.patient-info h1`; especie/raza vía el `div` interno cuyo texto combina "Especie, Raza, Color" separado por comas (el color se descarta, no forma parte del contrato de datos). Tutor todavía sin selector real confirmado — viaja con sus 3 campos en `null` (raspado de mejor esfuerzo).
*   **Contrato `postMessage` oficial (bookmarklet → SPA), calzado con el listener ya existente en `interface/app.js` Sección 2:**
    ```json
    {
      "type": "MYVETE_FILIACION",
      "payload": {
        "tutor": { "nombre": null, "telefono": null, "email": null },
        "mascota": { "nombre": "string|null", "especie": "string|null", "raza": "string|null", "pesoActual": "number|null" }
      }
    }
    ```
    Nota: esta forma (payload con `tutor`/`mascota` a nivel raíz) es la que efectivamente consume `app.js` hoy — distinta de la envoltura `meta`/`tutor`/`mascota` propuesta originalmente en `CONTRATO-DE-DATOS-V2.7.md` Sección 1.2, que queda como diseño no implementado.
*   **`window.open()` síncrono:** se dispara en el mismo hilo del clic (sin pasos async antes), respetando la mitigación de bloqueo de pop-ups de la Sección 4.1 del informe de arquitectura.
*   **Reintentos en vez de handshake:** como `app.js` todavía no emite señal de "ventana lista" (handshake de la Sección 0.1 del Contrato de Datos V2.7, ver pendiente #6 abajo), el mensaje se reenvía cada 400ms durante 5 intentos (~2s) en lugar de un único `postMessage` a ciegas. Es seguro porque `app.js` solo asigna valores a campos (idempotente).
*   **Pendiente real:** no se probó todavía contra el DOM en vivo de MyVete (¿el `div` combinado de especie/raza/color es siempre el primero con coma dentro de `.patient-info`, o puede haber otro que lo confunda?). Selector de tutor sigue sin confirmar.

---

## 🟡 2. TRABAJO EN PROGRESO (Evolución Actual)

Sin frentes activos por el momento — próximo trabajo en la sección de pendientes abajo.

---

## 🔴 3. PENDIENTES PRÓXIMOS

1. **Confirmar visualmente el renderizado de `borrador_medico`:** repetir la prueba manual de dictado en `http://localhost:8080/interface/index.html` y verificar que `#bloque-resumen` se muestre y `#resumen-clinico-texto` traiga el objeto formateado (el fix de `mostrarBorradorMedico()` quedó aplicado pero sin confirmación visual en esta sesión).
2. **Bookmarklet de Filiación (`bookmarklet/launcher.js`):** implementado (ver Sección 1.E) con selectores reales de mascota/especie/raza — pendiente de: (a) validación visual real contra la pestaña de MyVete abierta (¿el `div` combinado elegido es siempre el correcto?), (b) selector real de tutor (nombre/teléfono/email), todavía no confirmado sobre el DOM.
   *   **Quirk de Chrome a tener en cuenta:** el campo URL del editor de marcadores bloquea el pegado directo de una URL `javascript:...` completa (protección anti-XSS) — hay que escribir `javascript:` a mano en ese campo y recién ahí pegar el resto del código.
3. **Persistencia del borrador de IA:** el workflow de n8n todavía no reenvía `borrador_medico` ni el payload original a un destino final (Sheets/Supabase/orquestador real) — solo lo devuelve en la respuesta HTTP.
4. **Botón "Confirmar y enviar a MyVete"** en `#bloque-resumen`: falta el `postMessage` que confirme el borrador editado de vuelta al bookmarklet.
5. **Implementación de la Sección C en SPA (Estudios Complementarios):** Maquetado de métricas de Ecocardiograma, Electrocardiograma y Observaciones de Estudios en `index.html` y `app.js`.
6. **Sincronización de Handshake (`PostMessage`):** Protocolo de confirmación de carga de la ventana flotante con el Bookmarklet de MyVete (Sección 5 de `INFORME-ARQUITECTURA-MYVETE-V2.7.md`).
7. **Control de Versiones (Git):** repositorio ya inicializado localmente; falta resolver el archivo de conflicto de sincronización sin trackear (`interface/app.sync-conflict-*.js`), revisar/commitear los cambios de hoy (`STATUS.md`, `interface/app.js`, `interface/index.html`, `n8n/README.md`, `n8n/workflow_v4_current.json`) y confirmar remoto.