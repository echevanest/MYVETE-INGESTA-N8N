================================================================================
MYVETE — SISTEMA DE INGESTA DE INFORMES CARDIOLÓGICOS VETERINARIOS
MANUAL DE USUARIO Y DOCUMENTACIÓN TÉCNICA
Versión 2.1 — 2026-09-22 (actualizada 2026-09-23 con el Sprint 8.0 — Examen clínico)
================================================================================

ÍNDICE
------
PARTE I — MANUAL DE USUARIO
  1. Descripción general del sistema
  2. Finalidad y objetivo
  3. Cómo usar el sistema (guía paso a paso)
  4. Preguntas frecuentes del veterinario

PARTE II — DOCUMENTACIÓN TÉCNICA
  5. Arquitectura del sistema
  6. Componentes
  7. Flujo completo de una consulta
  8. Cada nodo del workflow explicado
  9. Estructura de datos
  10. Credenciales y cuentas
  11. Pruebas realizadas y resultados
  12. Decisiones de diseño y complicaciones resueltas
  13. Sprint 7 — Identificación de Profesional
  14. Pendientes conocidos y sprints planificados
  15. Apéndices


================================================================================
PARTE I — MANUAL DE USUARIO
================================================================================

================================================================================
1. DESCRIPCIÓN GENERAL DEL SISTEMA
================================================================================

MYVETE es un sistema de ingesta automatizada de informes cardiológicos
veterinarios. Su función es transformar una consulta veterinaria (dictada
por voz o escrita por el profesional) en un informe PDF formal, persistir
los datos clínicos en una base de datos, indexar el informe en una planilla
de búsqueda, y enviarlo por mail al tutor del paciente.

El sistema reemplaza un proceso manual que consumía tiempo del veterinario
y producía informes inconsistentes.

Componentes principales:
  - Un SPA (Single Page Application) que el veterinario usa desde el navegador.
  - Un formulario de alta de profesionales (standalone).
  - Un bookmarklet que se inyecta en MyVete (plataforma externa) para
    autocompletar la filiación del paciente y tutor.
  - Un workflow en n8n (orquestador) que procesa el payload del SPA.
  - Supabase (base de datos Postgres + Storage) para persistir consultas
    clínicas y firmas de profesionales.
  - Google Drive para almacenar los PDFs generados.
  - Google Sheets como índice de informes para búsqueda.
  - Gmail para enviar el informe al tutor y las alertas de fallo.
  - OpenAI (GPT-4.1-mini) para estructurar la anamnesis dictada.

Estado actual (2026-09-23): SISTEMA EN PRODUCCIÓN, con Sprint 7
(Identificación de Profesional) completo y validado end-to-end, y
Sprint 8.0 (Examen clínico) implementado en Supabase, SPA y n8n —
pendiente de la prueba end-to-end con el workflow publicado. Detalle en
SPRINT-08-ESTADO.md.


================================================================================
2. FINALIDAD Y OBJETIVO
================================================================================

FINALIDAD:
Automatizar la generación de informes cardiológicos veterinarios desde
el momento en que el veterinario termina la consulta hasta que el tutor
recibe el PDF por mail, sin intervención manual del profesional.

OBJETIVOS ESPECÍFICOS:
  a) Reducir el tiempo administrativo del veterinario post-consulta.
  b) Garantizar consistencia en el formato de los informes.
  c) Persistir los datos clínicos para historia clínica y análisis futuro.
  d) Facilitar la búsqueda de informes previos vía índice en Google Sheets.
  e) Enviar el informe al tutor de forma automática.
  f) Detectar y alertar fallos de persistencia sin bloquear la entrega
     del informe al tutor.
  g) Identificar al profesional actuante y firmar digitalmente el informe.

CÓMO SE LOGRA:
  - El veterinario se identifica una vez por PC (con el formulario de alta).
  - El SPA reconoce al profesional (vía localStorage) y lo usa en cada consulta.
  - El veterinario usa el SPA durante la consulta.
  - El SPA arma un payload estructurado con todos los datos.
  - El payload se envía a un webhook de n8n.
  - n8n orquesta la cadena: IA → Supabase → PDF → Drive → Sheets → Gmail.
  - Cada paso tiene manejo de errores y alertas específicas.


================================================================================
3. CÓMO USAR EL SISTEMA (GUÍA PASO A PASO)
================================================================================

