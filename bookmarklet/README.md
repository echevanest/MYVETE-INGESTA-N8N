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

## Regenerar tras editar `launcher.js`

```sh
npx terser@5 bookmarklet/launcher.js --compress --mangle -o bookmarklet/bookmarklet.min.js
node -e "const fs=require('fs');const m=fs.readFileSync('bookmarklet/bookmarklet.min.js','utf8').trim();fs.writeFileSync('bookmarklet/bookmarklet.txt','javascript:'+encodeURIComponent(m).replace(/%20/g,' ')+'\n')"
```
