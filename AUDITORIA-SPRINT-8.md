# AUDITORÍA — SPRINT 8 (Autofill, Plantillas, Examen Clínico)

Versión 1.0 — 2026-09-23
Auditor: CODE (Claude)
Solicitada por: DeepSeek (arquitecto/auditor de la tríada)
Contexto: antes de implementar el Sprint 8

## PROPÓSITO

Auditar el estado real del sistema MyVete antes de diseñar e
implementar el Sprint 8 (Autofill, Plantillas, Examen Clínico).
Objetivo: no asumir nada, inventariar lo que existe, detectar
problemas, y diseñar con datos.

Se hicieron tres auditorías de solo lectura:

1. **Auditoría 1 — SPA + n8n + Supabase (inventario de campos).**
   Foco: qué campos existen en el SPA, cómo funciona "Guardar
   Perfil", qué toca Supabase, estructura del repo.

2. **Auditoría 2 — Schema + workflow + flujo de datos.**
   Foco: schema de Supabase, workflow MYVETE - Ingesta, flujo del
   SPA, flujo en Supabase.

3. **Auditoría 3 — Propósito y uso real.**
   Foco: para qué se usa cada tabla, cómo se arma el informe PDF,
   estado real del examen clínico, mecanismos de historial,
   documentación existente.

Todas fueron de solo lectura. No se modificó nada. Sin commits.

## HALLAZGOS CLAVE

### Sobre el SPA

- Existían solo 6 campos clínicos: `clinica-fc`, `clinica-fr`,
  `clinica-pas`, `clinica-pam`, `clinica-pad`, `clinica-mucosas`.
- NO existían: Sensorio, Pulso femoral, Reflejo tusígeno,
  Hidratación, TLLC, Sucusión, Auscultación pulmonar, Auscultación
  cardíaca.
- "Guardar Perfil" guardaba en localStorage (`perfiles_${especie}`),
  con solo 6 campos: fc, fr, pas, pam, pad, anamnesis.
- "Chequeo Sano" y "MVD B2" eran `PERFILES_BASE` hardcodeados en
  `app.js`.
- El SPA (`index.html`/`app.js`) no leía ni escribía Supabase
  directo. Todo pasaba por webhook de n8n.
- `profesional.html` sí leía/escribía Supabase directo (SELECT
  profesionales, Storage firmas).
- Especie en el SPA: solo `canino`/`felino`. El bookmarklet
  reconocía muchas más especies, con falla silenciosa si llegaba
  otra.
- `clinica-mucosas` no tenía opción vacía: siempre mandaba "rosadas".
- No existía campo Edad ni Estado reproductor.
- No existía mecanismo de autofill desde historial.
- No existía mecanismo de consulta anterior.

### Sobre Supabase

- 5 tablas: `tutores`, `mascotas`, `atenciones_cardiologia`,
  `datos_ecocardiografia`, `profesionales`.
- `atenciones_cardiologia` tenía 0 filas. Los campos clínicos
  vivían en `metricas` (jsonb), que en la práctica quedaba null.
- `datos_ecocardiografia` tiene 74 columnas numeric + campos text,
  1:1 con `atenciones_cardiologia`.
- `profesionales` tiene `matricula_tipo`/`matricula_numero` con
  CHECK. UNIQUE compuesto.
- RLS: solo una policy activa (`profesionales_select_anon`). Las
  otras 4 tablas, RLS on sin policies → deny-all para anon.
- Storage: bucket `firmas` con policies muy permisivas para anon
  (incluido DELETE). Hallazgo de seguridad.
- `metricas` era un subconjunto de campos que devolvía la IA, no
  el SPA. Hallazgo crítico (H2).

### Sobre el workflow MYVETE - Ingesta

- 31 nodos, ninguno deshabilitado.
- Webhook: `POST /ingesta-filiacion`.
- IA: gpt-4.1-mini, un solo nodo (`IA - Estructurar Anamnesis`).
- `Insert Atención Cardiología` mapeaba `metricas` desde la IA,
  no desde el SPA. Bug H2.
- `Preparar Datos para PDF` usaba `informe.fc ?? payload.consulta.fc`
  (IA gana, SPA fallback). Bug bidireccional.
- No había nodo de extracción de PDF. La extracción de eco la hace
  el SPA con PDF.js.
- No había nodo GET a Supabase. Solo escrituras.
- `datos_ecocardiografia` se inserta con upsert 1:1.

### Sobre el informe PDF

- Se arma con Google Docs API: crear doc, insertar texto, exportar
  a PDF.
- Secciones: Fecha, Profesional, Datos del paciente, Constantes
  fisiológicas, Resumen de anamnesis, Eco, Scores, Diagnóstico,
  Indicaciones, Firma.
- No había bloque "Examen clínico".
- Los valores de FC/FR/PAS/PAM/PAD/Mucosas salían de la IA (no del
  SPA). Bug H2.
- La firma se inserta como imagen inline con `insertInlineImage`.

### Sobre el examen clínico (referencia)

- El formulario PDF a mano (que los profesionales usan hoy) tiene
  13 campos: Sensorio, Mucosas, Pulso femoral, Reflejo tusígeno,
  Hidratación, TLLC, Sucusión, Auscultación pulmonar (patrón,
  amplitud, SLTB), FR, Auscultación cardíaca, FC.
- FC tiene además N soplos (momento, foco, intensidad).
- El SPA no replicaba esos campos. El informe tampoco.

### Sobre la documentación

- `README.md`: desactualizado.
- `STATUS.md`: sin Sprint 7.
- `n8n/README.md`: hablaba del CORE como activo (desactualizado).
- `supabase/schema.sql`: con afirmaciones obsoletas.
- Manual v2.1: untracked, el más actual. Termina en la sección 12.
- `docs/ACCESS_STRATEGY.md`: vigente.
- Otros docs: parcialmente vigentes.

## DECISIONES DERIVADAS

Las auditorías derivaron en las siguientes decisiones de diseño
(implementadas en el Sprint 8.0):

- El examen clínico completo vive en columnas de
  `atenciones_cardiologia` (no en jsonb, no en tabla aparte).
- `metricas` se deprecó y eliminó.
- `updated_at` se eliminó (no aporta valor).
- `pas`, `pam`, `pad` se agregaron como columnas.
- Los valores clínicos salen del SPA, no de la IA.
- La IA solo estructura la anamnesis narrativa.
- Soplos se guardan como jsonb (array).
- Auscultación cardíaca como jsonb (array, multiselección).
- El motivo de la consulta no tiene columna: va solo al informe.
- Se agregó el bloque "EXAMEN CLÍNICO" al informe.
- Se agregó `sucusión` (no `succión`).

## ESTADO POST-AUDITORÍA

El Sprint 8.0 fue implementado y validado en base a estos hallazgos.
Ver `SPRINT-08-ESTADO.md` para el detalle.

## PENDIENTES REGISTRADOS

- Imágenes eco/Doppler en el SPA.
- ECG con trazado electrocardiográfico.
- Gráfico de presión junto a PAS/PAM/PAD.
- Fotos del ecocardiograma.
- Dictado por voz para soplos.
- Adjuntos al informe PDF (gráfico, ECG, fotos eco).
- Fix del bug de especies (SPA solo canino/felino, bookmarklet
  reconoce más).
- Fix de la policy permisiva del bucket `firmas` (anon puede
  borrar).
- Índice único duplicado en `mascotas`.
- E2E del Sprint 8.0 (requiere activar workflow).