PASO 0 — Identificación del profesional (una vez por PC)
-------------------------------------------------------
  1. Abrí el formulario de alta:
     https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/profesional.html
  2. Llená tus datos:
     - Nombre y apellido.
     - Matrícula 1: tipo (M.N. o M.P.) y número (sin puntos).
     - Matrícula 2 (opcional): tipo y número.
     - Email (identificador único).
     - Especialidad (opcional).
     - Firma: subí una imagen PNG o JPG (solo la firma, sin datos).
  3. Marcá los checkboxes de confirmación de matrícula.
  4. Guardá.
  Listo. Esa PC queda registrada como tuya. La próxima vez que uses el
  SPA, no te va a pedir los datos de nuevo.

PASO 1 — Antes de la consulta
------------------------------
  1. Abrí MyVete en el navegador y buscá al paciente.
  2. Activá el bookmarklet "MYVETE Ingesta" (guardado en favoritos).
  3. Se abre el SPA con la filiación del tutor y la mascota ya cargadas.
  4. Si el SPA muestra un aviso de "no se pudo traer el tutor
     automáticamente", copiá el ID del tutor y pegalo manualmente.
  5. Si el SPA te pide identificarte (PC nueva), se abre el formulario
     de alta en un modal. Llenalo y guardá.

PASO 2 — Durante la consulta
----------------------------
  1. Completá el bloque "Consulta y examen clínico", de arriba hacia abajo:
     - Motivo de la consulta.
     - Anamnesis y examen físico: dictala por voz (botón 🎙️) o escribila.
     - FC (arranca en 120 lpm) y, si hay soplos, "+ Agregar soplo" por
       cada uno (momento, foco, intensidad; se pueden cargar varios).
     - FR (arranca en 20 rpm) y tipo de respiración.
     - Sensorio, mucosas, pulso femoral, reflejo tusígeno, hidratación,
       TLLC, sucusión y auscultación pulmonar (patrón, amplitud, SLTB).
     - Auscultación cardíaca: se pueden marcar varias opciones; "Normal"
       excluye a las demás. Si cargás soplos queda vacía, salvo que la
       marques vos.
     - PAS / PAM / PAD (sin valor inicial, se cargan a mano).
  2. IMPORTANTE: casi todos los desplegables vienen con un valor inicial
     (el del paciente típico de consultorio, mayormente nervioso: por
     ejemplo Sensorio "Excitación", FR "Polipnea"). Ese valor SALE EN EL
     INFORME tal cual. Si no evaluaste un campo, elegí "—" (vacío): lo
     vacío no se imprime.
  3. Si hiciste ecocardiograma: cargá el PDF del equipo con el botón
     "Cargar PDF de eco". Los datos se extraen automáticamente.
     Si preferís, completalos a mano.
  4. Completá diagnóstico e indicaciones.
  5. Si hay medicación, agregala en la sección correspondiente.
  6. Si hiciste EKG, completá los 4 campos del bloque (aún no se persisten).

PASO 3 — Envío
--------------
  1. Hacé click en "✔ Enviar Consulta a n8n".
  2. El SPA valida que el diagnóstico no esté vacío.
  3. El SPA envía los datos al webhook de n8n (con el profesional_id).
  4. En pocos segundos aparece el borrador médico generado por la IA.
  5. Revisá el borrador. Podés editarlo localmente.
  6. El tutor recibe el mail con el PDF adjunto automáticamente.

PASO 4 — Post-consulta
----------------------
  - El informe queda en Google Drive (carpeta "Informes MYVETE").
  - El informe queda indexado en Google Sheets (planilla "Índice de Informes").
  - Los datos clínicos quedan en Supabase, con el profesional_id.
  - Si algo falló en la persistencia, recibís un mail de alerta.

REGLAS DE ORO
-------------
  - Solo campos medidos: si un dato no está medido, no aparece en el informe.
  - NULL permitido: en Supabase los campos no medidos quedan como NULL.
  - Lo que cargás en el SPA es la fuente de verdad: FC, FR, presión y
    examen clínico se guardan y se imprimen tal cual. La IA solo resume
    la anamnesis; no pisa valores clínicos (desde el Sprint 8.0).
  - Solo lectura por defecto: el profesional revisa, no modifica.
  - Indexación específica: cada medida tiene su propio exponente de Cornell.
  - Extracción automática: al cargar PDF, los datos se extraen sin botón extra.
  - El profesional_id nunca es null: el SPA bloquea el envío sin identificación.
  - Matrículas normalizadas: tipo (M.N./M.P.) + número (sin puntos).


================================================================================
4. PREGUNTAS FRECUENTES DEL VETERINARIO
================================================================================

¿Qué hago si el SPA no trae los datos del tutor?
  → Copiá el ID del tutor desde MyVete y pegalo en el campo correspondiente.
    El SPA tiene un botón "Copiar ID" para facilitar esto.

