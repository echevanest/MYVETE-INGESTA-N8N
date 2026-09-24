================================================================================
MYVETE — SISTEMA DE INGESTA DE INFORMES CARDIOLÓGICOS VETERINARIOS
MANUAL DE USUARIO Y DOCUMENTACIÓN TÉCNICA
Versión 2.0 — 2026-09-15
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
  13. Pendientes conocidos y sprints planificados
  14. Apéndices


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
  - Un bookmarklet que se inyecta en MyVete (plataforma externa de gestión
    veterinaria) para autocompletar la filiación del paciente y tutor.
  - Un workflow en n8n (orquestador) que procesa el payload del SPA.
  - Supabase (base de datos Postgres) para persistir consultas clínicas.
  - Google Drive para almacenar los PDFs generados.
  - Google Sheets como índice de informes para búsqueda.
  - Gmail para enviar el informe al tutor y las alertas de fallo.
  - OpenAI (GPT-4.1-mini) para estructurar la anamnesis dictada.

Estado actual (2026-09-15): SISTEMA EN PRODUCCIÓN, validado end-to-end
desde el SPA público en navegador.


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

CÓMO SE LOGRA:
  - El veterinario usa el SPA durante la consulta.
  - El SPA arma un payload estructurado con todos los datos.
  - El payload se envía a un webhook de n8n.
  - n8n orquesta la cadena: IA → Supabase → PDF → Drive → Sheets → Gmail.
  - Cada paso tiene manejo de errores y alertas específicas.


================================================================================
3. CÓMO USAR EL SISTEMA (GUÍA PASO A PASO)
================================================================================

PASO 1 — Antes de la consulta
------------------------------
  1. Abrí MyVete en el navegador y buscá al paciente.
  2. Activá el bookmarklet "MYVETE Ingesta" (guardado en favoritos).
  3. Se abre el SPA con la filiación del tutor y la mascota ya cargadas.
  4. Si el SPA muestra un aviso de "no se pudo traer el tutor
     automáticamente", copiá el ID del tutor y pegalo manualmente.

PASO 2 — Durante la consulta
----------------------------
  1. Dictá la anamnesis por voz (botón de micrófono) o escribila.
  2. Completá las constantes fisiológicas (FC, FR, PAS, PAM, PAD, mucosas).
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
  3. El SPA envía los datos al webhook de n8n.
  4. En pocos segundos aparece el borrador médico generado por la IA.
  5. Revisá el borrador. Podés editarlo localmente.
  6. El tutor recibe el mail con el PDF adjunto automáticamente.

PASO 4 — Post-consulta
----------------------
  - El informe queda en Google Drive (carpeta "Informes MYVETE").
  - El informe queda indexado en Google Sheets (planilla "Índice de Informes").
  - Los datos clínicos quedan en Supabase.
  - Si algo falló en la persistencia, recibís un mail de alerta.

REGLAS DE ORO
-------------
  - Solo campos medidos: si un dato no está medido, no aparece en el informe.
  - NULL permitido: en Supabase los campos no medidos quedan como NULL.
  - Solo lectura por defecto: el profesional revisa, no modifica.
  - Indexación específica: cada medida tiene su propio exponente de Cornell.
  - Extracción automática: al cargar PDF, los datos se extraen sin botón extra.


================================================================================
4. PREGUNTAS FRECUENTES DEL VETERINARIO
================================================================================

¿Qué hago si el SPA no trae los datos del tutor?
  → Copiá el ID del tutor desde MyVete y pegalo en el campo correspondiente.
    El SPA tiene un botón "Copiar ID" para facilitar esto.

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
    en el PDF. Está planificado para un sprint futuro.

¿Puedo usar el sistema desde cualquier computadora?
  → Sí. El SPA está en GitHub Pages, accesible desde cualquier navegador.


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
       |
       | (POST JSON al webhook de n8n)
       v
  [n8n - Workflow B: MYVETE - Ingesta (COPIA Sprint 6 - PDF+Mail) [STAGING]]
       |
       +---> [OpenAI GPT-4.1-mini]  (estructura la anamnesis)
       |
       +---> [Supabase]              (persiste tutor, mascota, atención, eco)
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
  - Supabase (tuedigqvvkvgongpcnjx.supabase.co, proyecto myvete-cardiologia)
  - Google Workspace (infoacivet@gmail.com como dueño de recursos)
  - OpenAI API (cuenta MYVETE)
  - GitHub Pages (hosting del SPA)

ESTADO DE PRODUCCIÓN:
  - Workflow B (lkOwTFmVTZu7EMoU): active:true, path "ingesta-filiacion".
  - Workflow A (5gGWXOjY2BBOAfuw): active:false, backup, path "v4".
  - SPA público: https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html


================================================================================
6. COMPONENTES
================================================================================

6.1 SPA (Single Page Application)
---------------------------------
Ubicación:  interface/index.html + interface/app.js + interface/assets/styles.css
Deploy:     https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html
Build:      No requiere build. HTML/JS/CSS plano, sin npm.

Features actuales (verificadas al 2026-09-15):
  - Handshake con el bookmarklet (postMessage MYVETE_PANEL_READY).
  - Recepción de filiación por 3 canales: postMessage, hash #data=,
    query param ?idTutor=.
  - Aviso al médico cuando el tutor no se pudo traer automáticamente.
  - Formulario de filiación (tutor + mascota) con auto-relleno vía bookmarklet.
  - Dictado por voz nativo (Web Speech API).
  - Perfiles clínicos (PERFILES_BASE) con persistencia en localStorage.
  - Sección clínica: constantes fisiológicas, anamnesis, diagnóstico,
    indicaciones.
  - Bloque de medicación con estados (continua/nueva/modificada/suspendida).
  - Estudios complementarios: ecocardiograma con 72 columnas + autollenado
    desde PDF vía PDF.js + cálculo de 13 índices (incluye epr y mvcf,
    ahora sí persistidos).
  - Auto-ocultamiento de campos eco vacíos (Sección 8.bis).
  - Bloque EKG (4 campos, sin persistencia en n8n todavía).
  - Envío del formulario al webhook de n8n vía fetch.
  - Recepción y visualización del borrador_medico devuelto por la IA.
  - postMessage MYVETE_SUBMIT_OK al bookmarklet al terminar el envío.

