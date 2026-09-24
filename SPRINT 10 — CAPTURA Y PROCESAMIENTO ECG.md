================================================================================
SPRINT 10 — CAPTURA Y PROCESAMIENTO ECG
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

Capturar los datos y/o imágenes del electrocardiograma (ECG) y:
  a) Persistirlos en Supabase.
  b) Renderizarlos en el PDF del informe.
  c) (Opcional) Adjuntar imágenes del trazado al informe.

Hoy el bloque EKG tiene 4 campos en el SPA que no se persisten ni
aparecen en el PDF. El bloque de código en n8n está comentado y listo
para ser activado.


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - Bloque EKG en el SPA con 4 campos (ekg_fc, ekg_ritmo, ekg_eje,
    ekg_p_ms), sin persistencia.
  - Sección ECG en el PDF preparada y comentada en "Preparar Datos para
    PDF" de n8n (bloque de código listo para descomentar).
  - No hay tabla de EKG en Supabase.
  - No hay captura de imágenes de trazado.

QUÉ NO EXISTE:
  - Persistencia del EKG en Supabase.
  - Render del EKG en el PDF.
  - Captura de imágenes de trazado ECG.
  - Procesamiento de las imágenes (si se capturan).
  - Adjuntado de imágenes al informe PDF.

NOTA: el traspaso menciona que "Sección ECG en el PDF" es un pendiente
de Fase 4, con el bloque ya preparado y comentado en n8n. Este sprint
toma ese pendiente y lo expande con captura de imágenes.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - SPA:
      * Bloque EKG existente (4 campos). Verificar si hay que agregar
        más campos (ej: intervalos PR, QRS, QT, QTc).
      * Captura de imágenes de trazado (input file o drag & drop).
      * Preview de las imágenes capturadas.
      * Envío de los datos + imágenes en el payload.

  - Supabase:
      * Nueva tabla: datos_ekg (o similar) con FK a atenciones.
      * O columnas nuevas en atenciones_cardiologia (menos limpio).
      * Storage (si las imágenes se guardan): bucket ekg-imagenes.
      * Relación con atenciones_cardiologia.

  - n8n:
      * Insert Atención Cardiología: agregar insert de EKG (si es tabla
        separada) o columnas nuevas.
      * Preparar Datos para PDF: descomentar bloque ECG y agregar render.
      * Si hay imágenes: insertar imágenes en el Google Doc (requiere
        insertInlineImage, cambio arquitectónico).
      * Insert Datos EKG (nodo nuevo, si es tabla separada).
      * IF - ¿Persistió EKG? (nodo nuevo, para alerta de fallo, si
        aplica).

  - Google Drive (si las imágenes se guardan):
      * Almacenamiento de los trazados ECG (opcional).


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Las decisiones se toman
al inicio del sprint. Sin embargo, hay algunas consideraciones iniciales:

4.1 DATOS NUMÉRICOS VS IMAGEN VS AMBOS
    Opciones:
      a) Solo datos numéricos (los 4 campos del SPA + ampliaciones).
      b) Solo imagen del trazado (captura de pantalla o foto).
      c) Ambos (datos estructurados + imagen como adjunto).

    La opción c es la más completa pero la más compleja.

4.2 PERSISTENCIA (OPCIONES)
    Opciones:
      a) Tabla nueva datos_ekg con FK a atenciones_cardiologia.
      b) Columnas nuevas en atenciones_cardiologia (ekg_*).
      c) Solo en el PDF (no persistir).

    Recomendación: opción a (tabla separada). Más limpia y extensible.

4.3 CAPTURA DE IMAGEN (OPCIONES)
    Opciones:
      a) input type="file" (el vet sube una foto o captura de pantalla).
      b) Captura desde cámara (getUserMedia, poco probable en consultorio).
      c) Integración con el equipo de ECG (poco probable sin API).

    Recomendación: opción a (input type="file" con drag & drop).

