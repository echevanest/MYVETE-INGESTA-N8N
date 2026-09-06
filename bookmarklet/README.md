# Bookmarklet de Filiación

Versión estable: **`1.0.0-estable`** (tag de Git `v1.0.0-estable`). El bookmarklet
loguea su versión en consola al arrancar (`MyVete Bookmarklet v1.0.0-estable`).
Si algo se rompe, revertir con `git checkout v1.0.0-estable` (ver más abajo).

## Archivos

| archivo | qué es |
|---|---|
| **`loader.js`** | Fuente del **cargador oficial**. Corto y estable: baja `launcher.js` de GitHub Pages y lo ejecuta. Casi nunca cambia. |
| **`bookmarklet.txt`** | `loader.js` minificado + `javascript:` + percent-encoded. **Esto es lo que se pega en el marcador de Chrome.** |
| **`launcher.js`** | Toda la lógica (raspado, panel, API del tutor). **Se edita acá**; el push a GitHub Pages ya lo publica — el marcador NO se vuelve a tocar. |
| **`bookmarklet.min.js`** | `launcher.js` minificado. **Legado / opcional** — el cargador usa `launcher.js` directo, no este archivo. |
| **`verificar.mjs`** | Prueba anti-regresión (`node bookmarklet/verificar.mjs`). |
| **`probe-tutor.js`** | Sonda de diagnóstico manual para pegar en la consola de MyVete. |

## Instalar (única forma soportada)

1. Crear un marcador nuevo en Chrome (cualquier página sirve).
2. En el campo **URL** pegar el contenido completo de **`bookmarklet.txt`**
   (son ~800 caracteres — el **cargador**, no el código largo).
3. Nombre sugerido: **MyVete → Panel**.

> ⚠️ **No pegar `launcher.js` ni `bookmarklet.min.js` en la barra de
> direcciones.** El código largo (~23 KB) se rompe al copiarlo desde la vista
> *Raw* de GitHub (se reinyectan espacios / saltos y el navegador "navega" en vez
> de ejecutar), y obliga a re-pegarlo en cada navegador con cada cambio. Fue
> causa recurrente de "el bookmarklet dejó de andar". El cargador de
> `bookmarklet.txt` evita las dos cosas: es corto y siempre baja la última
> versión publicada de `launcher.js`.

Con la ficha de un paciente abierta en MyVete, hacer clic en el marcador: el
cargador baja `launcher.js` y el panel
(`https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html`) se monta
como **iframe overlay** sobre la misma página de MyVete, con los datos de
filiación precargados. Cerrar con `✕`, `Esc` o clic en el fondo; "Abrir en
pestaña" lo despega a una ventana propia.

### Probar una rama / fork sin tocar el marcador

Desde la consola de MyVete, una sola vez:

```js
localStorage.setItem('myvete_launcher_url', 'https://<host>/ruta/launcher.js')
// volver al oficial:
localStorage.removeItem('myvete_launcher_url')
```

### Por qué overlay y no una ventana emergente

El bookmarklet supo abrir una pestaña con `window.open()` para raspar el tutor.
Sumarle un **segundo** `window.open()` para el panel hacía que el navegador
bloqueara el segundo en silencio (regla de "una ventana por gesto") y el panel no
aparecía. Desde el 07/09/2026 el tutor ausente se recupera con `fetch()` (sin
pestaña — ver abajo), así que el bookmarklet ya **no** abre ninguna ventana
dentro del clic: el panel va embebido como iframe. Si MyVete bloquea el iframe
por CSP / `X-Frame-Options` (no confirma `MYVETE_PANEL_READY` en 9 s), recién ahí
cae a `window.open()` en ventana aparte.

### Cómo llegan los datos al panel

El panel corre en **otro origen** (`echevanest.github.io`), así que no puede
depender de `window.opener` / `postMessage` (se pierde con `noopener`, con
bloqueadores o por timing al abrir en ventana nueva). El bookmarklet embute la
filiación completa en la **URL**:

- `?idTutor=123` en el query string (respaldo histórico);
- `#data=<JSON codificado>` en el **fragmento**, con `{ tutor, mascota, idTutor }`.
  El fragmento no viaja al servidor (no queda en logs de GitHub Pages);
  `interface/app.js` lo lee al cargar (`leerFiliacionDesdeHash()`) y **lo limpia**
  con `history.replaceState` para no re-aplicar datos viejos en un refresh.

