# Propuesta de Implementación — Modelo Elástico V3.5
## Respuesta técnica al INFORME_CODE V3.5 (Alineación Arquitectónica Global)

**Fecha:** 2026-07-19
**Alcance:** Responde puntualmente a los dos entregables pedidos en el informe recibido — (1) validar el modelo de datos elástico con `<datalist>` dinámicos para la SPA local, (2) diseñar los payloads JSON hacia n8n separando informe de señales de actualización de listas. Complementa, no reemplaza, `INFORME-ARQUITECTURA-MYVETE-V2.7.md` y `CONTRATO-DE-DATOS-V2.7.md`: el flujo de ventana flotante, handshake y contrato de filiación/medicación siguen vigentes tal cual están. Lo que cambia acá es específicamente el mecanismo de precarga de vocabulario clínico (Sección 2.2 y 2.3 del informe V2.7, bloque "Consulta de hoy") y el canal de aprendizaje hacia Google Sheets.

---

## 0. Punto de partida — qué hay hoy y qué queda dado de baja

Revisé `interface/app.js` (líneas 262-356) e `interface/index.html` (líneas 125-134). Hoy existe:

- Un `<select id="control-perfil-clinico">` con 4 opciones fijas (`sano`, `acvim_b1`, `acvim_b2`, `personalizado`).
- Un diccionario `PERFILES_CLINICOS` hardcodeado en `app.js` que, al elegir una opción, vuelca de una sola vez 6 campos (`fc`, `fr`, `mucosas`, `anamnesis`, `diagnostico`, `indicaciones`).
- Un `<select id="clinica-mucosas">` con 4 opciones clínicas fijas.

Esto es exactamente lo que el informe pide dar de baja: perfiles estáticos incrustados en código. Confirmo la baja y explico abajo qué lo reemplaza — pero señalo una diferencia de fondo entre dos cosas que hoy están mezcladas en `PERFILES_CLINICOS` y que conviene separar:

1. **Vocabulario de campo individual** ("Mucosas: rosadas y húmedas", "Veterinario derivante: Dra. Pérez") — esto es lo que el patrón `<datalist>` resuelve directamente.
2. **Plantilla de caso completo** (volcar 6 campos a la vez para "Sano"/"ACVIM B1"/"ACVIM B2") — esto es un atajo de velocidad de tipeo, no vocabulario. `<datalist>` no lo reemplaza uno a uno: un datalist sugiere valores para *un* campo, no arma seis de golpe.

Dejo esto como decisión a confirmar en la Sección 5 en vez de asumir una respuesta, porque cambia el alcance de la implementación.

---

## 1. Modelo de datos elástico — clasificación de campos

No todos los campos deben volverse `<datalist>`. Clasifico los campos existentes según si tienen universo cerrado real o vocabulario clínico abierto:

| Campo | Tipo hoy | Propuesta | Motivo |
|---|---|---|---|
| `paciente-especie` | `<select>` (canino/felino) | Se mantiene `<select>` | Universo real y verdaderamente cerrado — no hay tercera especie válida que un médico necesite tipear |
| `clinica-mucosas` | `<select>` (4 opciones) | → `<input list>` + `<datalist>` | El informe da el ejemplo textual ("Mucosas: Rosadas y húmedas") — la clínica real combina matices que un select fijo no cubre |
| `paciente-raza` | `<input text>` libre, sin sugerencias | → `<input list>` + `<datalist>` | Ya es texto libre; agregarle sugerencias no le quita nada, solo acelera tipeo repetido |
| Veterinario derivante | **No existe todavía como campo** | Nuevo `<input list>` + `<datalist>` | El informe lo cita como ejemplo explícito del ciclo de aprendizaje — hay que agregarlo al formulario |
| `estado` de cada fármaco (continua/nueva/modificada/suspendida) | Interno, fijado por lógica de botones | Sin cambios | No lo tipea el médico; lo resuelve la interacción con Editar/Suspender (`app.js:77-140`) — no es candidato a datalist |
| `anamnesis` / `diagnostico` / `indicaciones` | `<textarea>` de texto libre y largo | Ver Sección 5, pregunta abierta | Son párrafos, no un valor corto — el patrón datalist calza mal ahí tal cual está hoy |

### 1.1 Patrón de implementación

Reemplazo del select rígido por el patrón híbrido:

```html
<label class="campo-label">
  Mucosas
  <input type="text" id="clinica-mucosas" class="input-control" list="sugerencias-mucosas" autocomplete="off" />
  <datalist id="sugerencias-mucosas"></datalist>
</label>
```

El `<datalist>` nace **vacío** en el HTML estático — se hidrata en runtime desde `app.js` con la respuesta de n8n (Sección 2). Esto es lo que hace el modelo "elástico": el HTML no fija valores posibles, solo declara el punto de enganche (el `id` del datalist).

Estructura cliente en `app.js`:

```js
const MAPEO_CAMPOS_SUGERENCIA = Object.freeze({
  "clinica-mucosas": "mucosas",
  "paciente-raza": "raza",
  "consulta-veterinario-derivante": "veterinarioDerivante",
  // agregar una fila acá es todo lo que pide una columna nueva de vocabulario
});

function hidratarDatalist(campoId, columna, valores) {
  const datalist = document.getElementById(`sugerencias-${campoId}`);
  datalist.innerHTML = "";
  valores.forEach((valor) => {
    const option = document.createElement("option");
    option.value = valor;
    datalist.appendChild(option);
  });
}
```

`MAPEO_CAMPOS_SUGERENCIA` es la única lista que hay que tocar para dar de alta un campo nuevo con sugerencias — nunca la lógica de hidratación ni el contrato con n8n. Esto es lo que responde al punto de "Abstracción de Columnas" del informe: si mañana aparece una columna nueva en Sheets pero nadie la mapea a un campo del formulario, simplemente no se usa — no rompe nada, no requiere código defensivo.

---

## 2. Contrato de lectura (n8n → SPA) — hidratación de datalists

Nuevo intercambio, distinto del ya definido en `CONTRATO-DE-DATOS-V2.7.md` Sección 2 (que es de escritura). Ocurre una vez, al abrir el panel, en paralelo a la consulta de historial de medicación ya prevista (`INFORME-ARQUITECTURA-MYVETE-V2.7.md`, Sección 3.2 punto 3).

**Request:** `GET` (o `POST` vacío, según predilección del webhook) sin body relevante — no depende del paciente, es vocabulario compartido por los 8 profesionales, no por caso.

**Response:**

```json
{
  "sugerencias": {
    "mucosas": ["Rosadas y húmedas", "Pálidas", "Congestivas", "Cianóticas"],
    "raza": ["Boxer", "Caniche Toy", "Mestizo", "Bulldog Francés"],
    "veterinarioDerivante": ["Dra. Pérez", "Dr. Gómez"]
  }
}
```

**Reglas:**
- Las claves de `sugerencias` son nombres de columna de Google Sheets, no ids de campo HTML — el mapeo entre ambos vive únicamente en `MAPEO_CAMPOS_SUGERENCIA` (Sección 1.1), nunca en el contrato de red. Esto es lo que permite que agregar una columna en Sheets no obligue a tocar el payload.
- Una columna ausente en la respuesta (porque todavía no tiene ningún valor cargado en Sheets) se trata igual que un array vacío `[]`: el campo funciona en modo texto libre puro, sin sugerencias, nunca como error.
- Esta consulta no bloquea el renderizado del formulario: si tarda o falla, los campos quedan operativos como texto libre sin sugerencias — el datalist vacío no es un estado roto, es el estado inicial legítimo (misma filosofía de tolerancia que la Sección 4.2 del informe V2.7 para historial vacío).

---

## 3. Contrato de escritura — separación en dos payloads

El informe pide explícitamente separar la carga útil del informe de las señales de actualización de listas. Van como **dos llamadas independientes**, no dos bloques de un mismo JSON, por una razón operativa: no tiene que fallar el envío del informe clínico (acción crítica, bloqueante, con feedback visual al médico) si falla la actualización de vocabulario (acción secundaria, no bloqueante, sin feedback visual). Son dos webhooks de n8n distintos.

### 3.1 Payload A — Informe clínico (ya definido, con una regla nueva)

Mantiene la forma de `CONTRATO-DE-DATOS-V2.7.md` Sección 2, con la regla de **omisión de vacíos** (punto C del informe) aplicada al armado del payload, no solo al renderizado final:

```js
function consolidarPayloadFinal() {
  const payload = {
    meta: { /* ... como ya está definido ... */ },
    tutor: obtenerPayloadFiliacion().tutor,
    mascota: obtenerPayloadFiliacion().mascota,
    consulta: omitirVacios(obtenerPayloadConsulta()),
    tratamientoCronico: obtenerPayloadMedicacion(),
  };
  return payload;
}

function omitirVacios(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== "" && valor !== null && valor !== undefined)
  );
}
```

Por qué a nivel de payload y no solo en el motor de PDF: si n8n/el motor de reporte reciben la clave presente pero vacía (`"indicaciones": ""`), tienen que reimplementar la misma regla de omisión del lado del backend. Si la clave directamente no viaja cuando está vacía, el motor de PDF solo necesita iterar `Object.keys(payload.consulta)` y renderizar lo que encuentra — la omisión ya está resuelta en la frontera, una sola vez, del lado que tiene la información más fresca (el formulario en el instante del submit).

**Nota:** esto es compatible con las reglas de obligatoriedad ya fijadas en `CONTRATO-DE-DATOS-V2.7.md` (`tutor.nombre` y `mascota.nombre` siguen siendo obligatorios, no se les aplica `omitirVacios` — el validador de envío ya se los exige antes de llegar acá).

### 3.2 Payload B — Actualización de listas (nuevo)

Se dispara en el mismo evento de submit, pero como llamada aparte, fire-and-forget (no bloquea el flujo de confirmación del informe ni su UI):

```json
{
  "actualizaciones": [
    { "columna": "veterinarioDerivante", "valor": "Dra. Insaurralde" },
    { "columna": "mucosas", "valor": "Rosadas, TLLC prolongado" }
  ]
}
```

