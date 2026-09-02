/**
 * Probe de diagnostico para rasparTutor() -- PEGAR EN LA CONSOLA DE MyVete
 * (F12 -> Console) con la ficha de un paciente abierta.
 *
 * No modifica nada: solo inspecciona el DOM y reporta en que paso falla el
 * raspado del tutor (nombre / telefono / email). Copiar TODO el output y
 * pasarlo de vuelta para ajustar los selectores de launcher.js.
 *
 * Sin template literals, sin emojis y sin acentos literales a proposito: asi
 * el copiado por consola no puede romper la sintaxis ni las cadenas de busqueda.
 */
(function () {
  "use strict";

  // "telefono celular" con la e acentuada armada por codigo -> el archivo queda
  // 100% ASCII y ningun copiado puede corromper la cadena de busqueda.
  var TEL = "tel" + String.fromCharCode(233) + "fono celular";
  var MAIL = "email personal";
  var TITULO = "datos del cliente";

  function norm(t) {
    return (t || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function resumen(el) {
    if (!el) return "(null)";
    var s = "<" + el.tagName.toLowerCase();
    if (el.id) s += " #" + el.id;
    if (el.className && typeof el.className === "string") {
      s += " ." + el.className.trim().split(/\s+/).join(".");
    }
    return s + ">";
  }

  function texto(el, n) {
    return JSON.stringify((el && el.innerText ? el.innerText : "").trim().slice(0, n || 80));
  }

  console.group("PROBE rasparTutor()");

  // --- Paso 1: encabezado "Datos del Cliente" -----------------------------
  var todos = Array.prototype.slice.call(document.querySelectorAll("body *"));
  var exactos = todos.filter(function (n) {
    return norm(n.innerText) === TITULO;
  });
  var contiene = todos.filter(function (n) {
    return norm(n.innerText).indexOf(TITULO) !== -1 && n.querySelectorAll("*").length <= 3;
  });

  console.log("Paso 1 - encabezado 'datos del cliente'");
  console.log("  match EXACTO:", exactos.length, exactos.map(resumen));
  console.log(
    "  match CONTIENE (<=3 hijos):",
    contiene.length,
    contiene.map(function (n) {
      return resumen(n) + " :: " + JSON.stringify(norm(n.innerText).slice(0, 60));
    })
  );

  var encabezado = exactos[0] || contiene[0] || null;
  if (!encabezado) {
    console.warn(
      "  STOP: ningun elemento con el texto 'datos del cliente'. " +
        "El titulo de la seccion en MyVete cambio -- hace falta otro ancla."
    );
    console.groupEnd();
    return;
  }

  // --- Paso 2: contenedor de la seccion ----------------------------------
  console.log("Paso 2 - subir hasta el contenedor con telefono + email");
  var contenedor = encabezado.parentElement;
  var saltos = 0;
  var encontrado = null;
  while (contenedor && saltos < 12) {
    var txt = norm(contenedor.innerText);
    var tieneTel = txt.indexOf(TEL) !== -1;
    var tieneMail = txt.indexOf(MAIL) !== -1;
    console.log(
      "  salto " + saltos + ": " + resumen(contenedor) +
        " | telefono=" + tieneTel + " email=" + tieneMail
    );
    if (tieneTel && tieneMail) {
      encontrado = contenedor;
      break;
    }
    contenedor = contenedor.parentElement;
    saltos += 1;
  }
  if (!encontrado) {
    console.warn(
      "  STOP: ningun ancestro contiene a la vez 'telefono celular' y 'email personal' " +
        "(texto exacto, en minusculas). Puede que MyVete use otras etiquetas " +
        "(p.ej. 'E-mail', 'Correo', 'Celular'). Ver el texto real de las etiquetas abajo."
    );
  }
  var seccion = encontrado || encabezado.parentElement;

  // --- Paso 3: etiquetas y valores -------------------------------------
  console.log("Paso 3 - etiquetas 'Nombre:', 'Telefono celular:', 'Email personal:'");
  var etiquetas = ["nombre:", TEL + ":", MAIL + ":"];
  etiquetas.forEach(function (et) {
    var candidatos = Array.prototype.slice
      .call(seccion.querySelectorAll("*"))
      .filter(function (el) {
        return norm(el.innerText) === et;
      });
    console.log("  '" + et + "' - elementos con texto exacto:", candidatos.length, candidatos.map(resumen));

    var base = et.replace(":", "");
    var parcial = Array.prototype.slice
      .call(seccion.querySelectorAll("*"))
      .filter(function (el) {
        return norm(el.innerText).indexOf(base) === 0 && el.querySelectorAll("*").length <= 2;
      });
    if (parcial.length) {
      console.log(
        "    (parciales que empiezan con '" + base + "'):",
        parcial.slice(0, 4).map(function (el) {
          return resumen(el) + " :: " + texto(el);
        })
      );
    }
  });

  // --- Paso 4: divs col-sm-8 col-xs-12 (selector actual del valor) ------
  var valores = Array.prototype.slice.call(seccion.querySelectorAll("div")).filter(function (d) {
    return (
      !d.querySelector("div") &&
      d.classList.contains("col-sm-8") &&
      d.classList.contains("col-xs-12")
    );
  });
  console.log("Paso 4 - divs hoja .col-sm-8.col-xs-12 dentro de la seccion:", valores.length);
  valores.slice(0, 10).forEach(function (d) {
    console.log("   ", texto(d));
  });
  if (!valores.length) {
    console.warn(
      "  STOP: no hay divs .col-sm-8.col-xs-12 -- el grid de MyVete cambio de clases. " +
        "extraerValorPorEtiqueta() nunca va a encontrar el valor con el selector actual."
    );
  }

  // --- Paso 5: HTML crudo de la seccion (primeros 2500 chars) -----------
  console.log("Paso 5 - outerHTML de la seccion (recortado):");
  console.log((seccion.outerHTML || "").replace(/\s+/g, " ").slice(0, 2500));

  console.groupEnd();
})();
