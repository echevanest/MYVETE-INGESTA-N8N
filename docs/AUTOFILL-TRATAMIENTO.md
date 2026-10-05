# Autofill del tratamiento crónico — plan (sin ejecutar)

**Actualización 2026-10-05 (8.7p): la Fase 1 está implementada, sin E2E.**
La columna `medicacion` existe (`jsonb`, admite NULL, sin default: así la pidió
Marcelo; el plan de abajo decía `not null default '[]'`), `Insert Atención
Cardiología` la guarda y el informe tiene la sección TRATAMIENTO después de
INDICACIONES, con el estado de cada fármaco (Continúa / Nueva / Modificada).
Las Fases 2 y 3 se definen en 8.1. La tabla de "Estado actual" de abajo es la
del 2026-10-01.

Preparado el 2026-10-01. **Nada de esto estaba implementado.** Es el plan para
que, al abrir el panel sobre un paciente con consultas previas, el bloque
"Tratamiento crónico" llegue precargado con lo que quedó vigente en la última.

## 1. Estado actual (verificado el 2026-10-01)

| Pieza | Estado |
|---|---|
| UI del bloque (`index.html`, `app.js` §3) | Existe y funciona: filas con medicamento, dosis, intervalo y estado (`continua` / `nueva` / `modificada`). Un fármaco cortado se elimina de la lista (✕) y no viaja en el payload (8.7e). `crearFilaMedicamento()` ya acepta una fila `continua` con datos. |
| Payload | `payload.medicacion` viaja en cada envío: `[{ medicamento, dosis, frecuencia, estado }]`. |
| n8n (`lkOwTFmVTZu7EMoU`) | **Ningún nodo lee `medicacion`.** Se descarta. |
| Supabase | **No hay columna** para el tratamiento en `atenciones_cardiologia` ni en otra tabla. |
| Informe PDF | **No muestra** el tratamiento. |
| Lectura de la última consulta | No existe. `app.js` §10 ya reserva `window.historialUltimaConsulta` (hoy siempre `null`) para ACVIM / MINE 2 / HP, a la espera de "un webhook nuevo de n8n". |

Conclusión: **hoy no hay de dónde precargar.** El tratamiento que el
profesional carga no se guarda en ningún lado. Antes del autofill hay que
persistirlo (Fase 1).

## 2. Diseño

Vía n8n, con un solo webhook de lectura que sirve también al historial de
clasificaciones que 8.7b dejó previsto.

```
SPA (recibe la filiación)  ──POST──▶  n8n "MYVETE - Última consulta"
        ▲                                   │  service_role
        │                                   ▼
        └──── { medicacion, acvim…, fecha } ◀── Supabase: última atención de esa mascota
```

### Fase 1 — Guardar el tratamiento (requisito)

1. **Supabase (DDL, por la API de administración con OK previo; ver
   `SUPABASE-DDL.md`):**

   ```sql
   alter table public.atenciones_cardiologia
     add column medicacion jsonb not null default '[]'::jsonb;
   ```

   Un arreglo JSON por atención, con la misma forma del payload. Se descarta
   una tabla aparte de medicamentos: el tratamiento se lee y se escribe
   siempre entero, junto con la atención, y no hay consultas por fármaco.

2. **n8n — `Insert Atención Cardiología`:** sumar
   `medicacion: (Array.isArray(body.medicacion) ? body.medicacion : []).filter(m => m && String(m.medicamento || '').trim() !== '')`
   (las filas sin nombre de fármaco no se guardan).

3. **n8n — `Preparar Datos para PDF`:** sección nueva **TRATAMIENTO**, una
   línea por fármaco (`Pimobendan - 0,25 mg/kg - c/12 h`), con la marca
   `(nuevo)` o `(modificado)` cuando no es `continua`.
   Ubicación propuesta: después de INDICACIONES. *A confirmar por Marcelo.*

El orden importa: primero la columna, después el nodo (si el nodo manda una
clave sin columna, el insert de la atención falla).

### Fase 2 — Webhook de lectura

Workflow **nuevo** `MYVETE - Última consulta` (no se toca el de ingesta):

- **Entrada:** `POST /webhook/ultima-consulta` con
  `{ id_myvete, mascota_nombre }` — las mismas claves con las que el workflow
  de ingesta hace los upserts (`tutores.id_myvete`; `mascotas (tutor_id, nombre)`).
