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

El bookmarklet ya abría una pestaña con `window.open()` para raspar el tutor
(Plan B). Sumarle un **segundo** `window.open()` para el panel hacía que el
navegador bloqueara el segundo en silencio (regla de "una ventana por gesto") y
el panel no aparecía. Ahora el único `window.open()` del clic es el de la pestaña
del tutor; el panel va embebido. Si MyVete bloquea el iframe por
CSP / `X-Frame-Options` (no confirma `MYVETE_PANEL_READY` en 9 s), el bookmarklet
cae solo a `window.open()` en ventana aparte.

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
raspado en la pestaña aparte), pero ya no es la única vía: la ventana nueva es
autosuficiente con lo que trae la URL.

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

### Plan B — pestaña nueva de `/customers/{id}`

Si la ficha del paciente **no** trae la sección "Datos del Cliente", el
bookmarklet abre `/customers/{idTutor}` en una **pestaña nueva** (`window.open`,
disparado dentro del clic para que no lo mate el bloqueador de pop-ups), espera a
que la SPA renderice (polling + `MutationObserver`, timeout 30 s) y raspa de ahí.
El iframe oculto que se usaba antes dejó de servir: MyVete responde 403 a
`/customers/{id}` en contexto iframe/fetch. El resultado va al panel en un **2do**
mensaje `MYVETE_FILIACION`. En consola:

```
MyVete Bookmarklet: pestaña de tutor abierta -> https://app.myvete.com/customers/123
MyVete Bookmarklet: tutor raspado (pestaña /customers/123) -> nombre: ... | teléfono: ... | email: ...
MyVete Bookmarklet: 2do mensaje (tutor desde pestaña) -> {...}
```

Diagnóstico: `localStorage.setItem('myvete_debug_tutor','1')` deja la pestaña
abierta si vence el timeout (en `window.__myveteTutorWin`) y loguea el polling
cada ~2 s. Volver a producción: `localStorage.setItem('myvete_debug_tutor','0')`.

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
