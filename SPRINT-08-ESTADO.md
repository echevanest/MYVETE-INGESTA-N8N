# Sprint 8 — Autofill, Plantillas y Examen Clínico — Estado

Última actualización: 2026-09-23

## Qué es el Sprint 8

El Sprint 8 apunta a acelerar y ordenar la carga clínica en el SPA:

- **Examen clínico completo y persistido** (lo que se implementó en 8.0).
- **Autofill** desde la consulta anterior del paciente.
- **Perfiles/plantillas clínicas** que hoy viven hardcodeados en el SPA (`PERFILES_BASE` + localStorage).

El documento de planificación original es `SPRINT 8 — AUTOFILL Y PLANTILLAS.md` (no versionado).

## Por qué empezó por el examen clínico (8.0)

La auditoría previa al sprint (ver "Referencias") encontró:

- **H2 (crítico):** las constantes que carga el vet en el SPA (FC/FR/PAS/PAM/PAD/Mucosas) salían en el PDF pero en Supabase se guardaban como null. `metricas` se armaba solo con la salida de la IA. Además, en el PDF la IA tenía **prioridad** sobre el SPA: si el vet tipeaba FC 120 y dictaba "fc 140", el informe decía 140.
- El SPA tenía solo 6 campos clínicos; faltaban sensorio, pulso femoral, reflejo tusígeno, hidratación, TLLC, sucusión, auscultación pulmonar y cardíaca y soplos.

Sin datos clínicos confiables y persistidos no tiene sentido construir autofill, así que 8.0 va primero.

## Sub-fases implementadas (2026-09-23)

| Paso | Qué | Estado |
|---|---|---|
| Prompt 1 | Migración `sprint8_examen_clinico_atenciones`: 15 columnas del examen + `updated_at` + trigger | ✅ Aplicado |
| 2a | Migración `sprint8_pa_columns_drop_metricas_updated_at`: `pas`/`pam`/`pad`, DROP `metricas`, DROP `updated_at` + trigger | ✅ Aplicado |
| 2b | SPA: bloque único "Consulta y examen clínico" + payload `examen_clinico` | ✅ Implementado y commiteado; falta deploy/uso real |
| 2c | n8n `MYVETE - Ingesta`: 3 nodos adaptados + bloque "EXAMEN CLÍNICO" en el informe | ✅ Aplicado en n8n (inactivo) |

### Prompt 1 + 2a — Supabase

`atenciones_cardiologia` quedó con estas columnas nuevas, todas nullable y sin CHECK:

- `text`: `sensorio`, `mucosas`, `pulso_femoral`, `reflejo_tusigeno`, `hidratacion`, `tllc`, `sucusion`, `auscultacion_pulmonar_patron`, `auscultacion_pulmonar_amplitud`, `auscultacion_pulmonar_sltb`, `fr_tipo`
- `integer`: `fc_numero`, `fr_numero`, `pas`, `pam`, `pad`
- `jsonb`: `auscultacion_cardiaca` (array de textos), `soplos` (array de `{momento, foco, intensidad, orden}`)

Se eliminaron `metricas` (deprecada por H2) y `updated_at` + su trigger (se agregaron en el Prompt 1 y se sacaron en 2a: no aportaban valor). La tabla tenía 0 filas al migrar. Detalle en `supabase/schema.sql`.

### 2b — SPA

- Bloque único **"Consulta y examen clínico"**, siempre visible, con 21 ítems en orden clínico: motivo, anamnesis, FC + soplos, FR + tipo, sensorio, mucosas, pulso femoral, reflejo tusígeno, hidratación, TLLC, sucusión, auscultación pulmonar (patrón/amplitud/SLTB), auscultación cardíaca, [16 y 17 reservados], PAS/PAM/PAD, diagnóstico, indicaciones, [21 reservado].
- Opciones y defaults en **una sola fuente**: `CATALOGO_EXAMEN` / `CATALOGO_SOPLO` (`interface/app.js`, Sección 9). El HTML solo trae los `<select>` vacíos.
- Todos los selects tienen opción vacía "—", que viaja como `null` (antes mucosas no tenía opción vacía y siempre mandaba "rosadas").
- **Soplos:** N renglones (sin límite), 3 selects + eliminar. Los renglones totalmente vacíos no se envían.
- **Auscultación cardíaca:** checkboxes de selección múltiple; "Normal" es excluyente. Con soplos queda vacía y sin soplos vuelve a `["Normal"]`, **salvo** que el vet la haya tocado a mano.
- Números redondeados a entero (las columnas son `integer`).
- `payload.consulta` se reemplazó por `payload.examen_clinico`.
- El bloque de eco/ECG (`<details>`) se mantiene, ubicado en la zona de los reservados 16/17.