¿Qué hago si el SPA me pide identificarme de nuevo?
  → Si es una PC nueva, llená el formulario. Si es la misma PC donde ya
    te identificaste, puede ser que el navegador haya borrado los datos.
    Volvé a llenar el formulario. Si el problema persiste, avisá a Marcelo.

¿Qué pasa si me equivoco en un dato ya enviado?
  → El informe ya se generó. Contactá a Marcelo para corregir en Supabase
    y regenerar el PDF si hace falta.

¿Puedo editar el borrador que devuelve la IA?
  → Sí, pero la edición es local. No vuelve a n8n. Si querés que la edición
    quede en el informe, hay que hacerlo antes de enviar.

¿Qué hago si el mail al tutor no llega?
  → Revisá la carpeta de spam del tutor. Si no está, avisá a Marcelo: puede
    ser un problema de credencial de Gmail o un email mal cargado.

¿Los datos de EKG se guardan?
  → Todavía no. El bloque está en el SPA pero no se persiste ni aparece
    en el PDF. Está planificado para un sprint futuro (Sprint 10).

¿Qué pasa con los valores que vienen precargados en el examen clínico?
  → Salen en el informe como si los hubieras evaluado. Revisalos siempre.
    Si un campo no lo evaluaste, elegí "—" (vacío) y no se imprime.

¿Puedo usar el sistema desde cualquier computadora?
  → Sí. El SPA está en GitHub Pages, accesible desde cualquier navegador.
    Pero en cada PC nueva tenés que identificarte una vez.

¿Cómo preparo mi firma?
  → Firmá en un papel blanco con lapicera negra o azul. Escaneá o sacá
    una foto con app de escaneo. Recortá para que quede solo la firma.
    Formato PNG (ideal, con fondo transparente) o JPG. Máximo 5 MB.
    Subila en el formulario de alta.


================================================================================
PARTE II — DOCUMENTACIÓN TÉCNICA
================================================================================

================================================================================
5. ARQUITECTURA DEL SISTEMA
================================================================================

DIAGRAMA DE ALTO NIVEL:

  [MyVete - plataforma externa]
       |
       | (bookmarklet lee datos de filiación)
       v
  [SPA - interface/index.html + app.js]
       |                    ^
       |                    | (modal con iframe si falta identificación)
       |                    |
       |              [profesional.html - formulario de alta]
       |
       | (POST JSON al webhook de n8n)
       v
  [n8n - MYVETE - Ingesta]
       |
       +---> [OpenAI GPT-4.1-mini]  (estructura la anamnesis)
       |
       +---> [Supabase]              (persiste tutor, mascota, atención, eco, profesional_id)
       |
       +---> [Google Docs API]       (crea doc temporal)
       |
       +---> [Google Drive API]      (exporta PDF, lo sube, lo renombra)
       |
       +---> [Google Sheets API]     (agrega fila al índice)
       |
       +---> [Gmail API]             (envía informe al tutor + alertas)
       |
       v
  [Respuesta al SPA con borrador_medico]

COMPONENTES EXTERNOS:
  - n8n Cloud (echevanest.app.n8n.cloud)
  - Supabase (tuedigqvvkvgongpcnjx, proyecto myvete-cardiologia)
  - Google Workspace (infoacivet@gmail.com como dueño de recursos)
  - OpenAI API (cuenta MYVETE)
  - GitHub Pages (hosting del SPA y del formulario)

ESTADO DE PRODUCCIÓN:
  - Workflow `MYVETE - Ingesta` (lkOwTFmVTZu7EMoU): active:false,
    path "ingesta-filiacion". (Despublicado para evitar tráfico real.)
  - Workflow `MYVETE - Alta Profesional` (MlEGaxt7k6H9SAfP): active:true,
    path "alta-profesional".
  - Workflow `MYVETE - Ingesta (CORE) [BACKUP - NO TOCAR]`
    (5gGWXOjY2BBOAfuw): active:false, backup.
  - SPA público: https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html
  - Formulario: https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/profesional.html


================================================================================
6. COMPONENTES
================================================================================

6.1 SPA (Single Page Application)
---------------------------------
Ubicación:  interface/index.html + interface/app.js + interface/assets/styles.css
Deploy:     https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html
Build:      No requiere build. HTML/JS/CSS plano, sin npm.

