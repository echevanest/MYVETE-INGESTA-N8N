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
 * de la propia página de MyVete, NO como ventana emergente. Si MyVete bloquea el
 * iframe por CSP/X-Frame-Options (no confirma READY en 9s), se cae solo a
 * window.open() en ventana aparte.
 *
 * Estrategia del tutor (07/09/2026, rev. 2): si la ficha del paciente NO trae los
 * datos del tutor, YA NO se abre una pestaña nueva de /customers/{id} ni se hace
 * fetch de esa ruta HTML. MyVete es una SPA que redirige CUALQUIER carga dura de
 * /customers/{id} (pestaña, fetch, navegación) al dashboard. En su lugar se llama
 * a la API interna de MyVete desde la MISMA pestaña (sesión viva):
 *     GET /api/customers/{id}?sessionId={sid}
 * — confirmado 200 JSON inspeccionando el tráfico real (cuenta 444). Devuelve
 * customerFullName + Contacts[] (Telefono movil / Email personal / ...). El
 * sessionId se lee del Resource Timing de la propia página. Si la API no
 * responde, el panel muestra un aviso con enlace directo a /customers/{id} para
 * carga manual (y el idTutor copiable al portapapeles).
 *
 * Contrato del mensaje (debe calzar con el listener de interface/app.js Sección 2):
 *   { type: 'MYVETE_FILIACION', payload: { tutor: {...}, mascota: {...}, idTutor: 'string | null' } }
 * Se pueden emitir DOS mensajes de este tipo: el 1ro con mascota + idTutor +
 * tutor raspado de la página actual (mejor esfuerzo); si el tutor no estaba en
 * esa pantalla, un 2do mensaje con `payload: { tutor, idTutor }` cuando el fetch
 * lo consigue, o con `payload: { idTutor, tutorAutoFallo: true, tutorUrl }` si no.
 * interface/app.js reasigna campos de forma idempotente, así que el 2do mensaje
 * solo completa lo que faltó. Si nada trae datos, los campos viajan en `null`.
 */