Features pendientes (ver Sección 13):
  - Botón "Confirmar y enviar a MyVete" en #bloque-resumen.
  - Persistencia de medicación y bloque EKG en Supabase.
  - Warning visible al vet si falla persistencia.
  - Link al PDF visible en el SPA.

6.2 Bookmarklet
---------------
Ubicación:  bookmarklet/launcher.js + bookmarklet/loader.js
Función:    Se inyecta en la página de MyVete (plataforma externa) y lee
            los datos de filiación del paciente y tutor para autocompletar
            el SPA. Construye el string "Apellido, Nombre" del tutor.
Pendiente:  Botón "Confirmar y enviar a MyVete" de vuelta al bookmarklet
            (el postMessage MYVETE_SUBMIT_OK existe, pero se dispara
            automáticamente tras el envío, no cuando el médico confirma).

6.3 Workflow n8n — Workflow B (PRODUCCIÓN)
------------------------------------------
Nombre:     MYVETE - Ingesta (COPIA Sprint 6 - PDF+Mail) [STAGING]
            (el nombre mantiene [STAGING] por historia, pero el rol es producción)
ID n8n:     lkOwTFmVTZu7EMoU
Path:       ingesta-filiacion (SIN sufijos)
Estado:     active:true (publicado, recibe tráfico del SPA)
Nodos:      29 (los 26 originales + 3 del gap H7)
Función:    Orquesta todo el proceso de ingesta post-SPA.

6.4 Workflow n8n — Workflow A (CORE, BACKUP)
--------------------------------------------
Nombre:     MYVETE - Ingesta (CORE) [BACKUP - NO TOCAR]
ID n8n:     5gGWXOjY2BBOAfuw
Path:       ingesta-filiacion-v4
Estado:     active:false (despublicado, conservado como backup)
Nodos:      8
Función:    Punto de rollback. Se borra solo cuando producción (Workflow B)
            esté validada 3-7 días con tráfico real.

6.5 Supabase
------------
Proyecto:   myvete-cardiologia (tuedigqvvkvgongpcnjx)
Plan:       Free Tier (puede pausarse tras 7 días sin actividad)
Tablas:     tutores, mascotas, atenciones_cardiologia, datos_ecocardiografia
Columnas nuevas (2026-09-13):
  - datos_ecocardiografia.epr (numeric, nullable)
  - datos_ecocardiografia.tiempo_eyectivo (numeric, nullable)
Índices:
  - tutores_email_unq (parcial, redundante): ELIMINADO.
  - tutores_email_unique (plano): MANTENIDO (fallback on_conflict=email).

6.6 Google Drive
----------------
Carpeta:    Informes MYVETE (id 1_lcbkiJK5ql_1sCNB3kkhDOES7Xgv7Vn)
Propiedad:  infoacivet@gmail.com
Uso:        Almacena los PDFs finales de informes.
Estado:     Limpia (Marcelo borró manualmente los PDFs de prueba).

6.7 Google Sheets (índice de búsqueda)
--------------------------------------
Planilla:   1Zxn38DFlpGBlIKSsh_94ZfdnWHC5D3j9y9eiOTGwCxU
Hoja:       "Hoja 1"
Columnas:   fecha | paciente | tutor | veterinario_derivante |
            nombre_pdf | link_pdf | estado_persistencia | observaciones
Función:    Índice consultable de informes. Cada fila representa un informe
            con link directo al PDF en Drive.
Estado:     Limpia (encabezados intactos, 8 columnas).
Nota:       veterinario_derivante y observaciones se completan en Fase 4.

6.8 Gmail
---------
Credenciales:
  - "Gmail account INFOACIVET" (eMVAugCGSCpQrcEj): envía informe al tutor.
  - "Gmail - echevanest@gmail.com" (rz2DSV3KtfiLr5fV): envía alertas.

6.9 OpenAI
----------
Credencial: LChLJhcSz4xuxdIF
Modelo:     gpt-4.1-mini
Uso:        Estructura la anamnesis dictada, extrae constantes, síntomas,
            resumen y diagnóstico sugerido.


================================================================================
7. FLUJO COMPLETO DE UNA CONSULTA
================================================================================

PASO 1 — Preparación (pre-consulta)
  - El veterinario abre MyVete en el navegador.
  - Activa el bookmarklet.
  - El bookmarklet lee los datos del paciente y tutor de la página actual.
  - Se abre el SPA con la filiación autocompletada.

PASO 2 — Durante la consulta
  - El veterinario dicta la anamnesis por voz (Web Speech API).
  - O la escribe manualmente.
  - Completa constantes fisiológicas (FC, FR, PAS, PAM, PAD, mucosas).
  - Completa diagnóstico e indicaciones.
  - Opcionalmente carga un PDF de ecocardiograma para autollenado.
  - Opcionalmente completa datos de eco manualmente.
  - Opcionalmente completa datos de EKG (no persistidos aún).

PASO 3 — Envío
  - El veterinario hace click en "✔ Enviar Consulta a n8n".
  - El SPA valida que el diagnóstico no esté vacío.
  - El SPA arma el payload con consolidarPayloadFinal().
  - El SPA hace POST al webhook de n8n (path ingesta-filiacion).

