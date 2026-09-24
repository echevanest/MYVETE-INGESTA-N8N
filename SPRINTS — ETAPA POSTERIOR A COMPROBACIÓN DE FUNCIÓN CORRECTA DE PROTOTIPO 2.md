================================================================================
SPRINTS — ETAPA POSTERIOR A COMPROBACIÓN DE FUNCIÓN CORRECTA DE PROTOTIPO 2
================================================================================
Versión 1.1 — 2026-09-15
Autor: DeepSeek (Arquitecto/Auditor tríada)
Estado: documento vivo — las decisiones se cierran al inicio de cada sprint
================================================================================

ÍNDICE
------
0. Cómo leer este documento
1. Contexto y punto de partida
2. Visión general de los 8 sprints
3. Resumen de cada sprint
4. Dependencias cruzadas
5. Criterio de secuenciación
6. Cómo se trabaja cada sprint
7. Registro de cambios


================================================================================
0. CÓMO LEER ESTE DOCUMENTO
================================================================================

Este archivo es el MAPA de los sprints posteriores a la validación del
prototipo. NO contiene arquitectura cerrada de cada sprint. Contiene:

  - Qué se quiere lograr en cada uno.
  - Qué existe hoy y qué no.
  - Qué componentes toca.
  - Qué depende de qué.
  - Qué hay que decidir cuando arranque cada sprint.

Cada sprint tiene su propio documento individual (SPRINT-XX-*.md) con el
mismo nivel de detalle: objetivo, estado, componentes afectados, puntos a
trabajar, dependencias, criterio de aceptación y decisiones a cerrar al
inicio.

La idea es que este maestro sea la guía de orden general, y que los
documentos individuales se abran cuando toque trabajar cada sprint.


================================================================================
1. CONTEXTO Y PUNTO DE PARTIDA
================================================================================

Al 2026-09-15, el sistema MyVete está:

  ✅ Funcionando end-to-end desde el SPA público.
  ✅ Con el Workflow B (lkOwTFmVTZu7EMoU) en producción, 29 nodos,
     path "ingesta-filiacion", active: true.
  ✅ Con el Workflow A (5gGWXOjY2BBOAfuw) como backup, active: false.
  ✅ Con epr y tiempo_eyectivo persistidos en Supabase.
  ✅ Con el gap H7 cerrado (alerta de fallo aislado de eco).
  ✅ Con tutores_email_unique mantenido, tutores_email_unq eliminado.
  ✅ Con la prueba E2E real validada desde el SPA (2026-09-15).

Lo que sigue es la etapa de sprints funcionales: agregar capacidades que
se postergaron durante el prototipo para no enlentecer la validación.

NOTA: los sprints NO son bugs a corregir. El prototipo funciona. Son
funcionalidades nuevas y mejoras que se agregaron al backlog después de
que el sistema quedó estable.


================================================================================
2. VISIÓN GENERAL DE LOS 8 SPRINTS
================================================================================

┌──────────┬────────────────────────────────────────────┬───────────────────────┐
│ Sprint   │ Nombre                                     │ Posición              │
├──────────┼────────────────────────────────────────────┼───────────────────────┤
│ Sprint 7 │ Identificación de Profesional              │ 1° del medio          │
│ Sprint 8 │ Autofill y Plantillas                      │ 2° del medio          │
│ Sprint 9 │ Fuzzy Matching Médico Derivante            │ 3° del medio          │
│ Sprint 10│ Captura y Procesamiento ECG                │ 4° del medio          │
│ Sprint 11│ Selección JPGs del Pendrive                │ 5° del medio          │
│ Sprint 12│ Completar Historia Clínica en MyVete       │ Anteúltimo            │
│ Sprint 13│ Auditor de Mails                           │ Último del medio      │
│ Sprint 14│ Rediseño Estético del Informe              │ Último                │
└──────────┴────────────────────────────────────────────┴───────────────────────┘

Numeración: continúa la histórica. El workflow se llama "Sprint 6", así
que los nuevos arrancan en Sprint 7.

Estado general: todos los sprints están EN DEFINICIÓN. Ninguno tiene
arquitectura cerrada (salvo Sprint 7, que tiene más decisiones tomadas
durante la sesión del 2026-09-15, pero igual quedan puntos por cerrar al
inicio).


================================================================================
3. RESUMEN DE CADA SPRINT
================================================================================

SPRINT 7 — IDENTIFICACIÓN DE PROFESIONAL
----------------------------------------
Objetivo: que el informe y el mail referencien al profesional actuante
(nombre + matrícula). Hoy el informe dice "Generado automáticamente por
el sistema de ingesta MyVete" sin mencionar quién lo hizo.