- **Consulta (service_role):** la atención más reciente de esa mascota.
- **Salida:**

  ```json
  {
    "encontrada": true,
    "fecha": "2026-09-30",
    "medicacion": [{ "medicamento": "Pimobendan", "dosis": "0,25 mg/kg", "frecuencia": "c/12 h" }],
    "acvim_estadio": "B2", "mine2_puntaje": 6, "mine2_clasificacion": "moderado",
    "hp_clasificacion": null
  }
  ```

  - `medicacion` sale **sin `estado`** (las eliminadas nunca se guardaron): lo
    que quedó vigente pasa a ser `continua` en la consulta nueva.
  - Sin atención previa: `{ "encontrada": false }` (HTTP 200).
- **Solo lectura.** Nunca escribe.

### Fase 3 — SPA

En `app.js`, al terminar `aplicarFiliacion()` (ahí ya están el `idTutor` y el
nombre de la mascota):

1. `POST` al webhook, una sola vez por paciente (guardar la clave
   `id_myvete + nombre` ya consultada; `aplicarFiliacion` se llama varias
   veces).
2. Si `encontrada`: por cada fármaco,
   `lista.appendChild(crearFilaMedicamento({ ...farmaco, estado: 'continua' }))`.
   Las filas `continua` nacen con la dosis de solo lectura (un clic la
   habilita) y el intervalo en un desplegable (8.7f); si algún valor cambia,
   pasan a `modificada`. Un intervalo precargado que no esté en la lista se
   agrega como opción propia; la ✕ elimina la
   fila (ya implementado, 8.7e).
3. **No pisar lo que el profesional ya cargó:** si la lista ya tiene filas
   cuando llega la respuesta, las precargadas se insertan antes y las del
   profesional quedan.
4. Cargar `window.historialUltimaConsulta` con las clasificaciones y llamar a
   `recalcularClasificaciones()` (cierra el pendiente de 8.7b).
5. Avisar en pantalla de dónde viene: "Tratamiento precargado de la consulta
   del dd/mm/aaaa".
6. Si el webhook falla o tarda: no se precarga nada y el panel sigue igual.

## 3. Lo que hay que decidir antes

1. **Privacidad del webhook de lectura.** Los webhooks actuales son públicos,
   pero solo reciben datos. Este **devuelve** datos clínicos a quien conozca la
   URL y un `id_myvete`. Opciones: (a) aceptarlo, igual que hoy se acepta que
   la clave publicable deje leer `profesionales`; (b) exigir además el
   `profesional_id` del SPA y validar que exista (frena el acceso casual, no a
   quien lea el código); (c) autenticación real de profesionales, que hoy no
   existe. **No implementar la Fase 2 sin esta decisión.**
2. **Identidad de la mascota.** La clave es `tutor + nombre`. Si en MyVete
   cambian el nombre o hay dos mascotas con el mismo nombre para un tutor, la
   última consulta no se encuentra o se cruza. No hay hoy un id de mascota de
   MyVete en `mascotas`.
3. **Qué es "vigente".** Propuesta: todo el tratamiento de la última
   atención (lo eliminado no se guarda). ¿O hay que mirar más atrás si la última no tocó el tratamiento?
   (Con el diseño propuesto no hace falta: cada atención guarda el tratamiento
   completo.)
4. **Tratamiento en el informe:** ¿se muestra? ¿dónde? (Los fármacos
   eliminados no llegan a n8n: no se pueden listar.)
5. **Otros profesionales:** ¿la última consulta es la del paciente, sin
   importar qué profesional la cargó? (Propuesta: sí.)

## 4. Orden de trabajo y pruebas

| Paso | Qué | Prueba |
|---|---|---|
| 1 | Columna `medicacion` (DDL con OK) | `select` a `information_schema.columns` |
| 2 | Nodo de insert + sección del informe, en `lkOwTFmVTZu7EMoU` sin activar | Local, con el payload TEST más 3 fármacos |
| 3 | E2E de ingesta: el tratamiento queda en Supabase y en el PDF | Lo corre Marcelo |
| 4 | Workflow `Última consulta` | Copia temporal + paciente de prueba, como en 8.7d |
| 5 | SPA: precarga + historial de clasificaciones | jsdom y navegador, con paciente con y sin historia |
| 6 | E2E completo: consulta 1 (carga tratamiento) → consulta 2 (llega precargado; modificar uno, eliminar otro) → consulta 3 (el eliminado ya no viene) | Lo corre Marcelo |

Fuera de alcance: leer el tratamiento desde MyVete con el bookmarklet (no se
sabe si MyVete lo tiene estructurado; la fuente de verdad pasa a ser Supabase).