PASO 4 — Procesamiento en n8n (Workflow B, 29 nodos)
  - Webhook recibe el POST.
  - IA (OpenAI) estructura la anamnesis → devuelve borrador_medico.
  - Respond to Webhook devuelve borrador_medico al SPA.
  - EN PARALELO:
    a) Upsert Tutor en Supabase (insert o update por id_myvete o email).
    b) Upsert Mascota en Supabase (insert o update por tutor_id+nombre).
    c) Insert Atención Cardiología en Supabase (siempre insert).
    d) IF - ¿Trae Ecocardiografía? → Insert Datos Ecocardiografía.
    e) IF - ¿Persistió Eco? → si falla, Preparar alerta eco → Alertar fallo eco.
    f) Preparar Datos para PDF (código JS que arma el contenido del informe).
    g) Crear Google Doc → Insertar contenido → Exportar PDF → subir a Drive.
    h) Nombrar PDF (nombre base: PACIENTE+APELLIDOTUTOR+MES AÑO).
    i) Buscar colisiones en la carpeta de Drive.
    j) IF - ¿Colisión?:
       - TRUE: Renombrar PDF → Set - Nombre con colisión.
       - FALSE: Set - Nombre sin colisión.
    k) Registrar en Índice (Sheets): escribe fila con nombre_pdf_final.
    l) IF - ¿Tutor con email?:
       - TRUE: Enviar informe al tutor (adjunto PDF).
       - FALSE: saltar a IF - ¿Persistió en Supabase?.
    m) IF - ¿Persistió en Supabase?:
       - TRUE: fin.
       - FALSE: Preparar alerta → Alertar fallo persistencia.
    n) Eliminar Google Doc temporal.

PASO 5 — Post-consulta
  - El SPA muestra el borrador_medico al veterinario.
  - El veterinario puede editarlo localmente (no vuelve a n8n).
  - El tutor recibe el mail con el PDF adjunto.
  - El informe aparece en Drive.
  - El informe aparece en el índice de Sheets.
  - Los datos quedan en Supabase.

PASO 6 — Búsqueda posterior
  - Alguien abre la planilla de Sheets.
  - Busca por paciente, tutor, fecha, etc.
  - El link_pdf lleva directo al PDF en Drive.


================================================================================
8. CADA NODO DEL WORKFLOW EXPLICADO
================================================================================

NOTA: este workflow tiene 29 nodos. Los listamos por orden de ejecución.

8.1 Webhook
  Tipo: n8n-nodes-base.webhook
  Path: /webhook/ingesta-filiacion
  Método: POST
  CORS: allowedOrigins: "*"
  Función: Recibe el POST del SPA con el payload.

8.2 IA - Estructurar Anamnesis
  Tipo: @n8n/n8n-nodes-langchain.openAi
  Modelo: gpt-4.1-mini
  Credencial: OpenAi account (LChLJhcSz4xuxdIF)
  Función: Recibe el texto de anamnesis dictada y extrae:
    - Constantes: fc, fr, pas, pam, pad, mucosas.
    - Síntomas detectados (array).
    - Cumplimiento de tratamiento.
    - Diagnóstico sugerido.
    - Indicaciones sugeridas.
    - Resumen de la anamnesis (1-2 frases).
  Salida: JSON con schema estricto (textOptions.format = json_schema).
  Retry: 3 intentos, 5 segundos entre intentos.

8.3 Respond to Webhook
  Tipo: n8n-nodes-base.respondToWebhook
  Función: Devuelve al SPA:
    {
      "status": "success",
      "message": "Anamnesis procesada correctamente",
      "timestamp": <now>,
      "borrador_medico": <output de la IA>
    }

8.4 Upsert Tutor
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/tutores?on_conflict=id_myvete o email (condicional)
  Método: POST con Prefer: resolution=merge-duplicates
  Credencial: Supabase (EPCExaKpytpqeH99)
  Función: Inserta o actualiza tutor por id_myvete (o email si no hay
           id_myvete).
  onError: continueRegularOutput.

8.5 Upsert Mascota
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/mascotas?on_conflict=tutor_id,nombre
  Función: Inserta o actualiza mascota por tutor_id+nombre.
  onError: continueRegularOutput.

8.6 Insert Atención Cardiología
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/atenciones_cardiologia
  Función: Siempre INSERT (no upsert). Guarda:
    - mascota_id (FK).
    - datos_filiacion (JSONB completo).
    - metricas (JSONB con fc, fr, pas, pam, pad, mucosas).
    - informe_borrador (JSONB con el output de la IA).
    - anamnesis_raw, diagnostico_raw, indicaciones_raw (TEXT).
  onError: continueRegularOutput.

8.7 IF - ¿Trae Ecocardiografía?
  Tipo: n8n-nodes-base.if
  Condición: Boolean($('Webhook').item.json.body.datos_ecocardiografia)
  TRUE: Insert Datos Ecocardiografía.
  FALSE: fin del branch eco.

8.8 Insert Datos Ecocardiografía
  Tipo: n8n-nodes-base.httpRequest
  URL: /rest/v1/datos_ecocardiografia?on_conflict=atencion_id
  Función: Guarda los 72 campos de eco (con on_conflict por atencion_id),
           incluidos epr y tiempo_eyectivo.
  onError: continueRegularOutput.
  Salida: ahora conectada a IF - ¿Persistió Eco? (gap H7).

8.9 IF - ¿Persistió Eco?
  Tipo: n8n-nodes-base.if
  Condición: ausencia de .error + presencia de atencion_id.
  TRUE: fin (no hace nada).
  FALSE: Preparar alerta eco.
  Rol: gap H7 — detecta fallo aislado del INSERT de eco.

8.10 Preparar alerta eco
  Tipo: n8n-nodes-base.code (JavaScript)
  Función: Arma asunto y cuerpo del mail de alerta por fallo del INSERT
           de datos_ecocardiografia. Incluye:
    - Datos del paciente y tutor.
    - Atención ID.
    - Error crudo del insert de eco.
  Rol: gap H7.

8.11 Alertar fallo eco
  Tipo: n8n-nodes-base.gmail
  Credencial: Gmail - echevanest (rz2DSV3KtfiLr5fV)
  Destinatarios: echevanest@gmail.com, infoacivet@gmail.com
  Asunto: "[MYVETE][ALERTA] Persistencia ECO FALLÓ - {paciente} - {fecha}"
  Rol: gap H7.

