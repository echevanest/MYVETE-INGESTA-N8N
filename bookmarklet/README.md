# Bookmarklet de Filiación

- **`launcher.js`** — fuente legible y comentada. Editar acá.
- **`bookmarklet.min.js`** — `launcher.js` minificado (terser). Generado, no editar a mano.
- **`bookmarklet.txt`** — el mismo código con prefijo `javascript:`, listo para pegar en un marcador de Chrome.

## Instalar

1. Crear un marcador nuevo en Chrome (cualquier página sirve).
2. En el campo **URL** pegar el contenido completo de `bookmarklet.txt`.
3. Nombre sugerido: **MyVete → Panel**.

Con la ficha de un paciente abierta en MyVete, hacer clic en el marcador: se abre
el panel (`https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html`)
con los datos de filiación precargados.

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

## Regenerar tras editar `launcher.js`

```sh
npx terser@5 bookmarklet/launcher.js --compress --mangle -o bookmarklet/bookmarklet.min.js
node -e "const fs=require('fs');const m=fs.readFileSync('bookmarklet/bookmarklet.min.js','utf8').trim();fs.writeFileSync('bookmarklet/bookmarklet.txt','javascript:'+encodeURIComponent(m).replace(/%20/g,' ')+'\n')"
```