El `postMessage` se sigue usando en modo iframe y para el **2do** mensaje (tutor
recuperado por `fetch`, o aviso de carga manual), pero ya no es la única vía: la
ventana nueva es autosuficiente con lo que trae la URL.

## Cambiar la URL del panel sin regenerar

Desde la consola de MyVete, una sola vez:

```js
localStorage.setItem('myvete_panel_url', 'https://otra.url/interface/index.html')
// volver al valor por defecto:
localStorage.removeItem('myvete_panel_url')
```

## Diagnóstico: el tutor no se auto-llena

`launcher.js` ya loguea lo que raspó en la consola de MyVete:

```
MyVete Bookmarklet: filiación raspada -> {"tutor":{"nombre":null,...},"mascota":{...}}
```

Si `tutor` sale con los tres campos en `null`, el fallo está en los selectores
contra el DOM real de esa pantalla. Para ver en qué paso falla, pegar el
contenido de **`probe-tutor.js`** en la consola de MyVete (F12 → Console) con la
ficha del paciente abierta y pasar el output. El probe no modifica nada: reporta
si aparece el encabezado "Datos del Cliente", si el contenedor tiene las
etiquetas esperadas, y si los divs `.col-sm-8.col-xs-12` (selector actual del
valor) siguen existiendo.

### Placeholders y timestamps no cuentan como dato

`launcher.js` descarta como "campo vacío" los literales de MyVete (`Sin asignar`,
`No disponible`, `-`, `N/D`, …) y cualquier fecha/hora u "hace X minutos" que se
cuele en un campo de contacto (visto 06/09/2026: la ficha traía la sección "Datos
del Cliente" con nombre `Sin asignar` y un `06/09/2026 - Hace 0 segundos` en el
lugar del teléfono). Efecto: esos valores no viajan al panel como reales y
`tutorVacio` da `true`, así que **la recuperación por API se dispara igual aunque
la sección exista pero venga sin cargar**. En consola:

```
MyVete Bookmarklet: nombre de tutor descartado (placeholder/fecha): Sin asignar
MyVete Bookmarklet: tutor ausente/placeholder en la página actual; se recupera por fetch desde /customers/1310951.
```

### Recuperación del tutor por la API interna de MyVete (07/09/2026, rev. 2)

Si la ficha del paciente **no** trae la sección "Datos del Cliente" (o la trae con
los campos en placeholder), el bookmarklet consulta la **API interna** de MyVete
desde la **misma pestaña** (sesión viva):

```
GET /api/customers/{idTutor}?sessionId={sid}
```

Descubierto inspeccionando el tráfico de red real de MyVete (cuenta 444). Datos
clave:

- **Ni la pestaña nueva ni el `fetch` de HTML sirven**: MyVete es una SPA (React)
  y **redirige al dashboard cualquier carga dura** de `/customers/{id}` — pestaña
  nueva, `fetch`, o navegación top-level. Confirmado: `fetch('/customers/{id}')`
  devuelve `200` pero con `res.url === 'https://app.myvete.com/'`.
- La **API** en cambio responde `200 JSON` a un `fetch()` same-origin normal (sin
  headers especiales), con la forma:
  ```jsonc
  {
    "customerFullName": "APELLIDO, NOMBRE",
    "customerName": "...", "customerLastName": "...",
    "Contacts": [
      { "contactValue": "1130000000", "Attribute": { "attributeName": "Telefono movil" } },
      { "contactValue": "n@dominio.com", "Attribute": { "attributeName": "Email personal" } },
      { "contactValue": "", "Attribute": { "attributeName": "Telefono fijo" } }
    ]
  }
  ```
- El `sessionId` es el token que la SPA cuelga de **cada** llamada `/api/...`. El
  bookmarklet lo lee del **Resource Timing** de la propia página
  (`performance.getEntriesByType('resource')`), que siempre tiene llamadas `/api/`
  de MyVete (kpis, schedules, `socket.io`, `autologin`…).

Mapeo (`tutorDesdeApiMyVete`):

| campo panel | origen en el JSON |
|---|---|
| `nombre` | `customerFullName` (ya "APELLIDO, NOMBRE") — si falta, `customerName` + `customerLastName` |
| `telefono` | `Contacts[].contactValue` cuyo `Attribute.attributeName` matchee `tel/celular/móvil`, prefiriendo `celular/móvil` sobre `fijo/laboral` |
| `email` | `Contacts[].contactValue` cuyo `Attribute.attributeName` matchee `mail/correo` |

