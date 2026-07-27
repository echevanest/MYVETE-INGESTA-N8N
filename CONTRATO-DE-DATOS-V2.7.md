# Contrato de Datos — MyVete v2.7
## Frontera JSON entre Bookmarklet, Ventana Flotante y n8n

**Fecha:** 2026-07-15
**Alcance:** Especificación conceptual de los esquemas JSON que cruzan cada frontera del sistema. No incluye código de scraping, de red ni de manejo del DOM — solo la forma que deben tener los datos al cruzar cada límite. Complementa a `INFORME-ARQUITECTURA-MYVETE-V2.7.md` (Secciones 2.3 y 3.1-3.2), sin redefinir las decisiones ya tomadas ahí.

---

## 0. Nota técnica previa — mecanismo de transporte del Payload de Apertura

El pedido original planteaba pasar el payload de apertura "mediante almacenamiento temporal rápido antes del postMessage inicial" (`localStorage`/`sessionStorage`). Corresponde señalar una restricción del navegador que condiciona el diseño de este contrato:

**`localStorage` y `sessionStorage` están aislados por origen.** El Bookmarklet corre inyectado en el origen de MyVete; la ventana flotante navega a un origen propio (el dominio donde se aloje `/interface`). Son dos orígenes distintos, y el navegador no comparte almacenamiento entre ellos aunque estén abiertos en el mismo perfil — un `sessionStorage.setItem()` hecho por el Bookmarklet es invisible para la ventana flotante. Este canal queda descartado como mecanismo de transporte del payload de apertura.

Quedan dos canales viables, y se propone usar ambos, cada uno para lo que sabe hacer bien:

| Canal | Qué transporta | Por qué |
|---|---|---|
| **Query params de la URL** (`window.open(url + "?...")`) | Únicamente el **ID de paciente** | Es el único dato que la ventana flotante necesita *antes* de poder hacer nada (consultar historial en n8n, Sección 3.2 punto 3). Debe estar disponible en el instante en que el documento carga, sin esperar a un segundo mensaje. Al ser un solo identificador corto, no genera riesgo de exceder límites de longitud de URL ni de exponer datos clínicos o personales en el historial de navegación. |
| **`postMessage` de apertura** (opener → ventana nueva, inmediatamente después de `window.open()`) | El resto del **Payload de Apertura**: datos de filiación raspados (tutor, mascota) | Evita exponer nombre, teléfono o e-mail del tutor en la URL / historial del navegador / logs de proxy — que sí sería el caso si todo el payload viajara por query params. Requiere un pequeño protocolo de sincronización (ver 0.1), porque la ventana nueva puede no estar lista para recibir mensajes en el instante exacto en que se abre. |

### 0.1 Protocolo de sincronización mínimo
Para que el `postMessage` de apertura no se pierda por una condición de carrera (la ventana flotante todavía no cargó su listener cuando el opener ya intentó enviar el mensaje), el intercambio debe resolverse como un **handshake de dos pasos**, no como un envío unidireccional a ciegas:

1. La ventana flotante, al terminar de cargar, emite un mensaje corto de "lista" (`postMessage` hacia `window.opener`).
2. Recién al recibir ese mensaje de "lista", el Bookmarklet responde con el Payload de Apertura completo (Sección 1).

Este handshake es responsabilidad conjunta de `launcher.js` (emisor del payload, paso 2) y de `app.js` (emisor de la señal de "lista" y receptor del payload, paso 3) — se documenta acá porque define la forma del contrato, no la implementación.

---

## 1. Contrato de Entrada (Bookmarklet ➡️ Ventana Flotante)

### 1.1 Vía query param (disponible al cargar, sin esperar handshake)

| Campo | Tipo | Obligatorio | Fuente |
|---|---|---|---|
| `idPaciente` | string | Sí | Extraído de `window.location.href` en la pestaña de MyVete |

Es el único dato que viaja por este canal. Todo lo demás espera al handshake de la Sección 0.1.

### 1.2 Vía `postMessage` de apertura (Payload de Apertura)

