/**
 * Bookmarklet — Cargador síncrono.
 * Ver INFORME-ARQUITECTURA-MYVETE-V2.7.md, Sección 3 (SECCIÓN 5), punto 3.2, pasos 1-2.
 *
 * Responsabilidad de este archivo: correr en el contexto de la pestaña de MyVete,
 * extraer lo mínimo indispensable de la pantalla activa y desplegar el panel
 * definido en /interface/index.html. No contiene lógica de formulario ni de
 * negocio — eso vive del lado de /interface/app.js.
 *
 * Despliegue del panel (06/09/2026): el panel se monta como IFRAME OVERLAY dentro
 * de la propia página de MyVete, NO como segunda ventana emergente. Motivo: el
 * navegador permite una sola ventana por gesto de usuario, y el flujo abría dos
 * window.open() en el mismo clic (la pestaña de raspado del tutor + el panel), con
 * lo que el bloqueador de pop-ups mataba la segunda (el panel) en silencio y el
 * bookmarklet "no hacía nada". Ahora el único window.open() del gesto es el de la
 * pestaña del tutor (Plan B), que al ser el primero/único nunca se bloquea. Si
 * MyVete bloquea el iframe por CSP/X-Frame-Options (no confirma READY en 9s), se
 * cae solo a window.open() en ventana aparte.
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
  // URL del panel (interface/index.html), servido por GitHub Pages desde la raíz
  // del repo: /MYVETE-INGESTA-N8N/interface/index.html.
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

  // Modo debug del raspado de tutor. Con esto activo:
  //   - si el raspado desde la pestaña nueva vence por timeout, la pestaña NO se
  //     cierra: queda abierta y en window.__myveteTutorWin para inspección manual
  //     desde la consola (window.__myveteTutorWin.document, .close() para cerrarla);
  //   - el polling loguea cada ~2s: si la pestaña sigue abierta, readyState del
  //     doc, location.href real, si apareció la sección "Datos del Cliente" y si
  //     cada campo (nombre / teléfono / email) ya está poblado.
  // Apagado por defecto (producción). Para encenderlo durante un diagnóstico:
  //   localStorage.setItem('myvete_debug_tutor', '1')
  // (se sigue respetando el viejo '0' como "apagado" por compatibilidad).
  let DEBUG_TUTOR = false;
  try {
    if (localStorage.getItem("myvete_debug_tutor") === "1") DEBUG_TUTOR = true;
  } catch (error) {
    // sin localStorage: se queda con el default (debug apagado).
  }

  // Paso 1 — Activación y raspado de entrada (Sección 3.2, punto 1)
  // Selectores confirmados sobre el DOM de la ficha clínica (div.patient-info) y
  // sobre la sección "Datos del Cliente" (probe-tutor.js, 02/09/2026). Todos los
  // selectores de acá abajo llevan fallbacks: si MyVete cambia el grid Bootstrap,
  // los ids o las clases, el raspado degrada pero no se cae a null en seco.
  //
  // Blindaje anti-contaminación (detectado 25/08/2026, paciente "Mentira"): un div
  // contenedor previo al bloque de perfil puede envolver también los datos de
  // contacto del tutor, y como querySelectorAll('div') recorre en orden de
  // documento, ese ancestro (cuyo innerText concatena TODO su contenido) puede
  // llegar antes que el div hoja real y ganar el .find() por tener una coma
  // "de casualidad". Se descartan los nodos con hijos de bloque (solo interesan
  // hojas) y además se exige que el primer segmento coincida con una especie
  // conocida, para no depender únicamente de la forma del DOM.
  const ESPECIES_VALIDAS = [
    "canino", "canina", "felino", "felina", "perro", "perra", "gato", "gata",
    "equino", "equina", "caballo", "yegua", "ave", "aviar", "exotico", "exótico",
    "conejo", "huron", "hurón", "roedor", "hamster", "cobayo", "reptil", "tortuga",
    "caprino", "bovino", "ovino", "porcino", "silvestre",
  ];

  // Blindaje análogo para tutor: la búsqueda de etiquetas está acotada al
  // contenedor de "Datos del Cliente" (nunca a document completo) para no
  // confundir el "Nombre:" del tutor con el de la mascota, y el valor asociado se
  // valida por forma (regex de teléfono/email) antes de aceptarlo.
  const REGEX_TELEFONO = /^[+\d][\d\s\-()]{5,}$/;
  const REGEX_EMAIL = /\S+@\S+\.\S+/;

  function escaparRegex(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizarTexto(texto) {
    return (texto || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Como normalizarTexto pero sin bajar a minúsculas: para valores que se
  // muestran tal cual al médico (nombre, email con mayúsculas, etc.).
  function normalizarConEspacios(texto) {
    return (texto || "").replace(/\s+/g, " ").trim();
  }

  // Acepta un Document (el de la página actual o el de una pestaña same-origin).
  function encontrarSeccionDatosCliente(raiz) {
    const doc = raiz || document;
    try {
      // Ruta principal: el tab-pane "Datos del Cliente" tiene id estable
      // (probe 02/09/2026). Fallbacks por si MyVete lo renombra.
      const porId =
        doc.getElementById("modalcustomerDetail_customers") ||
        doc.querySelector(
          "[id*='customerDetail'],[id*='customerdetail'],[id^='modalcustomer']," +
            "[id*='datosCliente'],[id*='datoscliente'],[id*='clienteDetail']"
        );
      if (porId) return porId;

      // Fallback por texto: encabezados típicos que contengan "datos del cliente".
      const encabezados = Array.from(
        doc.querySelectorAll(
          "h1,h2,h3,h4,h5,h6,legend,.panel-title,.card-title,.box-title,.tab-pane," +
            "[class*='title'],[class*='header'],[class*='titulo']"
        )
      ).filter((n) => normalizarTexto(n.innerText).indexOf("datos del cliente") !== -1);

      const anclas = encabezados.length
        ? encabezados
        : Array.from(doc.querySelectorAll("body *")).filter(
            (n) => normalizarTexto(n.innerText) === "datos del cliente"
          );

      for (const ancla of anclas) {
        let contenedor = ancla.parentElement;
        let saltos = 0;
        while (contenedor && saltos < 12) {
          const texto = normalizarTexto(contenedor.innerText);
          const tieneTel =
            texto.indexOf("teléfono") !== -1 ||
            texto.indexOf("telefono") !== -1 ||
            texto.indexOf("celular") !== -1;
          const tieneMail =
            texto.indexOf("email") !== -1 ||
            texto.indexOf("e-mail") !== -1 ||
            texto.indexOf("correo") !== -1;
          if (tieneTel && tieneMail) return contenedor;
          contenedor = contenedor.parentElement;
          saltos += 1;
        }
      }

      // Último recurso: el elemento más chico que contenga a la vez nombre,
      // teléfono/celular y email/correo (sin asumir ninguna clase ni id).
      const candidatos = Array.from(
        doc.querySelectorAll("div,section,form,table,article")
      ).filter((n) => {
        const t = normalizarTexto(n.innerText);
        if (!t || t.length > 6000) return false;
        const tel =
          t.indexOf("teléfono") !== -1 || t.indexOf("telefono") !== -1 || t.indexOf("celular") !== -1;
        const mail = t.indexOf("email") !== -1 || t.indexOf("e-mail") !== -1 || t.indexOf("correo") !== -1;
        return tel && mail && t.indexOf("nombre") !== -1;
      });
      candidatos.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
      return candidatos[0] || null;
    } catch (error) {
      return null;
    }
  }

  function extraerValorPorEtiqueta(root, etiqueta, silencioso) {
    if (!root) return null;
    const etiquetaNorm = normalizarTexto(etiqueta);
    const etiquetaSinDosPuntos = etiquetaNorm.replace(/:$/, "").trim();
    const avisar = (msg, extra) => {
      if (!silencioso) console.warn(msg, extra);
    };

    // Selectores de etiqueta y valor con fallbacks: el grid original es Bootstrap
    // 3 (col-sm-4 / col-sm-8), pero se aceptan variantes de Bootstrap 4/5, listas
    // de definición (dt/dd) y tablas (th/td).
    const SEL_ETIQUETA =
      "div.col-sm-4.col-xs-12,[class*='col-sm-4'],[class*='col-md-4'],[class*='col-4']," +
      "dt,th,label,strong,b,.control-label,.field-label,[class*='label']";
    const SEL_VALOR =
      "div.col-sm-8.col-xs-12,[class*='col-sm-8'],[class*='col-md-8'],[class*='col-8']," +
      "dd,td,[class*='value'],[class*='valor']";

    const coincideEtiqueta = (nodo) => {
      const t = normalizarTexto(nodo.textContent);
      if (!t) return false;
      return (
        t === etiquetaNorm ||
        t === etiquetaSinDosPuntos ||
        t === etiquetaSinDosPuntos + ":" ||
        (t.length <= etiquetaSinDosPuntos.length + 3 && t.indexOf(etiquetaSinDosPuntos) === 0)
      );
    };

    let nodosEtiqueta = Array.from(root.querySelectorAll(SEL_ETIQUETA)).filter(coincideEtiqueta);
    if (!nodosEtiqueta.length) {
      // Barrido amplio: cualquier elemento hoja cuyo texto sea exactamente la etiqueta.
      nodosEtiqueta = Array.from(root.querySelectorAll("*")).filter(
        (n) => !n.children.length && coincideEtiqueta(n)
      );
    }
    if (!nodosEtiqueta.length) {
      avisar("MyVete Bookmarklet: etiqueta de tutor no encontrada:", etiqueta);
      return null;
    }
    // La más específica primero (texto más corto = más cerca de la hoja real).
    nodosEtiqueta.sort((a, b) => a.textContent.length - b.textContent.length);

    for (const nodoEtiqueta of nodosEtiqueta) {
      const fila = nodoEtiqueta.parentElement;
      let nodoValor = null;

      // 1) Columna/celda hermana dentro del mismo row.
      if (fila) {
        nodoValor = Array.from(fila.querySelectorAll(SEL_VALOR)).find(
          (v) =>
            v !== nodoEtiqueta &&
            !nodoEtiqueta.contains(v) &&
            !v.contains(nodoEtiqueta) &&
            normalizarConEspacios(v.textContent)
        );
      }
      // 2) El siguiente hermano con texto que no sea otra etiqueta.
      if (!nodoValor) {
        let sig = nodoEtiqueta.nextElementSibling;
        while (sig && !normalizarConEspacios(sig.textContent)) sig = sig.nextElementSibling;
        if (sig && !coincideEtiqueta(sig)) nodoValor = sig;
      }
      // 3) El primer nodo-valor que siga a la etiqueta en orden de documento.
      if (!nodoValor) {
        nodoValor = Array.from(root.querySelectorAll(SEL_VALOR)).find(
          (v) =>
            normalizarConEspacios(v.textContent) &&
            nodoEtiqueta.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      }

      let texto = nodoValor ? normalizarConEspacios(nodoValor.textContent) : null;

      // 4) Respaldo final: el texto de la fila con el prefijo de la etiqueta quitado.
      if (!texto && fila) {
        const filaTexto = normalizarConEspacios(fila.textContent);
        const limpio = filaTexto
          .replace(new RegExp("^\\s*" + escaparRegex(etiqueta) + "\\s*", "i"), "")
          .trim();
        if (limpio && normalizarTexto(limpio) !== etiquetaNorm) texto = limpio;
      }

      if (texto && normalizarTexto(texto) !== etiquetaNorm) return texto;
    }

    avisar("MyVete Bookmarklet: valor de tutor no encontrado para:", etiqueta);
    return null;
  }

  // Raspa nombre/teléfono/email de una sección ya localizada (sirve tanto para
  // la página actual como para el Document de una pestaña same-origin).
  // `silencioso` corta los console.warn durante el polling (se hace un intento
  // final ruidoso). Cada etiqueta prueba varias redacciones (MyVete podría usar
  // "Celular:" o "E-mail:" en vez de "Teléfono celular:" / "Email personal:").
  function rasparTutorDeSeccion(seccion, origen, silencioso) {
    const vacio = { nombre: null, telefono: null, email: null };
    if (!seccion) return vacio;
    try {
      const primero = (etiquetas) => {
        for (const et of etiquetas) {
          const v = extraerValorPorEtiqueta(seccion, et, true);
          if (v) return v;
        }
        return null;
      };

      const nombre = primero(["Nombre:", "Nombre y apellido:", "Nombre completo:", "Cliente:"]);
      const telefono = primero([
        "Teléfono celular:", "Telefono celular:", "Celular:", "Teléfono:", "Telefono:",
        "Teléfono móvil:", "Tel:",
      ]);
      const email = primero([
        "Email personal:", "Email:", "E-mail personal:", "E-mail:", "Correo:",
        "Correo electrónico:", "Correo electronico:",
      ]);

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

  // Plan B: si la ficha del paciente NO trae los datos del tutor, se abre
  // /customers/{id} en una PESTAÑA NUEVA (window.open) y se raspa desde ahí.
  // Sustituye al iframe oculto, que dejó de servir: MyVete responde 403 a
  // /customers/{id} en contexto iframe/fetch (WAF que filtra por Sec-Fetch-Dest /
  // X-Requested-With). Una pestaña nueva es una navegación top-level normal, así
  // que no dispara ese bloqueo.
  //
  // `tutorWin` DEBE venir de un window.open() disparado sincrónicamente dentro
  // del clic del bookmarklet (más abajo): un window.open diferido lo mata el
  // bloqueador de pop-ups. Acá solo se hace el polling del documento de esa
  // pestaña (same-origin -> `tutorWin.document` accesible) y, al terminar, se la
  // cierra. Devuelve SIEMPRE {nombre,telefono,email}: nunca rechaza.
  function rasparTutorDesdePestana(idTutorArg, tutorWin) {
    return new Promise((resolve) => {
      const vacio = { nombre: null, telefono: null, email: null };
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

      function obtenerDoc() {
        try {
          return tutorWin.document || null;
        } catch (error) {
          return undefined;
        }
      }

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
      const root =
        document.querySelector(".patient-info") ||
        document.querySelector(
          "[class*='patient-info'],[class*='patient_info'],[class*='patientInfo']," +
            "[class*='patient-header'],[class*='paciente-info'],#patient-info,.patient,.paciente"
        );
      if (!root) {
        console.warn("MyVete Bookmarklet: contenedor de la mascota (.patient-info) no encontrado.");
        return { tutor: rasparTutor(), mascota: vacio.mascota };
      }

      const nodoNombre = root.querySelector(
        "h1,h2,.patient-name,[class*='patient-name'],[class*='paciente-nombre'],[class*='pet-name']"
      );
      const nombreMascota =
        nodoNombre && nodoNombre.innerText ? nodoNombre.innerText.trim() || null : null;

      // "Especie, raza[, color]" en un nodo hoja. Se aceptan varios tags (no solo
      // div) y se exige que el primer segmento sea una especie conocida.
      const divCombinado = Array.from(
        root.querySelectorAll("div,span,p,li,small,h2,h3,h4")
      ).find((d) => {
        if (d.querySelector("div,span,p,li")) return false; // solo hojas
        const texto = d.innerText && d.innerText.trim();
        if (!texto || texto.indexOf(",") === -1) return false;
        const primeraParte = normalizarTexto(texto.split(",")[0]);
        return ESPECIES_VALIDAS.indexOf(primeraParte) !== -1;
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

  // Paso 2 — Despliegue del panel (Sección 3.2, punto 2)
  // IMPORTANTE (Sección 4.1 — bloqueadores de pop-ups): el ÚNICO window.open() que
  // corre dentro del gesto del clic es el de la pestaña del tutor (Plan B). El
  // panel se monta como iframe overlay (sin ventana emergente), así que no hay
  // "segundo window.open" que el navegador pueda bloquear. El raspado de arriba es
  // 100% síncrono, así que la pestaña del tutor se abre limpia dentro del gesto.
  const datosFiliacion = rasparFiliacion();
  const idTutor = extraerIdTutor();

  console.log("MyVete Bookmarklet: filiación raspada ->", JSON.stringify(datosFiliacion));
  console.log("MyVete Bookmarklet: idTutor ->", idTutor);

  // Plan B, apertura sincrónica: si el tutor no vino en la página actual y hay
  // idTutor, la pestaña /customers/{id} se abre AHORA, dentro del hilo del clic.
  // Diferirla a un .then() haría que el bloqueador de pop-ups la mate.
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
  // panel (no en MyVete), así que la URL es el único canal disponible al cargar el
  // documento — el postMessage (más abajo) lo repite solo como respaldo.
  const params = new URLSearchParams();
  if (idTutor) params.set("idTutor", idTutor);
  const queryString = params.toString();
  const urlPanel =
    PANEL_URL +
    (queryString ? (PANEL_URL.indexOf("?") === -1 ? "?" : "&") + queryString : "");

  console.log("MyVete Bookmarklet: montando panel embebido ->", urlPanel);
  console.log(
    "MyVete Bookmarklet: para cambiar la URL del panel ->",
    "localStorage.setItem('myvete_panel_url', '<url>')"
  );

  // Overlay del panel: <div> fijo a pantalla completa con un <iframe> del panel.
  // Todos los estilos se fijan por CSSOM (.style.cssText) — no por atributo
  // style= ni <style> inyectado — para no chocar con una CSP style-src estricta
  // de MyVete. Se usan !important en lo crítico para ganarle a los estilos del
  // sitio anfitrión.
  function crearOverlayPanel(url, alPedirVentana) {
    const previo = document.getElementById("myvete-panel-host");
    if (previo && previo.parentNode) previo.parentNode.removeChild(previo);

    const host = document.createElement("div");
    host.id = "myvete-panel-host";
    host.style.cssText =
      "position:fixed!important;inset:0!important;z-index:2147483647!important;" +
      "margin:0!important;padding:0!important;background:rgba(0,0,0,.35)!important;" +
      "display:flex!important;justify-content:flex-end!important;";

    const caja = document.createElement("div");
    caja.style.cssText =
      "width:520px!important;max-width:100%!important;height:100%!important;" +
      "background:#fff!important;display:flex!important;flex-direction:column!important;" +
      "box-shadow:-4px 0 24px rgba(0,0,0,.35)!important;";

    const barra = document.createElement("div");
    barra.style.cssText =
      "flex:0 0 auto!important;display:flex!important;align-items:center!important;" +
      "gap:10px!important;padding:6px 10px!important;background:#0b8457!important;" +
      "color:#fff!important;font:600 13px/1.4 system-ui,'Segoe UI',Arial,sans-serif!important;";

    const titulo = document.createElement("span");
    titulo.textContent = "MyVete → Panel de carga";

    const espaciador = document.createElement("span");
    espaciador.style.cssText = "flex:1 1 auto!important;";

    const botonVentana = document.createElement("button");
    botonVentana.type = "button";
    botonVentana.textContent = "Abrir en pestaña";
    botonVentana.style.cssText =
      "border:0!important;background:transparent!important;color:#fff!important;" +
      "text-decoration:underline!important;cursor:pointer!important;font:inherit!important;";

    const botonCerrar = document.createElement("button");
    botonCerrar.type = "button";
    botonCerrar.textContent = "✕";
    botonCerrar.setAttribute("aria-label", "Cerrar panel");
    botonCerrar.style.cssText =
      "border:0!important;background:transparent!important;color:#fff!important;" +
      "font-size:16px!important;line-height:1!important;cursor:pointer!important;padding:2px 6px!important;";

    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = "MyVete Panel de carga";
    iframe.setAttribute("allow", "microphone; clipboard-write; clipboard-read");
    iframe.style.cssText =
      "flex:1 1 auto!important;width:100%!important;height:100%!important;" +
      "border:0!important;background:#fff!important;display:block!important;";

    function destruir() {
      window.removeEventListener("keydown", alPresionarTecla);
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }
    function alPresionarTecla(evento) {
      if (evento.key === "Escape") destruir();
    }

    botonCerrar.addEventListener("click", destruir);
    botonVentana.addEventListener("click", function () {
      if (typeof alPedirVentana === "function") alPedirVentana();
    });
    host.addEventListener("click", function (evento) {
      if (evento.target === host) destruir();
    });
    window.addEventListener("keydown", alPresionarTecla);

    barra.appendChild(titulo);
    barra.appendChild(espaciador);
    barra.appendChild(botonVentana);
    barra.appendChild(botonCerrar);
    caja.appendChild(barra);
    caja.appendChild(iframe);
    host.appendChild(caja);
    (document.body || document.documentElement).appendChild(host);
    window.__myvetePanelHost = host;

    return { iframe: iframe, destruir: destruir };
  }

  // Canal hacia el panel con handshake y fallback iframe -> ventana.
  //  - Modo iframe (default): se espera el aviso MYVETE_PANEL_READY del panel
  //    (interface/app.js). Si el panel no lo confirma en 9s, se asume que MyVete
  //    bloqueó el iframe (CSP / X-Frame-Options) y se cae a window.open().
  //  - Respaldo intermedio: aun con un app.js viejo en caché (que solo avisa
  //    READY al opener), el listener de MYVETE_FILIACION del panel ya está activo,
  //    así que a los 5s se hace un despacho ciego al iframe para no demorar los
  //    datos. interface/app.js reasigna campos de forma idempotente: un envío de
  //    más no hace daño.
  //  - Soporta varios envíos: el 1ro lleva mascota + idTutor + tutor de la página
  //    actual; si después la pestaña consigue el tutor, se manda un 2do mensaje.
  function abrirCanalPanel(url) {
    const cola = [];
    let listo = false;
    let modo = "iframe";
    let destino = null;
    let overlay = null;
    let tFallback = null;
    let tCiego = null;

    function flush() {
      while (cola.length) {
        const m = cola.shift();
        try {
          console.log("MyVete Bookmarklet: -> panel (" + modo + "):", JSON.stringify(m));
          destino.postMessage(m, "*");
        } catch (error) {
          console.warn("MyVete Bookmarklet: no se pudo postMessage al panel.", error);
        }
      }
    }

    function marcarListo(motivo) {
      if (listo) return;
      listo = true;
      if (tFallback) {
        clearTimeout(tFallback);
        tFallback = null;
      }
      if (tCiego) {
        clearTimeout(tCiego);
        tCiego = null;
      }
      console.log("MyVete Bookmarklet: panel LISTO (" + motivo + ").");
      flush();
    }

    function alRecibirMensaje(evento) {
      if (!evento || !evento.data || evento.data.type !== "MYVETE_PANEL_READY") return;
      if (destino && evento.source && evento.source !== destino) return;
      marcarListo("READY (" + modo + ")");
    }
    window.addEventListener("message", alRecibirMensaje);

    function usarVentana(motivo) {
      if (modo === "ventana") return;
      console.warn(
        "MyVete Bookmarklet: el panel embebido no respondió (" + motivo + "); " +
          "abriendo el panel en una ventana aparte."
      );
      modo = "ventana";
      if (overlay) {
        try {
          overlay.destruir();
        } catch (error) {
          // ignorado
        }
        overlay = null;
      }
      let v = null;
      try {
        v = window.open(url, "MYVETE_PANEL");
      } catch (error) {
        v = null;
      }
      if (!v) {
        console.error(
          "MyVete Bookmarklet: no se pudo abrir el panel en ventana (pop-up bloqueado). " +
            "Permití pop-ups para " + window.location.origin + " y volvé a hacer clic, " +
            "o abrí el panel a mano: " + url
        );
        return;
      }
      destino = v;
      tCiego = setTimeout(function () {
        if (!listo) {
          console.warn("MyVete Bookmarklet: ventana del panel sin READY en 5s; se despacha igual.");
          marcarListo("timeout ventana");
        }
      }, 5000);
    }

    // Arranque en modo iframe.
    overlay = crearOverlayPanel(url, function () {
      usarVentana("pedido por el usuario");
    });
    destino = overlay.iframe.contentWindow;

    tFallback = setTimeout(function () {
      if (!listo) usarVentana("sin READY en 9s (¿iframe bloqueado por CSP?)");
    }, 9000);

    tCiego = setTimeout(function () {
      if (listo || modo !== "iframe" || !destino) return;
      console.warn("MyVete Bookmarklet: iframe sin READY en 5s; despacho ciego (¿app.js en caché?).");
      try {
        for (let i = 0; i < cola.length; i += 1) destino.postMessage(cola[i], "*");
      } catch (error) {
        // el fallback de 9s cubre el caso de iframe realmente bloqueado.
      }
    }, 5000);

    return {
      enviar(m) {
        cola.push(m);
        if (listo) flush();
      },
    };
  }

  const mensaje = {
    type: "MYVETE_FILIACION",
    payload: Object.assign({}, datosFiliacion, { idTutor: idTutor }),
  };
  console.log("MyVete Bookmarklet: 1er mensaje al panel ->", JSON.stringify(mensaje));

  const panel = abrirCanalPanel(urlPanel);
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
  //       devuelto por el panel (MYVETE_SUBMIT_OK ya se emite del lado del panel)
  // TODO: al recibir el mensaje, localizar el campo de evolución en el DOM de MyVete,
  //       asignar el valor y disparar evento nativo con bubbling (ver Sección 4.3)
})();