Estado: arquitectura mayormente cerrada durante la sesión 2026-09-15.
Decisiones tomadas: sin autenticación (solo identificación), Supabase +
localStorage, clave natural email, formulario en cada PC nueva,
deduplicación por apellido, validación de matrícula, firma híbrida
(SPA si puede, Marcelo como respaldo), profesional_id en atenciones.

Puntos a trabajar: campos exactos del formulario, nombre de tabla y
bucket, políticas RLS, ON DELETE de la FK, verificación de que el SPA
actual no tenga ya identificación.

Componentes: Supabase (tabla + Storage), SPA (formulario + localStorage),
n8n (inyectar datos en PDF y mail).

Dependencias: ninguna hacia otros sprints. Es el más independiente y el
más maduro.

Documento: SPRINT-07-Identificacion-Profesional.md


SPRINT 8 — AUTOFILL Y PLANTILLAS
--------------------------------
Objetivo: plantillas preconfiguradas para acelerar la carga de variables
recurrentes y diagnósticos frecuentes.

Estado: sin arquitectura definida. Idea general: el veterinario tiene
plantillas guardadas (por ejemplo, "control post-quirúrgico", "paciente
con soplo grado III") y al seleccionarlas se autocompletan campos del
SPA.

Puntos a trabajar: plantillas globales vs por veterinario, dónde
persisten (localStorage / Supabase / n8n staticData), qué campos cubren,
cómo se crean y editan.

Componentes: SPA (UI de plantillas), posiblemente Supabase (persistencia).

Dependencias: se beneficia de Sprint 7 (si las plantillas son por
profesional, necesita saber quién es el profesional).

Documento: SPRINT-08-Autofill-Plantillas.md


SPRINT 9 — FUZZY MATCHING MÉDICO DERIVANTE
------------------------------------------
Objetivo: identificar y unificar variantes de nombres del veterinario
derivante (errores de tipeo, nombres incompletos, variaciones). Hoy el
campo veterinario_derivante en Sheets queda vacío (se completa a mano en
Fase 4).

Estado: sin arquitectura definida.

Puntos a trabajar:
  - Diccionario existente o crear tabla de veterinarios derivantes.
  - Algoritmo de fuzzy matching (Levenshtein, trigramas, etc.).
  - Dónde matchea (SPA al escribir, n8n al persistir).
  - Umbral de similitud.
  - Resolución de conflictos.
  - OPCIÓN DE AGREGAR DERIVANTE NUEVO cuando el nombre tipeado no
    matchea con ninguno existente (derivante ocasional, no habitual).
    Decisiones a cerrar: ¿desde el SPA o desde n8n? ¿requiere aprobación
    o se agrega directo? ¿dónde persiste el nuevo derivante?

Componentes: SPA (detección al escribir + UI de agregado) o n8n
(detección al persistir), Supabase (tabla de referencia).

Dependencias: ninguna crítica. Se beneficia de datos históricos
acumulados en atenciones_cardiologia.

Documento: SPRINT-09-Fuzzy-Matching-Derivante.md


SPRINT 10 — CAPTURA Y PROCESAMIENTO ECG
---------------------------------------
Objetivo: capturar trazados/imágenes de ECG y adjuntarlos al informe.
Hoy el bloque EKG tiene 4 campos que no se persisten ni aparecen en el
PDF.

Estado: bloque EKG existe en SPA pero sin persistencia en n8n ni
Supabase. Sección ECG en el PDF está preparada y comentada en
"Preparar Datos para PDF" de n8n.

Puntos a trabajar: captura como imagen, como datos numéricos, o ambos;
persistencia en Supabase (nueva tabla o columnas en atenciones); sección
ECG en el PDF (descomentar bloque + agregar render); si es imagen, cómo
se adjunta al PDF (insertInlineImage en Google Docs).

Componentes: SPA (captura), Supabase (persistencia), n8n (procesamiento
y render).

Dependencias: ninguna hacia otros sprints. Sprint 12 (Historia Clínica)
depende de que este esté hecho, porque el resumen clínico incluye
diagnóstico electrocardiográfico.

Documento: SPRINT-10-Captura-ECG.md


SPRINT 11 — SELECCIÓN JPGs DEL PENDRIVE
---------------------------------------
Objetivo: seleccionar y filtrar automática o manualmente imágenes JPG
provenientes del pendrive/USB de exportación del equipo de
ecocardiografía, para adjuntar al informe.

Estado: sin arquitectura definida.

Puntos a trabajar: acceso al filesystem del cliente (Web File System
Access API vs input type="file" manual), filtrado automático (por
metadatos, tamaño, naming del equipo), selección manual, cómo se
adjuntan al PDF final.

Componentes: SPA (selección de archivos), n8n (posiblemente, si las
imágenes viajan por el webhook), Drive (almacenamiento).

Dependencias: alto riesgo de compatibilidad de navegador. Conviene
dejarlo al final del medio.

Documento: SPRINT-11-Seleccion-JPGs-Pendrive.md


SPRINT 12 — COMPLETAR HISTORIA CLÍNICA EN MYVETE
------------------------------------------------
Objetivo: volcar un resumen clínico del informe en la historia clínica
del paciente dentro de MyVete. MyVete no tiene API, así que la vía
principal es scraping del DOM (extender el bookmarklet para escribir),
y la vía secundaria es un botón "Copiar" en el SPA para pegado manual.

Contenido del resumen (sugerencia definida): FC, soplo, resumen de
respiración, síntomas clínicos relatados por el tutor, resumen de la
estructura cardíaca (ej: "dilatación atrial severa"), diagnóstico
electrocardiográfico, indicaciones terapéuticas, próximo control.

Estado: sin arquitectura definida más allá de la vía de implementación.

Puntos a trabajar: cómo se genera el resumen (IA, reglas clínicas,
híbrido), qué campos existen ya en el SPA y cuáles hay que agregar
(soplo, descripción respiratoria, próximo control), campos del DOM de
MyVete donde volcar, cuándo se dispara el volcado, si el PDF se adjunta
o solo el resumen.

Componentes: SPA (generación + botón copiar), bookmarklet (extensión
para escribir en MyVete), posiblemente n8n (si el resumen se genera del
lado del servidor).

Dependencias: Sprint 10 (ECG) para el diagnóstico electrocardiográfico.
Sprint 7 (Identificación) opcional pero coherente.

Documento: SPRINT-12-Completar-Historia-Clinica-MyVete.md


SPRINT 13 — AUDITOR DE MAILS
---------------------------
Objetivo: monitorear correos entrantes de tutores tras la entrega del
informe. Clasificar automáticamente confirmaciones simples (ej: "muchas
gracias", "recibido") para limpiarlas/archivarlas, e identificar mails
con dudas, consultas o seguimiento clínico que requieran respuesta.

Estado: sin arquitectura definida.

Puntos a trabajar: workflow n8n separado (Workflow C) vs nodos dentro
del B; clasificación por reglas, por IA, o híbrida; qué hacer con los
mails clasificados como "requieren respuesta" (notificar, marcar,
etiquetar); dónde se registran los logs.

Componentes: n8n (trigger de Gmail + clasificación), Gmail API,
posiblemente Supabase (logs).

Dependencias: ninguna crítica. Es autocontenido.

Documento: SPRINT-13-Auditor-Mails.md


SPRINT 14 — REDISEÑO ESTÉTICO DEL INFORME
-----------------------------------------
Objetivo: interfaz y maquetación moderna para el informe de cardiología
(ecocardiografía y electrocardiografía), tomando como base la estructura
del informe actual y adaptándola. Se descarta el estilo steampunk.

Estado: sin arquitectura definida. Hoy el informe se genera con Google
Docs → export PDF. Un rediseño moderno probablemente requiera migrar a
un motor HTML → PDF (Puppeteer, PDFMonkey, DocRaptor, etc.) o cambiar
drásticamente el enfoque de generación.

Puntos a trabajar: ¿seguir con Google Docs o migrar a HTML→PDF? Si es
HTML→PDF, ¿qué motor? ¿cómo se integra con n8n? ¿se reescribe el nodo
Preparar Datos para PDF o se agrega un nodo nuevo? ¿la firma del
profesional (Sprint 7) se inserta como imagen? ¿cómo se maneja el
maquetado de tablas de eco?

Componentes: n8n (generación del PDF), posiblemente un servicio externo
de render HTML→PDF, SPA (si el rediseño incluye preview antes de enviar).

Dependencias: Sprint 7 (si el informe incluye firma del profesional).
Sprint 10 (si el informe incluye sección ECG).

Documento: SPRINT-14-Rediseno-Estatico-Informe.md


================================================================================
4. DEPENDENCIAS CRUZADAS
================================================================================

DIAGRAMA DE DEPENDENCIAS:

  Sprint 7 (Identificación)
      │
      ├──► Sprint 8 (Autofill) — si las plantillas son por profesional
      │
      └──► Sprint 14 (Rediseño) — si el informe lleva firma

  Sprint 10 (ECG)
      │
      └──► Sprint 12 (Historia Clínica) — para diagnóstico electrocardiográfico

  Sprint 11 (JPGs)
      │
      └──► Sprint 14 (Rediseño) — si el rediseño incluye adjuntar imágenes

  Sprint 12 (Historia Clínica)
      │
      └──► Sin dependencias salientes críticas

  Sprint 13 (Auditor Mails) — autocontenido
  Sprint 9 (Fuzzy) — autocontenido


DEPENDENCIAS EXTERNAS:

  - MyVete: capacidad de recibir escritura por scraping del DOM (Sprint 12).
    Si no es viable, el sprint se cae o se limita a la vía secundaria
    (botón copiar).
  - Equipo de ecocardiografía: formato de exportación de JPGs (Sprint 11).
    Si el equipo exporta en un formato raro, cambia el enfoque.
  - Navegador: File System Access API (Sprint 11) solo en navegadores
    Chromium. Si el veterinario usa Firefox o Safari, hay que usar input
    type="file" manual.


================================================================================
5. CRITERIO DE SECUENCIACIÓN
================================================================================

El orden propuesto sigue 4 criterios:

  1. MADUREZ: primero los sprints con arquitectura más avanzada.
     Sprint 7 ya tiene decisiones tomadas → arranca primero.

  2. DEPENDENCIAS: primero los que no dependen de nadie, después los que
     dependen. Sprint 12 depende de Sprint 10, así que 10 va antes.

  3. IMPACTO CLÍNICO: los que mejoran la experiencia del veterinario
     van antes que los cosméticos.

  4. RIESGO DE COMPATIBILIDAD: los que tocan APIs inestables o
     navegadores específicos (Sprint 11 con File System Access API) van
     al final del medio.

Resultado: 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14.

NOTA: si querés priorizar distinto (por ejemplo, mover Sprint 10 antes
de Sprint 8 por impacto clínico), es válido. El orden es una guía, no
una camisa de fuerza. Pero cualquier cambio hay que evaluarlo contra las
dependencias cruzadas de la sección 4.


================================================================================
6. CÓMO SE TRABAJA CADA SPRINT
================================================================================

FLUJO ESTÁNDAR:

  1. ABRIR EL DOCUMENTO DEL SPRINT
     Leer SPRINT-XX-*.md completo. Revisar objetivo, estado, componentes,
     puntos a trabajar, dependencias y criterio de aceptación.

  2. CERRAR LAS DECISIONES AL INICIO
     El documento lista las "decisiones a cerrar al inicio del sprint".
     Responderlas antes de tocar código. Sin esas respuestas, no se
     avanza (gobernanza: no asumir).

  3. PLANIFICAR EN PROMPTS A CODE
     El sprint se divide en prompts a Claude Code, uno por componente.
     Cada prompt sigue el formato CABLEAR (TAREA / ARCHIVOS AFECTADOS /
     CÓDIGO EXACTO / INSTRUCCIONES DE PRUEBA / ROLLBACK).

  4. VERIFICAR
     Al terminar cada prompt, verificar el criterio de aceptación.

  5. REGISTRAR
     Al cerrar el sprint, actualizar:
       - Este maestro (marcar sprint como cerrado).
       - El manual del usuario (si aplica).
       - STATUS.md del repo.

REGLAS:

  - Un sprint NO se abre si tiene dependencias sin cerrar.
  - Un sprint NO se cierra si el criterio de aceptación no se cumple.
  - Si un sprint se cae por dependencia externa (ej: MyVete no permite
    escritura), se registra y se pasa al siguiente.


================================================================================
7. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del maestro.
  - 8 sprints definidos (7 a 14).
  - Orden: identificación → autofill → fuzzy → ECG → JPGs → historia
    clínica → auditor mails → rediseño.
  - Sprint 12 (Historia Clínica) agregado durante esta sesión.
  - Dependencias cruzadas identificadas.

Versión 1.1 — 2026-09-15
  - Sprint 9 (Fuzzy Matching Derivante): agregada la opción de agregar
    un derivante nuevo cuando el nombre no matchea con ninguno existente
    (derivante ocasional, no habitual). Decisiones a cerrar al inicio
    del sprint: desde dónde se agrega, si requiere aprobación, dónde
    persiste.
  - Corrección de tipeo: SPRINT-14-Rediseno-Estatico-Informe.md (era
    "Estatico" por error).


================================================================================
FIN DEL MAESTRO DE SPRINTS
================================================================================