8.12 Preparar Datos para PDF
  Tipo: n8n-nodes-base.code (JavaScript)
  Función: Nodo más complejo. Lee el payload del webhook y el output de
           la IA, calcula:
    - Constantes fisiológicas formateadas.
    - Valores de eco (medidos + indexados).
    - Scores (Acvim, MINE2, HP).
    - Parseo de tutor (separación por coma).
    - Normalización de nombres (Ñ preservada, acentos removidos).
    - Nombre del PDF base: PACIENTE+APELLIDOTUTOR+MES AÑO.
    - Nombre del PDF desambiguado: base + " (NOMBRETUTOR)".
    - Contenido completo del PDF en texto.
  Bloque ECG: comentado, preparado para próxima iteración.
  Salida: un item con todos esos campos.

8.13 Crear Google Doc
  Tipo: n8n-nodes-base.httpRequest
  URL: https://docs.googleapis.com/v1/documents
  Credencial: Google Drive - infoacivet (MYVETE) (4ugwVBPjLZ0Me9JS)
  Función: Crea un Google Doc temporal con título "Informe cardiologico
           - {paciente} - {fecha}".
  onError: continueRegularOutput.

8.14 Insertar contenido en Doc
  Tipo: n8n-nodes-base.httpRequest
  URL: /v1/documents/{documentId}:batchUpdate
  Función: Inserta el doc_content (texto completo del informe) en el
           Google Doc.

8.15 Exportar PDF (autenticado)
  Tipo: n8n-nodes-base.httpRequest
  URL: /drive/v3/files/{documentId}/export?mimeType=application/pdf
  Función: Exporta el Google Doc como PDF binario.
  responseFormat: file.

8.16 Guardar PDF en Drive (subir)
  Tipo: n8n-nodes-base.httpRequest
  URL: https://www.googleapis.com/upload/drive/v3/files?uploadType=media
  Función: Sube el PDF binario a Drive.
  Salida: { id, name } del archivo subido.

8.17 Nombrar y mover PDF
  Tipo: n8n-nodes-base.httpRequest
  URL: PATCH /drive/v3/files/{fileId}?addParents=...&removeParents=root
  Función: Renombra el PDF con nombrePdfBase y lo mueve a la carpeta
           "Informes MYVETE".
  Salida: { id, name, webViewLink }.

8.18 Buscar colisiones PDF
  Tipo: n8n-nodes-base.httpRequest
  URL: GET /drive/v3/files?q=name='{nombrePdfBase}' and '{folderId}' in
       parents and trashed=false
  Función: Busca si ya existe un archivo con ese nombre en la carpeta.
  Salida: { files: [...] }.

8.19 IF - ¿Colisión de nombre?
  Tipo: n8n-nodes-base.if
  Condición: length($json.files) > 1
  TRUE: Renombrar PDF (colisión) → Set - Nombre con colisión.
  FALSE: Set - Nombre sin colisión.

8.20 Renombrar PDF (colisión)
  Tipo: n8n-nodes-base.httpRequest
  URL: PATCH /drive/v3/files/{fileId}
  Función: Renombra el PDF con nombrePdfDesambiguado (agrega paréntesis
           con nombre del tutor).
  Salida: { id, name, webViewLink }.

8.21 Set - Nombre con colisión
  Tipo: n8n-nodes-base.set
  Función: Unifica los campos para la rama con colisión:
    - nombre_pdf_final = $json.name
    - link_pdf_final = $json.webViewLink
  Include Other Fields: true.

8.22 Set - Nombre sin colisión
  Tipo: n8n-nodes-base.set
  Función: Unifica los campos para la rama sin colisión:
    - nombre_pdf_final = $('Nombrar y mover PDF').item.json.name
    - link_pdf_final = $('Nombrar y mover PDF').item.json.webViewLink
  Include Other Fields: true.

8.23 IF - ¿Tutor con email?
  Tipo: n8n-nodes-base.if
  Condición: email exists AND email != 'N/D'
  TRUE: Enviar informe al tutor.
  FALSE: saltar (va directo a IF - ¿Persistió en Supabase?).

8.24 Enviar informe al tutor
  Tipo: n8n-nodes-base.gmail
  Credencial: Gmail account INFOACIVET (eMVAugCGSCpQrcEj)
  Destinatario: $('Preparar Datos para PDF').item.json.email
  Asunto: "Informe cardiologico - {paciente}"
  Adjunto: PDF binario del nodo Exportar PDF.
  onError: continueRegularOutput.

8.25 IF - ¿Persistió en Supabase?
  Tipo: n8n-nodes-base.if
  Condición: $('Insert Atención Cardiología').item.json.id != ''
  TRUE: fin (no hace nada).
  FALSE: Preparar alerta.

8.26 Preparar alerta
  Tipo: n8n-nodes-base.code (JavaScript)
  Función: Arma el asunto y cuerpo del mail de alerta. Incluye:
    - Resumen del fallo.
    - Datos del paciente.
    - Estado por paso (con errores crudos).
    - Marca <-- KEYSTONE en el paso crítico.

8.27 Alertar fallo persistencia
  Tipo: n8n-nodes-base.gmail
  Credencial: Gmail - echevanest (rz2DSV3KtfiLr5fV)
  Destinatarios: echevanest@gmail.com, infoacivet@gmail.com
  Asunto: "[MYVETE][ALERTA] Persistencia Supabase FALLÓ - {paciente} - {fecha}"
  Cuerpo: el armado por Preparar alerta.

8.28 Eliminar Google Doc
  Tipo: n8n-nodes-base.httpRequest
  URL: DELETE /drive/v3/files/{documentId}?supportsAllDrives=true
  Función: Borra el Google Doc temporal (una vez exportado el PDF).
  onError: continueRegularOutput.

8.29 Registrar en Índice
  Tipo: n8n-nodes-base.googleSheets
  Credencial: Google Sheets account (8UcIjrUyUocK69km)
  Planilla: 1Zxn38DFlpGBlIKSsh_94ZfdnWHC5D3j9y9eiOTGwCxU
  Hoja: "Hoja 1"
  Operación: Append Row.
  Columnas mapeadas (8 columnas actuales):
    - fecha = $('Preparar Datos para PDF').item.json.fecha
    - paciente = $('Preparar Datos para PDF').item.json.paciente
    - tutor = $('Preparar Datos para PDF').item.json.tutor
    - veterinario_derivante = '' (se completa en Fase 4)
    - nombre_pdf = $json.nombre_pdf_final (del nodo Set)
    - link_pdf = $json.link_pdf_final (del nodo Set)
    - estado_persistencia = $('Insert Atención').item.json.id ? 'OK' : 'FALLO'
    - observaciones = '' (se completa en Fase 4)
  onError: continueRegularOutput.