4.4 ALMACENAMIENTO DE IMÁGENES (OPCIONES)
    Opciones:
      a) Supabase Storage (bucket ekg-imagenes).
      b) Google Drive (carpeta dedicada).
      c) Embebidas en el payload (base64, no recomendado por peso).

    Recomendación: opción a (Supabase Storage, consistente con Sprint 7
    para firmas).

4.5 RENDER EN EL PDF (OPCIONES)
    Opciones:
      a) Solo texto (los campos estructurados).
      b) Texto + tabla formateada.
      c) Texto + tabla + imagen del trazado.

    La opción c requiere insertInlineImage en Google Docs (cambio
    arquitectónico, ya mencionado en Sprint 7 para firma).

4.6 CAMPOS DEL EKG (SUGERENCIA INICIAL)
    Los 4 campos actuales:
      - ekg_fc (frecuencia cardíaca)
      - ekg_ritmo (ritmo)
      - ekg_eje (eje)
      - ekg_p_ms (onda P en ms)

    Campos adicionales sugeridos:
      - ekg_pr_ms (intervalo PR)
      - ekg_qrs_ms (duración QRS)
      - ekg_qt_ms (intervalo QT)
      - ekg_qtc_ms (QT corregido)
      - ekg_conclusion (texto libre / diagnóstico electrocardiográfico)

    Confirmar cuáles son necesarios.

4.7 DIAGNÓSTICO ELECTROCARDIOGRÁFICO
    El Sprint 12 (Historia Clínica) menciona "diagnóstico
    electrocardiográfico" en el resumen. Esto sugiere que el EKG tiene
    un campo de conclusión/diagnóstico. Definir si es texto libre, lista
    de opciones, o generado por IA a partir de los datos.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 DEFINIR SI SE CAPTURAN DATOS, IMAGEN, O AMBOS
    Punto 4.1. Define el alcance completo del sprint.

5.2 DEFINIR QUÉ CAMPOS DEL EKG SON NECESARIOS
    Punto 4.6. Confirmar si los 4 actuales son suficientes o hay que
    agregar más.

5.3 DEFINIR SI HAY DIAGNÓSTICO ELECTROCARDIOGRÁFICO
    Punto 4.7. Es texto libre, lista, o IA.

5.4 DEFINIR LA TABLA DE EKG EN SUPABASE
    Schema sugerido:
      - id: uuid PK
      - atencion_id: uuid FK (UNIQUE, como datos_ecocardiografia)
      - ekg_fc, ekg_ritmo, ekg_eje, ekg_p_ms, etc.
      - conclusion: text
      - imagen_url: text (si hay imagen)
      - created_at: timestamptz

5.5 DEFINIR ALMACENAMIENTO DE IMÁGENES
    Punto 4.4. Si es Supabase Storage, definir bucket y nombre de
    archivos (ekg/{atencion_id}.png o similar).

5.6 IMPLEMENTAR CAPTURA EN EL SPA
    Bloque EKG existente + input de archivo + preview.

5.7 IMPLEMENTAR PERSISTENCIA EN n8n
    Nodo nuevo: Insert Datos EKG (similar a Insert Datos
    Ecocardiografía). Incluir IF - ¿Persistió EKG? si aplica (gap H7
    extendido).

5.8 IMPLEMENTAR RENDER EN EL PDF
    Descomentar bloque ECG en Preparar Datos para PDF. Agregar sección
    "ELECTROCARDIOGRAMA" al doc_content.
    Si hay imagen: insertInlineImage en Google Docs (cambio
    arquitectónico).

5.9 DEFINIR SI HAY ALERTA POR FALLO DE PERSISTENCIA DE EKG
    Similar al gap H7 del eco. Decidir si se agrega.

