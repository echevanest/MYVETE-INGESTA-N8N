================================================================================
SPRINT 12 — COMPLETAR HISTORIA CLÍNICA EN MYVETE
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

Volcar un resumen clínico del informe cardiológico en la historia clínica
del paciente dentro de MyVete. Cada atención en MyVete deja un registro;
el objetivo es que ese registro incluya lo más importante del informe
generado por el SPA.

MyVete no tiene API. La vía principal es scraping del DOM (extender el
bookmarklet para escribir). La vía secundaria es un botón "Copiar" en el
SPA para pegado manual.

CONTENIDO DEL RESUMEN (sugerencia definida en sesión 2026-09-15):
  1. FC (frecuencia cardíaca)
  2. Soplo
  3. Resumen de respiración
  4. Síntomas clínicos relatados por el tutor
  5. Resumen de la estructura cardíaca (ej: "ecoestructura conservada",
     "dilatación atrial severa", "disfunción sistólica")
  6. Diagnóstico electrocardiográfico
  7. Indicaciones terapéuticas
  8. Próximo control


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El bookmarklet lee datos de filiación de MyVete (tutor + mascota) y
    los pasa al SPA. Es unidireccional: MyVete → SPA.
  - El SPA genera el informe y lo envía a n8n.
  - El SPA muestra el borrador de IA.
  - El SPA tiene un postMessage MYVETE_SUBMIT_OK que se dispara
    automáticamente tras el envío (no cuando el médico confirma).

QUÉ NO EXISTE:
  - Vía de escritura del SPA → MyVete.
  - Resumen clínico generado a partir del informe.
  - Botón "Copiar" en el SPA para pegar manualmente en MyVete.
  - Extensión del bookmarklet para escribir en el DOM de MyVete.

CAMPOS DEL RESUMEN QUE YA EXISTEN EN EL SPA:
  - FC: existe (constantes fisiológicas).
  - Indicaciones terapéuticas: existe (indicaciones).
  - Síntomas relatados por el tutor: están dentro de la anamnesis cruda
    (no estructurados).
  - Resumen de estructura cardíaca: no existe como campo, es una
    interpretación clínica de los datos de eco.
  - Diagnóstico electrocardiográfico: depende del Sprint 10 (ECG).

CAMPOS QUE HAY QUE AGREGAR AL SPA:
  - Soplo (no existe como campo estructurado).
  - Resumen de respiración (existe FR numérico, falta descripción).
  - Próximo control (no existe como campo).


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - SPA:
      * Agregar campos faltantes (soplo, descripción respiratoria,
        próximo control) si no existen.
      * Lógica de generación del resumen clínico (IA, reglas, o híbrido).
      * UI de botón "Copiar resumen".
      * Preview del resumen antes de copiar/volcar.

  - Bookmarklet (extensión):
      * Lógica de escritura en el DOM de MyVete.
      * Detección del campo de historia clínica del paciente.
      * Inyección del resumen en el campo correspondiente.
      * Manejo de errores (si el DOM no está disponible).

  - n8n (posiblemente):
      * Si el resumen se genera del lado del servidor (IA en n8n en lugar
        de en el SPA), el workflow B agrega un nodo nuevo.
      * Alternativa: el resumen se genera en el SPA con la misma IA que
        ya se usa en n8n (llamada directa a OpenAI desde el SPA, poco
        recomendado por exposición de API key).

  - MyVete (externo):
      * Sin API. El acceso es por DOM.
      * El bookmarklet debe conocer el campo donde volcar el resumen.


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

4.1 VÍA PRINCIPAL: SCRAPING DEL DOM
    MyVete no tiene API. La vía principal es extender el bookmarklet
    para que, además de leer filiación, pueda escribir el resumen en el
    campo de historia clínica del paciente.

    El bookmarklet actual ya conoce la estructura de la página de MyVete
    (porque lee filiación). Reutiliza ese conocimiento para escribir.

    RIESGO: si MyVete cambia el DOM, el bookmarklet se rompe. Hay que
    monitorear cambios y tener un fallback.

4.2 VÍA SECUNDARIA: BOTÓN "COPIAR" EN EL SPA
    Si el scraping del DOM falla, el SPA muestra el resumen con un botón
    "Copiar". El veterinario lo pega manualmente en MyVete.

    Esta vía es un fallback, no la principal. Pero es más robusta
    (no depende del DOM de MyVete).

