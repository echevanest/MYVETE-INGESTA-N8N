================================================================================
SPRINT 7 — IDENTIFICACIÓN DE PROFESIONAL
================================================================================
Versión 1.0 — 2026-09-15
Parte de: SPRINTS (ETAPA POSTERIOR A COMPROBACION DE FUNCION CORRECTA DE PROTOTIPO 2)
================================================================================

ÍNDICE
------
1. Objetivo
2. Estado actual
3. Componentes afectados
4. Arquitectura definida (decisiones ya tomadas)
5. Puntos a trabajar
6. Decisiones a cerrar al inicio del sprint
7. Dependencias
8. Criterio de aceptación
9. Plan de implementación (a alto nivel)
10. Registro de cambios


================================================================================
1. OBJETIVO
================================================================================

Que el informe PDF y el mail al tutor referencien al profesional actuante
(nombre + matrícula). Hoy el informe dice "Generado automáticamente por
el sistema de ingesta MyVete" sin mencionar quién lo hizo.

Adicionalmente, que cada atención en atenciones_cardiologia quede
atribuida a un profesional (columna profesional_id) para trazabilidad
histórica.


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El SPA tiene perfiles clínicos (PERFILES_BASE) en localStorage, pero
    son para configuraciones clínicas, no para identidad del profesional.
  - No hay tabla de profesionales en Supabase.
  - No hay bucket de firmas en Storage.
  - atenciones_cardiologia NO tiene columna profesional_id.
  - El informe PDF no menciona al profesional.
  - El mail al tutor no menciona al profesional.

QUÉ NO EXISTE:
  - Mecanismo de identificación del profesional actuante.
  - Persistencia de datos del profesional.
  - Firma digital en el informe.

NOTA: la sesión del 2026-09-15 cerró varias decisiones de arquitectura
para este sprint. Se documentan en la sección 4.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - Supabase:
      * Tabla nueva: profesionales
      * Bucket nuevo en Storage: firmas
      * Columna nueva en atenciones_cardiologia: profesional_id (FK)
      * Policies RLS para SELECT anon en profesionales

  - SPA (interface/index.html + interface/app.js):
      * Formulario de identificación (primera vez por PC)
      * Caché en localStorage
      * Deduplicación asistida por apellido
      * Validación de matrícula con confirmación
      * Upload de firma (condicional, si no existe)
      * Inyección de profesional_id en el payload del webhook

  - n8n (Workflow B, lkOwTFmVTZu7EMoU):
      * Insert Atención Cardiología: agregar profesional_id al INSERT
      * Preparar Datos para PDF: agregar sección "PROFESIONAL ACTUANTE"
        al doc_content
      * Enviar informe al tutor: mencionar al profesional en asunto/cuerpo


================================================================================
4. ARQUITECTURA DEFINIDA (DECISIONES YA TOMADAS)
================================================================================

Las siguientes decisiones se cerraron durante la sesión 2026-09-15:

4.1 SIN AUTENTICACIÓN
    Es identificación, no autenticación. No hay login, no hay contraseña,
    no hay Supabase Auth. El SPA guarda los datos del profesional en
    localStorage y los usa para atribuir el informe.

4.2 PERSISTENCIA: SUPABASE + LOCALSTORAGE
    Supabase es la fuente de verdad. localStorage es caché por dispositivo.
    Si Supabase está pausado (Free Tier), el SPA funciona con el caché.
    Si el caché está vacío, el SPA pide el formulario.

4.3 CLAVE NATURAL: EMAIL
    El upsert en profesionales usa email como clave (on_conflict=email),
    consistente con el patrón de Upsert Tutor en n8n.

4.4 FORMULARIO EN CADA PC NUEVA
    El profesional llena el formulario completo en cada PC que usa por
    primera vez. No hay fingerprinting ni sincronización automática entre
    dispositivos. Es un formulario corto que se llena una vez por PC.

4.5 DEDUPLICACIÓN ASISTIDA POR APELLIDO (CAPA 2)
    Si al enviar el formulario el apellido coincide con un profesional
    existente pero la matrícula o el email no, el SPA pregunta al usuario
    si es él (actualizar) o es otro (crear nuevo).
    La Capa 3 (autofill por apellido con ghost text) queda POSTERGADA.