```json
{
  "meta": {
    "idPaciente": "string",
    "origenUrl": "string — URL completa de la pestaña de MyVete al momento del clic",
    "timestampApertura": "string ISO-8601"
  },
  "tutor": {
    "nombre": "string | null",
    "telefono": "string | null",
    "email": "string | null"
  },
  "mascota": {
    "nombre": "string | null",
    "especie": "string | null",
    "raza": "string | null",
    "pesoActual": "number | null"
  }
}
```

**Reglas de obligatoriedad y tolerancia:**
- `meta.idPaciente` es el único campo verdaderamente obligatorio de todo el payload de apertura — sin él, la ventana flotante no tiene forma de consultar historial (Sección 3.2, punto 3) ni de saber qué registro completar. Su ausencia debe tratarse como error duro, no como campo nulo tolerado.
- `meta.origenUrl` se transporta porque es el dato que permite, más adelante, validar que el `postMessage` de retorno (Sección 3.2, punto 5) se dirija de vuelta a la pestaña correcta y no a una pestaña de MyVete distinta que el médico haya abierto en paralelo.
- Todo el resto (`tutor.*`, `mascota.*`) se trata como **raspado de mejor esfuerzo**: si el DOM de MyVete no expone un campo en el momento del clic (por ejemplo, un tutor sin teléfono cargado), ese campo viaja como `null`, nunca como cadena vacía ambigua ni como propiedad ausente del objeto — la ventana flotante debe poder distinguir "no había dato" de "el campo no vino". Esto es la misma lógica de tolerancia ya establecida para historial vacío en la Sección 4.2 del informe de arquitectura, aplicada ahora a datos filiales incompletos.
- Este payload es explícitamente **provisorio**: la ventana flotante lo usa solo como base inicial hasta que la consulta a n8n (Sección 3.2, punto 3) devuelva, si existe, una versión más confiable de los mismos datos de filiación proveniente del historial. El payload de apertura no se escribe nunca directamente en el formulario sin pasar por esa posible actualización.

---

## 2. Contrato de Salida (Ventana Flotante ➡️ n8n Webhook)

```json
{
  "meta": {
    "idPaciente": "string",
    "timestampEnvio": "string ISO-8601",
    "historialEncontrado": "boolean",
    "bloqueFiliacionEditado": "boolean",
    "bloqueMedicacionEditado": "boolean"
  },
  "tutor": {
    "nombre": "string",
    "telefono": "string | null",
    "email": "string | null"
  },
  "mascota": {
    "nombre": "string",
    "especie": "string | null",
    "raza": "string | null",
    "peso": "number | null"
  },
  "consulta": {
    "anamnesis": "string",
    "diagnostico": "string",
    "indicaciones": "string"
  },
  "tratamientoCronico": [
    {
      "medicamento": "string",
      "dosis": "string",
      "frecuencia": "string",
      "estado": "continua | nueva | modificada | suspendida"
    }
  ]
}
```

### 2.1 Racional por bloque

**`meta`** — no es un bloque clínico, es el bloque de auditoría del propio envío:
- `historialEncontrado` distingue explícitamente el caso "paciente nuevo" (Sección 4.2 del informe) de "paciente recurrente sin cambios". Es información que n8n necesita para decidir si está creando el primer registro de control o agregando uno a una serie existente — no debería tener que inferirlo comparando contra la hoja de cálculo.
- `bloqueFiliacionEditado` / `bloqueMedicacionEditado` son booleanos derivados directamente de si el médico tocó el botón "Editar" de cada bloque (Sección 2.2 del informe). Se incluyen porque son gratis de capturar en la interfaz y valiosos para el registro de control: permiten, por ejemplo, detectar con qué frecuencia se editan datos de contacto sin tener que diffear texto contra el envío anterior.

