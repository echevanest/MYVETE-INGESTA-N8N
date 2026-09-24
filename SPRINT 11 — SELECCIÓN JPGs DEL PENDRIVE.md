================================================================================
SPRINT 11 — SELECCIÓN JPGs DEL PENDRIVE
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

Permitir que el veterinario seleccione imágenes JPG provenientes del
pendrive/USB de exportación del equipo de ecocardiografía, para
adjuntarlas al informe final. La selección puede ser automática (filtrado
por metadatos o naming) o manual.

Hoy el informe incluye solo texto (constantes, eco, diagnóstico,
indicaciones). Las imágenes del equipo quedan fuera del informe.


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El SPA extrae datos del PDF de eco (PDF.js + regex) para autocompletar
    campos.
  - No hay captura ni adjuntado de imágenes JPG.

QUÉ NO EXISTE:
  - Selección de archivos JPG desde el pendrive.
  - Filtrado automático o manual de imágenes.
  - Almacenamiento de las imágenes.
  - Adjuntado de las imágenes al PDF del informe.

NOTA: el equipo de ecocardiografía exporta imágenes al pendrive, pero
no hay integración con el SPA. Es un proceso manual hoy (si es que se
hace).


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - SPA:
      * UI para seleccionar archivos del pendrive (input file o File
        System Access API).
      * Filtrado automático (por metadatos, tamaño, naming) o manual.
      * Preview de las imágenes seleccionadas.
      * Posibilidad de descartar imágenes.
      * Envío de las imágenes en el payload (o subida por separado).

  - n8n:
      * Recepción de las imágenes en el webhook (si viajan por el POST).
      * O subida directa a Drive/Storage desde el SPA (si no viajan por
        el POST).
      * Adjuntado de las imágenes al PDF (insertInlineImage en Google
        Docs, o generación de un PDF con imágenes).

  - Supabase Storage (si las imágenes se guardan):
      * Bucket nuevo: ekg-imagenes (o eco-imagenes).
      * Policies para upload desde el SPA.

  - Google Drive (si las imágenes se adjuntan al PDF):
      * Almacenamiento de las imágenes referenciadas.
      * Inserción en el Google Doc antes de exportar a PDF.

  - Bookmarklet (posiblemente):
      * Si la selección se hace desde MyVete antes de abrir el SPA.


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Las decisiones se toman
al inicio del sprint. Hay consideraciones importantes:

4.1 ACCESO AL PENDRIVE (OPCIONES)
    Tres opciones técnicas:
      a) input type="file" con accept="image/jpeg": el navegador abre el
         diálogo de archivos y el vet navega hasta el pendrive. Funciona
         en todos los navegadores.
      b) Web File System Access API (window.showDirectoryPicker): el SPA
         pide acceso a una carpeta (el pendrive) y lee los archivos
         directamente. Solo funciona en navegadores Chromium (Chrome,
         Edge, Opera). NO funciona en Firefox ni Safari.
      c) WebUSB o similar: acceso directo al dispositivo USB. Muy
         complejo, poco soportado, no recomendado.

    Recomendación: opción a para compatibilidad universal. Opción b como
    mejora progresiva si el vet usa Chrome/Edge.

4.2 FILTRADO AUTOMÁTICO (OPCIONES)
    Si el equipo exporta las imágenes con un naming predecible, se puede
    filtrar automáticamente:
      a) Por extensión (.jpg, .jpeg).
      b) Por naming (ej: "ECO_*.jpg").
      c) Por metadatos EXIF (fecha, equipo).
      d) Por tamaño (descartar thumbnails).

    Requiere conocer cómo exporta el equipo. Sin esa info, el filtrado
    es limitado.

4.3 SELECCIÓN MANUAL (OPCIONES)
    Si el filtrado automático no es suficiente:
      a) El SPA muestra todas las imágenes y el vet selecciona cuáles
         van al informe.
      b) El SPA ordena por fecha de captura y el vet elige.

4.4 ALMACENAMIENTO DE IMÁGENES (OPCIONES)
    a) Supabase Storage: bucket nuevo eco-imagenes.
    b) Google Drive: carpeta dedicada por paciente o por informe.
    c) Embebidas en el payload (base64): no recomendado por peso.

    Recomendación: opción a (Supabase Storage) si el SPA sube las
    imágenes antes de enviar el payload; opción b (Drive) si n8n se
    encarga.

4.5 ADJUNTADO AL PDF (OPCIONES)
    a) Insertar las imágenes como insertInlineImage en el Google Doc
       antes de exportar a PDF. Requiere cambio arquitectónico en el
       nodo Insertar contenido en Doc.
    b) Generar un PDF separado con las imágenes y adjuntarlo al mail
       como segundo adjunto.
    c) Generar el PDF principal con imágenes embebidas en una sección
       "IMÁGENES" al final.

    Recomendación: opción a si el rediseño del informe (Sprint 14) lo
    permite. Opción c como solución intermedia.

4.6 RIESGO DE COMPATIBILIDAD
    Si se elige la opción b de 4.1 (File System Access API), el sprint
    solo funciona en navegadores Chromium. Esto limita a los veterinarios
    que usan Firefox o Safari. Hay que decidir si:
      - Se asume que todos usan Chrome/Edge.
      - Se implementa la opción a como fallback.