4.3 CONTENIDO DEL RESUMEN (8 VARIABLES)
    Definido en sesión 2026-09-15:
      1. FC
      2. Soplo
      3. Resumen de respiración
      4. Síntomas clínicos relatados por el tutor
      5. Resumen de la estructura cardíaca
      6. Diagnóstico electrocardiográfico
      7. Indicaciones terapéuticas
      8. Próximo control

4.4 GENERACIÓN DEL RESUMEN (OPCIONES)
    Tres enfoques:
      a) IA genera todo el resumen a partir de los datos del caso
         (constantes + eco + EKG + anamnesis + indicaciones). Un solo
         llamado a GPT-4.1-mini. Más flexible, menos determinístico.
      b) Plantilla de reglas clínicas (ej: "si AI/Ao > 1.5 → dilatación
         atrial"). Determinístico, auditable, pero requiere definir
         todas las reglas.
      c) Híbrido: variables numéricas se toman directo (FC), texto libre
         del vet se preserva (indicaciones, próximo control),
         interpretaciones se generan con IA (estructura cardíaca).

    Recomendación: opción c (híbrido).

4.5 MOMENTO DEL VOLCADO (OPCIONES)
    a) Automático tras el envío a n8n (junto con MYVETE_SUBMIT_OK).
    b) Manual: el veterinario hace click en "Volcar a MyVete" después
       de revisar el borrador.
    c) Híbrido: el veterinario revisa el borrador y confirma.

    Recomendación: opción c. El veterinario debe revisar antes de volcar.

4.6 ADJUNTAR EL PDF A MYVETE (OPCIONES)
    MyVete sin API probablemente no permita adjuntar archivos por
    scraping sin acceso al filesystem del navegador. Opciones:
      a) Solo el resumen de texto se vuelca.
      b) Se intenta subir el PDF (complejo, frágil).
      c) El PDF se envía al tutor por mail (ya se hace) y queda en Drive.

    Recomendación: opción a o c. No intentar subir el PDF a MyVete por
    scraping.

4.7 DEPENDENCIAS CON OTROS SPRINTS
    - Sprint 7 (Identificación): opcional. Si el resumen incluye el
      nombre del profesional, depende del Sprint 7.
    - Sprint 10 (ECG): necesario para el campo "diagnóstico
      electrocardiográfico".
    - Sprint 8 (Autofill y Plantillas): el resumen podría guardarse como
      plantilla reutilizable.


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 CONOCER EL DOM DE MYVETE
    Antes de implementar, inspeccionar el DOM de MyVete para saber:
      - ¿Dónde está el campo de historia clínica del paciente?
      - ¿Es un textarea, un div contenteditable, un campo de formulario?
      - ¿Hay validación al escribir?
      - ¿Se puede inyectar texto con JS sin romper la página?

5.2 DEFINIR CÓMO SE GENERA EL RESUMEN
    Punto 4.4. IA, reglas, o híbrido. Decisión de arquitectura.

5.3 AGREGAR CAMPOS FALTANTES AL SPA
    Soplo, descripción respiratoria, próximo control. ¿Dónde? ¿En qué
    sección del formulario?

5.4 DEFINIR LA UX DE VOLCADO
    Punto 4.5. Automático, manual, o híbrido.

5.5 DEFINIR LA UX DEL BOTÓN "COPIAR"
    Si el scraping falla, ¿cómo se muestra el botón? ¿Cómo se decide
    cuándo usarlo?

5.6 EXTENDER EL BOOKMARKLET
    Agregar lógica de escritura al bookmarklet actual (que hoy solo lee).

5.7 DEFINIR EL FORMATO DEL RESUMEN
    ¿Es un texto plano? ¿Con formato (negritas, saltos)? ¿Con
    etiquetas de campo ("FC: 120 lpm")?

5.8 EVALUAR INTEGRACIÓN CON LA IA
    Si el resumen se genera con IA, ¿se llama a GPT-4.1-mini desde el
    SPA o desde n8n? ¿Cuándo?

5.9 DEFINIR MANEJO DE ERRORES
    ¿Qué pasa si el DOM de MyVete no está disponible? ¿Si el campo de
    historia clínica no existe? ¿Si el veterinario no revisó el
    borrador?