Features actuales (verificadas al 2026-09-22):
  - Handshake con el bookmarklet (postMessage MYVETE_PANEL_READY).
  - Recepción de filiación por 3 canales: postMessage, hash #data=,
    query param ?idTutor=.
  - Aviso al médico cuando el tutor no se pudo traer automáticamente.
  - Formulario de filiación (tutor + mascota) con auto-relleno vía bookmarklet.
  - Dictado por voz nativo (Web Speech API).
  - Perfiles clínicos (PERFILES_BASE) con persistencia en localStorage.
  - Bloque único "Consulta y examen clínico" (Sprint 8.0): motivo,
    anamnesis, FC + soplos (N por consulta), FR + tipo, sensorio, mucosas,
    pulso femoral, reflejo tusígeno, hidratación, TLLC, sucusión,
    auscultación pulmonar (patrón/amplitud/SLTB), auscultación cardíaca
    (multiselección), PAS/PAM/PAD, diagnóstico, indicaciones. Ítems
    reservados: imágenes eco/Doppler, trazado ECG, fotos del eco.
    Opciones y defaults centralizados en CATALOGO_EXAMEN / CATALOGO_SOPLO
    (app.js, Sección 9). Opción vacía "—" en todos los desplegables.
  - Bloque de medicación con estados (continua/nueva/modificada/suspendida).
  - Estudios complementarios: ecocardiograma con 72 columnas + autollenado
    desde PDF vía PDF.js + cálculo de 13 índices (incluye epr y mvcf).
  - Auto-ocultamiento de campos eco vacíos.
  - Bloque EKG (4 campos, sin persistencia en n8n todavía).
  - Envío del formulario al webhook de n8n vía fetch.
  - Recepción y visualización del borrador_medico devuelto por la IA.
  - postMessage MYVETE_SUBMIT_OK al bookmarklet al terminar el envío.
  - Identificación del profesional: lee `myvete_profesional` de
    localStorage; si no existe, abre el modal con el formulario de alta
    (bloqueante). Si existe, inyecta `profesional_id` y `profesional` en
    el payload.
  - Modal de identificación (iframe con profesional.html) + listener de
    storage + polling fallback.

Features pendientes (ver Sección 14):
  - Botón "Confirmar y enviar a MyVete" en #bloque-resumen.
  - Persistencia de medicación y bloque EKG en Supabase.
  - Warning visible al vet si falla persistencia.
  - Link al PDF visible en el SPA.
  - Botón "Cambiar profesional" (re-identificación sin borrar localStorage).

6.2 Formulario de alta de profesionales (profesional.html)
----------------------------------------------------------
Ubicación:  interface/profesional.html (standalone, self-contained)
Deploy:     https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/profesional.html

Features actuales:
  - Formulario con campos: nombre, apellido, matrícula 1 (tipo + número),
    matrícula 2 (opcional, tipo + número), email, especialidad, firma.
  - Selectores de tipo de matrícula (M.N. / M.P.).
  - Validación: campos obligatorios, formato de número (solo dígitos),
    coherencia de matrícula 2, checkboxes de confirmación.
  - Texto de ayuda: "Solo números, sin puntos ni espacios."
  - Mensaje de error específico si el número tiene puntos o espacios.
  - Upload de firma a Supabase Storage (bucket `firmas`, PNG/JPG, máx 5 MB).
  - Detección de firma existente (mensaje + opción de reemplazo).
  - Deduplicación por apellido (ILIKE exacto, capa 2).
  - Guardado en localStorage (`myvete_profesional`).
  - POST al webhook `alta-profesional` de n8n (que hace upsert en
    `profesionales` con service_role).

6.3 Bookmarklet
---------------
Ubicación:  bookmarklet/launcher.js + bookmarklet/loader.js
Función:    Se inyecta en la página de MyVete (plataforma externa) y lee
            los datos de filiación del paciente y tutor para autocompletar
            el SPA. Construye el string "Apellido, Nombre" del tutor.
Pendiente:  Botón "Confirmar y enviar a MyVete" de vuelta al bookmarklet.

6.4 Workflow n8n — MYVETE - Ingesta (PRODUCCIÓN)
------------------------------------------------
Nombre:     MYVETE - Ingesta
ID n8n:     lkOwTFmVTZu7EMoU
Path:       ingesta-filiacion
Estado:     active:false (despublicado; se publica para pruebas E2E)
Nodos:      31
Función:    Orquesta todo el proceso de ingesta post-SPA.

6.5 Workflow n8n — MYVETE - Alta Profesional
--------------------------------------------
Nombre:     MYVETE - Alta Profesional
ID n8n:     MlEGaxt7k6H9SAfP
Path:       alta-profesional
Estado:     active:true
Nodos:      5
Función:    Recibe el POST del formulario de alta, valida, normaliza y
            hace upsert en `profesionales` (on_conflict: matricula_tipo,
            matricula_numero).