(function () {
  "use strict";

  // ===== VERSIÓN =====
  // Etiqueta de versión visible en consola. Debe coincidir con la de
  // interface/app.js y con el tag de Git del último estado estable
  // (v1.0.0-estable). Si algo se rompe, revertir a ese tag:
  //   git checkout v1.0.0-estable
  // El script de verificación bookmarklet/verificar.mjs comprueba que ambas
  // versiones coincidan y que la lógica de la API siga intacta.
  const VERSION = "1.0.0-estable";
  console.log(
    "%cMyVete Bookmarklet v" + VERSION,
    "font-weight:bold;color:#0b8457",
    "— lógica de tutor por API interna (/api/customers/{id}). " +
      "Revertir: git checkout v1.0.0-estable"
  );

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

  // Blindaje anti-placeholder (detectado 06/09/2026 en logs en vivo, idTutor
  // 1310951): la ficha del paciente puede traer la sección "Datos del Cliente"
  // con los campos del tutor SIN cargar — MyVete pinta literales tipo
  // "Sin asignar" en el nombre y encaja un timestamp de la ficha
  // ("06/09/2026 - Hace 0 segundos") donde debería ir el teléfono. Esos valores
  // NO son datos: hay que tratarlos como "campo vacío" para que
  //   a) no viajen al panel como si fueran reales, y
  //   b) `tutorVacio` dé true y se dispare la recuperación por fetch del tutor.
  // Lista de textos-basura (comparación exacta, ya normalizados a minúsculas):
  const PLACEHOLDERS_BASURA = [
    "sin asignar", "no asignado", "no asignada", "sin datos", "sin dato",
    "no encontrado", "no encontrada", "no disponible", "no especificado",
    "no especificada", "sin especificar", "sin información", "sin informacion",
    "no informado", "no informa", "no registra", "sin registrar", "ninguno",
    "ninguna", "n/a", "na", "n/d", "s/d", "s/n", "-", "--", "---", "—", "–",
    "...", "vacío", "vacio", "pendiente",
  ];
  // "Hace 0 segundos", "hace 5 minutos", "hace 2 días", "hace un momento"...
  const REGEX_TIEMPO_RELATIVO =
    /\bhace\s+(un[oa]?|\d+)\s+(segund|minut|hor|d[ií]a|semana|mes|año|anio|momento)/i;
  // Fechas 06/09/2026 · 6-9-26 · 2026-09-06 y horas 14:30 · 14:30:05.
  const REGEX_FECHA =
    /(\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b)|(\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b)|(\b\d{1,2}:\d{2}(?::\d{2})?\b)/;

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

  // Texto visible de un nodo. Se prueba innerText primero (respeta lo que está
  // oculto por CSS) y se cae a textContent para nodos sin layout (innerText puede
  // devolver "" o undefined en ese caso).
  function textoDe(nodo) {
    if (!nodo) return "";
    const via = nodo.innerText;
    if (via != null && via !== "") return via;
    return nodo.textContent || "";
  }

  // true si `texto` es un placeholder de MyVete ("Sin asignar", "-", ...) o un
  // timestamp/fecha ("06/09/2026 - Hace 0 segundos") en vez de un dato real de
  // contacto. Se usa para NO aceptar esos valores como nombre/teléfono/email y
  // para decidir que el tutor "no está en la página actual" (dispara el fetch).
  function esValorBasura(texto) {
    const t = normalizarTexto(texto);
    if (!t) return true;
    if (PLACEHOLDERS_BASURA.indexOf(t) !== -1) return true;
    // Mismo placeholder pero con signos alrededor: "(sin asignar)", "sin asignar.".
    const sinSignos = t.replace(/[()[\].,;:*"'¡!¿?_]+/g, " ").replace(/\s+/g, " ").trim();
    if (PLACEHOLDERS_BASURA.indexOf(sinSignos) !== -1) return true;
    if (REGEX_TIEMPO_RELATIVO.test(t)) return true;
    if (REGEX_FECHA.test(t)) return true;
    return false;
  }

  // Localiza la sección "Datos del Cliente" en el Document de la página actual
  // (el tutor ausente ya no se raspa de HTML: se pide a /api/customers/{id}).
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
      ).filter((n) => normalizarTexto(textoDe(n)).indexOf("datos del cliente") !== -1);

      const anclas = encabezados.length
        ? encabezados
        : Array.from(doc.querySelectorAll("body *")).filter(
            (n) => normalizarTexto(textoDe(n)) === "datos del cliente"
          );

      for (const ancla of anclas) {
        let contenedor = ancla.parentElement;
        let saltos = 0;
        while (contenedor && saltos < 12) {
          const texto = normalizarTexto(textoDe(contenedor));
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
        const t = normalizarTexto(textoDe(n));
        if (!t || t.length > 6000) return false;
        const tel =
          t.indexOf("teléfono") !== -1 || t.indexOf("telefono") !== -1 || t.indexOf("celular") !== -1;
        const mail = t.indexOf("email") !== -1 || t.indexOf("e-mail") !== -1 || t.indexOf("correo") !== -1;
        return tel && mail && t.indexOf("nombre") !== -1;
      });
      candidatos.sort((a, b) => textoDe(a).length - textoDe(b).length);
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

  // Raspa nombre/teléfono/email de una sección "Datos del Cliente" ya localizada
  // en la página actual. `silencioso` corta los console.warn. Cada etiqueta
  // prueba varias redacciones (MyVete podría usar "Celular:" o "E-mail:" en vez
  // de "Teléfono celular:" / "Email personal:").
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

      // Se descartan placeholders y timestamps ANTES de validar la forma: un
      // "Sin asignar" en el nombre o un "06/09/2026 - Hace 0 segundos" en el
      // teléfono no son datos, son "campo sin cargar".
      const nombreOk = nombre && !esValorBasura(nombre) ? nombre : null;
      const telefonoOk =
        telefono && !esValorBasura(telefono) && REGEX_TELEFONO.test(telefono) ? telefono : null;
      const emailOk =
        email && !esValorBasura(email) && REGEX_EMAIL.test(email) ? email : null;
      if (!silencioso && nombre && !nombreOk) {
        console.warn("MyVete Bookmarklet: nombre de tutor descartado (placeholder/fecha):", nombre);
      }
      if (!silencioso && telefono && !telefonoOk) {
        console.warn("MyVete Bookmarklet: teléfono raspado no pasó la validación de forma:", telefono);
      }
      if (!silencioso && email && !emailOk) {
        console.warn("MyVete Bookmarklet: email raspado no pasó la validación de forma:", email);
      }

      const resultado = { nombre: nombreOk, telefono: telefonoOk, email: emailOk };
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
  // sección "Datos del Cliente" (o viene con placeholders), el flujo principal
  // dispara obtenerTutorPorFetch() más abajo.
  function rasparTutor() {
    const seccion = encontrarSeccionDatosCliente(document);
    if (!seccion) {
      console.warn("MyVete Bookmarklet: sección 'Datos del Cliente' no está en la página actual.");
    }
    return rasparTutorDeSeccion(seccion, "página actual", false);
  }

  // Estrategia del tutor cuando la ficha del paciente no lo trae (o lo trae con
  // placeholders). NO se abre una pestaña /customers/{id}: MyVete es una SPA que
  // redirige CUALQUIER carga dura de esa ruta (pestaña nueva, fetch de HTML,
  // navegación top-level) al dashboard, así que la ficha del cliente nunca
  // renderiza. En su lugar se llama a la API interna de MyVete desde ESTA misma
  // pestaña (sesión viva):
  //
  //   GET /api/customers/{id}?sessionId={sid}
  //
  // Confirmado el 07/09/2026 sobre app.myvete.com (cuenta 444) inspeccionando el
  // tráfico de red real: responde 200 JSON a un fetch() same-origin normal (sin
  // headers especiales), con la forma:
  //   { customerFullName: "APELLIDO, NOMBRE", customerName, customerLastName,
  //     Contacts: [ { contactValue: "...", Attribute: { attributeName: "Telefono
  //     movil" | "Email personal" | "Telefono fijo" | ... } }, ... ], ... }
  // El sessionId es el token que la SPA cuelga de cada llamada /api/...; se lee
  // del Resource Timing de la propia página (siempre hay llamadas /api/ de MyVete
  // ahí: kpis, schedules, socket.io, autologin...).
  //
  // Devuelve SIEMPRE {nombre,telefono,email}: nunca rechaza.

  // Token de sesión propio de MyVete (?sessionId=... en cada /api/ que hace la
  // SPA). Sin él la API responde 401/redirect.
  function obtenerSessionIdMyVete() {
    const RE = /[?&]sessionId=([A-Za-z0-9]{4,})/;
    try {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      for (const u of urls) {
        const m = u.match(RE);
        if (m) return m[1];
      }
    } catch (error) {
      // Resource Timing no disponible: se prueban los fallbacks de abajo.
    }
    try {
      const m = (window.location.href + " " + (window.name || "")).match(RE);
      if (m) return m[1];
    } catch (error) {
      // ignorado
    }
    try {
      const m = (document.documentElement.innerHTML || "").match(
        /sessionId["'\s:=]+([A-Za-z0-9]{6,})/
      );
      if (m) return m[1];
    } catch (error) {
      // ignorado
    }
    return null;
  }

  // Mapea la respuesta de /api/customers/{id} de MyVete a {nombre,telefono,email}.
  // nombre  <- customerFullName ("APELLIDO, NOMBRE") | customerName + lastName
  // telefono/email <- Contacts[] emparejados por Attribute.attributeName; para
  // teléfono se prefiere celular/móvil sobre fijo/laboral.
  function tutorDesdeApiMyVete(j) {
    const salida = { nombre: null, telefono: null, email: null };
    if (!j || typeof j !== "object") return salida;

    const nombre =
      j.customerFullName ||
      [j.customerName, j.customerLastName].filter(Boolean).join(" ").trim() ||
      null;
    if (nombre && !esValorBasura(nombre)) salida.nombre = normalizarConEspacios(nombre);

    const contactos = Array.isArray(j.Contacts) ? j.Contacts : [];
    const conValor = contactos
      .map((c) => ({
        etiqueta: normalizarTexto((c && c.Attribute && c.Attribute.attributeName) || ""),
        valor: String((c && c.contactValue) || "").trim(),
      }))
      .filter((c) => c.valor && !esValorBasura(c.valor));

    const ES_TEL = (t) => /tel[eé]fono|tel\.|celular|m[oó]vil|whats/.test(t);
    const ES_TEL_PREF = (t) => /celular|m[oó]vil|whats/.test(t);
    const ES_MAIL = (t) => /mail|correo/.test(t);

    const tel =
      conValor.find((c) => ES_TEL(c.etiqueta) && ES_TEL_PREF(c.etiqueta)) ||
      conValor.find((c) => ES_TEL(c.etiqueta));
    if (tel && REGEX_TELEFONO.test(tel.valor)) salida.telefono = tel.valor;

    const mail = conValor.find((c) => ES_MAIL(c.etiqueta));
    if (mail && REGEX_EMAIL.test(mail.valor)) salida.email = mail.valor;

    return salida;
  }

  // Red de seguridad: si la forma de /api/customers/{id} cambiara, se recorre el
  // objeto por nombre de clave (BFS: una clave poco profunda le gana a un "name"
  // de mascota anidado). Bounded (profundidad <= 4).
  function tutorDesdeObjetoJson(raiz) {
    const salida = { nombre: null, telefono: null, email: null };
    if (!raiz || typeof raiz !== "object") return salida;

    const CLAVE_NOMBRE = /^(nombre|name|nombre_completo|nombrecompleto|full_name|fullname|customerfullname|customername|razon_social|razonsocial|cliente|nombre_cliente)$/i;
    const CLAVE_APELLIDO = /^(apellido|apellidos|last_name|lastname|customerlastname)$/i;
    const CLAVE_TEL = /(telefono|tel[_-]?(cel|movil|mob)|celular|movil|mobile|phone|whatsapp|contactvalue)/i;
    const CLAVE_MAIL = /(mail|correo)/i;

    let nombre = null;
    let apellido = null;
    const visto = new Set();

    let nivel = [raiz];
    let prof = 0;
    while (nivel.length && prof <= 4) {
      const siguiente = [];
      for (const obj of nivel) {
        if (!obj || typeof obj !== "object" || visto.has(obj)) continue;
        visto.add(obj);
        for (const clave of Object.keys(obj)) {
          const valor = obj[clave];
          if (valor && typeof valor === "object") {
            siguiente.push(valor);
            continue;
          }
          if (valor == null || valor === "") continue;
          const sval = String(valor).trim();
          if (!sval || esValorBasura(sval)) continue;
          if (!nombre && CLAVE_NOMBRE.test(clave)) nombre = sval;
          else if (!apellido && CLAVE_APELLIDO.test(clave)) apellido = sval;
          else if (!salida.telefono && CLAVE_TEL.test(clave) && REGEX_TELEFONO.test(sval)) salida.telefono = sval;
          else if (!salida.email && CLAVE_MAIL.test(clave) && REGEX_EMAIL.test(sval)) salida.email = sval;
        }
      }
      nivel = siguiente;
      prof += 1;
    }

    const nombreCompuesto = [nombre, apellido].filter(Boolean).join(" ").trim();
    if (nombreCompuesto && !esValorBasura(nombreCompuesto)) salida.nombre = nombreCompuesto;
    return salida;
  }

  function obtenerTutorPorFetch(idTutorArg) {
    const vacio = { nombre: null, telefono: null, email: null };
    if (!idTutorArg || typeof fetch !== "function") return Promise.resolve(vacio);

    const sid = obtenerSessionIdMyVete();
    if (!sid) {
      console.warn(
        "MyVete Bookmarklet: no se pudo leer el sessionId de MyVete (sin llamadas /api/ en el " +
          "Resource Timing). No se puede consultar /api/customers/" + idTutorArg + "."
      );
      return Promise.resolve(vacio);
    }

    const url =
      window.location.origin + "/api/customers/" + encodeURIComponent(idTutorArg) +
      "?sessionId=" + encodeURIComponent(sid);

    return (async function () {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          console.warn(
            "MyVete Bookmarklet: /api/customers/" + idTutorArg + " respondió " + res.status +
              " (¿sessionId vencido?)."
          );
          return vacio;
        }
        let data = null;
        try {
          data = await res.json();
        } catch (error) {
          console.warn("MyVete Bookmarklet: /api/customers/" + idTutorArg + " no devolvió JSON.", error);
          return vacio;
        }

        let tutor = tutorDesdeApiMyVete(data);
        if (!tutor.nombre && !tutor.telefono && !tutor.email) {
          tutor = tutorDesdeObjetoJson(data); // red de seguridad ante cambio de forma
        }

        if (tutor.nombre || tutor.telefono || tutor.email) {
          console.log(
            "MyVete Bookmarklet: tutor obtenido de /api/customers/" + idTutorArg + " ->",
            "nombre:", tutor.nombre || "(no encontrado)",
            "| teléfono:", tutor.telefono || "(no encontrado)",
            "| email:", tutor.email || "(no encontrado)"
          );
          return tutor;
        }
        console.warn(
          "MyVete Bookmarklet: /api/customers/" + idTutorArg +
            " respondió 200 pero sin datos de contacto reconocibles."
        );
        return vacio;
      } catch (error) {
        console.warn("MyVete Bookmarklet: fetch a /api/customers/" + idTutorArg + " falló.", error);
        return vacio;
      }
    })();
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
  // El panel se monta como iframe overlay (sin ventana emergente). Ya NO se abre
  // una pestaña /customers/{id} dentro del gesto del clic: la recuperación del
  // tutor ausente es un fetch() asíncrono desde esta misma pestaña (más abajo).
  const datosFiliacion = rasparFiliacion();
  const idTutor = extraerIdTutor();

  console.log("MyVete Bookmarklet: filiación raspada ->", JSON.stringify(datosFiliacion));
  console.log("MyVete Bookmarklet: idTutor ->", idTutor);

  // ¿Falta el tutor? = los tres campos son null O son basura (placeholder /
  // fecha). rasparTutorDeSeccion ya null-ea la basura, pero se revalida acá con
  // esValorBasura por si un valor se colara: el objetivo es que la ficha con el
  // tutor "Sin asignar" dispare la recuperación por fetch en vez de darlo por
  // resuelto.
  const tutorSync = (datosFiliacion && datosFiliacion.tutor) || {};
  const tutorTieneNombre = !!tutorSync.nombre && !esValorBasura(tutorSync.nombre);
  const tutorTieneTelefono = !!tutorSync.telefono && !esValorBasura(tutorSync.telefono);
  const tutorTieneEmail = !!tutorSync.email && !esValorBasura(tutorSync.email);
  const tutorVacio = !tutorTieneNombre && !tutorTieneTelefono && !tutorTieneEmail;
  const tutorFaltante = tutorVacio && !!idTutor;
  if (tutorVacio && idTutor) {
    console.log(
      "MyVete Bookmarklet: tutor ausente/placeholder en la página actual; se recupera por fetch desde /customers/" +
        idTutor + "."
    );
  } else if (tutorVacio && !idTutor) {
    console.warn(
      "MyVete Bookmarklet: tutor ausente y sin idTutor recuperable; no se puede auto-completar. Cargá el tutor a mano en el panel."
    );
  }

  // Transporte de datos hacia el panel. El panel (interface/app.js) corre en OTRO
  // origen (echevanest.github.io), así que la única vía que no depende de que el
  // canal con el opener sobreviva es la propia URL:
  //   - `?idTutor=` en el query string (respaldo histórico, lo lee app.js);
  //   - `#data=<JSON codificado>` en el FRAGMENTO, con la filiación completa
  //     ({ tutor, mascota, idTutor }). El fragmento no viaja al servidor (no
  //     queda en logs de GitHub Pages) y app.js lo lee al cargar y lo limpia.
  // Con esto la ventana nueva del fallback es autosuficiente: recibe el paciente
  // aunque MyVete haya bloqueado el iframe y el postMessage no llegue. El
  // postMessage se sigue usando (modo iframe y 2do mensaje) pero ya no es la
  // única vía.
  const params = new URLSearchParams();
  if (idTutor) params.set("idTutor", idTutor);
  const queryString = params.toString();
  const urlPanel =
    PANEL_URL +
    (queryString ? (PANEL_URL.indexOf("?") === -1 ? "?" : "&") + queryString : "");

  const payloadPanel = Object.assign({}, datosFiliacion, { idTutor: idTutor });
  let urlPanelConDatos = urlPanel;
  try {
    urlPanelConDatos = urlPanel + "#data=" + encodeURIComponent(JSON.stringify(payloadPanel));
  } catch (error) {
    // si JSON.stringify/encode falla, el panel depende del postMessage (modo iframe).
    console.warn("MyVete Bookmarklet: no se pudo serializar la filiación para el hash de la URL.", error);
  }

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

  const panel = abrirCanalPanel(urlPanelConDatos);
  panel.enviar(mensaje);

  // Recuperación del tutor ausente: llamada a /api/customers/{id} desde ESTA
  // pestaña (sesión viva). Cuando resuelve, se manda un 2do mensaje al panel: con
  // los datos si la API los devolvió, o con `tutorAutoFallo` + `tutorUrl` para
  // que el panel muestre el aviso de carga manual con enlace directo.
  if (tutorFaltante) {
    const urlTutorManual = window.location.origin + "/customers/" + encodeURIComponent(idTutor);
    obtenerTutorPorFetch(idTutor).then((tutorFetch) => {
      if (tutorFetch.nombre || tutorFetch.telefono || tutorFetch.email) {
        const mensaje2 = {
          type: "MYVETE_FILIACION",
          payload: { tutor: tutorFetch, idTutor: idTutor },
        };
        console.log("MyVete Bookmarklet: 2do mensaje (tutor por API) ->", JSON.stringify(mensaje2));
        panel.enviar(mensaje2);
      } else {
        const mensajeManual = {
          type: "MYVETE_FILIACION",
          payload: { idTutor: idTutor, tutorAutoFallo: true, tutorUrl: urlTutorManual },
        };
        console.warn(
          "MyVete Bookmarklet: 2do mensaje (aviso manual, sin datos de tutor) ->",
          JSON.stringify(mensajeManual)
        );
        panel.enviar(mensajeManual);
      }
    });
  }

  // Paso 5 — Escucha de retorno (Sección 3.2, punto 5)
  // TODO: registrar listener de "message" para recibir el resumen clínico compacto
  //       devuelto por el panel (MYVETE_SUBMIT_OK ya se emite del lado del panel)
  // TODO: al recibir el mensaje, localizar el campo de evolución en el DOM de MyVete,
  //       asignar el valor y disparar evento nativo con bubbling (ver Sección 4.3)
})();
