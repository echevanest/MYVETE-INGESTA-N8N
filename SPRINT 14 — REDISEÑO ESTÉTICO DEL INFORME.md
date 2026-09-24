================================================================================
SPRINT 14 — REDISEÑO ESTÉTICO DEL INFORME
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

Diseñar una interfaz y maquetación moderna para el informe de cardiología
(ecocardiografía y electrocardiografía), tomando como base la estructura
del informe actual y adaptándola a todas las secciones requeridas.

El objetivo es que el informe se vea profesional y moderno, sin sacrificar
la claridad clínica. Se descarta explícitamente el estilo steampunk.

El rediseño debe:
  - Mantener la estructura de secciones del informe actual (datos del
    paciente, constantes, eco, scores, diagnóstico, indicaciones).
  - Agregar la sección de ECG (si Sprint 10 se implementó).
  - Incorporar la firma del profesional (si Sprint 7 se implementó).
  - Mejorar la presentación visual (tipografía, colores, espaciado,
    tablas).


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El informe se genera con Google Docs (creación de doc temporal,
    inserción de texto plano, export a PDF).
  - El contenido es texto plano con separadores (líneas de guiones y
    signos igual).
  - La estructura es: encabezado, datos del paciente, constantes,
    resumen de anamnesis, eco (valores medidos + índices), scores,
    diagnóstico, indicaciones.
  - No hay tablas ni formato visual.
  - No hay imágenes.
  - No hay firma del profesional.
  - El código de "Preparar Datos para PDF" arma el `doc_content` como
    texto plano.

QUÉ NO EXISTE:
  - Maquetación moderna (HTML, CSS).
  - Tablas formateadas.
  - Imágenes embebidas (firma, ECG).
  - Colores, tipografía custom.
  - Logo de la clínica.

NOTA: el rediseño puede ser solo cosmético (mantener Google Docs pero
agregar formato) o arquitectónico (migrar a HTML→PDF). La decisión es
el punto más importante del sprint.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

DEPENDIENDO DE LA DECISIÓN ARQUITECTÓNICA:

OPCIÓN A — MANTENER GOOGLE DOCS (solo cosmético):
  - n8n:
      * Preparar Datos para PDF: agregar formato al doc_content
        (negritas, saltos, tablas como texto).
      * Insertar contenido en Doc: adaptar para enviar requests más
        complejos (batchUpdate con múltiples requests).
      * Google Docs API permite insertText, insertTable, updateTextStyle,
        etc.
  - Sin cambios en otros componentes.

OPCIÓN B — MIGRAR A HTML→PDF (arquitectónico):
  - n8n:
      * Preparar Datos para PDF: generar HTML con CSS en lugar de texto
        plano.
      * Nodo nuevo: render HTML→PDF (Puppeteer, PDFMonkey, DocRaptor,
        u otro servicio).
      * Eliminar nodos: Crear Google Doc, Insertar contenido en Doc,
        Exportar PDF, Eliminar Google Doc.
      * Mantener: Guardar PDF en Drive, Nombrar y mover PDF, etc.
  - Servicio externo de render (PDFMonkey, DocRaptor, etc.) o servicio
    propio (Puppeteer en un servidor).
  - Posible cambio en credenciales (si el render usa otro servicio).

OPCIÓN C — HÍBRIDA:
  - Mantener Google Docs para el flujo principal pero agregar formato
    (tablas, negritas) y eventualmente migrar a HTML→PDF en una
    iteración futura.

COMPONENTES COMUNES A TODAS LAS OPCIONES:
  - SPA (si el rediseño incluye preview antes de enviar).
  - Drive (almacenamiento del PDF final).
  - Gmail (el mail al tutor puede cambiar si el PDF cambia).


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Es el sprint con más
impacto arquitectónico potencial. Las decisiones se toman al inicio.

4.1 DECISIÓN PRINCIPAL: GOOGLE DOCS VS HTML→PDF
    Opciones:
      a) Mantener Google Docs, solo agregar formato (negritas, tablas
         como texto, espaciado).
      b) Migrar a HTML→PDF (Puppeteer, PDFMonkey, DocRaptor, etc.).
      c) Híbrido: mantener Google Docs por ahora, migrar después.

    Ventajas de Google Docs:
      - Ya funciona. Sin cambios arquitectónicos grandes.
      - Google Docs API permite tablas, negritas, colores.
      - Sin dependencias nuevas.

    Desventajas de Google Docs:
      - El formato es limitado comparado con HTML/CSS.
      - Insertar imágenes (firma, ECG) requiere insertInlineImage
        (factible pero acotado).
      - El diseño "moderno" es más difícil de lograr.

    Ventajas de HTML→PDF:
      - Control total sobre el diseño (CSS).
      - Facilita insertar imágenes, tablas, layouts complejos.
      - Genera PDFs más lindos visualmente.

    Desventajas de HTML→PDF:
      - Requiere un servicio de render (Puppeteer, PDFMonkey, DocRaptor,
        etc.).
      - Cambio arquitectónico grande en n8n (eliminar nodos de Docs,
        agregar nodo de render).
      - Posible costo (servicios como PDFMonkey o DocRaptor son pagos
        a partir de cierto volumen).
      - Requiere reescribir Preparar Datos para PDF.

    Recomendación: opción a (mantener Google Docs con formato mejorado)
    como primera iteración. Opción b (migrar a HTML→PDF) como iteración
    futura si el diseño de Google Docs no alcanza.

