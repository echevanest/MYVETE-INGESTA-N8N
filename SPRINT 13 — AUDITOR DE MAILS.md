================================================================================
SPRINT 13 — AUDITOR DE MAILS
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

Monitorear los correos entrantes de los tutores tras la entrega del
informe cardiológico. Clasificar automáticamente:

  a) Confirmaciones simples (ej: "muchas gracias", "recibido") para
     limpiarlas/archivarlas de la bandeja de entrada.
  b) Mails con dudas, consultas o seguimiento clínico que requieran
     respuesta, para notificar o marcar.

El objetivo es liberar tiempo administrativo: los mails triviales se
archivan solos, los importantes se destacan.


================================================================================
2. ESTADO ACTUAL
================================================================================

QUÉ EXISTE HOY:
  - El sistema envía mails al tutor con el informe adjunto (nodo Enviar
    informe al tutor del Workflow B).
  - Los tutores responden a esos mails.
  - Hoy esas respuestas caen en la bandeja de entrada de
    infoacivet@gmail.com sin clasificación.
  - No hay monitoreo automático de respuestas.
  - No hay clasificación por IA ni por reglas.
  - No hay archivo automático de confirmaciones.

QUÉ NO EXISTE:
  - Workflow n8n que monitoree la bandeja de entrada.
  - Clasificador de mails (confirmación vs consulta).
  - Acción automática (archivar, etiquetar, notificar).
  - Logs de clasificación.


================================================================================
3. COMPONENTES AFECTADOS
================================================================================

  - n8n:
      * Workflow C (nuevo) o nodos dentro del Workflow B.
      * Trigger de Gmail (Gmail Trigger node) para monitorear la
        bandeja de entrada.
      * Nodo de clasificación (IA o reglas).
      * Nodos de acción (archivar, etiquetar, notificar).

  - Gmail API:
      * Credencial Gmail account INFOACIVET (eMVAugCGSCpQrcEj) o una
        nueva.
      * Permisos para leer, archivar, etiquetar.

  - OpenAI (si la clasificación es con IA):
      * Credencial LChLJhcSz4xuxdIF (ya existente).
      * Modelo GPT-4.1-mini o similar.

  - Supabase (opcional, para logs):
      * Tabla nueva: logs_mails (o similar).
      * Registro de clasificaciones.

  - SPA: no afectado directamente.

  - MyVete: no afectado.


================================================================================
4. ARQUITECTURA DEFINIDA
================================================================================

No hay arquitectura cerrada para este sprint. Las decisiones se toman
al inicio del sprint. Hay consideraciones importantes:

4.1 WORKFLOW SEPARADO VS NODOS EN B (OPCIONES)
    a) Workflow C separado en n8n, con su propio trigger (Gmail Trigger)
       y su propia lógica.
    b) Nodos agregados al Workflow B (pero el B tiene un trigger de
       webhook, no de Gmail; habría que agregar un segundo trigger).

    Recomendación: opción a (Workflow C separado). Es más limpio, no
    mezcla responsabilidades, y el Workflow B queda intacto.

4.2 CLASIFICACIÓN: REGLAS VS IA VS HÍBRIDA (OPCIONES)
    a) Reglas simples: si el mail contiene "gracias" o "recibido" →
       archivar. Si contiene "?" o "consulta" → notificar.
    b) IA: llamar a GPT-4.1-mini para clasificar cada mail.
    c) Híbrida: reglas para casos obvios, IA para casos ambiguos.

    Recomendación: opción c. Las reglas resuelven el 80% de los casos
    (confirmaciones simples), la IA se reserva para los ambiguos.

4.3 TRIGGER DE GMAIL (OPCIONES)
    a) Gmail Trigger de n8n: se dispara cuando llega un mail nuevo.
    b) Polling periódico: consultar cada X minutos.
    c) Webhook de Gmail (Pub/Sub): requiere configuración de Google
       Cloud.

    Recomendación: opción a (Gmail Trigger). Es el mecanismo nativo de
    n8n.

