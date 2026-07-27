# Informe de Arquitectura Lógica — MyVete v2.7
## Reestructuración: Precarga Interactiva + Interfaz Paralela Desacoplada

**Fecha:** 2026-07-15
**Alcance:** Diseño lógico y de configuración exclusivamente. No incluye código funcional, funciones ejecutables ni estructuras de persistencia fijas (nombres de archivo, columnas de base de datos). Documenta especificación de flujos y protocolos de comunicación para que la implementación técnica posterior sea limpia y autónoma.

---

## 0. Nota de versión — Purga de contexto heredado

Este informe reemplaza la lógica de decisión y las secciones 3 y 4 de la versión anterior del documento. Se abandona el paradigma de **inferencia semántica de continuidad a nivel de backend** (deducción asíncrona de fármacos basada en texto libre, resuelta unilateralmente por el nodo de IA en n8n) en favor de un paradigma de **autorización explícita del operador**: el médico valida en pantalla, antes del envío, qué continúa, qué cambia y qué se suspende. La IA deja de decidir sobre continuidad clínica y pasa a un rol de estructuración de texto ya validado por el humano.

Como consecuencia directa de este cambio de paradigma, el mecanismo de captura también se rediseña: se abandona el patrón de "Bookmarklet dispara un POST silencioso y muestra un aviso flotante de éxito/error" (antigua Sección 4) en favor de una **ventana flotante interactiva** que presenta el formulario editable, gestiona el intercambio síncrono con n8n y devuelve el resultado a la pestaña de origen mediante comunicación inter-ventanas. El ciclo de confirmación visual queda absorbido dentro de este nuevo flujo (ver Sección 5.2, paso 5) y no como un aviso aparte.

No se heredan nombres de columnas, hojas de cálculo ni convenciones de payload de versiones anteriores: cualquier coincidencia de nombres en ejemplos de este informe es ilustrativa, no una decisión de esquema.

---

## 1. Reglas Generales y Filosofía del Diseño

### 1.1 Independencia de la SPA
"MyVete" es una Single Page Application (SPA) ajena y de terceros. El diseño no debe:
- Inyectar interfaces intrusivas dentro de su DOM gestionado (formularios, paneles, overlays persistentes montados dentro del árbol de componentes de la SPA).
- Depender de una extensión de Chrome compleja que requiera mantenimiento constante ante cambios de versión, build o framework de la plataforma de terceros.

La superficie de contacto con MyVete debe reducirse al mínimo indispensable: lectura puntual de datos visibles en pantalla y, al final del ciclo, la escritura de un único bloque de texto en un campo existente del formulario nativo de MyVete (ver 1.2 y 5.2, paso 5).

### 1.2 Flujo Inverso de Datos
El origen de la carga clínica es un formulario externo (la ventana flotante descrita en la Sección 5), no la SPA. El recorrido de la información es:

1. **Entrada:** el formulario externo (precargado + editado por el médico) envía el payload a n8n.
2. **Procesamiento:** n8n genera el informe clínico final, lo envía por correo al tutor de la mascota y registra el resultado en una hoja de cálculo de control y comparación.
3. **Retorno:** n8n devuelve a la ventana flotante un resumen estructurado y compacto de la consulta.
4. **Reinyección:** ese resumen se inyecta de regreso en la historia clínica de MyVete, dentro del campo de evolución del paciente, mediante el mecanismo descrito en la Sección 5.

El dato no viaja en una sola dirección hacia el backend: hay un tramo final donde el resultado procesado por n8n vuelve a la SPA, lo cual condiciona el diseño de la Sección 5 (comunicación inter-ventanas bidireccional, no un simple disparo de captura).

### 1.3 Simetría de Interacción (Edición por Excepción)
Todos los componentes de la interfaz de carga —tanto los datos de filiación (tutor/mascota) como los fármacos crónicos— se precargan de forma **pasiva y bloqueada**. El principio operativo es: el médico solo interviene si detecta un cambio; en ausencia de acción, el sistema asume continuidad total.

Esto es deliberado y tiene un objetivo de tiempo de consulta: minimizar los clics necesarios en el caso general (paciente recurrente sin cambios), reservando el esfuerzo de edición exclusivamente para las excepciones reales (cambio de teléfono del tutor, ajuste de dosis, suspensión de un fármaco). Esta regla de simetría es el principio que gobierna el diseño de estados descrito en la Sección 3.2.

---

## 2. SECCIÓN 3 — Paradigma de Precarga Interactiva y Flujo Clínico

### 2.1 Redefinición del Principio de Operación
Se descarta la inferencia semántica de continuidad a nivel de backend en n8n: ya no existe un nodo de IA que deduzca de forma asíncrona, a partir de texto libre, qué fármacos continúan y cuáles se suspenden. El sistema opera bajo el principio de **"Precarga Eficiente con Autorización Explícita del Operador"**: el médico valida la continuidad, modificación o suspensión directamente en el formulario interactivo en pantalla, **antes** de que el payload salga hacia n8n.

