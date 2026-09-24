================================================================================
SPRINT 8 — AUTOFILL Y PLANTILLAS
================================================================================
Versión 1.0 — 2026-09-15
Parte de: SPRINTS (ETAPA POSTERIOR A COMPROBACION DE FUNCION CORRECTA DE PROTOTIPO 2)
================================================================================

ÍNDICE
------
1. Objetivo
2. Estado actual
3. Componentes afectados
4. Arquitectura definida
5. Puntos a trabajar
6. Decisiones a cerrar al inicio del sprint
7. Dependencias
8. Criterio de aceptación
9. Plan de implementación (a alto nivel)
10. Registro de cambios


================================================================================
1. OBJETIVO
================================================================================

Acelerar la carga de datos recurrentes en el SPA mediante plantillas
preconfiguradas. La idea es que el veterinario pueda seleccionar una
plantilla (por ejemplo, "control post-quirúrgico", "paciente con soplo
grado III", "control anual geriátrico") y que los campos correspondientes
se autocompleten.

Complementariamente, que el SPA sugiera valores frecuentes basados en
el historial del profesional (autofill inteligente).


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El SPA tiene PERFILES_BASE (perfiles clínicos) con persistencia en
    localStorage. Estos perfiles son configuraciones clínicas, no
    plantillas de carga.
  - El campo de diagnóstico, indicaciones, medicación y anamnesis se
    completan manualmente.
  - La extracción de datos de eco desde PDF autocompleta los campos de
    eco (no es lo mismo que plantillas).

QUÉ NO EXISTE:
  - Sistema de plantillas de carga.
  - Persistencia de plantillas (ni globales ni por profesional).
  - Sugerencia de valores frecuentes.
  - UI para crear, editar o seleccionar plantillas.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - SPA:
      * UI de selección de plantillas (dropdown o panel).
      * UI de creación/edición de plantillas (¿modal? ¿sección nueva?).
      * Lógica de autocompletado de campos.
      * Posiblemente integración con identificación del profesional
        (Sprint 7) si las plantillas son por profesional.

  - Supabase (si las plantillas persisten ahí):
      * Tabla nueva: plantillas (o similar).
      * Relación con profesionales (si son por profesional).

  - localStorage (si las plantillas son locales):
      * Guardar plantillas en el dispositivo.
      * No sincronizan entre PCs.

  - n8n (posiblemente):
      * Si las plantillas se usan del lado del servidor (ej: la IA
        estructura la anamnesis y aplica una plantilla).
      * Poco probable en esta iteración.

  - Bookmarklet (posiblemente):
      * Si las plantillas se aplican al abrir el SPA desde MyVete.


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Las decisiones se toman
al inicio del sprint. Sin embargo, hay algunas consideraciones iniciales:

4.1 TIPOS DE PLANTILLAS (CONCEPTUAL)
    Hay al menos 3 tipos posibles de plantillas:
      a) Plantillas clínicas fijas (ej: "control post-quirúrgico") con
         campos pre-cargados.
      b) Plantillas por profesional (cada veterinario tiene las suyas).
      c) Plantillas derivadas del historial (el SPA sugiere valores
         basados en consultas previas de ese paciente o ese profesional).

4.2 PERSISTENCIA (OPCIONES)
    Tres opciones de persistencia:
      a) localStorage: simple, no sincroniza entre PCs, cada vet tiene
         las suyas en cada dispositivo.
      b) Supabase (tabla plantillas): sincroniza, requiere definir
         relación con profesionales.
      c) n8n staticData: no recomendado, mezcla configuración con
         orquestación.

4.3 UI DE SELECCIÓN (OPCIONES)
    Formas de aplicar una plantilla:
      a) Dropdown al inicio del formulario.
      b) Botones rápidos ("Plantillas frecuentes").
      c) Panel lateral con búsqueda.

4.4 ALCANCE INICIAL SUGERIDO
    Para no sobredimensionar el sprint, conviene empezar por:
      - Plantillas locales (localStorage).
      - Creación manual desde el SPA.
      - Aplicación por dropdown.
      - Sin integración con Supabase en la primera iteración.
    Después se evalúa migrar a Supabase si hace falta sincronización.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 DEFINIR ALCANCE DEL SPRINT
    ¿Es un sprint grande (con persistencia en Supabase, plantillas
    compartidas, historial) o chico (solo plantillas locales)?

5.2 DEFINIR QUÉ CAMPOS CUBREN LAS PLANTILLAS
    ¿Solo diagnóstico e indicaciones? ¿También medicación? ¿Constantes?
    ¿Anamnesis?

5.3 DISEÑAR EL FORMATO DE UNA PLANTILLA
    Una plantilla es un JSON con:
      - Nombre de la plantilla.
      - Descripción (opcional).
      - Campos que aplica (con valores).
      - Categoría (opcional).

