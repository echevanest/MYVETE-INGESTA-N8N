================================================================================
SPRINT 9 — FUZZY MATCHING MÉDICO DERIVANTE
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

Identificar y unificar variantes de nombres del veterinario derivante
(errores de tipeo, nombres incompletos, variaciones, mayúsculas/
minúsculas, acentos) para que el campo veterinario_derivante en Sheets
quede consistente y utilizable.

Adicionalmente, permitir agregar un derivante nuevo cuando el nombre
tipeado no matchea con ninguno existente (derivante ocasional, no
habitual).


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El campo veterinario_derivante existe en la planilla de Sheets (columna
    4 de 8), pero queda vacío. Se completa a mano en Fase 4.
  - No hay tabla de veterinarios derivantes en Supabase.
  - No hay lógica de matching ni fuzzy matching.
  - El SPA no tiene campo para veterinario derivante (según el manual,
    no está en el formulario hoy).

QUÉ NO EXISTE:
  - Campo veterinario_derivante en el SPA.
  - Tabla o diccionario de derivantes habituales.
  - Algoritmo de fuzzy matching.
  - UI de agregar derivante nuevo.
  - Persistencia del derivante en Supabase (más allá de Sheets).

NOTA: el traspaso menciona que "Agregar veterinario_derivante a la
planilla Índice" es un pendiente de Fase 4 con diseño cerrado. Este
sprint toma ese pendiente y lo expande con fuzzy matching + agregado
de nuevos.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - SPA:
      * Campo nuevo: veterinario_derivante (si no existe).
      * Lógica de fuzzy matching al escribir (o al enviar).
      * UI de sugerencia: "¿Quisiste decir Dr. X?".
      * UI de agregar derivante nuevo: "Este derivante no está en la
        lista habitual. ¿Agregar?".

  - Supabase:
      * Tabla nueva: veterinarios_derivantes (o similar).
      * Campos: id, nombre, nombre_normalizado, alias (array), activo,
        created_at.
      * Posible tabla de relación con atenciones_cardiologia (o columna
        derivante_id en atenciones).

  - n8n:
      * Insert Atención Cardiología: agregar derivante_id (si aplica).
      * Registrar en Índice: completar la columna veterinario_derivante
        con el nombre unificado.

  - Google Sheets:
      * La columna veterinario_derivante se completa con el nombre
        unificado (ya no queda vacía).


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Las decisiones se toman
al inicio del sprint. Sin embargo, hay algunas consideraciones iniciales:

4.1 QUÉ ES UN DERIVANTE
    Un veterinario que deriva un paciente a la clínica para una consulta
    cardiológica. No es el profesional que atiende (ese es el Sprint 7);
    es el que refiere.

4.2 DÓNDE MATCHEA (OPCIONES)
    Tres opciones:
      a) En el SPA al escribir: mientras el vet tipea el nombre, el SPA
         consulta la tabla de derivantes y sugiere matches.
      b) En el SPA al enviar: cuando el vet envía el formulario, el SPA
         valida el nombre contra la tabla antes de enviarlo.
      c) En n8n al persistir: el nombre llega crudo al webhook, y n8n
         hace el matching antes de guardar en Supabase y Sheets.

4.3 ALGORITMO DE MATCHING (OPCIONES)
    Opciones comunes:
      a) Levenshtein distance (distancia de edición).
      b) Trigramas (PostgreSQL tiene pg_trgm, que es muy bueno para esto).
      c) Soundex / Metaphone (fonético, útil para nombres).
      d) Fuzzy simple: normalizar (lowercase, sin acentos) y comparar
         con umbral.

4.4 AGREGAR DERIVANTE NUEVO (AGREGADO 2026-09-15)
    Cuando el nombre no matchea con ninguno existente:
      - El SPA (o n8n) detecta "no match".
      - Muestra un aviso al veterinario: "Este derivante no está en la
        lista habitual. ¿Querés agregarlo?".
      - Si acepta → se agrega a la tabla de derivantes.
      - Si rechaza → se guarda como texto libre (comportamiento actual).

4.5 DÓNDE VIVE LA TABLA DE DERIVANTES (OPCIONES)
    Opciones:
      a) Supabase: tabla veterinarios_derivantes.
      b) localStorage: cada dispositivo tiene su propia lista.
      c) Híbrido: Supabase como fuente de verdad + localStorage como
         caché.

    Recomendación: Supabase (consistente con el resto del sistema).

4.6 RELACIÓN CON ATENCIONES_CARDIOLOGIA (OPCIONES)
    Opciones:
      a) Columna derivante_id (FK) en atenciones_cardiologia.
      b) Columna derivante_texto (texto libre) en atenciones_cardiologia.
      c) Ambas (id para unificados, texto para casos ocasionales sin
         agregar).

    Recomendación: ambas. La FK para derivantes habituales, el texto para
    los ocasionales que no se agregaron a la tabla.

4.7 ALGUNAS DECISIONES YA TOMADAS POR CONTEXTO:
    - El matching debe ser tolerante a acentos y mayúsculas.
    - El nombre unificado se guarda en Sheets (no el crudo).
    - Si el derivante es nuevo y el vet acepta agregarlo, se guarda en
      la tabla y se asocia a la atención.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 DEFINIR EL CAMPO veterinario_derivante EN EL SPA
    Verificar si existe hoy. Si no existe, agregarlo al formulario (en
    qué sección, con qué label).

5.2 DEFINIR LA TABLA DE DERIVANTES EN SUPABASE
    Estructura sugerida:
      - id: uuid PK
      - nombre: text NOT NULL (nombre canónico)
      - nombre_normalizado: text (lowercase, sin acentos)
      - alias: text[] (variantes conocidas)
      - activo: boolean DEFAULT true
      - created_at, updated_at: timestamptz
    Índices: nombre_normalizado, alias (GIN si es array).