Red de seguridad: si la forma del endpoint cambiara, se cae a `tutorDesdeObjetoJson`
(recorrido BFS del objeto por nombre de clave).

En consola (caso con datos):

```
MyVete Bookmarklet: tutor obtenido de /api/customers/123 -> nombre: PEREZ, JUAN | teléfono: 1130000000 | email: juan@mail.com
MyVete Bookmarklet: 2do mensaje (tutor por API) -> {...}
```

En consola (caso sin datos → aviso manual):

```
MyVete Bookmarklet: /api/customers/123 respondió 200 pero sin datos de contacto reconocibles.
MyVete Bookmarklet: 2do mensaje (aviso manual, sin datos de tutor) -> {"type":"MYVETE_FILIACION","payload":{"idTutor":"123","tutorAutoFallo":true,"tutorUrl":"https://app.myvete.com/customers/123"}}
```

En ese caso el panel muestra **"No se pudieron obtener los datos del tutor
automáticamente"** con enlace directo a `/customers/{id}` y el `idTutor` copiable
al portapapeles (botón "Copiar ID").

## Editar la lógica (flujo normal)

**No hace falta regenerar nada.** El cargador (`bookmarklet.txt`) baja
`launcher.js` en vivo desde GitHub Pages:

1. Editar `bookmarklet/launcher.js`.
2. `node bookmarklet/verificar.mjs` — tiene que dar todo OK.
3. `git commit` + `git push`. GitHub Pages publica el `launcher.js` nuevo y el
   próximo clic en el marcador ya lo usa.

El `bookmarklet.min.js` es **legado**: si querés mantenerlo al día,
`npx terser@5 bookmarklet/launcher.js --compress --mangle -o bookmarklet/bookmarklet.min.js`.
No afecta al bookmarklet.

## Regenerar el cargador `bookmarklet.txt` (solo si cambiás `loader.js`)

Rarísimo — `loader.js` casi no cambia. Si lo tocás:

```sh
npx terser@5 bookmarklet/loader.js --compress --mangle -o /tmp/loader.min.js
node -e "const fs=require('fs');const m=fs.readFileSync('/tmp/loader.min.js','utf8').replace(/\r?\n/g,'').trim();fs.writeFileSync('bookmarklet/bookmarklet.txt','javascript:'+encodeURIComponent(m)+'\n')"
node bookmarklet/verificar.mjs
```

`bookmarklet.txt` queda **en una sola línea, 100 % percent-encoded** (sin espacios
literales, sin `\n` interno — solo el salto final del archivo). Después hay que
volver a pegarlo en el marcador de Chrome (única vez que hace falta re-pegar).

## Anti-regresión

`node bookmarklet/verificar.mjs` comprueba, sin navegador:

- sintaxis de `loader.js` / `launcher.js` / `interface/app.js`;
- que `const VERSION` coincida entre `launcher.js` y `app.js`;
- que `bookmarklet.txt` sea el cargador corto (fetch+eval, apunta a `launcher.js`);
- que la **lógica del tutor por API siga intacta**: extrae las funciones puras
  del propio `launcher.js` (`obtenerSessionIdMyVete`, `tutorDesdeApiMyVete`,
  `tutorDesdeObjetoJson`, `esValorBasura`) y las corre contra fixtures con la
  forma real de `/api/customers/{id}`;
- invariantes de texto (endpoint, `?sessionId=`, lectura por Resource Timing,
  `PLACEHOLDERS_BASURA`, `tutorAutoFallo`, que **no** se abra pestaña de tutor).

Corre también en CI (`.github/workflows/verificar.yml`) en cada push que toque
`bookmarklet/` o `interface/`. Si algo falla, el script y el check de GitHub
avisan **"VERSIÓN INESTABLE"** y cómo revertir:

```sh
git checkout v1.0.0-estable
# o solo el código, dejando el resto del repo como está:
git checkout v1.0.0-estable -- bookmarklet/launcher.js interface/app.js
```

## Verificación rápida del `.txt`

```sh
node -e "const t=require('fs').readFileSync('bookmarklet/bookmarklet.txt','utf8');const b=t.replace(/\n$/,'');console.log('una línea:',!b.includes('\n'),'| sin espacios:',!b.includes(' '),'| prefijo ok:',b.startsWith('javascript:'))"
```