6.6 Workflow n8n — MYVETE - Ingesta (CORE) [BACKUP]
---------------------------------------------------
Nombre:     MYVETE - Ingesta (CORE) [BACKUP - NO TOCAR]
ID n8n:     5gGWXOjY2BBOAfuw
Path:       ingesta-filiacion-v4
Estado:     active:false (backup)
Nodos:      8
Función:    Punto de rollback. Se borra cuando producción esté validada
            3-7 días con tráfico real.

6.7 Supabase
------------
Proyecto:   myvete-cardiologia (tuedigqvvkvgongpcnjx)
Plan:       Free Tier (puede pausarse tras 7 días sin actividad)
Tablas:     tutores, mascotas, atenciones_cardiologia,
            datos_ecocardiografia, profesionales
Storage:    bucket `firmas` (público, PNG/JPG, máx 5 MB)

6.8 Google Drive
----------------
Carpeta:    Informes MYVETE (id 1_lcbkiJK5ql_1sCNB3kkhDOES7Xgv7Vn)
Propiedad:  infoacivet@gmail.com
Uso:        Almacena los PDFs finales de informes.

6.9 Google Sheets (índice de búsqueda)
--------------------------------------
Planilla:   1Zxn38DFlpGBlIKSsh_94ZfdnWHC5D3j9y9eiOTGwCxU
Hoja:       "Hoja 1"
Columnas:   fecha | paciente | tutor | veterinario_derivante |
            nombre_pdf | link_pdf | estado_persistencia | observaciones

6.10 Gmail
----------
Credenciales:
  - "Gmail account INFOACIVET" (eMVAugCGSCpQrcEj): envía informe al tutor.
  - "Gmail - echevanest@gmail.com" (rz2DSV3KtfiLr5fV): envía alertas.

6.11 OpenAI
-----------
Credencial: LChLJhcSz4xuxdIF
Modelo:     gpt-4.1-mini
Uso:        Estructura la anamnesis dictada.


================================================================================
7. FLUJO COMPLETO DE UNA CONSULTA
================================================================================

PASO 0 — Identificación (una vez por PC)
  - El profesional abre el formulario de alta (o el SPA lo abre en modal).
  - Llena sus datos + firma.
  - El formulario sube la firma al bucket `firmas`.
  - El formulario hace POST al webhook `alta-profesional`.
  - n8n hace upsert en `profesionales`.
  - El formulario guarda los datos en localStorage.

PASO 1 — Preparación (pre-consulta)
  - El veterinario abre MyVete en el navegador.
  - Activa el bookmarklet.
  - El bookmarklet lee los datos del paciente y tutor.
  - Se abre el SPA con la filiación autocompletada.
  - El SPA verifica localStorage: ¿hay `myvete_profesional`?
    - Si no: abre el modal de identificación (bloqueante).
    - Si sí: continúa.

PASO 2 — Durante la consulta
  - El veterinario completa el bloque "Consulta y examen clínico":
    motivo, anamnesis (dictada), FC + soplos, FR + tipo, examen físico,
    auscultación pulmonar y cardíaca, presión, diagnóstico e indicaciones.
  - Opcionalmente carga un PDF de ecocardiograma.
  - Opcionalmente completa datos de EKG.

PASO 3 — Envío
  - El veterinario hace click en "✔ Enviar Consulta a n8n".
  - El SPA valida que el diagnóstico no esté vacío.
  - El SPA valida que haya `profesional_id` (si no, reabre el modal).
  - El SPA arma el payload con `consolidarPayloadFinal()` (incluye
    `profesional_id` y `profesional` en la raíz).
  - El SPA hace POST al webhook de n8n (path `ingesta-filiacion`).

PASO 4 — Procesamiento en n8n (31 nodos)
  - Webhook recibe el POST.
  - IA (OpenAI) estructura la anamnesis → devuelve borrador_medico.
  - Respond to Webhook devuelve borrador_medico al SPA.
  - EN PARALELO:
    a) Upsert Tutor en Supabase.
    b) Upsert Mascota en Supabase.
    c) Insert Atención Cardiología en Supabase (incluye profesional_id).
    d) IF - ¿Trae Ecocardiografía? → Insert Datos Ecocardiografía.
    e) IF - ¿Persistió Eco? → si falla, alerta eco.
    f) Preparar Datos para PDF (código JS que arma el contenido del informe,
       incluye secciones PROFESIONAL ACTUANTE y FIRMA DEL PROFESIONAL).
    g) Crear Google Doc → Insertar contenido → IF - ¿Tiene firma? →
       Insertar firma en Doc → Exportar PDF → subir a Drive.
    h) Nombrar PDF, buscar colisiones, renombrar si hace falta.
    i) Registrar en Índice (Sheets).
    j) IF - ¿Tutor con email? → Enviar informe al tutor (con mención al
       profesional).
    k) IF - ¿Persistió en Supabase? → alerta si falla.
    l) Eliminar Google Doc temporal.