4.4 ACCIONES SEGÚN CLASIFICACIÓN (OPCIONES)
    a) Confirmación → archivar (quitar de INBOX).
    b) Consulta → etiquetar como "requiere respuesta" y notificar a
       infoacivet.
    c) Ambiguo → etiquetar como "revisar manualmente".

4.5 DESTINATARIOS DE LA NOTIFICACIÓN (OPCIONES)
    a) Solo a infoacivet@gmail.com.
    b) A infoacivet + echevanest.
    c) Configurable.

4.6 LOGS (OPCIONES)
    a) Supabase: tabla logs_mails.
    b) Sheets: hoja nueva.
    c) Sin logs, solo acción.

    Recomendación: opción a o b. Tener un registro de qué se clasificó
    y por qué.

4.7 FILTRADO DE MAILS (OPCIONES)
    ¿El auditor monitorea TODOS los mails entrantes o solo los que son
    respuestas a informes enviados?
    a) Todos los entrantes: simple, pero clasifica mails no relacionados.
    b) Solo respuestas a informes: requiere identificar el hilo del mail
       original.

    Recomendación: opción b si es viable (identificar el hilo). Si no,
    opción a.

4.8 RIESGO DE FALSOS POSITIVOS/NEGATIVOS
    La clasificación automática puede equivocarse:
      - Confirmación clasificada como consulta → notificación innecesaria.
      - Consulta clasificada como confirmación → mail archivado por error.

    Mitigación: no borrar mails, solo archivar. El tutor o el vet pueden
    recuperarlos si hace falta.

4.9 NOMBRE DEL WORKFLOW C
    Sugerencia: "MYVETE - Auditor de Mails".


================================================================================
5. PUNTOS A TRABAJAR
================================================================================

5.1 DEFINIR ALCANCE DEL MONITOREO
    Punto 4.7. ¿Todos los mails entrantes o solo respuestas a informes?

5.2 DEFINIR CLASIFICACIÓN
    Punto 4.2. Reglas, IA, o híbrida.

5.3 DEFINIR ACCIONES
    Punto 4.4. Qué se hace según la clasificación.

5.4 DEFINIR TRIGGER
    Punto 4.3. Gmail Trigger, polling, o webhook.

5.5 DEFINIR NOTIFICACIONES
    Punto 4.5. A quién se notifica cuando un mail requiere respuesta.

5.6 DEFINIR LOGS
    Punto 4.6. Supabase, Sheets, o sin logs.

5.7 DEFINIR CREDENCIALES
    ¿Usa la misma credencial Gmail INFOACIVET (eMVAugCGSCpQrcEj) o una
    nueva? Verificar permisos (lectura, archivar, etiquetar).

5.8 DEFINIR ETIQUETAS DE GMAIL
    ¿Hay etiquetas existentes ("requiere respuesta", "archivado") o hay
    que crearlas?

5.9 EVALUAR RIESGO DE FALSOS POSITIVOS
    Punto 4.8. ¿Cómo se mitiga?

5.10 EVALUAR INTEGRACIÓN CON EL WORKFLOW B
     ¿El auditor necesita saber que un mail es respuesta a un informe
     enviado? Si sí, ¿cómo se identifica el hilo? (Asunto con ID, header
     References, etc.)


================================================================================
6. DECISIONES A CERRAR AL INICIO DEL SPRINT
================================================================================

Antes de tocar código, responder:

  [ ] 6.1 ¿El auditor es un workflow separado (Workflow C) o nodos en
          el Workflow B?

  [ ] 6.2 ¿La clasificación es con reglas, IA, o híbrida?

  [ ] 6.3 ¿El trigger es Gmail Trigger, polling, o webhook?

  [ ] 6.4 ¿Qué acciones se toman según la clasificación?

  [ ] 6.5 ¿A quién se notifica cuando un mail requiere respuesta?

  [ ] 6.6 ¿Hay logs? ¿En Supabase, Sheets, o ninguno?

  [ ] 6.7 ¿El auditor monitorea todos los mails entrantes o solo
          respuestas a informes enviados?

  [ ] 6.8 ¿Usa la credencial Gmail INFOACIVET existente o una nueva?

  [ ] 6.9 ¿Hay etiquetas de Gmail predefinidas? ¿Cuáles?

  [ ] 6.10 ¿Cómo se mitigan los falsos positivos/negativos?

  [ ] 6.11 ¿El auditor identifica el hilo del mail original (para saber
           que es respuesta a un informe)?