4.7 RIESGO DE PESO
    Las imágenes JPG de un ecocardiograma pueden pesar varios MB cada
    una. Si viajan en el payload del webhook, el POST puede ser lento
    o fallar. Conviene subirlas a Storage/Drive desde el SPA y enviar
    solo las URLs en el payload.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 CONOCER EL EQUIPO DE ECO
    Antes de implementar, saber:
      - ¿Qué equipo es (marca, modelo)?
      - ¿Cómo exporta las imágenes al pendrive?
      - ¿Con qué naming?
      - ¿En qué formato (JPG, PNG, DICOM)?
      - ¿Cuántas imágenes por estudio (1, 5, 20)?

5.2 DEFINIR MECANISMO DE ACCESO
    Opción a (input file) o b (File System Access API). Decidir si hay
    fallback.

5.3 DEFINIR FILTRADO AUTOMÁTICO
    Si se puede filtrar por naming o metadatos, definir reglas.

5.4 DEFINIR SELECCIÓN MANUAL
    Si hay selección manual, definir UI (checkbox, drag & drop, etc.).

5.5 DEFINIR ALMACENAMIENTO
    Supabase Storage, Drive, o ambos.

5.6 DEFINIR ADJUNTADO AL PDF
    Insertar en el PDF principal, PDF separado, o ambos.

5.7 DEFINIR SI EL SPRINT DEPENDE DEL REDISEÑO (SPRINT 14)
    Si se elige insertInlineImage en Google Docs, es un cambio
    arquitectónico que puede coincidir con el rediseño del informe.

5.8 DEFINIR MANEJO DE ERRORES
    ¿Qué pasa si el vet no selecciona ninguna imagen? ¿El informe se
    genera igual?

5.9 DEFINIR LÍMITE DE IMÁGENES
    ¿Cuántas imágenes máximo se pueden adjuntar al informe?

5.10 EVALUAR IMPACTO EN EL TIEMPO DE GENERACIÓN DEL PDF
     Si hay 20 imágenes, el PDF va a pesar más y tardar más en generarse.
     ¿Es aceptable?


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Qué equipo de eco usa el veterinario? Marca, modelo, formato
          de exportación, naming.

  [ ] 6.2 ¿El mecanismo de acceso es input file, File System Access API,
          o ambos (con fallback)?

  [ ] 6.3 ¿Hay filtrado automático? ¿Por qué criterio?

  [ ] 6.4 ¿Hay selección manual? ¿Cómo se ve la UI?

  [ ] 6.5 ¿Las imágenes se almacenan en Supabase Storage, Google Drive,
          o ambos?

  [ ] 6.6 ¿Cómo se adjuntan al PDF? insertInlineImage, PDF separado,
          o sección "IMÁGENES" al final.

  [ ] 6.7 ¿El sprint depende del rediseño del informe (Sprint 14)?

  [ ] 6.8 ¿Qué pasa si no hay imágenes seleccionadas? ¿El informe se
          genera igual?

  [ ] 6.9 ¿Cuántas imágenes máximo por informe?

  [ ] 6.10 ¿Hay límite de peso? ¿Se comprimen las imágenes antes de
           subirlas?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Sprint 14 (Rediseño): si el rediseño incluye adjuntar imágenes, este
    sprint debe estar hecho primero.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Sprint 10 (ECG): si la captura de imagen de EKG y de JPGs comparten
    lógica de Storage, conviene implementarlas juntas o coordinar.

DEPENDENCIAS EXTERNAS:
  - Equipo de ecocardiografía: formato de exportación, naming.
  - Navegador: File System Access API solo en Chromium.
  - N8N: si las imágenes viajan por el webhook, verificar que el nodo
    soporte payloads grandes.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El SPA permite acceder a las imágenes del pendrive.
  [ ] El SPA permite seleccionar imágenes (automática o manualmente).
  [ ] El SPA muestra preview de las imágenes seleccionadas.
  [ ] Las imágenes se suben a Storage o Drive.
  [ ] Las URLs de las imágenes se incluyen en el payload (o se guardan
      directamente desde el SPA).
  [ ] Las imágenes se adjuntan al informe PDF (o PDF separado).
  [ ] El flujo completo (seleccionar → subir → adjuntar → ver en PDF)
      funciona end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Si hay fallback para Firefox/Safari, funciona correctamente.
  [ ] Si hay filtrado automático, filtra correctamente.
  [ ] Si hay límite de imágenes o peso, se respeta.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — INVESTIGACIÓN DEL EQUIPO DE ECO
    - Documentar formato de exportación, naming, cantidad de imágenes.
    - No es código, es análisis previo.

  PROMPT 2 — ACCESO Y SELECCIÓN EN EL SPA
    - Implementar input file o File System Access API.
    - Filtrado automático (si aplica).
    - UI de selección manual.

  PROMPT 3 — ALMACENAMIENTO
    - Bucket en Supabase Storage o carpeta en Drive.
    - Upload desde el SPA.

  PROMPT 4 — ADJUNTADO AL PDF
    - Insertar imágenes en Google Doc (si aplica insertInlineImage).
    - O generar PDF separado con imágenes.
    - O sección "IMÁGENES" al final.

  PROMPT 5 — INTEGRACIÓN CON n8n (SI APLICA)
    - Recibir URLs de imágenes en el payload.
    - Coordinar con el nodo Insertar contenido en Doc o Exportar PDF.

Cada prompt sigue el formato CABLEAR estándar.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 10 decisiones a cerrar identificadas.
  - Riesgos: compatibilidad de navegador (File System Access API solo
    Chromium), peso de las imágenes, dependencia del equipo de eco.
  - Sprint 14 (Rediseño) puede depender de este sprint si incluye
    imágenes.


================================================================================
FIN DEL SPRINT 11
================================================================================