PASO 5 — Post-consulta
  - El SPA muestra el borrador_medico al veterinario.
  - El tutor recibe el mail con el PDF adjunto.
  - El informe aparece en Drive y en el índice de Sheets.
  - Los datos quedan en Supabase, con el profesional_id.

PASO 6 — Búsqueda posterior
  - Alguien abre la planilla de Sheets.
  - Busca por paciente, tutor, fecha, etc.
  - El link_pdf lleva directo al PDF en Drive.


================================================================================
8. CADA NODO DEL WORKFLOW EXPLICADO
================================================================================

NOTA: el workflow `MYVETE - Ingesta` tiene 31 nodos. Los listamos por
orden de ejecución.

8.1 Webhook
  Tipo: n8n-nodes-base.webhook
  Path: /webhook/ingesta-filiacion
  Método: POST
  CORS: allowedOrigins: "*"

8.2 IA - Estructurar Anamnesis
  Tipo: @n8n/n8n-nodes-langchain.openAi
  Modelo: gpt-4.1-mini
  Función: Estructura la anamnesis (body.examen_clinico.anamnesis):
    resumen, síntomas, cumplimiento, diagnóstico/indicaciones sugeridos.
  Salida: JSON con schema estricto (borrador_medico_v4).
  Nota (Sprint 8.0): el schema todavía pide fc/fr/pas/pam/pad/mucosas,
    pero esos valores NO son fuente de verdad: solo quedan dentro de
    informe_borrador. Los valores clínicos salen del SPA.

8.3 Respond to Webhook
  Función: Devuelve al SPA: {status, message, timestamp, borrador_medico}

8.4 Upsert Tutor
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/tutores?on_conflict=id_myvete o email
  onError: continueRegularOutput.

8.5 Upsert Mascota
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/mascotas?on_conflict=tutor_id,nombre

8.6 Insert Atención Cardiología
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/atenciones_cardiologia
  Función: INSERT (siempre). Incluye profesional_id (NOT NULL).
  Mapeo (Sprint 8.0): 25 columnas desde body.examen_clinico — textos
    crudos (anamnesis/diagnóstico/indicaciones → *_raw), las 18
    columnas del examen clínico (soplos y auscultacion_cardiaca como
    arrays JSON). Ya no manda `metricas` (columna eliminada).
  onError: continueRegularOutput.

8.7 IF - ¿Trae Ecocardiografía?
  Condición: Boolean($('Webhook').item.json.body.datos_ecocardiografia)

8.8 Insert Datos Ecocardiografía
  URL: /rest/v1/datos_ecocardiografia?on_conflict=atencion_id

8.9 IF - ¿Persistió Eco?
  Condición: ausencia de .error + presencia de atencion_id.

8.10 Preparar alerta eco
  Tipo: n8n-nodes-base.code
  Función: Arma asunto y cuerpo del mail de alerta por fallo del eco.

8.11 Alertar fallo eco
  Tipo: n8n-nodes-base.gmail
  Credencial: Gmail - echevanest (rz2DSV3KtfiLr5fV)

8.12 Preparar Datos para PDF
  Tipo: n8n-nodes-base.code
  Función: Arma el contenido del informe. Incluye:
    - Sección "PROFESIONAL ACTUANTE" (arriba, después de Fecha).
    - Sección "FIRMA DEL PROFESIONAL" (abajo, antes del pie).
    - Formato de matrícula: M.N. {numero} - M.P. {numero}.
    - Firma como imagen: insertInlineImage con `firma_url`.
    - Sección "MOTIVO DE LA CONSULTA" (Sprint 8.0).
    - "CONSTANTES FISIOLOGICAS" solo desde el SPA (FC, FR + tipo,
      PAS/PAM/PAD, mucosas); la IA ya no es fuente.
    - Sección "EXAMEN CLÍNICO" (Sprint 8.0): sensorio, pulso femoral,
      reflejo tusígeno, hidratación, TLLC, sucusión, auscultación
      pulmonar, auscultación cardíaca y soplos en formato
      "SOPLO SISTÓLICO MITRAL 3/6". Lo vacío no se imprime.