5.10 EVALUAR SI EL RESUMEN SE GUARDA COMO PLANTILLA (SPRINT 8)
     Si un resumen se usa seguido, ¿se guarda como plantilla
     reutilizable?


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿Cómo se accede al DOM de MyVete? ¿El bookmarklet ya conoce el
          campo de historia clínica?

  [ ] 6.2 ¿Cómo se genera el resumen? IA, reglas, o híbrido.

  [ ] 6.3 ¿Qué campos faltan en el SPA (soplo, descripción respiratoria,
          próximo control)?

  [ ] 6.4 ¿Cuándo se dispara el volcado? Automático, manual, o híbrido.

  [ ] 6.5 ¿Cómo se ve el botón "Copiar" y cuándo se muestra?

  [ ] 6.6 ¿Qué formato tiene el resumen? Texto plano, con etiquetas, con
          formato.

  [ ] 6.7 ¿El PDF se adjunta a MyVete, o solo el resumen de texto?

  [ ] 6.8 ¿El resumen incluye el nombre del profesional (Sprint 7)?

  [ ] 6.9 ¿Qué pasa si el DOM de MyVete no está disponible? ¿Fallback
          automático al botón "Copiar"?

  [ ] 6.10 ¿El resumen se guarda como plantilla reutilizable (Sprint 8)?

  [ ] 6.11 ¿El diagnóstico electrocardiográfico depende del Sprint 10?
           ¿Se implementa este sprint antes o después del 10?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Ninguna crítica.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Sprint 10 (ECG): necesario para el campo "diagnóstico
    electrocardiográfico" del resumen.
  - Sprint 7 (Identificación): opcional, si el resumen incluye el
    nombre del profesional.
  - Sprint 8 (Autofill): opcional, si el resumen se guarda como
    plantilla.

DEPENDENCIAS EXTERNAS:
  - MyVete: capacidad de recibir escritura por scraping del DOM. Si no
    es viable, el sprint se limita a la vía secundaria (botón copiar).
  - Estabilidad del DOM de MyVete: si MyVete cambia, el bookmarklet
    se rompe.

NOTA: este sprint es el que más depende de factores externos. Conviene
evaluar su viabilidad técnica al inicio antes de comprometer esfuerzo.


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El SPA tiene los campos faltantes (soplo, descripción respiratoria,
      próximo control).
  [ ] El SPA genera el resumen clínico con las 8 variables.
  [ ] El bookmarklet puede escribir el resumen en el DOM de MyVete.
  [ ] El veterinario puede revisar el resumen antes de volcarlo.
  [ ] El volcado a MyVete funciona (si el DOM está disponible).
  [ ] El botón "Copiar" funciona como fallback.
  [ ] El resumen aparece en la historia clínica del paciente en MyVete.
  [ ] El flujo completo (generar resumen → revisar → volcar) funciona
      end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Si el DOM de MyVete no está disponible, el fallback funciona.
  [ ] Si el resumen se guarda como plantilla, se puede reutilizar.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — INSPECCIÓN DEL DOM DE MYVETE
    - Documentar el campo de historia clínica.
    - Analizar cómo se inyecta texto sin romper la página.
    - No es código, es análisis previo.

  PROMPT 2 — CAMPOS FALTANTES EN EL SPA
    - Agregar soplo, descripción respiratoria, próximo control.
    - Definir ubicación en el formulario.

  PROMPT 3 — GENERACIÓN DEL RESUMEN
    - Lógica de generación (IA, reglas, o híbrido).
    - Formato del resumen.

  PROMPT 4 — UI DE REVISIÓN Y VOLCADO
    - Preview del resumen.
    - Botón "Volcar a MyVete" (vía principal).
    - Botón "Copiar" (fallback).

  PROMPT 5 — EXTENSIÓN DEL BOOKMARKLET
    - Lógica de escritura en el DOM de MyVete.
    - Manejo de errores.

  PROMPT 6 — INTEGRACIÓN CON n8n (SI APLICA)
    - Si el resumen se genera en el servidor, agregar nodo.

Cada prompt sigue el formato CABLEAR estándar.

NOTA: la viabilidad de este sprint depende de la inspección del DOM de
MyVete (Prompt 1). Si no se puede escribir, el sprint se limita a la
vía secundaria.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 11 decisiones a cerrar identificadas.
  - Sprint 10 (ECG) es dependencia para el diagnóstico electrocardiográfico.
  - Sprint 7 (Identificación) opcional.
  - Dependencia externa crítica: DOM de MyVete.


================================================================================
FIN DEL SPRINT 12
================================================================================