================================================================================
7. DEPENDENCIAS
================================================================================

DEPENDENCIAS ENTRANTES (otros sprints que necesitan este):
  - Ninguna crítica.

DEPENDENCIAS SALIENTES (este sprint necesita de otros):
  - Ninguna crítica. Es autocontenido.

DEPENDENCIAS EXTERNAS:
  - Gmail API: permisos de lectura, archivar, etiquetar.
  - OpenAI (si usa IA): credencial existente.
  - Supabase (si usa logs): tabla nueva.

NOTA: este es el sprint más autocontenido de todos. No depende de otros
sprints, no toca el SPA, no toca Supabase (a menos que se decida usar
logs ahí).


================================================================================
8. CRITERIO DE ACEPTACIÓN
================================================================================

El sprint se considera cerrado cuando:

  [ ] El Workflow C (o los nodos en B) está activo en n8n.
  [ ] El trigger de Gmail monitorea la bandeja de entrada.
  [ ] Los mails se clasifican automáticamente (confirmación vs consulta).
  [ ] Las confirmaciones se archivan automáticamente.
  [ ] Las consultas se etiquetan y notifican.
  [ ] Los ambiguos se marcan para revisión manual.
  [ ] (Si aplica) Los logs quedan registrados.
  [ ] El flujo completo (llega mail → clasifica → actúa) funciona
      end-to-end.

CRITERIO DE ACEPTACIÓN ADICIONAL (si aplica):
  [ ] Los falsos positivos/negativos no causan pérdida de mails (solo
      archivo, no borrado).
  [ ] Las notificaciones llegan correctamente.


================================================================================
9. PLAN DE IMPLEMENTACIÓN (A ALTO NIVEL)
================================================================================

El sprint se divide en prompts a Claude Code, cantidad a definir según
el alcance.

PROMPTS POSIBLES (a confirmar al inicio del sprint):

  PROMPT 1 — CREACIÓN DEL WORKFLOW C
    - Crear workflow nuevo en n8n.
    - Agregar Gmail Trigger.
    - Definir filtros iniciales.

  PROMPT 2 — CLASIFICADOR (REGLAS O IA)
    - Implementar reglas (si aplica).
    - O configurar nodo de OpenAI para clasificación (si aplica).
    - Definir output (confirmación / consulta / ambiguo).

  PROMPT 3 — ACCIONES
    - Nodo de archivar (Gmail).
    - Nodo de etiquetar (Gmail).
    - Nodo de notificar (Gmail).

  PROMPT 4 — LOGS (SI APLICA)
    - Tabla en Supabase o hoja en Sheets.
    - Registro de clasificaciones.

  PROMPT 5 — VERIFICACIÓN Y AJUSTES
    - Pruebas con mails reales.
    - Ajuste de reglas o umbrales.
    - Activar el workflow.

Cada prompt sigue el formato CABLEAR estándar.

NOTA: este sprint no toca el SPA ni el Workflow B. Es completamente
independiente y puede implementarse en paralelo a otros sprints.


================================================================================
10. REGISTRO DE CAMBIOS
================================================================================

Versión 1.0 — 2026-09-15
  - Creación del documento.
  - No hay arquitectura cerrada: se listan opciones y se marcan
    decisiones a cerrar al inicio del sprint.
  - 11 decisiones a cerrar identificadas.
  - Sin dependencias críticas con otros sprints.
  - Este sprint es autocontenido: no toca SPA ni Workflow B.
  - Sugerencia: Workflow C separado, clasificación híbrida (reglas + IA),
    Gmail Trigger, logs en Supabase o Sheets.


================================================================================
FIN DEL SPRINT 13
================================================================================