### 2c — n8n + informe

Ver `n8n/README.md` → "Estado actual". En resumen:

- La IA lee `examen_clinico`.
- El insert mapea 25 columnas y ya no manda `metricas`.
- El PDF toma las constantes solo del SPA.
- El informe suma las secciones **MOTIVO DE LA CONSULTA** y **EXAMEN CLÍNICO**, con soplos en formato `SOPLO SISTÓLICO MITRAL 3/6`.
- Backups: `n8n/workflow_v7_pre-2c.json` / `workflow_v7_post-2c.json`.

## Decisiones de diseño tomadas

1. **La fuente de verdad clínica es el SPA.** La IA solo estructura la anamnesis narrativa (resumen, síntomas, cumplimiento, sugerencias). Sus `fc/fr/pas/pam/pad/mucosas` quedan solo dentro de `informe_borrador`.
2. **El examen se guarda en columnas de `atenciones_cardiologia`**, no en una tabla aparte ni en un jsonb único. Así se persiste en el mismo INSERT que la atención: es atómico y no necesita nodo ni alerta extra.
3. **Soplos y auscultación cardíaca se guardan como jsonb** (arrays).
4. **Se guarda el texto visible (con tildes), no códigos.** Se lee directo en Supabase y en el PDF. Contra: corregir un texto después deja historial con el texto viejo.
5. **Sin CHECK ni enums** en las columnas del examen. FC/FR son `integer` sin CHECK.
6. **Los defaults representan al paciente típico de consultorio** (mayormente nervioso), no el estado normal. Ej.: Sensorio "Excitación", FR tipo "Polipnea", SLTB "Aumentado".
7. **La opción vacía se envía como null** y no se imprime en el informe.
8. **`motivo` no tiene columna:** va solo al informe.
9. **`metricas` y `updated_at` se eliminaron.**

## Estado actual

- **Implementado:** schema (Supabase), SPA (repo) y workflow (n8n, inactivo).
- **Sin validar E2E:** falta publicar `MYVETE - Ingesta` y hacer una consulta real SPA → n8n → Supabase → PDF → mail, y verificar el informe con el bloque nuevo.
- **Riesgo conocido:** el backup CORE (`5gGWXOjY2BBOAfuw`) sigue mandando `metricas`. Si se reactiva, su insert falla.
- **Riesgo clínico abierto (auditoría):** un valor default no se distingue de uno evaluado. Si el vet no toca los campos, el informe firmado afirma, por ejemplo, "FC 120 lpm" o "Pulso femoral moderado sin déficit". No se implementó ninguna marca de "sin confirmar".
- **Menor:** el borrador de IA que se muestra en el SPA (`#bloque-resumen`) sigue incluyendo FC/mucosas de la IA, que ya no se usan.

## Pendientes futuros

- **8.1** — Autofill desde la última consulta del paciente. Recomendación de la auditoría:
  - Leer vía un webhook n8n con service_role, no abrir SELECT para anon sobre datos clínicos.
  - Resolver cómo se identifica la mascota (`tutor_id` + `nombre` es frágil).
  - No precargar hallazgos del examen como si estuvieran evaluados.
- **8.2** — Perfiles clínicos con aprendizaje (migrar `PERFILES_BASE` a Supabase).
- **8.3** — Filiación extendida: edad, estado reproductor.
- **8.4** — Extensibilidad de dropdowns (catálogo editable).
- **8.5** — Perfiles contextuales por paciente.
- **8.6** — La IA sugiere perfiles.
- Imágenes de eco/Doppler en el SPA (ítem 16 reservado).
- ECG con trazado (ítem 17 reservado).
- Gráfico de presión.
- Fotos del ecocardiograma (ítem 21 reservado).
- Dictado por voz para soplos.
- Adjuntos al informe PDF.

## Referencias

- **Auditorías de Claude Code (solo lectura, en conversación, no guardadas en el repo):**
  1. Schema de Supabase + workflow `MYVETE - Ingesta` + flujo del SPA.
  2. Propósito y uso real de cada tabla, informe PDF y examen clínico.
  3. Análisis de impacto del diseño del Sprint 8 (2026-09-23): origen del hallazgo sobre la prioridad IA > SPA en el PDF, la recomendación de columnas en la misma tabla y los riesgos de defaults y autofill.
- `supabase/schema.sql` — schema y comentarios de las migraciones de Sprint 8.
- `n8n/README.md` — detalle de los nodos modificados.
- `MANUAL MYVETE — VERSIÓN 2.1.md` — manual de usuario y técnico (actualizado con 8.0).
- `STATUS.md` — Sección K (Sprint 7) y Sección L (Sprint 8.0).