5.4 DISEÑAR LA UI
    ¿Cómo se ve el selector? ¿Cómo se crea una plantilla? ¿Cómo se edita?
    ¿Cómo se borra?

5.5 DEFINIR SI LAS PLANTILLAS SON POR PROFESIONAL O GLOBALES
    Si son por profesional, dependen del Sprint 7 (identificación).
    Si son globales, no dependen de nada.

5.6 DEFINIR SI HAY PLANTILLAS PRECARGADAS
    ¿El sprint incluye algunas plantillas de fábrica (ej: "control anual",
    "post-quirúrgico") o el veterinario las crea todas?

5.7 EVALUAR AUTOFILL INTELIGENTE
    ¿El sprint incluye sugerencias basadas en historial (ej: si el
    paciente tiene antecedentes de soplo grado III, sugerir ese texto)?
    Esto puede ser una segunda iteración.

5.8 EVALUAR INTEGRACIÓN CON IDENTIFICACIÓN (SPRINT 7)
    Si las plantillas son por profesional, hay dependencia con Sprint 7.
    Si son globales, no.

5.9 EVALUAR INTEGRACIÓN CON LA IA (GPT-4.1-MINI)
    ¿La IA puede sugerir plantillas basadas en la anamnesis dictada? Por
    ejemplo: el vet dicta "paciente con soplo grado III en ápex mitral",
    y el SPA sugiere la plantilla "Soplo mitral". Esto es sofisticado y
    probablemente no corresponde a la primera iteración.


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Qué alcance tiene el sprint? ¿Solo plantillas locales
          (localStorage) o también persistencia en Supabase?

  [ ] 6.2 ¿Las plantillas son por profesional o globales? (Si son por
          profesional, Sprint 7 es prerequisito.)

  [ ] 6.3 ¿Qué campos cubren las plantillas? (Diagnóstico, indicaciones,
          medicación, constantes, anamnesis, todos, otros.)

  [ ] 6.4 ¿El sprint incluye plantillas de fábrica (precargadas)?

  [ ] 6.5 ¿El sprint incluye creación/edición de plantillas desde el SPA,
          o solo se cargan desde el dashboard de Supabase?

  [ ] 6.6 ¿La UI de selección es dropdown, botones rápidos, panel, u otra?

  [ ] 6.7 ¿El sprint incluye autofill inteligente basado en historial, o
          eso queda para una segunda iteración?

  [ ] 6.8 ¿Hay integración con la IA para sugerir plantillas?

  [ ] 6.9 Si las plantillas son por profesional, ¿se sincronizan entre
          PCs (requiere Supabase) o cada PC tiene las suyas (localStorage)?

  [ ] 6.10 ¿Hay límite de plantillas por profesional? (No es crítico,
           pero conviene definirlo.)


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Ninguna.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Sprint 7 (Identificación): SOLO si las plantillas son por profesional.
    Si son globales o locales, no hay dependencia.

DEPENDENCIAS EXTERNAS:
  - Ninguna crítica.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] Existe una forma de crear plantillas (desde el SPA o desde el
      dashboard).
  [ ] Existe una forma de aplicar plantillas a un caso en curso.
  [ ] Al aplicar una plantilla, los campos definidos se autocompletan.
  [ ] El veterinario puede editar los campos después de aplicar la
      plantilla.
  [ ] Las plantillas persisten (localStorage o Supabase, según la
      decisión del punto 6.1).
  [ ] Si hay plantillas por profesional, se identifican correctamente
      (depende de Sprint 7).
  [ ] El flujo completo (crear → guardar → seleccionar → aplicar) funciona
      end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Si hay plantillas de fábrica, se cargan al primer uso.
  [ ] Si hay autofill inteligente, sugiere valores correctamente.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance del punto 6.1.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — DEFINICIÓN DE LA ESTRUCTURA DE PLANTILLA
    - Diseñar el JSON de plantilla.
    - Definir el schema (si va a Supabase).

  PROMPT 2 — UI DE SELECCIÓN Y APLICACIÓN
    - Agregar dropdown/panel al SPA.
    - Lógica de autocompletado de campos.

  PROMPT 3 — UI DE CREACIÓN/EDICIÓN (SI APLICA)
    - Modal o sección para crear/editar plantillas.
    - Persistencia local o remota según decisión 6.1.

  PROMPT 4 — PERSISTENCIA EN SUPABASE (SI APLICA)
    - Migración de tabla plantillas.
    - Relación con profesionales (si aplica).

  PROMPT 5 — PLANTILLAS DE FÁBRICA (SI APLICA)
    - Seed inicial de plantillas comunes.

Cada prompt sigue el formato CABLEAR estándar.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan decisiones
    a cerrar al inicio del sprint.
  - 10 decisiones a cerrar identificadas.
  - Dependencia con Sprint 7 condicional (si las plantillas son por
    profesional).


================================================================================
FIN DEL SPRINT 8
================================================================================