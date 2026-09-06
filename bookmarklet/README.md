# Bookmarklet de Filiación

- **`launcher.js`** — fuente legible y comentada. Editar acá.
- **`bookmarklet.min.js`** — `launcher.js` minificado (terser). Generado, no editar a mano.
- **`bookmarklet.txt`** — el mismo código con prefijo `javascript:`, listo para pegar en un marcador de Chrome.

## Instalar

1. Crear un marcador nuevo en Chrome (cualquier página sirve).
2. En el campo **URL** pegar el contenido completo de `bookmarklet.txt`.
3. Nombre sugerido: **MyVete → Panel**.

Con la ficha de un paciente abierta en MyVete, hacer clic en el marcador: el
panel (`https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html`) se
monta como **iframe overlay** sobre la misma página de MyVete, con los datos de
filiación precargados. Cerrar con `✕`, `Esc` o clic en el fondo; "Abrir en
pestaña" lo despega a una ventana propia.

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
`tutorVacio` da `true`, así que **la recuperación por fetch se dispara igual
aunque la sección exista pero venga sin cargar**. En consola:

```
MyVete Bookmarklet: nombre de tutor descartado (placeholder/fecha): Sin asignar
MyVete Bookmarklet: tutor ausente/placeholder en la página actual; se recupera por fetch desde /customers/1310951.
```

### Recuperación del tutor por `fetch` (07/09/2026)

Si la ficha del paciente **no** trae la sección "Datos del Cliente" (o la trae con
los campos del tutor en placeholder), el bookmarklet **ya no abre una pestaña
nueva** de `/customers/{id}`. Esa vía caía al **home** de MyVete: al ser una SPA,
un cold-load de esa ruta en pestaña nueva pierde el contexto de router/sesión y
la ficha del cliente nunca renderiza (`tutor: null` en el panel).

En su lugar, el dato se pide desde la **misma pestaña** (sesión viva), con
`fetch()`, en este orden:

1. `fetch('/customers/{id}')` como documento (`credentials: 'include'`) y raspado
   del HTML devuelto con los **mismos selectores**, vía `DOMParser`.
2. Si eso da `403` (WAF) o el fetch rebota al home, se prueban endpoints JSON
   candidatos de la API interna (`/customers/{id}.json`, `/api/customers/{id}`,
   `/api/v1/customers/{id}`, `/api/customer/{id}`, `/api/clientes/{id}`) y se
   mapean nombre / teléfono / email por nombre de clave.
3. Si **nada** devuelve datos, el bookmarklet manda al panel
   `payload: { idTutor, tutorAutoFallo: true, tutorUrl }` y el panel muestra el
   aviso **"No se pudieron obtener los datos del tutor automáticamente"** con un
   enlace directo a `/customers/{id}` para cargarlo a mano.

En consola (caso con datos):

```
MyVete Bookmarklet: tutor raspado (fetch HTML /customers/123) -> nombre: ... | teléfono: ... | email: ...
MyVete Bookmarklet: 2do mensaje (tutor por fetch) -> {...}
```

En consola (caso sin datos → aviso manual):

```
MyVete Bookmarklet: fetch HTML de /customers/123 no sirvió (status 403, url final ...). Probando API JSON.
MyVete Bookmarklet: ninguna vía automática (HTML ni API JSON) devolvió el tutor 123. El panel mostrará el aviso para cargarlo a mano.
MyVete Bookmarklet: 2do mensaje (aviso manual, sin datos de tutor) -> {"type":"MYVETE_FILIACION","payload":{"idTutor":"123","tutorAutoFallo":true,"tutorUrl":"https://app.myvete.com/customers/123"}}
```

## Regenerar tras editar `launcher.js`

```sh
npx terser@5 bookmarklet/launcher.js --compress --mangle -o bookmarklet/bookmarklet.min.js
node -e "const fs=require('fs');const m=fs.readFileSync('bookmarklet/bookmarklet.min.js','utf8').replace(/\r?\n/g,'').trim();fs.writeFileSync('bookmarklet/bookmarklet.txt','javascript:'+encodeURIComponent(m)+'\n')"
```

`bookmarklet.txt` queda **en una sola línea, 100 % percent-encoded** (sin espacios
literales, sin comas sueltas, sin `\n` interno — solo el salto final del archivo).
El `.replace(/%20/g,' ')` de la versión anterior reinyectaba ~550 espacios
literales: al copiar desde la vista *Raw* de GitHub y pegar en la barra de
direcciones, esos espacios/quiebres rompían el `javascript:` y el navegador
navegaba a la URL en vez de ejecutarlo. Ya no.

Verificación rápida:

```sh
node -e "const t=require('fs').readFileSync('bookmarklet/bookmarklet.txt','utf8');const b=t.replace(/\n$/,'');console.log('una línea:',!b.includes('\n'),'| sin espacios:',!b.includes(' '),'| prefijo ok:',b.startsWith('javascript:'))"
```
