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
 * Se pueden emitir DOS mensajes de este tipo: el 1ro con mascota + idTutor +
 * tutor raspado de la página actual (mejor esfuerzo); si el tutor no estaba en
 * esa pantalla, un 2do mensaje con `payload: { tutor, idTutor }` cuando el
 * raspado desde una PESTAÑA NUEVA de /customers/{id} termina (el iframe oculto
 * dejó de servir: MyVete devuelve 403 a ese recurso en contexto iframe/fetch).
 * interface/app.js reasigna campos de forma idempotente, así que el 2do mensaje
 * solo completa lo que faltó. Si nada trae datos, los campos viajan en `null`.
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

  // Modo debug del raspado de tutor (05/09/2026). Con esto activo:
  //   - si el raspado desde la pestaña nueva vence por timeout, la pestaña NO se
  //     cierra: queda abierta y en window.__myveteTutorWin para inspección manual
  //     desde la consola (window.__myveteTutorWin.document, .close() para cerrarla).
  //     Sirve para ver qué muestra MyVete realmente ahí (un 403, un login SSO, la
  //     ficha sin poblar, etc.);
  //   - el polling loguea cada ~2s: si la pestaña sigue abierta, readyState del
  //     doc, location.href real, si apareció la sección "Datos del Cliente" y si
  //     cada campo (nombre / teléfono / email) ya está poblado.
  // Activado por defecto durante la etapa de diagnóstico. Para apagarlo (volver
  // al comportamiento de producción: pestaña siempre cerrada, sin logs de poll):
  //   localStorage.setItem('myvete_debug_tutor', '0')
  let DEBUG_TUTOR = true;
  try {
    if (localStorage.getItem("myvete_debug_tutor") === "0") DEBUG_TUTOR = false;
  } catch (error) {
    // sin localStorage: se queda con el default (debug activo).
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

  // Como normalizarTexto pero sin bajar a minúsculas: para valores que se
  // muestran tal cual al médico (nombre, email con mayúsculas, etc.).
  function normalizarConEspacios(texto) {
    return (texto || "").replace(/\s+/g, " ").trim();
  }

  // Acepta un Document (el de la página actual o el de un iframe same-origin).
  function encontrarSeccionDatosCliente(raiz) {
    const doc = raiz || document;
    try {
      // Ruta principal: el tab-pane "Datos del Cliente" tiene id estable
      // (probe 02/09/2026). Si MyVete lo renombra, se cae al fallback por texto.
      const porId = doc.getElementById("modalcustomerDetail_customers");
      if (porId) return porId;

      // Fallback: no se asume una etiqueta de título estándar; se buscan todos
      // los elementos cuyo texto normalizado sea exacto "datos del cliente" y,
      // si hay varios, se prefiere el más específico (menos descendientes), y
      // desde ahí se sube al primer ancestro que contenga las dos etiquetas.
      const candidatos = Array.from(doc.querySelectorAll("body *")).filter(
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

  function extraerValorPorEtiqueta(root, etiqueta, silencioso) {
    if (!root) return null;
    const etiquetaNorm = normalizarTexto(etiqueta);
    const avisar = (msg, extra) => {
      if (!silencioso) console.warn(msg, extra);
    };

    // La etiqueta es un DIV.col-sm-4.col-xs-12 con el texto exacto; el valor es
    // el DIV.col-sm-8.col-xs-12 hermano (mismo row). textContent (no innerText)
    // porque el panel puede estar en un tab oculto sin layout calculado.
    const nodoEtiqueta = Array.from(
      root.querySelectorAll("div.col-sm-4.col-xs-12")
    ).find((d) => normalizarTexto(d.textContent) === etiquetaNorm);
    if (!nodoEtiqueta) {
      avisar("MyVete Bookmarklet: etiqueta de tutor no encontrada:", etiqueta);
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
      avisar("MyVete Bookmarklet: valor de tutor no encontrado para:", etiqueta);
      return null;
    }

    const texto = normalizarConEspacios(nodoValor.textContent);
    return texto || null;
  }

  // Raspa nombre/teléfono/email de una sección ya localizada (sirve tanto para
  // la página actual como para el Document de un iframe). `silencioso` corta los
  // console.warn durante el polling del iframe (se hace un intento final ruidoso).
  function rasparTutorDeSeccion(seccion, origen, silencioso) {
    const vacio = { nombre: null, telefono: null, email: null };
    if (!seccion) return vacio;
    try {
      const nombre = extraerValorPorEtiqueta(seccion, "Nombre:", silencioso);
      const telefono = extraerValorPorEtiqueta(seccion, "Teléfono celular:", silencioso);
      const email = extraerValorPorEtiqueta(seccion, "Email personal:", silencioso);

      const telefonoOk = telefono && REGEX_TELEFONO.test(telefono) ? telefono : null;
      const emailOk = email && REGEX_EMAIL.test(email) ? email : null;
      if (!silencioso && telefono && !telefonoOk) {
        console.warn("MyVete Bookmarklet: teléfono raspado no pasó la validación de forma:", telefono);
      }
      if (!silencioso && email && !emailOk) {
        console.warn("MyVete Bookmarklet: email raspado no pasó la validación de forma:", email);
      }

      const resultado = { nombre: nombre || null, telefono: telefonoOk, email: emailOk };
      if (!silencioso) {
        console.log(
          "MyVete Bookmarklet: tutor raspado (" + (origen || "?") + ") ->",
          "nombre:", resultado.nombre || "(no encontrado)",
          "| teléfono:", resultado.telefono || "(no encontrado)",
          "| email:", resultado.email || "(no encontrado)"
        );
      }
      return resultado;
    } catch (error) {
      console.error("MyVete Bookmarklet: error al raspar tutor de sección.", error);
      return vacio;
    }
  }

  // Raspado síncrono desde la página actual (mejor esfuerzo). Si acá no está la
  // sección "Datos del Cliente", el flujo principal abre la pestaña nueva (abajo).
  function rasparTutor() {
    const seccion = encontrarSeccionDatosCliente(document);
    if (!seccion) {
      console.warn("MyVete Bookmarklet: sección 'Datos del Cliente' no está en la página actual.");
    }
    return rasparTutorDeSeccion(seccion, "página actual", false);
  }

  // Plan B (v3 — 05/09/2026): si la ficha del paciente NO trae los datos del
  // tutor, se abre /customers/{id} en una PESTAÑA NUEVA (window.open) y se raspa
  // desde ahí. Sustituye al iframe oculto, que dejó de servir: MyVete empezó a
  // responder 403 a /customers/{id} en contexto iframe/fetch (WAF que filtra por
  // Sec-Fetch-Dest / X-Requested-With). Una pestaña nueva es una navegación
  // top-level normal —cookies completas, `Sec-Fetch-Dest: document`,
  // `Sec-Fetch-Mode: navigate`, sin `X-Requested-With`—, indistinguible de que el
  // usuario abra el enlace a mano, así que no dispara ese bloqueo. Además el SPA
  // en una pestaña top-level no está enmarcado (`window.top === window.self`), lo
  // que descarta cualquier redirect por frame-detection.
  //
  // `tutorWin` DEBE venir de un window.open() disparado sincrónicamente dentro
  // del clic del bookmarklet (más abajo): un window.open diferido lo mata el
  // bloqueador de pop-ups. Acá solo se hace el polling del documento de esa
  // pestaña (same-origin app.myvete.com -> `tutorWin.document` accesible) y, al
  // terminar, se la cierra. Devuelve SIEMPRE {nombre,telefono,email} (nulls si
  // falla / la bloquean / vence el timeout): nunca rechaza, no rompe el flujo.
  function rasparTutorDesdePestana(idTutorArg, tutorWin) {
    return new Promise((resolve) => {
      const vacio = { nombre: null, telefono: null, email: null };
      // 30s: en la prueba real MyVete tarda en poblar "Datos del Cliente" en una
      // carga en frío del SPA por esa ruta (sin warm-up).
      const LIMITE_MS = 30000;
      let intervalo = null;
      let timeoutGlobal = null;
      let observer = null;
      let observerInstalado = false;
      let terminado = false;
      let ultimoDiag = 0;
      const inicio = Date.now();

      if (!tutorWin) {
        console.warn(
          "MyVete Bookmarklet: la pestaña /customers/" + idTutorArg + " fue BLOQUEADA por el " +
            "navegador (pop-ups). Cargá el tutor a mano; para que se auto-complete, permití " +
            "pop-ups para " + window.location.origin + " y volvé a hacer clic."
        );
        return resolve(vacio);
      }
      window.__myveteTutorWin = tutorWin;

      // undefined = document inaccesible (la pestaña navegó a OTRO origen: login
      // SSO en otro dominio, típicamente). null = todavía no hay documento.
      function obtenerDoc() {
        try {
          return tutorWin.document || null;
        } catch (error) {
          return undefined;
        }
      }

      // `conservar` (solo en DEBUG_TUTOR + timeout): deja la pestaña abierta y en
      // window.__myveteTutorWin para poder ver a mano qué muestra MyVete (403,
      // login, ficha sin poblar...).
      function finalizar(resultado, motivo, conservar) {
        if (terminado) return;
        terminado = true;
        if (intervalo) clearInterval(intervalo);
        if (timeoutGlobal) clearTimeout(timeoutGlobal);
        if (observer) {
          try {
            observer.disconnect();
          } catch (error) {
            // ignorado
          }
        }
        if (conservar) {
          console.warn(
            "MyVete Bookmarklet: pestaña de tutor CONSERVADA para inspección (" + motivo + "). " +
              "Ref: window.__myveteTutorWin | doc: window.__myveteTutorWin.document | " +
              "cerrarla: window.__myveteTutorWin.close()"
          );
        } else {
          try {
            if (tutorWin && !tutorWin.closed) tutorWin.close();
          } catch (error) {
            // algunos navegadores no dejan cerrar por script: no es fatal.
          }
          console.log("MyVete Bookmarklet: pestaña de tutor cerrada (" + motivo + ").");
        }
        resolve(resultado);
      }

      // Traza de diagnóstico del polling (solo DEBUG_TUTOR), 1 línea cada ~2s.
      function logDiagnostico(doc, seccion) {
        if (!DEBUG_TUTOR) return;
        const ahora = Date.now();
        if (ahora - ultimoDiag < 2000) return;
        ultimoDiag = ahora;
        let loc = "(sin doc)";
        try {
          if (doc && doc.location) loc = doc.location.href;
        } catch (error) {
          loc = "(location inaccesible)";
        }
        const t = seccion ? rasparTutorDeSeccion(seccion, "diag", true) : null;
        console.log(
          "MyVete Bookmarklet [diag " + Math.round((ahora - inicio) / 1000) + "s]:",
          "closed:", tutorWin.closed,
          "| readyState:", (doc && doc.readyState) || "(sin doc)",
          "| location:", loc,
          "| sección Datos del Cliente:", seccion ? "PRESENTE" : "ausente",
          "| nombre:", t && t.nombre ? "sí" : "no",
          "| teléfono:", t && t.telefono ? "sí" : "no",
          "| email:", t && t.email ? "sí" : "no"
        );
      }

      // MutationObserver sobre la sección apenas aparece: reacciona al instante
      // cuando el SPA inyecta los valores del XHR de /customers/{id}. El intervalo
      // de 400ms queda como respaldo. Se usa el constructor de la propia pestaña
      // (mismo realm que el nodo observado); si falla, el polling cubre igual.
      function instalarObserverSiHaceFalta(seccion) {
        if (observerInstalado || !seccion) return;
        observerInstalado = true;
        try {
          const MO = tutorWin.MutationObserver || window.MutationObserver;
          observer = new MO(function () {
            intentar();
          });
          observer.observe(seccion, { childList: true, subtree: true, characterData: true });
        } catch (error) {
          observer = null;
        }
      }

      function intentar() {
        if (terminado) return;
        if (tutorWin.closed) {
          return finalizar(vacio, "pestaña cerrada por el usuario");
        }
        const doc = obtenerDoc();
        if (doc === undefined) {
          // Navegó a otro origen (login SSO). No se puede leer. Se espera por si
          // vuelve; si no, corta por timeout más abajo.
          if (Date.now() - inicio > LIMITE_MS) {
            console.warn(
              "MyVete Bookmarklet: la pestaña de tutor está en otro origen (¿login SSO?); no se puede raspar."
            );
            return finalizar(vacio, "cross-origin (login?) + timeout", DEBUG_TUTOR);
          }
          return;
        }
        const seccion = doc && encontrarSeccionDatosCliente(doc);
        logDiagnostico(doc, seccion);
        if (seccion) {
          instalarObserverSiHaceFalta(seccion);
          const tutor = rasparTutorDeSeccion(seccion, "pestaña /customers/" + idTutorArg, true);
          if (tutor.nombre || tutor.telefono || tutor.email) {
            // Intento final ruidoso: deja el resumen y los warns en consola.
            const definitivo = rasparTutorDeSeccion(seccion, "pestaña /customers/" + idTutorArg, false);
            return finalizar(definitivo, "datos obtenidos");
          }
        }
        if (Date.now() - inicio > LIMITE_MS) {
          if (seccion) {
            console.warn("MyVete Bookmarklet: sección encontrada en la pestaña pero sin valores; intento final:");
            rasparTutorDeSeccion(seccion, "pestaña /customers/" + idTutorArg, false);
            try {
              console.warn("MyVete Bookmarklet: diagnóstico pestaña -> location:", doc.location.href);
              console.warn(
                "MyVete Bookmarklet: diagnóstico pestaña -> seccion.outerHTML (recortado):",
                (seccion.outerHTML || "").slice(0, 1500)
              );
            } catch (error) {
              // best-effort
            }
          } else {
            let loc = "?";
            try {
              loc = doc.location.href;
            } catch (error) {
              // ignorado
            }
            console.warn(
              "MyVete Bookmarklet: sección 'Datos del Cliente' no apareció en la pestaña (location:", loc, ")."
            );
          }
          // En DEBUG_TUTOR la pestaña se conserva (ver finalizar()); en producción
          // se cierra siempre.
          return finalizar(vacio, "timeout " + LIMITE_MS + "ms", DEBUG_TUTOR);
        }
      }

      try {
        tutorWin.addEventListener("load", intentar);
      } catch (error) {
        // algunos navegadores no dejan enganchar 'load' de otra ventana hasta que
        // termina de navegar: el polling lo cubre igual.
      }
      intervalo = setInterval(intentar, 400);
      timeoutGlobal = setTimeout(function () {
        finalizar(vacio, "timeout global", DEBUG_TUTOR);
      }, LIMITE_MS + 1500);
      intentar();
    });
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

  // Plan B, apertura sincrónica (Sección 4.1 — bloqueadores de pop-ups): si el
  // tutor no vino en la página actual y hay idTutor, la pestaña /customers/{id}
  // se abre AHORA, dentro del hilo del clic. Diferirla a un .then() haría que el
  // bloqueador de pop-ups la mate. Se abre ANTES que el panel para que el panel
  // quede como pestaña activa al final. El polling/raspado (asíncrono) se engancha
  // más abajo, cuando ya está el canal del panel.
  const tutorSync = (datosFiliacion && datosFiliacion.tutor) || {};
  const tutorVacio = !tutorSync.nombre && !tutorSync.telefono && !tutorSync.email;
  const necesitaPestanaTutor = tutorVacio && !!idTutor;
  let tutorWin = null;
  if (necesitaPestanaTutor) {
    const urlTutor = window.location.origin + "/customers/" + encodeURIComponent(idTutor);
    try {
      tutorWin = window.open(urlTutor, "MYVETE_TUTOR_SCRAPE");
      console.log(
        "MyVete Bookmarklet: pestaña de tutor abierta ->", urlTutor,
        tutorWin ? "" : "(BLOQUEADA por el navegador)"
      );
    } catch (error) {
      console.error("MyVete Bookmarklet: no se pudo abrir la pestaña de tutor.", error);
    }
  }

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
    // No dejar huérfana la pestaña de tutor si el panel no pudo abrir.
    try {
      if (tutorWin && !tutorWin.closed) tutorWin.close();
    } catch (error) {
      // ignorado
    }
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
  console.log("MyVete Bookmarklet: 1er mensaje al panel ->", JSON.stringify(mensaje));

  // Canal hacia el panel con handshake: los mensajes se encolan hasta que el
  // panel avisa MYVETE_PANEL_READY (o hasta un respaldo de 5s), y a partir de
  // ahí se despachan de inmediato. Soporta varios envíos: el 1ro lleva mascota +
  // idTutor + tutor de la página actual; si después el iframe consigue el tutor,
  // se manda un 2do MYVETE_FILIACION (interface/app.js reasigna campos de forma
  // idempotente, así que un segundo mensaje solo completa lo que faltaba).
  function crearCanalPanel(ventanaPanel) {
    let listo = false;
    const cola = [];

    function flush() {
      while (cola.length) {
        const m = cola.shift();
        console.log("MyVete Bookmarklet: -> panel:", JSON.stringify(m));
        ventanaPanel.postMessage(m, "*");
      }
    }

    function alRecibirMensaje(evento) {
      if (evento.source !== ventanaPanel) return;
      if (!evento.data || evento.data.type !== "MYVETE_PANEL_READY") return;
      if (listo) return;
      listo = true;
      console.log("MyVete Bookmarklet: panel READY.");
      flush();
    }

    window.addEventListener("message", alRecibirMensaje);
    setTimeout(() => {
      if (listo) return;
      listo = true;
      console.warn("MyVete Bookmarklet: sin READY en 5s, se despacha igual.");
      flush();
    }, 5000);

    return {
      enviar(m) {
        cola.push(m);
        if (listo) flush();
      },
    };
  }

  const panel = crearCanalPanel(ventana);
  panel.enviar(mensaje);

  // Plan B (continuación): la pestaña /customers/{id} ya se abrió sincrónicamente
  // arriba (tutorWin). Acá se hace el polling asíncrono de su documento y, cuando
  // trae datos, se manda como 2do mensaje al panel.
  if (necesitaPestanaTutor) {
    console.log(
      "MyVete Bookmarklet: tutor ausente en la página actual; raspando desde la pestaña /customers/" + idTutor
    );
    rasparTutorDesdePestana(idTutor, tutorWin).then((tutorPestana) => {
      if (!tutorPestana.nombre && !tutorPestana.telefono && !tutorPestana.email) {
        console.warn(
          "MyVete Bookmarklet: la pestaña tampoco trajo datos de tutor. Se cargan a mano en el panel."
        );
        return;
      }
      const mensaje2 = {
        type: "MYVETE_FILIACION",
        payload: { tutor: tutorPestana, idTutor: idTutor },
      };
      console.log("MyVete Bookmarklet: 2do mensaje (tutor desde pestaña) ->", JSON.stringify(mensaje2));
      panel.enviar(mensaje2);
    });
  }

  // Paso 5 — Escucha de retorno (Sección 3.2, punto 5)
  // TODO: registrar listener de "message" para recibir el resumen clínico compacto
  //       devuelto por la ventana flotante
  // TODO: al recibir el mensaje, localizar el campo de evolución en el DOM de MyVete,
  //       asignar el valor y disparar evento nativo con bubbling (ver Sección 4.3)
})();
