/**
 * Bookmarklet — Cargador síncrono.
 * Ver INFORME-ARQUITECTURA-MYVETE-V2.7.md, Sección 3 (SECCIÓN 5), punto 3.2, pasos 1-2.
 *
 * Responsabilidad de este archivo: correr en el contexto de la pestaña de MyVete,
 * extraer lo mínimo indispensable de la pantalla activa y abrir la ventana flotante
 * definida en /interface/index.html. No contiene lógica de formulario ni de negocio —
 * eso vive del lado de /interface/app.js.
 *
 * Contrato del mensaje (debe calzar con el listener de interface/app.js Sección 2):
 *   { type: 'MYVETE_FILIACION', payload: { tutor: {...}, mascota: {...}, idTutor: 'string | null' } }
 * `tutor` y `mascota` tienen selectores confirmados sobre el DOM real de MyVete
 * (mascota: 24/08/2026; tutor: 25/08/2026, ver abajo). Ambos raspan con la misma
 * estrategia defensiva de mejor esfuerzo: si la sección esperada no aparece en
 * pantalla, los campos viajan en `null` en vez de romper el flujo.
 */
(function () {
  "use strict";

  // ===== CONFIGURACIÓN =====
  // URL de la ventana flotante (interface/index.html), servida por GitHub Pages
  // desde la raíz del repo: /MYVETE-INGESTA-N8N/interface/index.html.
  //
  // Para apuntar a otra URL sin reeditar el bookmarklet, definir el override una
  // sola vez desde la consola de MyVete:
  //   localStorage.setItem('myvete_panel_url', 'https://otra.url/index.html')
  // y para volver al valor por defecto:
  //   localStorage.removeItem('myvete_panel_url')
  const PANEL_URL_DEFAULT =
    "https://echevanest.github.io/MYVETE-INGESTA-N8N/interface/index.html";
  let PANEL_URL = PANEL_URL_DEFAULT;
  try {
    PANEL_URL = localStorage.getItem("myvete_panel_url") || PANEL_URL_DEFAULT;
  } catch (error) {
    // localStorage puede no estar disponible (modo restringido): se usa el default.
  }

  // Paso 1 — Activación y raspado de entrada (Sección 3.2, punto 1)
  // Selectores reales confirmados sobre el DOM de la ficha clínica (div.patient-info):
  //   - Mascota:            '.patient-info h1' -> ej. "Baco"
  //   - Especie/Raza/Color: div interno con texto combinado por comas,
  //                         ej. "Canino, ovejero suizo, BLANCO" (color se descarta,
  //                         no forma parte del contrato de datos de mascota).
  // Selectores reales confirmados sobre la sección "Datos del Cliente" (tutor),
  // corrida de probe-tutor.js del 02/09/2026 sobre el DOM real de MyVete:
  //   - Contenedor: DIV#modalcustomerDetail_customers (el <div id> del tab-pane
  //     "Datos del Cliente"). Fallback: búsqueda por texto del encabezado
  //     "datos del cliente" + ancestro con "teléfono celular" y "email personal"
  //     (encontrarSeccionDatosCliente(), por si el id cambia).
  //   - Cada fila es un row Bootstrap con dos columnas hermanas:
  //       <div class="col-sm-4 col-xs-12">Nombre:</div>        (etiqueta)
  //       <div class="col-sm-8 col-xs-12">JUAN PEREZ</div>      (valor)
  //     -> se ubica la etiqueta por texto y se toma el .col-sm-8.col-xs-12 del
  //     mismo parentElement (extraerValorPorEtiqueta()).
  // El ID de tutor (segmento numérico de /customers/{id}) ya se extrae —ver
  // extraerIdTutor() más abajo, validado E2E el 01/09/2026 sobre el DOM real de
  // MyVete— y viaja al panel por query param `?idTutor=` + respaldo en el
  // postMessage. TODO pendiente: el ID de paciente (/patient/{id}/charts o
  // /customers/{c}/patients/{id}), necesario para la consulta de historial.
  //
  // Blindaje anti-contaminación (detectado 25/08/2026, paciente "Mentira"): un div
  // contenedor previo al bloque de perfil puede envolver también los datos de
  // contacto del tutor, y como querySelectorAll('div') recorre en orden de
  // documento, ese ancestro (cuyo innerText concatena TODO su contenido) puede
  // llegar antes que el div hoja real y ganar el .find() por tener una coma
  // "de casualidad". Se descartan los divs con hijos <div> (solo interesan
  // nodos hoja) y además se exige que el primer segmento coincida con una
  // especie conocida, para no depender únicamente de la forma del DOM.
  const ESPECIES_VALIDAS = ["canino", "felino", "equino", "ave", "aviar", "exotico"];

  // Blindaje análogo para tutor (misma fecha): la búsqueda de etiquetas está
  // acotada al contenedor de "Datos del Cliente" (nunca a document completo)
  // para no confundir el "Nombre:" del tutor con el de la mascota, y el valor
  // asociado se valida por forma (regex de teléfono/email) antes de aceptarlo.
  const REGEX_TELEFONO = /^[+\d][\d\s\-()]{5,}$/;
  const REGEX_EMAIL = /\S+@\S+\.\S+/;

  function normalizarTexto(texto) {
    return (texto || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function encontrarSeccionDatosCliente() {
    try {
      // Ruta principal: el tab-pane "Datos del Cliente" tiene id estable
      // (probe 02/09/2026). Si MyVete lo renombra, se cae al fallback por texto.
      const porId = document.getElementById("modalcustomerDetail_customers");
      if (porId) return porId;

      // Fallback: no se asume una etiqueta de título estándar; se buscan todos
      // los elementos cuyo texto normalizado sea exacto "datos del cliente" y,
      // si hay varios, se prefiere el más específico (menos descendientes), y
      // desde ahí se sube al primer ancestro que contenga las dos etiquetas.
      const candidatos = Array.from(document.querySelectorAll("body *")).filter(
        (n) => normalizarTexto(n.innerText) === "datos del cliente"
      );
      if (!candidatos.length) return null;
      candidatos.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
      let contenedor = candidatos[0].parentElement;
      let saltos = 0;
      while (contenedor && saltos < 10) {
        const texto = normalizarTexto(contenedor.innerText);
        if (texto.includes("teléfono celular") && texto.includes("email personal")) {
          return contenedor;
        }
        contenedor = contenedor.parentElement;
        saltos += 1;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  function extraerValorPorEtiqueta(root, etiqueta) {
    if (!root) return null;
    const etiquetaNorm = normalizarTexto(etiqueta);

    // La etiqueta es un DIV.col-sm-4.col-xs-12 con el texto exacto; el valor es
    // el DIV.col-sm-8.col-xs-12 hermano (mismo row). textContent (no innerText)
    // porque el panel puede estar en un tab oculto sin layout calculado.
    const nodoEtiqueta = Array.from(
      root.querySelectorAll("div.col-sm-4.col-xs-12")
    ).find((d) => normalizarTexto(d.textContent) === etiquetaNorm);
    if (!nodoEtiqueta) {
      console.warn("MyVete Bookmarklet: etiqueta de tutor no encontrada:", etiqueta);
      return null;
    }

    const fila = nodoEtiqueta.parentElement;
    let nodoValor = fila && fila.querySelector("div.col-sm-8.col-xs-12");

    // Respaldo: si el valor no está en el mismo parent, se toma el primer
    // .col-sm-8.col-xs-12 que siga a la etiqueta en orden de documento.
    if (!nodoValor) {
      nodoValor = Array.from(root.querySelectorAll("div.col-sm-8.col-xs-12")).find(
        (v) => nodoEtiqueta.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    }
    if (!nodoValor) {
      console.warn("MyVete Bookmarklet: valor de tutor no encontrado para:", etiqueta);
      return null;
    }

    const texto = normalizarConEspacios(nodoValor.textContent);
    return texto || null;
  }

  // Como normalizarTexto pero sin bajar a minúsculas: para valores que se
  // muestran tal cual al médico (nombre, email con mayúsculas, etc.).
  function normalizarConEspacios(texto) {
    return (texto || "").replace(/\s+/g, " ").trim();
  }

  function rasparTutor() {
    const vacio = { nombre: null, telefono: null, email: null };
    try {
      const seccion = encontrarSeccionDatosCliente();
      if (!seccion) {
        console.warn("MyVete Bookmarklet: sección 'Datos del Cliente' no encontrada.");
        return vacio;
      }

      const nombre = extraerValorPorEtiqueta(seccion, "Nombre:");
      const telefono = extraerValorPorEtiqueta(seccion, "Teléfono celular:");
      const email = extraerValorPorEtiqueta(seccion, "Email personal:");

      const telefonoOk = telefono && REGEX_TELEFONO.test(telefono) ? telefono : null;
      const emailOk = email && REGEX_EMAIL.test(email) ? email : null;
      if (telefono && !telefonoOk) {
        console.warn("MyVete Bookmarklet: teléfono raspado no pasó la validación de forma:", telefono);
      }
      if (email && !emailOk) {
        console.warn("MyVete Bookmarklet: email raspado no pasó la validación de forma:", email);
      }

      const resultado = { nombre: nombre || null, telefono: telefonoOk, email: emailOk };
      console.log(
        "MyVete Bookmarklet: tutor raspado ->",
        "nombre:", resultado.nombre || "(no encontrado)",
        "| teléfono:", resultado.telefono || "(no encontrado)",
        "| email:", resultado.email || "(no encontrado)"
      );
      return resultado;
    } catch (error) {
      console.error("MyVete Bookmarklet: error al raspar tutor.", error);
      return vacio;
    }
  }

  function rasparFiliacion() {
    const vacio = {
      tutor: { nombre: null, telefono: null, email: null },
      mascota: { nombre: null, especie: null, raza: null, pesoActual: null },
    };

    try {
      const root = document.querySelector(".patient-info");
      if (!root) return vacio;

      const nombreMascota = root.querySelector("h1")?.innerText.trim() || null;

      const divCombinado = Array.from(root.querySelectorAll("div")).find((d) => {
        if (d.querySelector("div")) return false;
        const texto = d.innerText && d.innerText.trim();
        if (!texto || texto.indexOf(",") === -1) return false;
        const primeraParte = texto.split(",")[0].trim().toLowerCase();
        return ESPECIES_VALIDAS.includes(primeraParte);
      });
      const partes = divCombinado
        ? divCombinado.innerText.split(",").map((s) => s.trim())
        : [];

      return {
        tutor: rasparTutor(),
        mascota: {
          nombre: nombreMascota,
          especie: partes[0] || null,
          raza: partes[1] || null,
          pesoActual: null,
        },
      };
    } catch (error) {
      console.error("MyVete Bookmarklet: error al raspar filiación.", error);
      return vacio;
    }
  }

  // Extracción del ID de tutor (cliente/dueño) desde la pantalla de MyVete.
  // Validado E2E el 01/09/2026 sobre el DOM real: MyVete usa dos formas de URL
  // para la ficha de un paciente y en ambas el ID de tutor es recuperable:
  //   a) /customers/{cid}/patients/{pid}  -> el cid está en la propia URL.
  //   b) /patient/{pid}/charts            -> la URL no lo trae, pero el botón
  //      flotante "editar paciente" del DOM lleva href="/customers/{cid}/patients/{pid}".
  // El enlace "/customers/0" (acción "Nuevo Cliente") aparece en todas las
  // pantallas: se descarta explícitamente el id "0" en cada paso.
  function extraerIdTutor() {
    try {
      const enUrl = window.location.pathname.match(/\/customers\/(\d+)\/patients\/\d+/);
      if (enUrl && enUrl[1] !== "0") return enUrl[1];

      const anclasPaciente = Array.from(
        document.querySelectorAll('a[href*="/customers/"][href*="/patients/"]')
      );
      for (const ancla of anclasPaciente) {
        const m = (ancla.getAttribute("href") || "").match(/\/customers\/(\d+)\/patients\/\d+/);
        if (m && m[1] !== "0") return m[1];
      }

      const anclasCliente = Array.from(document.querySelectorAll('a[href*="/customers/"]'));
      for (const ancla of anclasCliente) {
        const m = (ancla.getAttribute("href") || "").match(/\/customers\/(\d+)/);
        if (m && m[1] !== "0") return m[1];
      }
    } catch (error) {
      console.error("MyVete Bookmarklet: error al extraer idTutor.", error);
    }
    return null;
  }

  // Paso 2 — Despliegue del panel externo (Sección 3.2, punto 2)
  // IMPORTANTE (Sección 4.1 — bloqueadores de pop-ups): window.open() debe dispararse
  // en el mismo hilo de ejecución del clic sobre el bookmarklet, sin pasos asíncronos
  // intermedios (fetch, await, setTimeout) entre el clic y la apertura. El raspado de
  // arriba es 100% síncrono, así que no rompe esta regla.
  const datosFiliacion = rasparFiliacion();
  const idTutor = extraerIdTutor();

  // Diagnóstico: deja ver en la consola de MyVete exactamente qué se raspó,
  // antes de que sea un problema del panel. Si `tutor` sale con los tres campos
  // en null, el fallo está en encontrarSeccionDatosCliente()/extraerValorPorEtiqueta()
  // contra el DOM real de esta pantalla (ver probe en bookmarklet/README.md).
  console.log("MyVete Bookmarklet: filiación raspada ->", JSON.stringify(datosFiliacion));
  console.log("MyVete Bookmarklet: idTutor ->", idTutor);

  // El ID de tutor viaja por query param: interface/app.js corre en el origen del
  // panel (no en MyVete), así que la URL es el único canal disponible al cargar
  // el documento — el postMessage (más abajo) lo repite solo como respaldo.
  const params = new URLSearchParams();
  if (idTutor) params.set("idTutor", idTutor);
  const queryString = params.toString();
  const urlPanel =
    PANEL_URL +
    (queryString ? (PANEL_URL.indexOf("?") === -1 ? "?" : "&") + queryString : "");

  console.log("MyVete Bookmarklet: abriendo panel en", urlPanel);
  console.log(
    "MyVete Bookmarklet: para cambiar la URL del panel ->",
    "localStorage.setItem('myvete_panel_url', '<url>')"
  );
  const ventana = window.open(urlPanel, "MYVETE_PANEL");

  if (!ventana) {
    console.error("MyVete Bookmarklet: window.open() bloqueado por el navegador.");
    return;
  }

  // Handshake con el panel (interface/app.js Sección 0): en vez de disparar el
  // postMessage a ciegas, se espera a que el panel avise MYVETE_PANEL_READY —
  // recién ahí su listener de MYVETE_FILIACION está activo. Sirviendo desde
  // GitHub Pages la carga del panel tarda más que los 2s de la lógica vieja
  // (5 x 400ms), así que ese envío ciego se perdía siempre. Este listener se
  // registra de forma síncrona, antes de que la ventana nueva llegue a 'load',
  // así que no hay carrera: el READY siempre lo encuentra escuchando.
  //
  // Respaldo: si el READY no llega en 5s (panel viejo en caché sin el aviso,
  // extensión que bloquea el postMessage, etc.) se envía igual. interface/app.js
  // solo asigna valores a campos (idempotente), así que un envío de más no hace
  // daño y este fallback no puede empeorar el comportamiento anterior.
  const mensaje = {
    type: "MYVETE_FILIACION",
    payload: Object.assign({}, datosFiliacion, { idTutor: idTutor }),
  };
  console.log("MyVete Bookmarklet: mensaje a enviar al panel ->", JSON.stringify(mensaje));

  function enviarDatosConHandshake(ventanaPanel, mensajeFiliacion) {
    let yaEnviado = false;
    let timeoutId = null;

    function enviar(motivo) {
      if (yaEnviado) return;
      yaEnviado = true;
      clearTimeout(timeoutId);
      window.removeEventListener("message", alRecibirMensaje);
      console.log("MyVete Bookmarklet: enviando filiación al panel (" + motivo + ").");
      ventanaPanel.postMessage(mensajeFiliacion, "*");
    }

    function alRecibirMensaje(evento) {
      if (evento.source !== ventanaPanel) return;
      if (!evento.data || evento.data.type !== "MYVETE_PANEL_READY") return;
      enviar("panel READY");
    }

    window.addEventListener("message", alRecibirMensaje);
    timeoutId = setTimeout(() => enviar("timeout 5s, sin READY"), 5000);
  }

  enviarDatosConHandshake(ventana, mensaje);

  // Paso 5 — Escucha de retorno (Sección 3.2, punto 5)
  // TODO: registrar listener de "message" para recibir el resumen clínico compacto
  //       devuelto por la ventana flotante
  // TODO: al recibir el mensaje, localizar el campo de evolución en el DOM de MyVete,
  //       asignar el valor y disparar evento nativo con bubbling (ver Sección 4.3)
})();
