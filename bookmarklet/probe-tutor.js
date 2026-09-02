/**
 * Probe de diagnóstico para rasparTutor() — PEGAR EN LA CONSOLA DE MyVete
 * (F12 -> Console) con la ficha de un paciente abierta.
 *
 * No modifica nada: solo inspecciona el DOM y reporta en qué paso falla el
 * raspado del tutor (nombre / teléfono / email). Copiar TODO el output y
 * pasarlo de vuelta para ajustar los selectores de launcher.js.
 */
(function () {
  "use strict";

  const norm = (t) => (t || "").replace(/\s+/g, " ").trim().toLowerCase();
  const resumen = (el) =>
    el
      ? `<${el.tagName.toLowerCase()}${el.id ? " #" + el.id : ""}${
          el.className && typeof el.className === "string"
            ? " ." + el.className.trim().split(/\s+/).join(".")
            : ""
        }>`
      : "(null)";

  console.group("%cPROBE rasparTutor()", "font-weight:bold;font-size:13px");

  // --- Paso 1: encabezado "Datos del Cliente" -----------------------------
  const todos = Array.from(document.querySelectorAll("body *"));
  const exactos = todos.filter((n) => norm(n.innerText) === "datos del cliente");
  const contiene = todos.filter(
    (n) =>
      norm(n.innerText).includes("datos del cliente") &&
      n.querySelectorAll("*").length <= 3
  );

  console.log("Paso 1 — encabezado 'datos del cliente'");
  console.log("  match EXACTO:", exactos.length, exactos.map(resumen));
  console.log(
    "  match CONTIENE (<=3 hijos):",
    contiene.length,
    contiene.map((n) => resumen(n) + " :: " + JSON.stringify(norm(n.innerText).slice(0, 60)))
  );

  const encabezado = exactos[0] || contiene[0] || null;
  if (!encabezado) {
    console.warn(
      "  ⛔ No hay ningún elemento con el texto 'datos del cliente'. " +
        "El título de la sección en MyVete cambió — hace falta otro ancla."
    );
    console.groupEnd();
    return;
  }

  // --- Paso 2: contenedor de la sección ----------------------------------
  console.log("Paso 2 — subir hasta el contenedor con teléfono + email");
  let contenedor = encabezado.parentElement;
  let saltos = 0;
  let encontrado = null;
  while (contenedor && saltos < 12) {
    const txt = norm(contenedor.innerText);
    const tel = txt.includes("teléfono celular");
    const mail = txt.includes("email personal");
    console.log(
      `  salto ${saltos}: ${resumen(contenedor)} | 'teléfono celular'=${tel} 'email personal'=${mail}`
    );
    if (tel && mail) {
      encontrado = contenedor;
      break;
    }
    contenedor = contenedor.parentElement;
    saltos += 1;
  }
  if (!encontrado) {
    console.warn(
      "  ⛔ Ningún ancestro contiene a la vez 'teléfono celular' y 'email personal' " +
        "(texto exacto, en minúsculas). Puede que MyVete use otras etiquetas " +
        "(p.ej. 'E-mail', 'Correo', 'Celular'). Revisar el texto real de las etiquetas abajo."
    );
  }
  const seccion = encontrado || encabezado.parentElement;

  // --- Paso 3: etiquetas y valores -------------------------------------
  console.log("Paso 3 — etiquetas 'Nombre:', 'Teléfono celular:', 'Email personal:'");
  const etiquetas = ["nombre:", "teléfono celular:", "email personal:"];
  const hojas = Array.from(seccion.querySelectorAll("*")).filter(
    (el) => !Array.from(el.children).some((c) => c.tagName === el.tagName)
  );

  etiquetas.forEach((et) => {
    const candidatos = Array.from(seccion.querySelectorAll("*")).filter(
      (el) => norm(el.innerText) === et
    );
    console.log(`  '${et}' — elementos con texto exacto:`, candidatos.length, candidatos.map(resumen));
    const parcial = Array.from(seccion.querySelectorAll("*")).filter(
      (el) => norm(el.innerText).startsWith(et.replace(":", "")) && el.querySelectorAll("*").length <= 2
    );
    if (parcial.length) {
      console.log(
        `    (parciales que empiezan con '${et.replace(":", "")}'):`,
        parcial.slice(0, 4).map((el) => resumen(el) + " :: " + JSON.stringify((el.innerText || "").trim().slice(0, 80)))
      );
    }
  });

  // --- Paso 4: divs col-sm-8 col-xs-12 (selector actual del valor) ------
  const valores = Array.from(seccion.querySelectorAll("div")).filter(
    (d) => !d.querySelector("div") && d.classList.contains("col-sm-8") && d.classList.contains("col-xs-12")
  );
  console.log("Paso 4 — divs hoja .col-sm-8.col-xs-12 dentro de la sección:", valores.length);
  valores.slice(0, 10).forEach((d) => console.log("   ", JSON.stringify((d.innerText || "").trim().slice(0, 80))));
  if (!valores.length) {
    console.warn(
      "  ⛔ No hay divs .col-sm-8.col-xs-12 — el grid de MyVete cambió de clases. " +
        "extraerValorPorEtiqueta() nunca va a encontrar el valor con el selector actual."
    );
  }

  // --- Paso 5: HTML crudo de la sección (primeros 2000 chars) -----------
  console.log("Paso 5 — outerHTML de la sección (recortado):");
  console.log((seccion.outerHTML || "").replace(/\s+/g, " ").slice(0, 2000));

  console.groupEnd();
})();