4.2 SI SE MANTIENE GOOGLE DOCS: QUÉ FORMATO AGREGAR
    Google Docs API permite:
      - Negritas, itálicas, subrayado.
      - Tamaños de fuente.
      - Colores de texto y fondo.
      - Tablas (insertTable + insertText en celdas).
      - Alineación.
      - Saltos de página.
      - insertInlineImage para imágenes.

    Se puede lograr un diseño decente con estas herramientas.

4.3 SI SE MIGRA A HTML→PDF: QUÉ SERVICIO USAR
    Opciones:
      - PDFMonkey: servicio SaaS, plantillas HTML/CSS, API simple.
      - DocRaptor: servicio SaaS, HTML/CSS, buena calidad.
      - Puppeteer: autohospedado, requiere servidor (no es viable en
        n8n Cloud sin un servicio externo).
      - wkhtmltopdf: autohospedado, similar a Puppeteer.

    Si es n8n Cloud, lo más práctico es un servicio SaaS (PDFMonkey o
    DocRaptor).

4.4 SECCIONES DEL INFORME (ESTRUCTURA)
    Mantener la estructura actual:
      1. Encabezado (título + fecha).
      2. Datos del paciente.
      3. Profesional actuante (si Sprint 7).
      4. Constantes fisiológicas.
      5. Resumen de anamnesis.
      6. Ecocardiografía: valores medidos.
      7. Ecocardiografía: índices / calculados.
      8. Scores / clasificación.
      9. Electrocardiograma (si Sprint 10).
      10. Diagnóstico.
      11. Indicaciones.
      12. Firma del profesional (si Sprint 7).
      13. Pie de página.

4.5 ELEMENTOS VISUALES
    Definir:
      - Logo de la clínica (si aplica).
      - Colores corporativos.
      - Tipografía.
      - Estilo de tablas.
      - Separadores entre secciones.

4.6 PREVIEW EN EL SPA (OPCIONES)
    ¿El SPA muestra un preview del informe antes de enviar? Opciones:
      - No: el informe se ve solo después de generado.
      - Sí: el SPA renderiza un preview HTML antes de enviar.
      - Parcial: el SPA muestra un resumen textual, no el PDF.

    Recomendación: opción "no" o "parcial". El preview completo agrega
    complejidad.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 DECIDIR GOOGLE DOCS VS HTML→PDF
    Punto 4.1. Decisión principal del sprint.

5.2 SI GOOGLE DOCS: DEFINIR FORMATO
    Punto 4.2. Qué elementos visuales agregar.

5.3 SI HTML→PDF: ELEGIR SERVICIO
    Punto 4.3. PDFMonkey, DocRaptor, u otro.

5.4 DEFINIR ESTRUCTURA DE SECCIONES
    Punto 4.4. Confirmar el orden y los títulos.

5.5 DEFINIR ELEMENTOS VISUALES
    Punto 4.5. Logo, colores, tipografía, tablas.

5.6 DEFINIR SI HAY PREVIEW EN EL SPA
    Punto 4.6.

5.7 EVALUAR IMPACTO EN EL WORKFLOW B
    Si es HTML→PDF, hay que eliminar 3-4 nodos (Crear Google Doc,
    Insertar contenido, Exportar PDF, Eliminar Google Doc) y agregar
    el nodo de render. Esto es un cambio arquitectónico grande.

5.8 EVALUAR INTEGRACIÓN CON SPRINT 7 (FIRMA)
    Si Sprint 7 está implementado, el rediseño incluye la firma del
    profesional como imagen.

5.9 EVALUAR INTEGRACIÓN CON SPRINT 10 (ECG)
    Si Sprint 10 está implementado, el rediseño incluye la sección ECG.

5.10 EVALUAR INTEGRACIÓN CON SPRINT 11 (IMÁGENES JPG)
     Si Sprint 11 está implementado, el rediseño incluye las imágenes
     del pendrive.

5.11 DEFINIR MANEJO DE SECCIONES VACÍAS
     La regla de oro ("no medido = no aparece") se mantiene. El rediseño
     debe ocultar secciones vacías.