5.3 DEFINIR ALGORITMO DE MATCHING
    Opciones: pg_trgm (Postgres), Levenshtein en JS, u otro.
    Umbral de similitud: definir (ej: 0.7 de similitud trigram).

5.4 DEFINIR DÓNDE MATCHEA
    SPA al escribir, SPA al enviar, o n8n al persistir. La elección
    afecta la UX y la arquitectura.

5.5 DEFINIR LA UX DE SUGERENCIA
    Si el SPA sugiere un match, ¿cómo se ve? ¿Modal? ¿Datalist?
    ¿Texto debajo del campo?

5.6 DEFINIR LA UX DE AGREGAR DERIVANTE NUEVO
    Si no matchea, ¿el SPA muestra un modal "¿Agregar?" o el vet tiene
    que ir a una sección aparte?
    ¿Requiere aprobación o se agrega directo?

5.7 DEFINIR QUIÉN PUEDE AGREGAR
    ¿Cualquier veterinario desde el SPA? ¿Solo Marcelo desde el
    dashboard?

5.8 DEFINIR SI SE PERSISTE EL DERIVANTE EN ATENCIONES
    ¿Se guarda derivante_id en atenciones_cardiologia, o solo el texto
    en Sheets?

5.9 DEFINIR SI HAY UNA CARGA INICIAL
    ¿Se importan los derivantes habituales existentes? ¿De dónde?
    ¿Manualmente?

5.10 EVALUAR SI EL MATCHING SE APLICA TAMBIÉN AL PROFESIONAL
     ¿El mismo algoritmo se usa para identificar al profesional
     actuante (Sprint 7) en la deduplicación por apellido? Podría
     compartirse lógica.


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿El campo veterinario_derivante existe ya en el SPA, o hay
          que agregarlo?

  [ ] 6.2 ¿La tabla de derivantes vive en Supabase, localStorage, o
          híbrido?

  [ ] 6.3 ¿Dónde se hace el matching? SPA al escribir, SPA al enviar,
          o n8n al persistir.

  [ ] 6.4 ¿Qué algoritmo de matching se usa? (pg_trgm, Levenshtein,
          fonético, etc.)

  [ ] 6.5 ¿Cuál es el umbral de similitud para considerar match?

  [ ] 6.6 ¿Cómo se ve la UX de sugerencia cuando hay match?

  [ ] 6.7 ¿Cómo se ve la UX de "agregar derivante nuevo" cuando no hay
          match?

  [ ] 6.8 ¿Quién puede agregar derivantes nuevos? ¿Requiere aprobación?

  [ ] 6.9 ¿Se persiste derivante_id en atenciones_cardiologia, o solo
          el texto?

  [ ] 6.10 ¿Se importan derivantes habituales existentes, o se cargan
           a mano de cero?

  [ ] 6.11 ¿El algoritmo de matching se comparte con Sprint 7
           (deduplicación de profesionales) o son distintos?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Sprint 12 (Historia Clínica): el resumen clínico podría mencionar
    al derivante. Si es así, depende de que el campo exista.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Ninguna crítica. Es autocontenido.

DEPENDENCIAS EXTERNAS:
  - Si la tabla de derivantes se llena con datos de MyVete (que tiene
    los datos del veterinario derivante), podría haber una dependencia
    con el DOM de MyVete. Pero esto no es crítico: se puede cargar a
    mano de cero.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El campo veterinario_derivante existe en el SPA (si no existía).
  [ ] La tabla de derivantes existe en Supabase (si esa fue la decisión).
  [ ] El algoritmo de fuzzy matching está implementado.
  [ ] Al escribir un nombre, el SPA (o n8n) sugiere matches si los hay.
  [ ] Si no hay match, el SPA (o n8n) ofrece agregar el derivante nuevo.
  [ ] Si el vet acepta agregar, el derivante se guarda en la tabla.
  [ ] Si el vet rechaza, el nombre se guarda como texto libre (o se
      guarda igual sin agregar a la tabla, según decisión 6.9).
  [ ] El nombre unificado se guarda en Sheets.
  [ ] El flujo completo (tipear → matchear → sugerir → confirmar →
      guardar) funciona end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Si hay importación de derivantes habituales, se cargaron
      correctamente.
  [ ] Si el matching se comparte con Sprint 7, ambos usan la misma
      lógica.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — TABLA DE DERIVANTES EN SUPABASE
    - Migración de tabla veterinarios_derivantes.
    - Índices y RLS.
    - Posible carga inicial de datos.

  PROMPT 2 — CAMPO veterinario_derivante EN EL SPA
    - Agregar campo al formulario (si no existe).
    - Lógica de captura.

  PROMPT 3 — LÓGICA DE FUZZY MATCHING
    - Implementar algoritmo (JS en SPA o SQL en Supabase).
    - Definir umbral y respuesta.

  PROMPT 4 — UX DE SUGERENCIA Y AGREGADO
    - Modal o datalist de sugerencias.
    - Modal de "agregar derivante nuevo".
    - Persistencia de la decisión.

  PROMPT 5 — INTEGRACIÓN CON n8n Y SHEETS
    - Insert Atención: agregar derivante_id (si aplica).
    - Registrar en Índice: completar columna veterinario_derivante.

Cada prompt sigue el formato CABLEAR estándar.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - Incluye el agregado de la sesión 2026-09-15: opción de agregar
    derivante nuevo cuando no matchea.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 11 decisiones a cerrar identificadas.
  - Sin dependencias críticas con otros sprints.


================================================================================
FIN DEL SPRINT 9
================================================================================