================================================================================
9. ESTRUCTURA DE DATOS
================================================================================

9.1 Payload de entrada (SPA → n8n)
----------------------------------
{
  "filiacion": {
    "tutor": {
      "id_myvete": "string (obligatorio en la práctica)",
      "nombre": "Apellido, Nombre (formato del bookmarklet)",
      "tele
9.2 Respuesta de n8n (n8n → SPA)
--------------------------------
{
  "status": "success",
  "message": "Anamnesis procesada correctamente",
  "timestamp": "ISO timestamp",
  "borrador_medico": {
    "fc": number | null,
    "fr": number | null,
    "pas": number | null,
    "pam": number | null,
    "pad": number | null,
    "mucosas": string | null,
    "sintomas_detectados": [string],
    "cumplimiento_tratamiento": string | null,
    "diagnostico_sugerido": string | null,
    "indicaciones_sugeridas": string | null,
    "resumen_anamnesis": string
  }
}

9.3 Tablas de Supabase
----------------------

TABLA tutores:
  - id: uuid (PK)
  - nombre: text
  - telefono: text
  - email: text
  - id_myvete: text (unique, on_conflict)
  - created_at: timestamp with time zone

TABLA mascotas:
  - id: uuid (PK)
  - tutor_id: uuid (FK a tutores, NOT NULL)
  - nombre: text
  - especie: text
  - raza: text
  - created_at: timestamp with time zone

TABLA atenciones_cardiologia:
  - id: uuid (PK)
  - mascota_id: uuid (FK a mascotas, NOT NULL)
  - fecha: timestamp with time zone
  - datos_filiacion: jsonb
  - metricas: jsonb
  - informe_borrador: jsonb
  - anamnesis_raw: text
  - diagnostico_raw: text
  - indicaciones_raw: text
  - created_at: timestamp with time zone
  - profesional_id: uuid (FK a profesionales, ON DELETE SET NULL) — PENDIENTE
    de implementación (Sprint Identificación)

TABLA datos_ecocardiografia:
  - atencion_id: uuid (FK a atenciones_cardiologia, UNIQUE)
  - 70+ columnas numéricas (mayoría numeric, algunas text — revisar tipos)
  - epr: numeric, nullable (NUEVO 2026-09-13)
  - tiempo_eyectivo: numeric, nullable (NUEVO 2026-09-13)
  - acvim_estadio, mine2_puntaje, mine2_clasificacion, hp_clasificacion
  - observaciones: text
  - created_at: timestamp with time zone

TABLA profesionales (PENDIENTE — Sprint Identificación):
  - id: uuid (PK, gen_random_uuid())
  - nombre: text NOT NULL
  - apellido: text NOT NULL
  - matricula: text NOT NULL
  - email: text UNIQUE NOT NULL
  - telefono: text
  - especialidad: text
  - firma_url: text (URL pública en Storage bucket "firmas")
  - activo: boolean NOT NULL DEFAULT true
  - created_at, updated_at: timestamptz
  - RLS: SELECT para anon (activo = true)

9.4 Estructura del índice (Sheets)
----------------------------------
Columnas (fila 1) — 8 columnas:
  fecha | paciente | tutor | veterinario_derivante | nombre_pdf |
  link_pdf | estado_persistencia | observaciones

Columnas vacías por diseño (se completan en Fase 4):
  - veterinario_derivante
  - observaciones

9.5 Estructura del nombre del PDF
---------------------------------
SIN colisión:
  {NORM_PACIENTE}{NORM_APELLIDO_TUTOR} {MES AÑO}
  Ejemplo: ZZTESTLOLAMUÑOZ SEPTIEMBRE 2026

CON colisión (ya existe uno con ese nombre):
  {NORM_PACIENTE}{NORM_APELLIDO_TUTOR} ({NORM_NOMBRE_TUTOR}) {MES AÑO}
  Ejemplo: ZZTESTLOLAMUÑOZ (PEDRO) SEPTIEMBRE 2026

NORMALIZACIÓN aplicada:
  - Mayúsculas.
  - Acentos removidos (Á→A, É→E, etc.).
  - Ñ PRESERVADA.
  - Sin espacios internos en el prefijo.
  - Sin caracteres especiales (puntos, comas, etc.).

9.6 Payload de entrada — campos de eco persistidos
--------------------------------------------------
El SPA envía en `datos_ecocardiografia` los 13 índices calculados,
incluidos epr y mvcf. Adicionalmente, epr y tiempo_eyectivo se
persisten como columnas propias en la tabla (numeric, nullable).

Regla de oro: si un campo no fue medido, el SPA envía null explícito
(no omite la clave). En una columna numeric nullable sin default, null
y omitir son equivalentes en el resultado final almacenado.


================================================================================
10. CREDENCIALES Y CUENTAS
================================================================================

CUENTA PRINCIPAL: infoacivet@gmail.com (MYVETE)
CUENTA SECUNDARIA: echevanest@gmail.com (admin/alertas)

CREDENCIALES EN n8n:
┌──────────────────────────────────────┬──────────────────────┬──────────────────────┐
│ Nombre                                │ ID                   │ Proyecto              │
├──────────────────────────────────────┼──────────────────────┼──────────────────────┤
│ Google Drive - infoacivet (MYVETE)    │ 4ugwVBPjLZ0Me9JS     │ MYVETE (en uso)       │
│ Google Sheets account                 │ 8UcIjrUyUocK69km     │ MYVETE                │
│ Gmail account INFOACIVET              │ eMVAugCGSCpQrcEj     │ MYVETE                │
│ Gmail - echevanest@gmail.com          │ rz2DSV3KtfiLr5fV     │ MYVETE                │
│ OpenAi account                        │ LChLJhcSz4xuxdIF     │ MYVETE                │
│ Supabase myvete-cardiologia           │ EPCExaKpytpqeH99     │ MYVETE                │
└──────────────────────────────────────┴──────────────────────┴──────────────────────┘

NOTA HISTÓRICA: existía una credencial "Google Drive Docs Slides"
(k2oarx2fLAT9LgPw) perteneciente al proyecto ARES. En Sprint 6 se
migraron todos los nodos de Drive/Docs a la credencial de MYVETE
(4ugwVBPjLZ0Me9JS). La credencial ARES NO se usa en MYVETE.

CREDENCIALES N8N:
  URL: https://echevanest.app.n8n.cloud
  API key: (en docs/ACCESS_STRATEGY.md o variables de entorno)
  Auth header: X-N8N-API-KEY (no Bearer)
  Content-Type: application/json obligatorio

CONTRATO API n8n (IMPORTANTE):
  - PUT /workflows/{id} acepta SOLO 5 campos: name, nodes, connections,
    settings, staticData. Cualquier otro campo → HTTP 400.
  - El campo "active" NO es escribible por PUT. Se cambia con:
      POST /api/v1/workflows/{id}/activate
      POST /api/v1/workflows/{id}/deactivate

CREDENCIALES SUPABASE:
  - Project ref: tuedigqvvkvgongpcnjx
  - URL: https://tuedigqvvkvgongpcnjx.supabase.co
  - service_role key: solo en n8n y backend, NUNCA en el SPA.
  - publishable (anon) key: puede estar en el SPA (con RLS configurado).

CUENTAS GOOGLE:
  - infoacivet@gmail.com: dueña de Drive, Sheets, Gmail de informes.
  - echevanest@gmail.com: recibe alertas de fallo.
  - La sesión de Claude/Code NO tiene acceso a estas cuentas. La limpieza
    manual de Drive/Sheets la hace Marcelo.


================================================================================
11. PRUEBAS REALIZADAS Y RESULTADOS
================================================================================

11.1 Pruebas sintéticas (POST directo al webhook)
------------------------------------------------

PRUEBA A — Flujo limpio end-to-end
  Objetivo: validar el flujo completo sin datos previos.
  Payload:  MUÑOZ, JUANA + ZZ_TEST_LOLA + eco.
  Resultado: ✅ EXITOSA
    - Supabase: 4 filas (tutor, mascota, atención, eco).
    - epr y tiempo_eyectivo persistidos.
    - Drive: PDF ZZTESTLOLAMUÑOZ SEPTIEMBRE 2026.pdf con Ñ.
    - Sheets: fila nueva con 8 columnas, link funcional.
    - Gmail: mail al tutor con PDF adjunto.
    - Sin alertas.
  Duración: ~17 segundos.

PRUEBA B1 — Upsert-update + colisión de PDF
  Objetivo: validar upsert sobre datos existentes + colisión de PDF.
  Payload:  MUÑOZ, PEDRO (mismo apellido, mismo paciente) + eco.
  Resultado: ✅ EXITOSA
    - Upsert Tutor: UPDATE (mismo id, nombre actualizado).
    - Upsert Mascota: UPDATE (mismo id).
    - Atención: INSERT (2 filas).
    - Colisión detectada: SÍ.
    - PDF B1: ZZTESTLOLAMUÑOZ (PEDRO) SEPTIEMBRE 2026.pdf.
    - Sheets: fila 3 con nombre desambiguado.
    - Gmail: mail al tutor con PDF adjunto.
    - Sin alertas.

PRUEBA B2 — Fallo de persistencia forzado
  Objetivo: validar la rama de alerta cuando falla la persistencia.
  Payload:  tutor = null (fuerza error en Upsert Tutor y cascada).
  Resultado: ✅ EXITOSA
    - Upsert Tutor: FALLO (URL parameter must be a string, got undefined).
    - Upsert Mascota: FALLO (23502, null value in column tutor_id).
    - Insert Atención: FALLO (23502, null value in column mascota_id).
    - IF - ¿Persistió?: FALSE.
    - Preparar alerta: corrió.
    - Alertar fallo persistencia: mail a echevanest + infoacivet.
    - Contenido del mail: correcto, con estado por paso y error crudo.

PRUEBA C — Fallo aislado del eco (gap H7)
  Objetivo: validar que un fallo del INSERT de eco dispara su propia
            alerta, sin disparar la alerta general de persistencia.
  Payload:  eco con datos inválidos, email de tutor distinto al de la
            prueba A.
  Resultado: ✅ EXITOSA
    - Insert Atención: OK.
    - Insert Datos Eco: FALLO.
    - IF - ¿Persistió Eco?: FALSE.
    - Preparar alerta eco: corrió.
    - Alertar fallo eco: mail enviado.
    - Alerta vieja (keystone) NO se disparó.
    - Gap H7 validado.

11.2 Prueba E2E real desde SPA público en navegador
---------------------------------------------------

PRUEBA D — End-to-end desde el SPA (2026-09-15)
  Objetivo: validar el pipeline completo desde el cliente real, con
            el formulario cargado a mano por el veterinario.
  Entorno:  https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html
  Payload:  Cargado a mano en el SPA.
  Resultado: ✅ EXITOSA
    - Borrador médico mostrado en el SPA.
    - Mail al tutor enviado (verificado en Gmail).
    - PDF generado y subido a Drive.
    - Fila en Sheets.
    - Datos persistidos en Supabase.
    - Pipeline validado de punta a punta.
  Hito: con esta prueba, el sistema pasa de "prototipo validado" a
        "producción estable a depurar".

11.3 Pruebas fallidas y diagnósticos
------------------------------------
- Prueba A original (intento 1): falló el nodo Registrar en Índice.
  Causa: expresión $('Renombrar PDF (colisión)') lanzaba excepción
  cuando ese nodo no corría.
- Fix 6 (intento 1 de solución): $items() en lugar de $() directo.
  Resultado: siguió fallando (mismo error).
- Fix 7 (solución definitiva): nodos Set combinadores.
  Resultado: ✅ FUNCIONÓ.
- Prueba A original (intento 2): falló el mail al tutor.
  Causa: credencial Gmail INFOACIVET desconectada.
- Fix 3 (reconexión): cambiar credencial y volver a poner NO alcanzó.
  Hubo que reconectar vía "Switch account" en el panel de credencial.


================================================================================
12. DECISIONES DE DISEÑO Y COMPLICACIONES RESUELTAS
================================================================================

12.1 Credenciales de Google POR SERVICIO
----------------------------------------
COMPLICACIÓN: el Workflow B usaba 7 nodos con la credencial de ARES,
que no tenía acceso a la carpeta de MYVETE.
DECISIÓN: migrar los 7 nodos a la credencial nueva de MYVETE
(4ugwVBPjLZ0Me9JS).
Implementación: Fix 1.
Lección: las credenciales de Google en n8n son POR SERVICIO.
  Antes de cambiar la cuenta de una credencial, verificar qué otros
  workflows la usan.

12.2 Esquema del índice de Sheets
---------------------------------
COMPLICACIÓN: el esquema viejo (Nombre Paciente, Nombre Tutor, Apellido
Tutor, ID MyVete, ID Supabase, Link PDF, Fecha) no coincidía con el
deseado.
DECISIÓN: migrar a 8 columnas en snake_case:
  fecha | paciente | tutor | veterinario_derivante | nombre_pdf |
  link_pdf | estado_persistencia | observaciones.
Implementación: reescritura del nodo Registrar en Índice.
Estado: implementado. veterinario_derivante y observaciones quedan
vacías por diseño hasta Fase 4.

12.3 Índice duplicado en tutores.email
--------------------------------------
COMPLICACIÓN: existían dos índices sobre tutores.email:
  - tutores_email_unq (parcial)
  - tutores_email_unique (plano)
DECISIÓN: eliminar tutores_email_unq (redundante). Mantener
tutores_email_unique (es la clave del fallback on_conflict=email del
Upsert Tutor, y responde a un invariante de negocio: cada tutor tiene
email único).
Implementación: migración drop_redundant_tutores_email_unq_index.

12.4 Gap H7 — Fallo aislado del INSERT de eco
--------------------------------------------
COMPLICACIÓN: el nodo Insert Datos Ecocardiografía tenía
onError: continueRegularOutput. Si fallaba, el flujo seguía y solo se
disparaba la alerta general de persistencia (keystone), que no
distinguía entre fallo de atención y fallo de eco.
DECISIÓN: agregar 3 nodos nuevos (IF - ¿Persistió Eco? → Preparar
alerta eco → Alertar fallo eco). El IF evalúa ausencia de .error +
presencia de atencion_id.
Implementación: Sprint 6 v2 (2026-09-13).
Resultado: gap H7 cerrado. Si el INSERT de eco falla aislado, se
dispara alerta específica de eco, sin disparar la general.

12.5 Nodos Set para unificar nombre y link del PDF
--------------------------------------------------
COMPLICACIÓN: el nodo Registrar en Índice leía $json.nombre_pdf_final
y $json.link_pdf_final, pero esas claves solo existían en la rama de
colisión. En la rama sin colisión, $json no las tenía.
DECISIÓN: agregar 2 nodos Set (Set - Nombre con colisión, Set - Nombre
sin colisión) que normalizan las claves en ambas ramas antes de llegar
a Registrar en Índice.
Implementación: Sprint 6 v2 (no documentada en el traspaso original,
detectada en auditoría 2026-09-15).
Resultado: resuelto el bug de la prueba A original.

12.6 Normalización de acentos en nombres de PDF
-----------------------------------------------
COMPLICACIÓN: la función _norm usaba normalize('NFD').replace(...)
para remover acentos. Funcionaba pero era menos legible.
DECISIÓN: simplificar a .toUpperCase().replace(/[ÁÀÄÂ]/g,'A')... etc.
Funcionalmente equivalente para el caso de uso.
Implementación: Sprint 6 v2 (no documentada en el traspaso original,
detectada en auditoría 2026-09-15).

12.7 epr y tiempo_eyectivo persistidos
--------------------------------------
COMPLICACIÓN: epr se calculaba en el SPA y se mostraba en la UI, pero
no viajaba en el payload ni se persistía. tiempo_eyectivo no existía
como columna.
DECISIÓN: agregar columnas epr (numeric, nullable) y tiempo_eyectivo
(numeric, nullable) a datos_ecocardiografia. Actualizar el SPA para
que los envíe. Actualizar n8n para que los persista.
Implementación: Sprint 6 (2026-09-13).
Resultado: los 13 índices calculados se persisten, incluidos epr y mvcf.

12.8 Supabase Free Tier
-----------------------
COMPLICACIÓN: el proyecto myvete-cardiologia está en Free Tier. Puede
pausarse tras 7 días sin actividad.
DECISIÓN PENDIENTE: evaluar upgrade a Pro si el proyecto va a tener uso
regular, o convivir con la posibilidad de pausa (documentar cómo
reactivar).
Estado: sin resolver. Ver Sección 13.

12.9 Warning visible al vet si falla persistencia
-------------------------------------------------
COMPLICACIÓN: hoy, si falla la persistencia en Supabase, se envía un
mail de alerta a echevanest + infoacivet, pero el veterinario no ve
nada en el SPA.
DECISIÓN PENDIENTE: agregar warning visible al vet en el SPA.
Estado: sin resolver. Ver Sección 13 (Fase 3).


================================================================================
13. PENDIENTES CONOCIDOS Y SPRINTS PLANIFICADOS
================================================================================

13.1 Pendientes de Fase 2 (validación en producción)
----------------------------------------------------
  - Dejar correr producción 3-7 días con tráfico real.
  - Si todo OK: borrar Workflow A (CORE, 5gGWXOjY2BBOAfuw).
  - Actualizar documentación: este manual + README + STATUS.md +
    INFORME-ARQUITECTURA-V2.7.md + PROPUESTA-MODELO-ELASTICO-V3.5.md.
  - Corregir comentarios internos desactualizados en app.js (por ejemplo,
    el comentario obsoleto sobre epr en Sección 8).
  - Revisar VERSION = '1.0.0-estable' en app.js.

13.2 Sprints planificados (nuevos, post-validación E2E)
-------------------------------------------------------

SPRINT IDENTIFICACIÓN DE PROFESIONAL
  Objetivo: que el informe y el mail referencien al profesional actuante.
  Estado: arquitectura cerrada, sin implementar.
  Componentes:
    - Tabla profesionales en Supabase + bucket firmas en Storage.
    - Formulario de identificación en el SPA (primera vez por PC).
    - Caché en localStorage.
    - Deduplicación asistida por apellido.
    - Validación de matrícula con confirmación.
    - Firma se sube una sola vez (SPA o Marcelo como respaldo).
    - profesional_id en atenciones_cardiologia (FK, ON DELETE SET NULL).
    - n8n: inyectar nombre + matrícula en PDF y mail.
  Decisiones cerradas:
    - Sin autenticación (solo identificación).
    - Clave natural: email.
    - Formulario completo en cada PC nueva.
    - Firma: híbrido (SPA si puede, Marcelo como respaldo).
    - Capa 3 (autofill por apellido) y firma como imagen en PDF:
      postergadas.

SPRINT FUZZY MATCHING MÉDICO DERIVANTE
  Objetivo: detectar y unificar variantes de nombres del veterinario
            derivante.
  Estado: sin definir arquitectura.
  Decisiones pendientes: diccionario existente, dónde matchea, etc.

SPRINT AUTOFILL Y PLANTILLAS
  Objetivo: plantillas preconfiguradas para acelerar carga de variables
            recurrentes y diagnósticos frecuentes.
  Estado: sin definir arquitectura.
  Decisiones pendientes: plantillas globales vs por vet, dónde persisten.

SPRINT CAPTURA Y PROCESAMIENTO ECG
  Objetivo: capturar trazados/imágenes de ECG y adjuntar al informe.
  Estado: bloque EKG existe en SPA pero sin persistencia.
  Decisiones pendientes: imagen, datos numéricos, o ambos.

SPRINT SELECCIÓN JPGs DEL PENDRIVE
  Objetivo: seleccionar/filtrar imágenes JPG del pendrive del equipo
            de eco para adjuntar al informe.
  Estado: sin definir arquitectura.
  Decisiones pendientes: Web File System Access API vs upload manual.

SPRINT AUDITOR DE MAILS (Gmail en n8n) — ANTEÚLTIMO
  Objetivo: monitorear correos entrantes de tutores, clasificar
            confirmaciones vs consultas que requieren respuesta.
  Estado: sin definir arquitectura.
  Decisiones pendientes: workflow C separado vs nodos en B; reglas vs IA.

SPRINT REDISEÑO ESTÉTICO DEL INFORME — ÚLTIMO
  Objetivo: interfaz moderna para el informe (eco + ECG), sin steampunk.
  Estado: sin definir arquitectura.
  Decisiones pendientes: Google Docs vs motor HTML→PDF.

13.3 Deuda técnica
------------------
  - Supabase Free Tier: puede pausarse tras 7 días sin actividad.
  - Gap general de persistencia: si el INSERT de la Atención falla
    (keystone), se dispara la alerta vieja. Si el INSERT de eco falla
    aislado, se alerta con la nueva. Lo que NO hay todavía es un
    warning visible al vet si la persistencia falla.
  - Tipos numéricos en Supabase: columnas de datos_ecocardiografia se
    guardan como numérico/texto según el caso. Revisar migración masiva.


================================================================================
14. APÉNDICES
================================================================================

14.1 Glosario
-------------
  - SPA: Single Page Application. La interfaz web que usa el veterinario.
  - n8n: orquestador de workflows. Recibe el POST del SPA y ejecuta la
    cadena de pasos.
  - Supabase: base de datos Postgres en la nube.
  - Bookmarklet: script que se inyecta en MyVete para leer filiación.
  - Payload: JSON que el SPA envía al webhook de n8n.
  - Borrador médico: output de la IA (GPT-4.1-mini) tras estructurar
    la anamnesis.
  - Keystone: paso crítico del flujo (en este caso, Insert Atención
    Cardiología). Si falla, se dispara la alerta general.
  - Gap H7: hueco de detección de fallo aislado del INSERT de eco.
    Cerrado en Sprint 6 v2.

14.2 URLs y recursos
--------------------
  SPA público:
    https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html

  n8n Cloud:
    https://echevanest.app.n8n.cloud

  Supabase:
    https://tuedigqvvkvgongpcnjx.supabase.co

  Google Drive (Informes MYVETE):
    Carpeta id 1_lcbkiJK5ql_1sCNB3kkhDOES7Xgv7Vn

  Google Sheets (Índice):
    Planilla id 1Zxn38DFlpGBlIKSsh_94ZfdnWHC5D3j9y9eiOTGwCxU

  Repo GitHub:
    https://github.com/echevanest/MYVETE-INGESTA-N8N

14.3 Estado del repo al 2026-09-15
----------------------------------
  - Rama: master
  - Último commit: 76d4504 "docs: persistencia epr + tiempo_eyectivo +
    alerta fallo eco + limpieza indice"
  - Working tree: limpio, con UN archivo sin trackear:
    "MANUAL DE USUARIO MYVETE INGESTA.txt" (a propósito, se reescribe
    en sesión de documentación).
  - origin/master: al día.
  - 2 computadoras que se sincronizan vía GitHub.

14.4 Cambios pendientes de registrar en el repo
-----------------------------------------------
  - Hito E2E real desde SPA público (2026-09-15).
  - 3 mejoras no documentadas del workflow B: nodos Set, credencial
    Drive unificada, _norm simplificado.
  - Este manual (Versión 2.0).
  - Los sprints planificados (documentos por sprint).


================================================================================
FIN DEL MANUAL
Versión 2.0 — 2026-09-15
================================================================================