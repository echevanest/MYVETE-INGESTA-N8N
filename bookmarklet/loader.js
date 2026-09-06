/**
 * bookmarklet/loader.js — Cargador oficial del bookmarklet de MyVete.
 *
 * ESTE ES EL ÚNICO MODO SOPORTADO de ejecutar el bookmarklet.
 *
 * NO pegar el código largo (launcher.js minificado) en la barra de direcciones:
 *   - al copiar desde la vista Raw de GitHub se reinyectan espacios / saltos de
 *     línea y el navegador "navega" a la URL en vez de ejecutarla;
 *   - no se puede actualizar sin volver a pegarlo en cada navegador;
 *   - fue causa recurrente de "el bookmarklet dejó de andar".
 *
 * El loader es corto y estable: baja `bookmarklet/launcher.js` desde GitHub
 * Pages (siempre la última versión publicada) y lo ejecuta. Para cambiar la
 * lógica se edita `launcher.js` y se hace push — el marcador del navegador NO
 * se vuelve a tocar.
 *
 * `bookmarklet.txt` es este archivo minificado, con prefijo `javascript:` y
 * 100 % percent-encoded, listo para pegar como URL de un marcador de Chrome.
 * Regenerarlo solo si se cambia ESTE archivo (rarísimo) — ver README.
 */
(function () {
  "use strict";

  // Override opcional del origen del launcher (para probar una rama / fork sin
  // tocar el marcador):  localStorage.setItem('myvete_launcher_url', '<url>')
  var LAUNCHER_URL_DEFAULT =
    "https://echevanest.github.io/MYVETE-INGESTA-N8N/bookmarklet/launcher.js";
  var base = LAUNCHER_URL_DEFAULT;
  try {
    base = localStorage.getItem("myvete_launcher_url") || LAUNCHER_URL_DEFAULT;
  } catch (e) {
    // sin localStorage: se usa el default
  }

  var url = base + (base.indexOf("?") === -1 ? "?" : "&") + "v=" + Date.now();

  fetch(url, { cache: "no-store", credentials: "omit" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " al bajar launcher.js");
      return r.text();
    })
    .then(function (codigo) {
      // eval indirecto -> corre en el scope global, igual que un <script src>.
      (0, eval)(codigo);
    })
    .catch(function (e) {
      console.error(
        "MyVete Loader: no se pudo cargar launcher.js desde GitHub Pages.",
        e,
        "\nRevisá la conexión, o abrí a mano: " + base
      );
    });
})();