4.6 VALIDACIÓN DE MATRÍCULA (CAPA 1)
    El formulario incluye un checkbox de confirmación: "Confirmo que la
    matrícula ingresada es correcta". No se puede enviar sin marcarlo.

4.7 FIRMA: HÍBRIDO (SPA SI PUEDE, MARCELO COMO RESPALDO)
    La firma se sube una sola vez en la vida del profesional. Si el SPA
    detecta que ya existe firma_url en Supabase, solo muestra preview y
    no pide subirla. Si el profesional no puede subirla en el momento
    (PC de emergencia, no tiene el PNG digitalizado), Marcelo la carga
    después desde el Dashboard de Supabase.

4.8 FIRMA COMO IMAGEN EN EL PDF: POSTERGADA
    En esta iteración, el PDF solo incluye nombre + matrícula en texto.
    La inserción de la firma como imagen (insertInlineImage en Google
    Docs) queda para una iteración futura.

4.9 PROFESIONAL_ID EN ATENCIONES_CARDIOLOGIA
    Se agrega columna profesional_id uuid REFERENCES profesionales(id)
    ON DELETE SET NULL. Puede ser null si el SPA no tiene identificación
    en el momento del envío (no bloquea el flujo).

4.10 RLS: SELECT PARA ANON
     La tabla profesionales necesita policy de SELECT para el rol anon,
     para que el SPA pueda leer la lista en la capa 2 de deduplicación.
     INSERT/UPDATE solo desde service_role (n8n / dashboard).

4.11 NOMBRE DE TABLA: profesionales
     Bucket de Storage: firmas.

4.12 CAMPOS DEL FORMULARIO (PROPUESTA INICIAL)
     nombre, apellido, matricula, email, telefono, especialidad, firma.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 CONFIRMAR CAMPOS DEL FORMULARIO
    Los campos propuestos en 4.12 son un punto de partida. Verificar si
    falta alguno (ej: tipo de matrícula, provincia de matrícula, años de
    experiencia) o si sobra alguno.

5.2 VERIFICAR EL SPA ACTUAL
    Antes de modificar app.js, verificar que no exista ya algún mecanismo
    de identificación (grep de "profesional", "matricula", "firma").
    Según el traspaso, no existe, pero conviene confirmarlo.

5.3 DEFINIR SCHEMA EXACTO DE LA TABLA
    Aunque la propuesta es clara (nombre, apellido, matricula, email,
    telefono, especialidad, firma_url, activo, created_at, updated_at),
    confirmar si hay constraints adicionales (CHECK en matricula, etc.).

5.4 DEFINIR POLÍTICAS RLS COMPLETAS
    Confirmar:
      - SELECT para anon (necesario para deduplicación).
      - INSERT/UPDATE solo service_role.
      - DELETE solo service_role.

5.5 IMPLEMENTACIÓN DEL FORMULARIO EN EL SPA
    Diseñar el flujo UX:
      - Al abrir el SPA, si no hay profesional en localStorage → mostrar
        formulario.
      - Al enviar → upsert en Supabase → guardar en localStorage.
      - En PCs nuevas donde ya existe el profesional → no pedir formulario
        completo, solo confirmar si es él (o pedir datos igual, según
        decisión 4.4).
    Decisión de UX: ¿el formulario se muestra como modal, como bloque
    dentro del SPA, o como paso previo obligatorio?

5.6 IMPLEMENTACIÓN DE DEDUPLICACIÓN (CAPA 2)
    Definir:
      - Cómo se busca por apellido (ILIKE, fuzzy, etc.).
      - Umbral de similitud si es fuzzy.
      - Texto del modal de confirmación.

5.7 IMPLEMENTACIÓN DE UPLOAD DE FIRMA
    Definir:
      - Cómo se sube (fetch directo a Storage con publishable key).
      - Nombre del archivo (firmas/{profesional_id}.png).
      - Si se sobreescribe o se crea uno nuevo.

5.8 IMPLEMENTACIÓN EN n8n
    Modificar 3 nodos del Workflow B:
      - Insert Atención Cardiología (agregar profesional_id).
      - Preparar Datos para PDF (agregar sección "PROFESIONAL ACTUANTE").
      - Enviar informe al tutor (mencionar al profesional).