Esto traslada la decisión clínica de un modelo de lenguaje interpretando texto ambiguo a un humano interactuando con estados explícitos de una interfaz — eliminando la clase de riesgo que motivaba la "regla de decisión temporal" de la versión anterior del informe (arrastre erróneo de una droga suspendida por inferencia incorrecta).

### 2.2 Estados del Formulario (Sencillez de un Clic)
La interfaz del formulario externo maneja dos estados nativos por cada sección de información, pensados para velocidad de uso en el consultorio:

| Bloque de Datos | Comportamiento por Defecto (Sin Clic) | Acción al Activar "Editar" |
|---|---|---|
| **Filiación (Tutor/Mascota)** | Muestra los datos precargados. Campos bloqueados en modo lectura para evitar errores de tipeo accidentales. | Habilita los inputs para actualizar datos de contacto modificados en tiempo real (ej. cambio de e-mail o teléfono del propietario). |
| **Clínica (Medicamentos)** | Precarga el tratamiento exacto de la consulta anterior recuperado desde la fuente de historial. Se asume continuidad automática sin necesidad de clics. | Permite modificar dosis/intervalos de drogas activas, agregar nuevos fármacos o eliminar un renglón por suspensión de tratamiento. |

Cada bloque es independiente en su estado: el médico puede editar filiación sin tocar medicación, y viceversa. El estado "bloqueado" no es de solo lectura absoluto — es un estado de confianza en la continuidad, reversible con un clic, no una restricción de permisos.

### 2.3 Contrato de Datos de Entrada (Payload Hacia n8n)
El formulario de la interfaz empaqueta y envía a n8n un JSON **completamente resuelto, limpio y estructurado** — es decir, ya libre de ambigüedad sobre continuidad o suspensión, porque esa resolución ya ocurrió en pantalla por decisión del médico. Esto libera a n8n de tener que realizar deducciones lógicas complejas sobre texto libre; el rol de n8n pasa a ser de estructuración y distribución (generar el informe, enviar el mail, escribir el registro de control), no de arbitraje clínico.

El contrato debe incluir, como mínimo conceptual (sin fijar nombres de campo definitivos):
- Identificador del paciente.
- Datos de filiación vigentes al momento del envío (editados o confirmados sin cambios).
- Texto clínico de la consulta de hoy.
- Listado definitivo de fármacos ya validado por el médico, con su estado resultante de la interacción en pantalla (continúa / nuevo / modificado / suspendido), sin que n8n deba volver a inferir esa clasificación desde texto.

---

## 3. SECCIÓN 5 — Arquitectura de la Interfaz Paralela (Chrome Window)

### 3.1 El Mecanismo de Desacoplamiento (Bookmarklet + Pop-up HTML)
Para garantizar inmunidad ante futuras actualizaciones visuales o internas de MyVete, la interacción en el navegador se resuelve mediante comunicación inter-ventanas nativa, no mediante inyección de interfaz dentro del DOM de la SPA:

```
[ Pestaña MyVete (SPA) ]
        │
        ▼ (1) Clic en Bookmarklet
[ Inyección de Script ] ──(2) window.open()──► [ Ventana Flotante (Bot HTML) ]
        │                                              │
        │                                              │ (3) Obtiene historial,
        │                                              │     ofrece UI editable,
        │                                              │     despacha flujo a n8n
        │                                              ▼
[ Escucha postMessage ] ◄──(4) window.opener.postMessage() ─┘
        │
        ▼ (5) Inyección síncrona
[ Pegado en Evolución ]
```

Este mecanismo mantiene a MyVete y a la ventana flotante como dos documentos completamente independientes en el navegador, que solo intercambian datos por los dos canales nativos previstos para ese propósito: `window.open()` para el despliegue inicial (con datos pasados en la URL o en el estado de apertura) y `postMessage()` para el retorno del resultado. Ningún script queda montado dentro del ciclo de render de la SPA de forma persistente.

### 3.2 Ciclo de Vida de la Interacción Técnica

1. **Activación y Raspado de Entrada.** El médico presiona el Bookmarklet en su barra de marcadores de Chrome mientras está en la pestaña activa de MyVete. El script síncrono extrae el ID del paciente desde la URL activa y raspa los datos filiales visibles en pantalla, en esta primera instancia como fuente primaria de esos datos.

2. **Despliegue del Panel Externo.** El script abre una ventana emergente controlada (estilo barra lateral flotante) apuntando a la interfaz HTML del bot de trabajo, pasándole el ID del paciente y los datos filiales recién raspados.

3. **Consolidación en la Interfaz Flotante.** La ventana emergente consulta a n8n Cloud para recuperar el tratamiento de la última sesión registrada (si existe). Renderiza el formulario ya con la precarga descrita en la Sección 2.2 y los controles de edición listos. Si el paciente es recurrente, la fuente de historial actúa como caché más rápida y confiable para precargar también los datos filiales, sin necesidad de depender exclusivamente de lo raspado en el paso 1.