8.13 Crear Google Doc
8.14 Insertar contenido en Doc (insertText)
8.15 IF - ¿Tiene firma? (NUEVO)
8.16 Insertar firma en Doc (insertInlineImage) (NUEVO)
8.17 Exportar PDF (autenticado)
8.18 Guardar PDF en Drive (subir)
8.19 Nombrar y mover PDF
8.20 Buscar colisiones PDF
8.21 IF - ¿Colisión de nombre?
8.22 Renombrar PDF (colisión)
8.23 Set - Nombre con colisión
8.24 Set - Nombre sin colisión
8.25 IF - ¿Tutor con email?
8.26 Enviar informe al tutor (con mención al profesional)
8.27 IF - ¿Persistió en Supabase?
8.28 Preparar alerta
8.29 Alertar fallo persistencia
8.30 Eliminar Google Doc
8.31 Registrar en Índice


================================================================================
9. ESTRUCTURA DE DATOS
================================================================================

9.1 Payload de entrada (SPA → n8n)
----------------------------------
{
  "profesional_id": "uuid",
  "profesional": {
    "profesional_id": "uuid",
    "nombre": "string",
    "apellido": "string",
    "matricula_tipo": "MN" | "MP",
    "matricula_numero": "string (solo dígitos)",
    "matricula_2_tipo": "MN" | "MP" | null,
    "matricula_2_numero": "string" | null,
    "email": "string",
    "especialidad": "string" | null,
    "firma_url": "string (URL pública)"
  },
  "filiacion": {
    "tutor": { "id_myvete", "nombre", "telefono", "email" },
    "mascota": { "nombre", "especie", "raza", "peso" },
    "editado": boolean
  },
  "examen_clinico": {                      (Sprint 8.0; reemplaza a "consulta")
    "motivo", "anamnesis",                  (texto | null)
    "fc_numero", "fr_numero",               (integer | null)
    "soplos": [ { "momento", "foco", "intensidad", "orden" } ],
    "fr_tipo", "sensorio", "mucosas", "pulso_femoral",
    "reflejo_tusigeno", "hidratacion", "tllc", "sucusion",
    "auscultacion_pulmonar_patron", "auscultacion_pulmonar_amplitud",
    "auscultacion_pulmonar_sltb",           (texto visible | null)
    "auscultacion_cardiaca": [ "..." ],     (array, [] si vacío)
    "pas", "pam", "pad",                    (integer | null)
    "diagnostico", "indicaciones"           (texto | null)
  },
  "medicacion": [...],
  "datos_ecocardiografia": {...} | null,
  "bloque_ekg": {...}
}

9.2 Tablas de Supabase
----------------------

TABLA profesionales:
  - id: uuid (PK)
  - nombre: text NOT NULL
  - apellido: text NOT NULL
  - matricula_tipo: text NOT NULL (CHECK IN ('MN', 'MP'))
  - matricula_numero: text NOT NULL (CHECK ~ '^[0-9]+$')
  - matricula_2_tipo: text (CHECK IN ('MN', 'MP') o NULL)
  - matricula_2_numero: text (CHECK ~ '^[0-9]+$' o NULL)
  - email: text NOT NULL (dato de contacto, NO es clave natural)
  - especialidad: text
  - firma_url: text NOT NULL
  - activo: boolean NOT NULL DEFAULT true
  - created_at, updated_at: timestamptz
  - UNIQUE (matricula_tipo, matricula_numero) ← clave natural

TABLA atenciones_cardiologia:
  - id: uuid (PK)
  - mascota_id: uuid (FK)
  - profesional_id: uuid (FK a profesionales, NOT NULL, ON DELETE RESTRICT)
  - fecha: timestamptz
  - datos_filiacion: jsonb
  - informe_borrador: jsonb (salida de la IA; no es fuente de valores clínicos)
  - anamnesis_raw, diagnostico_raw, indicaciones_raw: text
  - created_at: timestamptz
  Examen clínico (Sprint 8.0, todas nullable, sin CHECK):
  - sensorio, mucosas, pulso_femoral, reflejo_tusigeno, hidratacion,
    tllc, sucusion, auscultacion_pulmonar_patron,
    auscultacion_pulmonar_amplitud, auscultacion_pulmonar_sltb,
    fr_tipo: text (texto visible del desplegable, con tildes)
  - fc_numero, fr_numero, pas, pam, pad: integer
  - auscultacion_cardiaca: jsonb (array de textos)
  - soplos: jsonb (array de {momento, foco, intensidad, orden})
  (Eliminadas en el Sprint 8.0: metricas, updated_at. El motivo de la
  consulta no tiene columna: va solo al informe.)