5.10 EVALUAR INTEGRACIÓN CON EL RESTO DEL FLUJO
     ¿El EKG sigue la misma lógica de "solo campos medidos"? ¿NULL
     permitido? ¿Se oculta la sección si no hay datos?


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Se capturan datos numéricos, imagen del trazado, o ambos?

  [ ] 6.2 ¿Los 4 campos actuales del EKG son suficientes, o hay que
          agregar más? ¿Cuáles?

  [ ] 6.3 ¿Hay un campo de "diagnóstico electrocardiográfico" (conclusión)?
          ¿Es texto libre, lista de opciones, o generado por IA?

  [ ] 6.4 ¿La persistencia va a tabla nueva datos_ekg, columnas en
          atenciones, o solo en el PDF?

  [ ] 6.5 Si hay imagen, ¿se guarda en Supabase Storage, Google Drive,
          o embebida?

  [ ] 6.6 Si hay imagen, ¿cómo se captura? input file, drag & drop,
          cámara, integración con equipo.

  [ ] 6.7 ¿La sección EKG del PDF incluye imagen del trazado? Si sí,
          requiere insertInlineImage en Google Docs.

  [ ] 6.8 ¿Se agrega alerta por fallo de persistencia de EKG (similar
          a gap H7 del eco)?

  [ ] 6.9 ¿El EKG sigue la misma regla de "solo campos medidos"? ¿La
          sección se oculta si no hay datos?

  [ ] 6.10 ¿Qué pasa con las atenciones existentes que no tienen EKG?
           ¿La nueva tabla/columna queda nullable?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Sprint 12 (Historia Clínica): el resumen clínico incluye diagnóstico
    electrocardiográfico. Sin Sprint 10, el Sprint 12 no puede completar
    ese campo.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Ninguna crítica. Es autocontenido.

DEPENDENCIAS EXTERNAS:
  - Si hay captura de imagen: definir desde dónde se captura. Si es
    input file, no hay dependencia externa. Si es integración con el
    equipo de ECG, hay dependencia con el equipo (poco probable sin API).


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El bloque EKG del SPA está actualizado con los campos finales.
  [ ] (Si hay imagen) El SPA permite capturar y previsualizar la imagen
      del trazado.
  [ ] Los datos del EKG viajan en el payload del webhook.
  [ ] La tabla datos_ekg existe en Supabase (si esa fue la decisión).
  [ ] El INSERT de EKG funciona en n8n.
  [ ] (Si aplica) La alerta por fallo de persistencia de EKG funciona.
  [ ] La sección "ELECTROCARDIOGRAMA" aparece en el PDF generado.
  [ ] (Si hay imagen) La imagen se inserta en el PDF.
  [ ] El flujo completo (cargar EKG → enviar → persistir → renderizar
      en PDF) funciona end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] La sección EKG se oculta en el PDF si no hay datos.
  [ ] Los campos numéricos se guardan como numeric en Supabase.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — TABLA datos_ekg EN SUPABASE
    - Migración de tabla.
    - FK a atenciones_cardiologia.
    - RLS (si aplica).

  PROMPT 2 — BLOQUE EKG EN EL SPA
    - Actualizar campos (si hay que agregar más).
    - Si hay imagen: input file + preview.
    - Inyectar los datos en el payload.

  PROMPT 3 — n8n: INSERT DE EKG
    - Nodo Insert Datos EKG.
    - Si aplica: IF - ¿Persistió EKG? + Preparar alerta EKG + Alertar
      fallo EKG.

  PROMPT 4 — n8n: RENDER EN PDF
    - Descomentar bloque ECG en Preparar Datos para PDF.
    - Agregar sección "ELECTROCARDIOGRAMA" al doc_content.
    - Si hay imagen: insertInlineImage en Google Docs.

  PROMPT 5 — STORAGE DE IMÁGENES (SI APLICA)
    - Bucket ekg-imagenes en Supabase Storage.
    - Policies y upload desde el SPA.

Cada prompt sigue el formato CABLEAR estándar.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 10 decisiones a cerrar identificadas.
  - Sprint 12 (Historia Clínica) depende de este sprint para el
    diagnóstico electrocardiográfico.
  - Bloques de código preparados y comentados en n8n listos para
    descomentar (sección ECG en el PDF).


================================================================================
FIN DEL SPRINT 10
================================================================================