4. **Generación de Documentos y Retorno de n8n.** Al enviar la información (payload descrito en la Sección 2.3), n8n procesa el registro histórico, distribuye el e-mail al tutor con el informe adjunto y responde de forma síncrona con un string: el "Resumen Clínico Compacto" de la consulta.

5. **Confirmación y Volcado Seguro (postMessage).**
   - La ventana flotante presenta al médico una vista previa **editable** de ese resumen clínico generado — el ciclo no se cierra automáticamente ni de forma silenciosa; el punto de confirmación visual del ciclo completo (que en el diseño anterior era un aviso flotante aparte) queda absorbido aquí.
   - Al confirmar, la ventana flotante envía el texto finalizado a la pestaña de origen mediante `postMessage`.
   - El script que quedó escuchando en segundo plano en la pestaña de MyVete recibe el string, localiza el elemento de evolución médica en el DOM, inyecta el valor y dispara de forma obligatoria un evento de interacción física (`input` o `change`, con burbujeo activo) para que el framework de la SPA registre el cambio en su estado interno y habilite sus propios controles nativos de guardado (ver Sección 4.3 para el porqué de este requisito).

---

## 4. MATRIZ DE RIESGOS Y CONTROL DE DAÑOS COLATERALES ("EL BOSQUE")

### 4.1 Bloqueadores de Ventanas Emergentes
Chrome puede interpretar la apertura de la ventana flotante (paso 2 de la Sección 3.2) como actividad no deseada y bloquearla, especialmente si el `window.open()` no ocurre en respuesta directa y síncrona al clic del médico sobre el Bookmarklet.

- **Mitigación de diseño:** el `window.open()` debe dispararse dentro del mismo hilo de ejecución del evento de clic, sin pasos asíncronos intermedios (llamadas de red, `await`, temporizadores) entre el clic y la apertura — cualquier demora ahí es lo que típicamente convierte una apertura legítima en una bloqueada por el navegador.
- **Punto a documentar para el usuario:** se debe instruir al médico para habilitar, por única vez, la excepción de pop-ups en el dominio donde corre MyVete. Esta es una acción manual inevitable, y corresponde señalarla explícitamente como paso de configuración inicial, no como parte del flujo recurrente de uso.

### 4.2 Tolerancia a Pacientes Nuevos (Historial Vacío)
Si la consulta a la fuente de historial (paso 3 de la Sección 3.2) devuelve un resultado nulo — primera consulta de un paciente dentro del ecosistema —, la interfaz flotante debe interceptar ese estado vacío de forma segura, sin romper el ciclo de vida del formulario.

- El bloque de fármacos debe inicializarse **vacío**, no en estado de error ni con placeholders que simulen datos inexistentes.
- El bloque de datos filiales debe inicializarse con lo raspado directamente de MyVete en el paso 1, ya que es la única fuente disponible en ausencia de historial previo.
- Esta condición no debe generar excepciones de referencia (acceso a campos de un registro inexistente) en ningún punto del renderizado del formulario; el estado "sin historial" es un estado válido y esperado del sistema, no un caso de error.

### 4.3 Eventos de Ciclo de Vida de Frameworks SPA (React/Angular/Vue)
Asignar directamente un valor a un campo de texto mediante manipulación del DOM (por ejemplo, fijar `.value` de un `textarea`) suele ser **ignorado** por frameworks modernos de frontend, porque estos mantienen su propio estado interno desacoplado del DOM real y no lo sincronizan a partir de mutaciones externas silenciosas.

- La especificación contempla que el Bookmarklet, en el paso 5 de la Sección 3.2, dispare manualmente un evento nativo (`input`/`change`) con la propiedad de propagación hacia arriba (`bubbles: true`) inmediatamente después de asignar el valor, para que la SPA reconozca la inyección como una interacción legítima del usuario.
- Sin este paso, el texto puede aparecer visualmente en pantalla pero la SPA no lo reconoce como un cambio de estado válido — el botón de guardado nativo de MyVete permanecería deshabilitado o el valor se perdería al siguiente ciclo de render, produciendo una falla silenciosa: el médico cree que el dato quedó cargado, pero nunca se persistió del lado de MyVete.

---

## Preguntas abiertas para la siguiente iteración (no bloquean este informe)

1. ¿Qué mecanismo de recuperación corresponde si `postMessage` no llega a destino (por ejemplo, la pestaña de MyVete se cerró o navegó a otra URL mientras la ventana flotante seguía abierta)?
2. ¿Cuántas consultas previas conviene traer como historial de referencia al precargar el bloque de medicación (Sección 2.2): solo la última, o un histórico acotado?
3. ¿Cómo se le informa al médico, dentro de la propia ventana flotante, si la reinyección del paso 5 (Sección 3.2) no logró disparar correctamente el evento nativo de la SPA y el texto no llegó a registrarse?
4. Persistencia temporal del payload editado dentro de la ventana flotante ante un cierre accidental antes de confirmar el envío — ¿se resguarda localmente para poder retomar la carga, o se pierde y obliga a reabrir el Bookmarklet?