(El resto de las tablas — tutores, mascotas, datos_ecocardiografia —
se mantienen igual que en v2.0.)

9.3 Formato de la matrícula en el informe
-----------------------------------------
M.N. {numero} - M.P. {numero}
Ejemplo: M.N. 7356 - M.P. 10087

Con una sola matrícula: M.N. 7356 (o M.P. 10087).

Sin puntos en los números (Y1-a).

9.4 Estructura del nombre del PDF
---------------------------------
(Sin cambios respecto a v2.0.)

9.5 Payload de entrada — campos de eco persistidos
--------------------------------------------------
(Sin cambios respecto a v2.0.)


================================================================================
10. CREDENCIALES Y CUENTAS
================================================================================

(Sin cambios respecto a v2.0, más las credenciales nuevas del Sprint 7.)

CREDENCIALES EN n8n (actualizado):
- Google Drive - infoacivet (MYVETE): 4ugwVBPjLZ0Me9JS
- Google Sheets account: 8UcIjrUyUocK69km
- Gmail account INFOACIVET: eMVAugCGSCpQrcEj
- Gmail - echevanest@gmail.com: rz2DSV3KtfiLr5fV
- OpenAi account: LChLJhcSz4xuxdIF
- Supabase myvete-cardiologia: EPCExaKpytpqeH99

NOTA SOBRE SECRETS:
  La carpeta `secrets/` contiene:
    - n8n_api_key.txt
    - supabase service role key.txt
  NO contiene credenciales de Google. Para futuras automatizaciones
  (limpieza de Drive/Sheets), habría que agregarlas.

PENDIENTE: las credenciales de Google (Drive/Sheets) NO están en
`secrets/`. La API de n8n no expone el secret de las credenciales.
Para limpiar Drive/Sheets, Marcelo lo hace a mano.


================================================================================
11. PRUEBAS REALIZADAS Y RESULTADOS
================================================================================

(Sin cambios respecto a v2.0, más las pruebas del Sprint 7.)

11.1 Pruebas sintéticas (POST directo al webhook)
------------------------------------------------
(Sin cambios.)

11.2 Prueba E2E real desde SPA público
--------------------------------------
PRUEBA D — End-to-end desde el SPA (2026-09-15): ✅ EXITOSA.

11.3 Pruebas del Sprint 7
-------------------------
PRUEBA E — E2E real con identificación de profesional (2026-09-22):
  Objetivo: validar el flujo completo con identificación del profesional.
  Resultado: ✅ EXITOSA
    - Formulario de alta funcionó (datos guardados en Supabase).
    - SPA reconoció al profesional (no pidió formulario de nuevo).
    - Atención con profesional_id persistido.
    - PDF generado con "PROFESIONAL ACTUANTE" (arriba) y "FIRMA DEL
      PROFESIONAL" (abajo, con firma como imagen).
    - Mail al tutor con mención al profesional.
    - Limpieza completa (Supabase, Storage, Drive, Sheets).


================================================================================
12. DECISIONES DE DISEÑO Y COMPLICACIONES RESUELTAS
================================================================================

Las decisiones de diseño del Sprint 8.0 y las complicaciones resueltas
durante el desarrollo están documentadas en:
  - AUDITORIA-SPRINT-8.md — hallazgos de las auditorías previas al
    Sprint 8 y decisiones derivadas.
  - SPRINT-08-ESTADO.md — estado del Sprint 8.0 (implementado y
    pendiente).


================================================================================
13. SPRINT 7 — IDENTIFICACIÓN DE PROFESIONAL
================================================================================

El Sprint 7 (Identificación de Profesional) está documentado en:
  - SPRINT 7 — IDENTIFICACIÓN DE PROFESIONAL.md — plan y detalle del
    sprint.
  - STATUS.md — Sección K, estado del Sprint 7 (cerrado).


================================================================================
14. PENDIENTES CONOCIDOS Y SPRINTS PLANIFICADOS
================================================================================

El roadmap de sprints (7 a 14) y los pendientes conocidos están
documentados en:
  - SPRINTS — ETAPA POSTERIOR A COMPROBACIÓN DE FUNCIÓN CORRECTA DE
    PROTOTIPO 2.md — maestro de sprints.
  - SPRINT 8 — *.md a SPRINT 14 — *.md — documentos individuales de
    cada sprint.


================================================================================
15. APÉNDICES
================================================================================

Los apéndices (glosario, detalles técnicos menores, convenciones) están
en el manual v2.0:
  - MYVETE — SISTEMA DE INGESTA DE INFORMES CARDIOLÓGICOS
    VETERINARIOS.md — manual v2.0, conservado como referencia.