**Lógica de detección en el cliente** (se resuelve comparando contra el mismo objeto de sugerencias ya hidratado en memoria, sin llamadas extra):

```js
function detectarValoresNuevos(sugerenciasActuales) {
  const actualizaciones = [];
  Object.entries(MAPEO_CAMPOS_SUGERENCIA).forEach(([campoId, columna]) => {
    const campo = document.getElementById(campoId);
    if (!campo) return;
    const valor = campo.value.trim();
    const yaExiste = (sugerenciasActuales[columna] || [])
      .some((v) => v.toLowerCase() === valor.toLowerCase());
    if (valor && !yaExiste) {
      actualizaciones.push({ columna, valor });
    }
  });
  return actualizaciones;
}
```

**Reglas:**
- La comparación es case-insensitive para evitar duplicados triviales ("Boxer" vs "boxer"), pero se envía el valor tal cual lo tipeó el médico (respeta mayúsculas reales de nombres propios).
- La deduplicación definitiva (por si dos médicos escriben el mismo valor nuevo en paralelo antes de que el Sheet se actualice) es responsabilidad del nodo de n8n que escribe en Sheets, no del cliente — el cliente solo evita el caso obvio (valor ya sugerido). Esto es coherente con "Aprendizaje y Persistencia Evolutiva": la concurrencia de 8 profesionales la arbitra el backend, no cada pestaña aislada.
- Si este POST falla, no se reintenta ni se le avisa al médico — es aprendizaje incremental, no un dato clínico; perder una sugerencia nueva no es una falla del sistema.

---

## 4. Estructura propuesta en Google Sheets

Una hoja `Sugerencias` con una columna por campo mapeado (encabezado = nombre de columna usado en los contratos de la Sección 2 y 3.2):

| mucosas | raza | veterinarioDerivante |
|---|---|---|
| Rosadas y húmedas | Boxer | Dra. Pérez |
| Pálidas | Mestizo | Dr. Gómez |
| ... | ... | ... |

El nodo de lectura en n8n arma el JSON de la Sección 2 leyendo cada columna y filtrando celdas vacías (una columna puede tener menos valores cargados que otra — es tabla irregular por diseño, no un error). El nodo de escritura (Sección 3.2) hace un append a la columna correspondiente solo si el valor no está ya presente (case-insensitive), que es donde vive la deduplicación real mencionada arriba.

---

## 5. Decisiones a confirmar antes de programar

Marco estas tres porque cambian el alcance de lo que hay que tocar en `index.html`/`app.js`, y prefiero no asumir la respuesta:

1. **¿Qué reemplaza al atajo de plantilla completa (`PERFILES_CLINICOS`)?** Hoy un clic vuelca 6 campos de golpe para "Sano"/"ACVIM B1"/"ACVIM B2". El patrón datalist no cubre eso — sugiere valor por campo, no arma un caso completo. ¿Se conserva un botón de "aplicar plantilla" (ahora alimentado por una hoja `Plantillas` en Sheets en vez de estar incrustado en código), o se abandona ese atajo y cada campo se completa por separado con sus sugerencias?
2. **¿La anamnesis se descompone en campos discretos?** El informe da como ejemplo "Sensorio: Excitación" — hoy eso es una frase suelta dentro del `<textarea>` de anamnesis, no un campo propio. Si el datalist tiene que sugerir "Sensorio", hace falta partir la anamnesis en sub-campos (Sensorio, Hidratación, TLLC, Auscultación cardíaca, Auscultación pulmonar...), cada uno con su propio `<input list>`, y volver a unirlos en texto al armar el payload. Es un cambio de estructura del formulario, no solo del mecanismo de sugerencias — confirmar si entra en esta etapa o es un paso posterior.
3. **¿Entran en esta etapa los parámetros ecocardiográficos (SIVd y similares)?** El informe los menciona en el punto de renderizado elástico, pero no existen todavía como bloque en `index.html` (hoy solo hay FC/FR/Mucosas). Si es así, conviene tratarlos aparte: son numéricos con unidades fijas (mm, %), no vocabulario de texto — no son candidatos a `<datalist>`, sino al patrón de omisión de vacíos de la Sección 3.1 puro.

---

## 6. Herramientas y dependencias necesarias

- Ninguna librería nueva del lado del cliente: `<datalist>` es HTML nativo, sin dependencias.
- Del lado de n8n: dos webhooks nuevos (lectura de sugerencias, escritura de actualizaciones) más el ya previsto para el informe — ninguno requiere nodos fuera de lo ya usado (Google Sheets, HTTP).
- Ninguna credencial nueva: reutiliza la conexión a Google Sheets ya prevista para el historial de medicación.

No voy a tocar `app.js`/`index.html` todavía — quedo a la espera de la confirmación de los tres puntos de la Sección 5, porque de ahí depende si el cambio es "reemplazar 3 selects por datalists" o si además hay que rediseñar la sección de anamnesis y agregar un bloque ecocardiográfico nuevo.