**`tutor` / `mascota`** — mantienen exactamente los mismos nombres de campo que el Payload de Apertura (Sección 1.2), con una diferencia deliberada de obligatoriedad: acá `tutor.nombre` y `mascota.nombre` pasan a ser **obligatorios** (ya no `| null`), porque en el momento del envío el formulario ya tuvo la oportunidad de completarlos —vía precarga confirmada o vía edición manual— y no corresponde que n8n reciba un registro sin nombre de tutor o de mascota. La simetría de nombres entre ambos contratos es intencional: simplifica el código que arma el payload de salida, que en el caso general (sin ediciones) es prácticamente una copia del payload de apertura ya resuelto.

**`consulta`** — el bloque de texto clínico propiamente dicho. Se separa en tres campos (`anamnesis`, `diagnostico`, `indicaciones`) en lugar de un único bloque de texto libre, siguiendo el pedido explícito de simetría del punto 3 de la instrucción. Cualquiera de los tres puede llegar vacío si el formulario no distingue esas subsecciones en su primera versión — pero la estructura del contrato ya los deja separados para no forzar un cambio de esquema cuando la interfaz sí los distinga.

**`tratamientoCronico`** — un arreglo, no un objeto único, porque un paciente puede tener múltiples fármacos activos simultáneamente. Cada entrada lleva:
- `medicamento`, `dosis`, `frecuencia`: los tres datos clínicos mínimos, simétricos a los pedidos en el punto 4 de la instrucción.
- `estado`: el campo que reemplaza directamente al mecanismo descartado en la Sección 2.1 del informe de arquitectura (la vieja inferencia de continuidad por IA). Acá el estado no lo decide un modelo de lenguaje interpretando texto ambiguo — lo decide el médico al interactuar con el bloque de medicación (Sección 2.2), y viaja ya resuelto:
  - `continua`: fila precargada del historial, sin edición.
  - `nueva`: fila agregada en esta consulta, sin antecedente en el historial recuperado.
  - `modificada`: fila que existía en el historial pero cuya dosis o frecuencia se editó hoy.
  - `suspendida`: fila que existía en el historial y el médico eliminó/marcó como cortada en esta consulta.

### 2.2 Decisión a validar — tratamiento de las filas `suspendida`
Hay dos formas de tratar un fármaco que el médico corta en esta consulta:
1. **Omitirlo del arreglo** (como se hacía, con matices, en el modelo de IA descartado): el tratamiento cortado simplemente no aparece más en `tratamientoCronico`.
2. **Incluirlo explícitamente con `estado: "suspendida"`** (lo que propone este contrato): la fila queda, pero marcada.

Se propone la opción 2 porque preserva trazabilidad clínica real: le permite a n8n registrar en la hoja de control que en la fecha de hoy se decidió cortar tal droga —dato con valor legal/clínico propio (por ejemplo, ante una consulta futura de "¿cuándo se suspendió tal tratamiento?")— en vez de que esa información desaparezca silenciosamente entre una consulta y la siguiente. Si se prefiere la opción 1 por simplicidad de payload, es un cambio de una sola línea en este contrato, pero se señala como punto a confirmar antes de que `app.js` empiece a construir el arreglo.

---

## 3. Relación con el contrato de retorno (no redefinido acá)

El intercambio n8n ➡️ ventana flotante ➡️ MyVete (el "Resumen Clínico Compacto" del punto 4-5 de la Sección 3.2 del informe) ya está especificado ahí como un string simple, no como JSON estructurado — se mantiene así: es el único tramo del flujo donde el dato que cruza la frontera es directamente el texto final a insertar en la evolución de MyVete, sin necesidad de un esquema adicional.

---

## 4. Contrato pendiente de definir (fuera de alcance de este documento)

Existe un tercer cruce de frontera no cubierto acá: la consulta que la ventana flotante le hace a n8n para recuperar el historial de tratamiento (Sección 3.2, punto 3, antes de que el médico vea el formulario). Ese es un intercambio de **lectura** (petición con `idPaciente`, respuesta con el último tratamiento conocido o vacío), distinto en forma y en momento del contrato de salida definido en la Sección 2 de este documento. Se deja señalado como el siguiente contrato a especificar, no se define ahora para no mezclar en un mismo documento dos intercambios con semánticas distintas (uno de lectura, uno de escritura).