5.9 MIGRACIÓN DE DATOS EXISTENTES
    Las atenciones existentes no tienen profesional_id. La columna se
    agrega como nullable. No hay migración de datos históricos.


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Los campos propuestos en 4.12 son los definitivos? ¿Falta o
          sobra alguno?

  [ ] 6.2 ¿El formulario se muestra como modal, como bloque, o como paso
          previo obligatorio?

  [ ] 6.3 ¿En PCs nuevas donde ya existe el profesional en Supabase,
          el SPA pide el formulario completo igual, o solo pide confirmar
          que es él? (Decisión 4.4 dice formulario completo en cada PC,
          pero hay que confirmarlo contra UX.)

  [ ] 6.4 ¿Cómo se busca por apellido en la deduplicación? ILIKE exacto
          o fuzzy (con umbral)?

  [ ] 6.5 ¿El upload de firma desde el SPA usa fetch directo a Storage
          con publishable key, o pasa por un endpoint de n8n?

  [ ] 6.6 ¿La firma se sobreescribe si ya existe, o se guarda una nueva
          versión?

  [ ] 6.7 ¿La columna profesional_id en atenciones_cardiologia debe
          incluir un índice? (Recomendado: sí, para consultas futuras.)

  [ ] 6.8 ¿El informe debe incluir la sección "PROFESIONAL ACTUANTE"
          antes o después de "DATOS DEL PACIENTE"?

  [ ] 6.9 ¿El mail al tutor debe incluir el nombre del profesional en el
          asunto, en el cuerpo, o en ambos?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Sprint 8 (Autofill): si las plantillas son por profesional.
  - Sprint 14 (Rediseño): si el informe lleva firma del profesional.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Ninguna. Es el sprint más independiente.

DEPENDENCIAS EXTERNAS:
  - Ninguna crítica. Supabase ya está integrado en el sistema.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] La tabla profesionales existe en Supabase con RLS configurado.
  [ ] El bucket firmas existe en Storage con policies configuradas.
  [ ] La columna profesional_id existe en atenciones_cardiologia.
  [ ] El SPA muestra el formulario de identificación al abrir por primera
      vez en una PC nueva.
  [ ] El SPA guarda los datos del profesional en localStorage.
  [ ] El SPA no pide el formulario de nuevo si ya hay datos en localStorage.
  [ ] La deduplicación por apellido funciona (pregunta al usuario si
      detecta match parcial).
  [ ] La validación de matrícula funciona (no se envía sin confirmar).
  [ ] El upload de firma funciona (si no existe, se sube; si existe,
      solo preview).
  [ ] El profesional_id llega a Supabase en cada atención.
  [ ] El PDF generado incluye la sección "PROFESIONAL ACTUANTE".
  [ ] El mail al tutor menciona al profesional.
  [ ] El Workflow B sigue active: true con 29 nodos (sin cambios de
      cantidad, solo de contenido).


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en 3 prompts a Claude Code:

  PROMPT 1 — SUPABASE (MIGRACIÓN)
    - Crear tabla profesionales.
    - Configurar RLS.
    - Crear bucket firmas + policies.
    - Agregar columna profesional_id a atenciones_cardiologia.
    - Verificación: consultas de solo lectura.

  PROMPT 2 — SPA (FORMULARIO + LOCALSTORAGE + DEDUPLICACIÓN)
    - Agregar HTML del formulario.
    - Agregar lógica JS (carga, validación, deduplicación, upload firma).
    - Inyectar profesional_id en el payload del webhook.
    - Verificación: abrir SPA en navegador, completar formulario,
      verificar en Supabase.

  PROMPT 3 — n8n (WORKFLOW B)
    - Modificar Insert Atención Cardiología (profesional_id).
    - Modificar Preparar Datos para PDF (sección PROFESIONAL ACTUANTE).
    - Modificar Enviar informe al tutor (mención al profesional).
    - Verificación: ejecución E2E desde el SPA.

Cada prompt sigue el formato CABLEAR estándar:
  TAREA / ARCHIVOS AFECTADOS / CÓDIGO EXACTO / INSTRUCCIONES DE PRUEBA /
  ROLLBACK.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - Decisiones de arquitectura tomadas durante la sesión 2026-09-15.
  - 9 decisiones a cerrar al inicio del sprint identificadas.
  - 3 prompts a CODE planificados.


================================================================================
FIN DEL SPRINT 7
================================================================================