5.12 EVALUAR TIEMPO DE GENERACIÓN
     Si el rediseño agrega imágenes o tablas complejas, el PDF puede
     tardar más. ¿Es aceptable?


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Se mantiene Google Docs o se migra a HTML→PDF?

  [ ] 6.2 Si se mantiene Google Docs, ¿qué elementos visuales se agregan
          (negritas, tablas, colores, alineación)?

  [ ] 6.3 Si se migra a HTML→PDF, ¿qué servicio se usa (PDFMonkey,
          DocRaptor, otro)?

  [ ] 6.4 ¿Cuál es la estructura final de secciones del informe?

  [ ] 6.5 ¿Hay logo de la clínica? ¿Dónde se almacena?

  [ ] 6.6 ¿Hay colores corporativos definidos?

  [ ] 6.7 ¿Hay tipografía específica?

  [ ] 6.8 ¿El SPA muestra preview del informe antes de enviar?

  [ ] 6.9 ¿El rediseño incluye firma del profesional (Sprint 7)?

  [ ] 6.10 ¿El rediseño incluye sección ECG (Sprint 10)?

  [ ] 6.11 ¿El rediseño incluye imágenes del pendrive (Sprint 11)?

  [ ] 6.12 ¿Cómo se manejan las secciones vacías?

  [ ] 6.13 ¿Hay límite de tiempo de generación del PDF?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Ninguna crítica.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Sprint 7 (Identificación): si el rediseño incluye firma del
    profesional.
  - Sprint 10 (ECG): si el rediseño incluye sección ECG.
  - Sprint 11 (JPGs): si el rediseño incluye imágenes del pendrive.

DEPENDENCIAS EXTERNAS:
  - Si se migra a HTML→PDF: servicio externo (PDFMonkey, DocRaptor,
    etc.) o servidor propio.
  - Si se mantiene Google Docs: Google Docs API (ya en uso).

NOTA: este sprint es el más dependiente de otros sprints. Conviene
implementarlo después de que los sprints 7, 10 y 11 estén cerrados,
para que el rediseño incluya todo lo nuevo.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El informe tiene maquetación moderna (según lo definido en 6.1).
  [ ] La estructura de secciones está completa y ordenada.
  [ ] Los elementos visuales definidos están implementados.
  [ ] Las secciones vacías se ocultan correctamente.
  [ ] Si Sprint 7 está implementado, la firma aparece en el informe.
  [ ] Si Sprint 10 está implementado, la sección ECG aparece.
  [ ] Si Sprint 11 está implementado, las imágenes aparecen.
  [ ] El PDF se genera correctamente.
  [ ] El mail al tutor adjunta el PDF rediseñado.
  [ ] El flujo completo (SPA → n8n → PDF → mail) funciona end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Si se migró a HTML→PDF, los nodos viejos de Google Docs se
      eliminaron correctamente.
  [ ] Si hay preview en el SPA, funciona.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
la opción arquitectónica.

SI SE MANTIENE GOOGLE DOCS (opción a):

  PROMPT 1 — DISEÑO DEL FORMATO
    - Definir estructura visual (colores, tipografía, tablas).
    - Diseñar el batchUpdate de Google Docs API.

  PROMPT 2 — MODIFICAR Preparar Datos para PDF
    - Adaptar el doc_content al nuevo formato.
    - Convertir texto plano a requests de Docs API.

  PROMPT 3 — MODIFICAR Insertar contenido en Doc
    - Enviar batchUpdate con múltiples requests.

  PROMPT 4 — VERIFICACIÓN Y AJUSTES
    - Pruebas de generación.
    - Ajuste de diseño.

SI SE MIGRA A HTML→PDF (opción b):

  PROMPT 1 — ELECCIÓN E INTEGRACIÓN DEL SERVICIO
    - Configurar PDFMonkey / DocRaptor / etc.
    - Agregar credencial en n8n.

  PROMPT 2 — DISEÑO DE PLANTILLA HTML/CSS
    - Crear plantilla HTML con CSS.
    - Definir variables dinámicas.

  PROMPT 3 — MODIFICAR Preparar Datos para PDF
    - Generar datos para la plantilla (JSON).

  PROMPT 4 — REEMPLAZAR NODOS DE GOOGLE DOCS
    - Eliminar Crear Google Doc, Insertar contenido, Exportar PDF,
      Eliminar Google Doc.
    - Agregar nodo de render HTML→PDF.
    - Ajustar conexiones.

  PROMPT 5 — VERIFICACIÓN Y AJUSTES
    - Pruebas de generación.
    - Ajuste de diseño.

Cada prompt sigue el formato CABLEAR estándar.

NOTA: si se elige HTML→PDF, este sprint cambia 4-5 nodos del Workflow B
(elimina 4, agrega 1, modifica 1). Es un cambio arquitectónico grande
que conviene hacer con backup y verificación exhaustiva.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 13 decisiones a cerrar identificadas.
  - Dependencia con Sprint 7, 10 y 11 (si esos sprints se implementan
    antes).
  - Es el sprint con más impacto arquitectónico potencial.
  - Recomendación: mantener Google Docs con formato mejorado como
    primera iteración, migrar a HTML→PDF como iteración futura.


================================================================================
FIN DEL SPRINT 14
================================================================================