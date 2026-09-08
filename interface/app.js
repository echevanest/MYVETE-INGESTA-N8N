// interface/app.js — MyVete Panel de carga (Módulo base V4.8)
// Reconstruido tras detectar que el archivo no existía en disco (ReferenceError
// consolidarPayloadFinal is not defined). Ver INFORME_CODE V4.8 e
// INFORME_CODE "reconstrucción app.js" para el alcance exacto de esta versión.

// Etiqueta de versión visible en consola. Debe coincidir con la de
// bookmarklet/launcher.js y con el tag de Git del último estado estable
// (v1.0.0-estable). Revertir: `git checkout v1.0.0-estable`.
const VERSION = '1.0.0-estable';
console.log(
  '%cMyVete Panel v' + VERSION,
  'font-weight:bold;color:#0b8457',
  '— recepción de filiación (tutor por API interna de MyVete).',
);

// ---------------------------------------------------------------------------
// 0. Handshake con el bookmarklet (launcher.js) — señal "panel listo"
// ---------------------------------------------------------------------------
// Antes el bookmarklet disparaba el postMessage a ciegas (5 reintentos a 400ms):
// servido desde localhost el panel montaba su listener antes de esos 2s, pero
// desde GitHub Pages (DNS + TLS + 3 archivos por CDN) la carga tarda más y todos
// los mensajes se perdían. Ahora el panel avisa cuando su listener de la Sección
// 2 ya está activo, y el bookmarklet recién ahí manda los datos (con timeout de
// respaldo de su lado por si este aviso no llega). Ver pendiente #6 de STATUS.md.
//
// El listener de 'message' que recibe MYVETE_FILIACION se registra en eval de
// este módulo (Sección 2, más abajo), es decir ANTES de que 'load' dispare este
// aviso: cuando el bookmarklet responde al READY, el panel ya puede recibir.
//
// El panel puede desplegarse de dos formas desde el bookmarklet (launcher.js):
//   - iframe overlay dentro de la página de MyVete -> el bookmarklet es
//     `window.parent` (no hay `window.opener`);
//   - ventana aparte (window.open, fallback) -> el bookmarklet es `window.opener`.
// Se avisa al que corresponda; `window.parent === window` cuando el panel está en
// una pestaña top-level suelta (sin bookmarklet), y ahí no hay a quién avisar.
function destinoBookmarklet() {
  if (window.opener) return window.opener;
  if (window.parent && window.parent !== window) return window.parent;
  return null;
}

function notificarPanelListo() {
  const destino = destinoBookmarklet();
  if (!destino) return;
  try {
    destino.postMessage({ type: 'MYVETE_PANEL_READY' }, '*');
    console.log('MyVete Panel: READY notificado al bookmarklet (opener/parent).');
  } catch (error) {
    console.warn('MyVete Panel: no se pudo notificar READY al bookmarklet.', error);
  }
}

if (document.readyState === 'complete') {
  notificarPanelListo();
} else {
  window.addEventListener('load', notificarPanelListo);
}

// ---------------------------------------------------------------------------
// 1. Perfiles clínicos — por especie, con persistencia en localStorage
// ---------------------------------------------------------------------------
// Reemplaza el placeholder vacío de V4.8 (Paso A). Decisión confirmada por
// Marcelo el 28/07/2026: los valores numéricos de PERFILES_BASE vienen del
// INFORME_CODE "Sección B" tal cual fueron entregados (no son un dato
// clínico validado acá — quedan como punto de partida editable). PAM/PAD no
// venían en ese informe, así que no se inventan: los perfiles solo precargan
// fc/fr/pas, y PAM/PAD quedan en blanco para que el médico los cargue.
const PERFILES_BASE = {
  canino: [
    {
      id: 'can_sano',
      etiqueta: 'Chequeo Sano',
      valores: {
        fc: 100,
        fr: 24,
        pas: 120,
        anamnesis: 'Paciente asintomático. Activo, tolerante al ejercicio. Sin tos ni disnea.',
      },
    },
    {
      id: 'can_b2',
      etiqueta: 'MVD B2 (Asintomático)',
      valores: {
        fc: 110,
        fr: 28,
        pas: 130,
        anamnesis: 'Detección de soplo sistólico apical izquierdo. Sin signos clínicos de falla cardíaca.',
      },
    },
  ],
  felino: [
    {
      id: 'fel_incidental',
      etiqueta: 'Soplo Incidental',
      valores: {
        fc: 180,
        fr: 30,
        pas: 125,
        anamnesis: 'Soplo detectado en consulta de rutina. Paciente asintomático en hogar.',
      },
    },
  ],
};

// Mapeo clave de perfil → id de campo en el DOM.
const CAMPOS_PERFIL = {
  fc: 'clinica-fc',
  fr: 'clinica-fr',
  pas: 'clinica-pas',
  pam: 'clinica-pam',
  pad: 'clinica-pad',
  anamnesis: 'consulta-anamnesis',
};

function obtenerPerfilesGuardados(especie) {
  try {
    return JSON.parse(localStorage.getItem(`perfiles_${especie}`)) || [];
  } catch {
    return [];
  }
}

function guardarPerfilesGuardados(especie, lista) {
  localStorage.setItem(`perfiles_${especie}`, JSON.stringify(lista));
}

// Combina PERFILES_BASE con lo guardado en localStorage. Si un perfil guardado
// reusa el id de uno base, gana el guardado (así funciona "sobrescribir" un
// perfil base: queda un override en localStorage con el mismo id).
function obtenerPerfilesPorEspecie(especie) {
  const combinados = [...(PERFILES_BASE[especie] || [])];
  obtenerPerfilesGuardados(especie).forEach((perfilGuardado) => {
    const indice = combinados.findIndex((p) => p.id === perfilGuardado.id);
    if (indice >= 0) {
      combinados[indice] = perfilGuardado;
    } else {
      combinados.push(perfilGuardado);
    }
  });
  return combinados;
}

function aplicarPerfil(perfil) {
  if (!perfil) return;
  Object.entries(perfil.valores || {}).forEach(([clave, valor]) => {
    const idCampo = CAMPOS_PERFIL[clave];
    const campo = idCampo && document.getElementById(idCampo);
    if (campo && valor !== undefined && valor !== null) campo.value = valor;
  });
}

const MAX_BOTONES_RAPIDOS = 6;
let perfilActivo = null; // { id, especie } — último perfil aplicado, para "Guardar"

const selectEspecie = document.getElementById('paciente-especie');
const gridPerfilesRapidos = document.getElementById('grid-perfiles-rapidos');
const selectPerfilesCompletos = document.getElementById('select-perfiles-completos');
const btnGuardarPerfil = document.getElementById('btn-guardar-perfil');

function especieActual() {
  return selectEspecie ? selectEspecie.value : 'canino';
}

function renderizarPerfiles() {
  const especie = especieActual();
  const perfiles = obtenerPerfilesPorEspecie(especie);

  if (selectPerfilesCompletos) {
    selectPerfilesCompletos.innerHTML = '<option value="">Seleccionar perfil...</option>';
    perfiles.forEach((perfil) => {
      const opcion = document.createElement('option');
      opcion.value = perfil.id;
      opcion.textContent = perfil.etiqueta;
      selectPerfilesCompletos.appendChild(opcion);
    });
  }

  if (gridPerfilesRapidos) {
    gridPerfilesRapidos.innerHTML = '';
    perfiles.slice(0, MAX_BOTONES_RAPIDOS).forEach((perfil) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'btn btn-secundario btn-perfil';
      boton.textContent = perfil.etiqueta;
      boton.addEventListener('click', () => seleccionarPerfil(perfil.id));
      gridPerfilesRapidos.appendChild(boton);
    });
  }
}

function seleccionarPerfil(perfilId) {
  const especie = especieActual();
  const perfil = obtenerPerfilesPorEspecie(especie).find((p) => p.id === perfilId);
  if (!perfil) return;
  aplicarPerfil(perfil);
  perfilActivo = { id: perfil.id, especie };
  if (selectPerfilesCompletos) selectPerfilesCompletos.value = perfil.id;
}

if (selectPerfilesCompletos) {
  selectPerfilesCompletos.addEventListener('change', (evento) => {
    if (!evento.target.value) {
      perfilActivo = null;
      return;
    }
    seleccionarPerfil(evento.target.value);
  });
}

if (selectEspecie) {
  selectEspecie.addEventListener('change', () => {
    perfilActivo = null;
    renderizarPerfiles();
  });
}

function leerValoresFormularioParaPerfil() {
  const valores = {};
  ['fc', 'fr', 'pas', 'pam', 'pad'].forEach((clave) => {
    const campo = document.getElementById(CAMPOS_PERFIL[clave]);
    if (campo && campo.value !== '') valores[clave] = Number(campo.value);
  });
  const anamnesis = document.getElementById('consulta-anamnesis').value.trim();
  if (anamnesis !== '') valores.anamnesis = anamnesis;
  return valores;
}

function generarIdPerfilPersonalizado(etiqueta) {
  const slug = etiqueta.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `custom_${slug || 'perfil'}_${Date.now()}`;
}

if (btnGuardarPerfil) {
  btnGuardarPerfil.addEventListener('click', () => {
    const especie = especieActual();
    const valores = leerValoresFormularioParaPerfil();

    let perfilSeleccionado = null;
    if (perfilActivo && perfilActivo.especie === especie) {
      perfilSeleccionado = obtenerPerfilesPorEspecie(especie).find((p) => p.id === perfilActivo.id) || null;
    }

    const sobrescribir = perfilSeleccionado
      ? window.confirm(`¿Sobrescribir el perfil "${perfilSeleccionado.etiqueta}" con los valores actuales?\n\nAceptar = sobrescribir.\nCancelar = crear un perfil nuevo.`)
      : false;

    if (sobrescribir) {
      const guardados = obtenerPerfilesGuardados(especie);
      const indice = guardados.findIndex((p) => p.id === perfilActivo.id);
      const perfilActualizado = { id: perfilActivo.id, etiqueta: perfilSeleccionado.etiqueta, valores };
      if (indice >= 0) guardados[indice] = perfilActualizado;
      else guardados.push(perfilActualizado);
      guardarPerfilesGuardados(especie, guardados);
      renderizarPerfiles();
      seleccionarPerfil(perfilActivo.id);
    } else {
      const nombre = window.prompt('Nombre para el nuevo perfil:', '');
      if (nombre === null) return; // cancelado
      const etiqueta = nombre.trim();
      if (!etiqueta) return;
      const id = generarIdPerfilPersonalizado(etiqueta);
      const guardados = obtenerPerfilesGuardados(especie);
      guardados.push({ id, etiqueta, valores });
      guardarPerfilesGuardados(especie, guardados);
      renderizarPerfiles();
      seleccionarPerfil(id);
    }
  });
}

renderizarPerfiles(); // estado inicial (especie por defecto del <select>)

// ---------------------------------------------------------------------------
// 2. Bloque Filiación — modo lectura / edición
// ---------------------------------------------------------------------------
let bloqueFiliacionEditado = false;

// ID de tutor de MyVete (segmento numérico de /customers/{id}). Este archivo
// corre en el origen del panel, no en MyVete, así que NO puede leerlo de la URL
// de MyVete: lo raspa el bookmarklet (launcher.js) y lo pasa como query param
// `?idTutor=` al abrir el panel, con respaldo dentro del payload del postMessage
// y dentro del hash `#data=` (ver Sección 2.bis). Viaja en el payload de salida
// como filiacion.tutor.id_myvete y es la clave de upsert prevista para la tabla
// `tutores`.
let idTutorMyVete = new URLSearchParams(window.location.search).get('idTutor') || null;

const btnEditarFiliacion = document.getElementById('btn-editar-filiacion');
const camposFiliacion = [
  'paciente-nombre', 'paciente-especie', 'paciente-raza', 'paciente-peso',
  'tutor-nombre', 'tutor-telefono', 'tutor-email',
];

if (btnEditarFiliacion) {
  btnEditarFiliacion.addEventListener('click', () => {
    bloqueFiliacionEditado = true;
    camposFiliacion.forEach((id) => {
      const campo = document.getElementById(id);
      if (campo) campo.disabled = false;
    });
    document.getElementById('bloque-filiacion').dataset.modo = 'edicion';
    btnEditarFiliacion.disabled = true;
  });
}

// Asigna un valor a un <select> comparando sin distinguir mayúsculas/acentos
// contra los `value` de sus <option>, en vez de asignación directa: el
// raspado del DOM de MyVete llega con la capitalización propia de esa UI
// ("Canino"), que no coincide con los value en minúscula de este formulario.
function asignarValorSelect(select, valorEntrante) {
  const normalizado = String(valorEntrante).trim().toLowerCase();
  const opcion = Array.from(select.options).find((o) => o.value.toLowerCase() === normalizado);
  if (opcion) {
    select.value = opcion.value;
  } else {
    console.warn(`asignarValorSelect: sin coincidencia para "${valorEntrante}" en #${select.id}`);
  }
}

// Limpia un peso entrante que puede llegar como número, o como string con
// coma decimal / unidad pegada ("28,5 kg", entorno ES/AR). Devuelve un string
// listo para un <input type="number"> (punto decimal, sin unidad) o null si
// no queda nada numérico tras la limpieza.
function sanitizarPeso(valorCrudo) {
  const limpio = String(valorCrudo).replace(',', '.').replace(/[^0-9.]/g, '');
  return limpio === '' ? null : limpio;
}

// Aviso "no se pudo traer el tutor automáticamente" (#aviso-tutor-auto en el
// bloque Filiación). El bookmarklet lo pide vía payload.tutorAutoFallo cuando ni
// la ficha del paciente ni la API /api/customers/{id} dieron los datos del
// tutor. Se arma con: enlace directo a la ficha del tutor en MyVete + el idTutor
// visible y un botón para copiarlo al portapapeles (así el médico lo pega en el
// buscador de MyVete en un paso).
function mostrarAvisoTutor(url, idTutor) {
  const aviso = document.getElementById('aviso-tutor-auto');
  if (!aviso) return;
  aviso.textContent = '';

  aviso.appendChild(
    document.createTextNode('No se pudieron obtener los datos del tutor automáticamente. '),
  );

  const destino = url || (idTutor ? `https://app.myvete.com/customers/${idTutor}` : null);
  if (destino) {
    const enlace = document.createElement('a');
    enlace.href = destino;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = 'Abrir ficha del tutor en MyVete ↗';
    aviso.appendChild(enlace);
  }
  aviso.appendChild(
    document.createTextNode(' Completá nombre, teléfono y e-mail a mano.'),
  );

  if (idTutor) {
    aviso.appendChild(document.createElement('br'));
    aviso.appendChild(document.createTextNode('ID de tutor: '));
    const cod = document.createElement('code');
    cod.textContent = String(idTutor);
    aviso.appendChild(cod);

    const btnCopiar = document.createElement('button');
    btnCopiar.type = 'button';
    btnCopiar.className = 'btn-copiar-id';
    btnCopiar.textContent = 'Copiar ID';
    btnCopiar.addEventListener('click', () => {
      const marcarOk = () => {
        btnCopiar.textContent = '✓ Copiado';
        setTimeout(() => { btnCopiar.textContent = 'Copiar ID'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(idTutor)).then(marcarOk).catch(() => {
          copiarConSeleccion(cod);
          marcarOk();
        });
      } else {
        copiarConSeleccion(cod);
        marcarOk();
      }
    });
    aviso.appendChild(btnCopiar);
  }

  aviso.hidden = false;
}

// Fallback de copiado cuando navigator.clipboard no está disponible (iframe sin
// permiso, contexto no seguro): selecciona el <code> con el ID y usa execCommand.
function copiarConSeleccion(nodo) {
  try {
    const rango = document.createRange();
    rango.selectNodeContents(nodo);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rango);
    document.execCommand('copy');
    sel.removeAllRanges();
  } catch (error) {
    /* si ni así se puede, el ID queda visible para copiar a mano */
  }
}

function ocultarAvisoTutor() {
  const aviso = document.getElementById('aviso-tutor-auto');
  if (aviso) {
    aviso.hidden = true;
    aviso.textContent = '';
  }
}

// Aplica un payload de filiación al formulario. Idempotente y por campo: solo
// pisa lo que llega con valor no nulo, así se puede llamar varias veces (1er
// mensaje con mascota + tutor de la página; 2do mensaje con el tutor raspado
// aparte) y desde varias fuentes (postMessage, hash `#data=`) sin pisar de más.
function aplicarFiliacion(payload, origen) {
  if (!payload) return;
  console.log(`MyVete Panel: filiación aplicada (${origen || '?'}) ->`, JSON.stringify(payload));

  const { tutor, mascota } = payload;

  // Respaldo del query param: si el bookmarklet no pudo poner el idTutor en la
  // URL (o el panel ya estaba abierto de antes), todavía llega dentro del payload.
  if (!idTutorMyVete && payload.idTutor != null) {
    idTutorMyVete = String(payload.idTutor);
  }

  if (tutor) {
    if (tutor.nombre != null) document.getElementById('tutor-nombre').value = tutor.nombre;
    if (tutor.telefono != null) document.getElementById('tutor-telefono').value = tutor.telefono;
    if (tutor.email != null) document.getElementById('tutor-email').value = tutor.email;
    // Si llegó algún dato real del tutor (2do mensaje del bookmarklet, vía
    // fetch), cualquier aviso de "no se pudo traer" que hubiera queda obsoleto.
    if (tutor.nombre != null || tutor.telefono != null || tutor.email != null) {
      ocultarAvisoTutor();
    }
  }

  // El bookmarklet no pudo recuperar el tutor por ninguna vía automática (la
  // ficha del paciente no lo traía y el fetch a /customers/{id} dio 403 / rebotó
  // al home / la API interna no respondió). Se muestra el aviso con enlace
  // directo para que el médico lo abra en MyVete y complete los campos a mano.
  if (payload.tutorAutoFallo) {
    const idParaAviso = payload.idTutor != null ? String(payload.idTutor) : idTutorMyVete;
    mostrarAvisoTutor(payload.tutorUrl || null, idParaAviso);
  }

  if (mascota) {
    if (mascota.nombre != null) document.getElementById('paciente-nombre').value = mascota.nombre;
    if (mascota.especie != null) {
      asignarValorSelect(document.getElementById('paciente-especie'), mascota.especie);
      // asignarValorSelect fija .value directo (sin evento 'change'), así que
      // hay que re-renderizar la grilla de perfiles a mano para la nueva especie.
      perfilActivo = null;
      renderizarPerfiles();
    }
    if (mascota.raza != null) document.getElementById('paciente-raza').value = mascota.raza;

    const pesoRaw = mascota.pesoActual ?? mascota.peso;
    if (pesoRaw != null && pesoRaw !== '') {
      const pesoSanitizado = sanitizarPeso(pesoRaw);
      if (pesoSanitizado != null) document.getElementById('paciente-peso').value = pesoSanitizado;
    }
  }
}

// Recepción de filiación raspada por el Bookmarklet de MyVete (modo iframe, o
// modo ventana cuando el navegador conserva el canal con el opener).
window.addEventListener('message', (evento) => {
  if (!evento.data || evento.data.type !== 'MYVETE_FILIACION') return;
  console.log('MyVete Panel: MYVETE_FILIACION recibido por postMessage.');
  aplicarFiliacion(evento.data.payload || {}, 'postMessage');
});

// ---------------------------------------------------------------------------
// 2.bis. Filiación por hash de URL — `#data=<JSON codificado>`
// ---------------------------------------------------------------------------
// El postMessage falla en el fallback de ventana nueva: MyVete bloquea el iframe
// por CSP/X-Frame-Options y, al abrir el panel con window.open, el canal con el
// opener no siempre sobrevive (bloqueadores, `noopener`, timing de carga). Para
// que la ventana nueva sea autosuficiente, el bookmarklet embute el payload en el
// fragmento de la URL (`...index.html?idTutor=123#data=%7B...%7D`). El fragmento
// NO viaja al servidor (no queda en logs de GitHub Pages) y lo lee el SPA acá.
// El 2do mensaje (tutor raspado aparte) sigue yendo por postMessage: si ese
// canal está vivo, completa; si no, el médico lo carga a mano.
function leerFiliacionDesdeHash() {
  try {
    const hash = window.location.hash || '';
    const marca = '#data=';
    if (hash.indexOf(marca) !== 0) return;

    const crudo = hash.slice(marca.length);
    if (!crudo) return;

    let json;
    try {
      json = decodeURIComponent(crudo);
    } catch {
      json = crudo; // por si ya venía sin codificar
    }
    const payload = JSON.parse(json);
    aplicarFiliacion(payload, 'hash #data=');

    // Limpia el fragmento para no re-aplicar datos viejos si el médico recarga
    // la pestaña, y para no dejar el payload a la vista en la barra de direcciones.
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (error) {
      window.location.hash = '';
    }
  } catch (error) {
    console.warn('MyVete Panel: no se pudo leer la filiación del hash #data=.', error);
  }
}

leerFiliacionDesdeHash();

// ---------------------------------------------------------------------------
// 3. Bloque Medicación — filas dinámicas con estado (continua/nueva/modificada/suspendida)
// ---------------------------------------------------------------------------
const listaMedicacion = document.getElementById('lista-medicacion');
const plantillaFilaMedicamento = document.getElementById('plantilla-fila-medicamento');

const ETIQUETAS_ESTADO = {
  nueva: 'Nueva',
  modificada: 'Modificada',
  suspendida: 'Suspendida',
};

function actualizarBadge(fila) {
  const badge = fila.querySelector('.estado-badge');
  const estado = fila.dataset.estado;
  if (estado === 'continua') {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.textContent = ETIQUETAS_ESTADO[estado] || estado;
}

function crearFilaMedicamento({ medicamento = '', dosis = '', frecuencia = '', estado = 'nueva' } = {}) {
  const fragmento = plantillaFilaMedicamento.content.cloneNode(true);
  const fila = fragmento.querySelector('.fila-medicamento');
  const campoMedicamento = fila.querySelector('.campo-medicamento');
  const campoDosis = fila.querySelector('.campo-dosis');
  const campoFrecuencia = fila.querySelector('.campo-frecuencia');
  const btnEditar = fila.querySelector('.btn-editar');
  const btnSuspender = fila.querySelector('.btn-suspender');

  fila.dataset.estado = estado;
  campoMedicamento.textContent = medicamento;
  campoDosis.value = dosis;
  campoFrecuencia.value = frecuencia;

  const esNueva = estado === 'nueva';
  campoMedicamento.contentEditable = esNueva ? 'true' : 'false';
  campoDosis.readOnly = !esNueva;
  campoFrecuencia.readOnly = !esNueva;

  // Snapshot para detectar ediciones reales sobre filas "continua" (Sección 2.1
  // del contrato: "modificada" es la fila que existía y cuya dosis/frecuencia
  // se editó hoy — no basta con haber tocado el botón de editar).
  campoDosis.dataset.original = dosis;
  campoFrecuencia.dataset.original = frecuencia;

  btnEditar.addEventListener('click', () => {
    campoDosis.readOnly = false;
    campoFrecuencia.readOnly = false;
    campoDosis.focus();
  });

  const marcarSiModificada = () => {
    if (fila.dataset.estado !== 'continua') return;
    const cambioDosis = campoDosis.value !== campoDosis.dataset.original;
    const cambioFrecuencia = campoFrecuencia.value !== campoFrecuencia.dataset.original;
    if (cambioDosis || cambioFrecuencia) {
      fila.dataset.estado = 'modificada';
      actualizarBadge(fila);
    }
  };
  campoDosis.addEventListener('blur', marcarSiModificada);
  campoFrecuencia.addEventListener('blur', marcarSiModificada);

  btnSuspender.addEventListener('click', () => {
    if (fila.dataset.estado === 'suspendida') {
      fila.dataset.estado = fila.dataset.estadoPrevio || 'continua';
      campoDosis.readOnly = fila.dataset.estado !== 'nueva';
      campoFrecuencia.readOnly = fila.dataset.estado !== 'nueva';
    } else {
      fila.dataset.estadoPrevio = fila.dataset.estado;
      fila.dataset.estado = 'suspendida';
      campoDosis.readOnly = true;
      campoFrecuencia.readOnly = true;
    }
    actualizarBadge(fila);
  });

  actualizarBadge(fila);
  return fila;
}

const btnAgregarMedicamento = document.getElementById('btn-agregar-medicamento');
if (btnAgregarMedicamento) {
  btnAgregarMedicamento.addEventListener('click', () => {
    const fila = crearFilaMedicamento({ estado: 'nueva' });
    listaMedicacion.appendChild(fila);
    fila.querySelector('.campo-medicamento').focus();
  });
}

function leerMedicacion() {
  return Array.from(listaMedicacion.querySelectorAll('.fila-medicamento')).map((fila) => ({
    medicamento: fila.querySelector('.campo-medicamento').textContent.trim(),
    dosis: fila.querySelector('.campo-dosis').value.trim(),
    frecuencia: fila.querySelector('.campo-frecuencia').value.trim(),
    estado: fila.dataset.estado,
  }));
}

// ---------------------------------------------------------------------------
// 4. (libre) — el "Apéndice Métrico" / MAPEO_METRICAS / leerBloqueMetrico se
//     eliminó el 2026-09-08 al unificar todo el eco en un solo bloque. Las
//     métricas de ecocardiograma viven ahora en la Sección 8
//     (leerBloqueEcocardiografia → payload.datos_ecocardiografia) y las de
//     electrocardiograma en leerBloqueEKG → payload.bloque_ekg. El viejo
//     payload.bloque_metrico ya no se emite (n8n nunca lo consumió: la clave
//     `metricas` de atenciones_cardiologia se arma con la salida de la IA).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Consolidación del Payload Final
// ---------------------------------------------------------------------------
function consolidarPayloadFinal() {
  return {
    filiacion: {
      tutor: {
        id_myvete: idTutorMyVete,
        nombre: document.getElementById('tutor-nombre').value.trim(),
        telefono: document.getElementById('tutor-telefono').value.trim() || null,
        email: document.getElementById('tutor-email').value.trim() || null,
      },
      mascota: {
        nombre: document.getElementById('paciente-nombre').value.trim(),
        especie: document.getElementById('paciente-especie').value || null,
        raza: document.getElementById('paciente-raza').value.trim() || null,
        peso: document.getElementById('paciente-peso').value === '' ? null : Number(document.getElementById('paciente-peso').value),
      },
      editado: bloqueFiliacionEditado,
    },
    consulta: {
      fc: document.getElementById('clinica-fc').value === '' ? null : Number(document.getElementById('clinica-fc').value),
      fr: document.getElementById('clinica-fr').value === '' ? null : Number(document.getElementById('clinica-fr').value),
      pas: document.getElementById('clinica-pas').value === '' ? null : Number(document.getElementById('clinica-pas').value),
      pam: document.getElementById('clinica-pam').value === '' ? null : Number(document.getElementById('clinica-pam').value),
      pad: document.getElementById('clinica-pad').value === '' ? null : Number(document.getElementById('clinica-pad').value),
      mucosas: document.getElementById('clinica-mucosas').value,
      anamnesis: document.getElementById('consulta-anamnesis').value.trim(),
      diagnostico: document.getElementById('consulta-diagnostico').value.trim(),
      indicaciones: document.getElementById('consulta-indicaciones').value.trim(),
    },
    medicacion: leerMedicacion(),
    // Bloque para la tabla Supabase `datos_ecocardiografia` (Sección 8). Objeto
    // con las 72 columnas (null las vacías) o null si no se cargó ningún dato;
    // n8n lo inserta recién después de crear la atención, con atencion_id = id
    // de esa atención. leerBloqueEcocardiografia / leerBloqueEKG son function
    // declarations (hoisted): disponibles aunque se definan más abajo.
    datos_ecocardiografia: leerBloqueEcocardiografia(),
    // Electrocardiograma — bloque aparte (la tabla eco no tiene columnas EKG).
    // n8n lo ignora por ahora, igual que hacía con el viejo bloque_metrico.
    bloque_ekg: leerBloqueEKG(),
  };
}

window.consolidarPayloadFinal = consolidarPayloadFinal;

// ---------------------------------------------------------------------------
// 6. Envío del formulario — Fase 2: POST directo al webhook de n8n
// ---------------------------------------------------------------------------
// Workflow "MYVETE - Ingesta Filiación & Orquestador Core" (id 5gGWXOjY2BBOAfuw)
// publicado y activo en n8n Cloud el 28/07/2026 — ver n8n/README.md. El nodo
// "IA - Estructurar Anamnesis" (31/07/2026) devuelve el borrador en la clave
// `borrador_medico` de la respuesta del webhook.
const WEBHOOK_URL_N8N = 'https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4';

const btnSubmitFormulario = document.getElementById('btn-submit-formulario');
const avisoFormulario = document.getElementById('aviso-formulario');
const bloqueResumen = document.getElementById('bloque-resumen');
const resumenClinicoTexto = document.getElementById('resumen-clinico-texto');

function mostrarAviso(mensaje) {
  avisoFormulario.textContent = mensaje;
  avisoFormulario.hidden = false;
}

function mostrarBorradorMedico(borradorMedico) {
  if (!bloqueResumen || !resumenClinicoTexto || !borradorMedico) return;
  if (typeof borradorMedico === 'string') {
    try {
      resumenClinicoTexto.value = JSON.stringify(JSON.parse(borradorMedico), null, 2);
    } catch {
      resumenClinicoTexto.value = borradorMedico;
    }
  } else {
    resumenClinicoTexto.value = JSON.stringify(borradorMedico, null, 2);
  }
  bloqueResumen.hidden = false;
}

if (btnSubmitFormulario) {
  const textoOriginalBoton = btnSubmitFormulario.textContent;

  btnSubmitFormulario.addEventListener('click', async () => {
    const diagnostico = document.getElementById('consulta-diagnostico').value.trim();
    if (!diagnostico) {
      mostrarAviso('Completá el diagnóstico antes de enviar la consulta.');
      return;
    }
    avisoFormulario.hidden = true;

    if (!WEBHOOK_URL_N8N) {
      mostrarAviso('Falta configurar WEBHOOK_URL_N8N en app.js — todavía no hay workflow publicado en n8n.');
      console.log('Payload consolidado (no enviado, sin webhook configurado):', consolidarPayloadFinal());
      return;
    }

    const payload = consolidarPayloadFinal();
    btnSubmitFormulario.disabled = true;
    btnSubmitFormulario.textContent = 'Enviando...';

    try {
      const respuesta = await fetch(WEBHOOK_URL_N8N, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!respuesta.ok) throw new Error(`n8n respondió ${respuesta.status}`);

      const datos = await respuesta.json();
      mostrarBorradorMedico(datos.borrador_medico);

      btnSubmitFormulario.textContent = 'Reporte generado';
      const destinoRetorno = destinoBookmarklet();
      if (destinoRetorno) {
        destinoRetorno.postMessage({ type: 'MYVETE_SUBMIT_OK' }, '*');
      }
    } catch (error) {
      console.error('Error al enviar a n8n:', error);
      console.log('Payload consolidado (no se pudo enviar):', payload);
      mostrarAviso('Error de conexión con n8n — el payload quedó impreso en la consola para no perder la carga.');
      btnSubmitFormulario.disabled = false;
      btnSubmitFormulario.textContent = textoOriginalBoton;
    }
  });
}

// ---------------------------------------------------------------------------
// 7. Dictado por voz — Web Speech API nativa (INFORME_CODE Sección B, 28/07/2026)
// ---------------------------------------------------------------------------
// Sin librerías nuevas: usa el reconocimiento de voz nativo del navegador.
// Un botón .btn-dictado por campo (data-target = id del textarea). Solo uno
// puede estar escuchando a la vez; al iniciar uno se apaga el anterior. El
// texto reconocido se concatena al final del campo, nunca borra lo existente.
const ReconocimientoVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
let dictadoActivo = null; // { recognition, boton }

function detenerDictadoActivo() {
  if (dictadoActivo) dictadoActivo.recognition.stop();
}

document.querySelectorAll('.btn-dictado').forEach((boton) => {
  if (!ReconocimientoVoz) {
    boton.disabled = true;
    boton.title = 'Dictado por voz no soportado en este navegador';
    return;
  }

  const campo = document.getElementById(boton.dataset.target);
  if (!campo) return;

  const textoOriginalBoton = boton.textContent;

  boton.addEventListener('click', () => {
    const eraElActivo = dictadoActivo && dictadoActivo.boton === boton;
    detenerDictadoActivo();
    if (eraElActivo) return; // click sobre el propio botón activo = apagar

    const recognition = new ReconocimientoVoz();
    recognition.lang = 'es-AR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let textoBase = campo.value + (campo.value && !/\s$/.test(campo.value) ? ' ' : '');

    // En cada evento 'result' se recorre solo el tramo nuevo (desde
    // resultIndex): los tramos ya marcados isFinal se suman una única vez a
    // textoBase (commit definitivo, no se vuelven a tocar); el tramo interino
    // (todavía no confirmado por el motor) se recalcula entero en cada evento
    // y se pisa sobre sí mismo al final de campo.value — así se ve la
    // transcripción en vivo sin duplicar ni perder el texto ya confirmado.
    recognition.addEventListener('result', (evento) => {
      let textoInterino = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i];
        if (resultado.isFinal) {
          textoBase += `${resultado[0].transcript.trim()} `;
        } else {
          textoInterino += resultado[0].transcript;
        }
      }
      campo.value = textoBase + textoInterino;
      campo.classList.toggle('campo-dictado-interino', textoInterino.trim() !== '');
    });

    recognition.addEventListener('error', (evento) => {
      console.error('Error de dictado por voz:', evento.error);
    });

    recognition.addEventListener('end', () => {
      // Al cortar el reconocimiento, cualquier resto interino sin confirmar
      // se descarta del DOM: el campo vuelve a valer exactamente textoBase
      // (lo que sí llegó a isFinal), para que no quede una frase a mitad
      // transcribir pegada en el textarea.
      campo.value = textoBase;
      campo.classList.remove('campo-dictado-interino');
      campo.classList.remove('campo-dictado-activo');
      boton.textContent = textoOriginalBoton;
      boton.classList.remove('btn-dictado-activo');
      if (dictadoActivo && dictadoActivo.boton === boton) dictadoActivo = null;
    });

    dictadoActivo = { recognition, boton };
    boton.textContent = '🔴 Escuchando...';
    boton.classList.add('btn-dictado-activo');
    campo.classList.add('campo-dictado-activo');
    recognition.start();
  });
});

// ---------------------------------------------------------------------------
// 8. Datos Ecocardiográficos — extracción de PDF + bloque `datos_ecocardiografia`
// ---------------------------------------------------------------------------
// Sustituye al "MÓDULO DE PRUEBA" que estaba sin comitear. Dos responsabilidades:
//
//  a) Extraer valores del PDF del ecocardiograma (PDF.js ya cargado en
//     index.html) con heurística de regex y AUTOLLENAR los campos #eco-* del
//     bloque "Datos Ecocardiográficos". Los campos arrancan disabled; el botón
//     "Editar campos" los habilita para corrección manual (decisión 2026-09-08:
//     el PDF prellena, el profesional revisa/edita, después envía).
//
//  b) leerBloqueEcocardiografia(): arma el objeto con TODAS las columnas de la
//     tabla Supabase `datos_ecocardiografia` (menos atencion_id/created_at, que
//     los pone la base y n8n). Las columnas sin campo en la UI, o con el campo
//     vacío, viajan como null. consolidarPayloadFinal() lo agrega como
//     payload.datos_ecocardiografia (o null si no se cargó ningún dato).
//
// El id de cada input de dato es EXACTAMENTE `eco-<nombre_de_columna>`, así el
// mapeo UI → columna es directo y no hay una segunda tabla de nombres.
//
// Unidades (la tabla es `numeric` sin unidad): lineales en cm (el extractor
// convierte mm → cm), fracciones en %, velocidades en m/s (cm/s → m/s). Es una
// convención elegida acá, no un dato del schema.
//
// Correcciones ya incorporadas del módulo previo: separador sigla/número
// opcional; unidad capturada dentro del regex (grupo 2) con ventana corta de
// respaldo (5 chars) para no cruzar al campo siguiente; coma decimal; "%"
// opcional en FE/FS; límite de palabra (\b) antes de cada sigla.

// Columnas reales de public.datos_ecocardiografia (introspección 2026-09-08),
// sin atencion_id ni created_at. El orden es el de la tabla.
const COLUMNAS_DATOS_ECO = [
  'sivd', 'sivs', 'dvid', 'dvs', 'ppvid', 'ppvis',
  'fe_modom', 'fs_modom',
  'volumen_fdi_modom', 'volumen_fsi_modom', 'volumen_si_modom', 'gasto_cardiaco_modom',
  'masa_vi', 'indice_masa_vi', 'mvcf',
  'fe_simpson',
  'volumen_ai_esv_simpson', 'volumen_ai_simp_simpson',
  'volumen_vi_fd_simpson', 'volumen_vi_fs_simpson',
  'ai_lineal', 'ao_lineal', 'ai_ao_lineal', 'ai_ao_area',
  'vmax_ao', 'gp_ao', 'vti_ao', 'thp_ao',
  'vmax_pulmonar', 'gp_pulmonar',
  'vmax_mitral', 'gp_mitral',
  'velocidad_e_mitral', 'velocidad_a_mitral', 'relacion_ea_mitral',
  'vmax_tricuspideo', 'gp_tricuspideo',
  'velocidad_e_tricuspideo', 'velocidad_a_tricuspideo', 'relacion_ea_tricuspideo',
  'mapse', 'tapse', 'fa_atrial',
  'vp_ap', 'ao_ap', 'dapd', 'dvccd',
  'efusion_pericardica', 'efusion_pleural', 'patron_llenado_vi', 'observaciones',
  'dvid_indexado', 'dvs_indexado', 'sivd_indexado', 'sivs_indexado',
  'ppvid_indexado', 'ppvis_indexado',
  'ai_indexado', 'ao_indexado', 'masa_vi_indexada', 'volumen_ai_indexado',
  'volumen_fdi_indexado', 'volumen_fsi_indexado', 'volumen_si_indexado', 'gasto_cardiaco_indexado',
  'volumen_vi_fd_indexado', 'volumen_vi_fs_indexado',
  'acvim_estadio', 'mine2_puntaje', 'mine2_clasificacion', 'hp_gradiente', 'hp_clasificacion',
];

// Columnas `text` de la tabla (el resto son `numeric`).
const COLUMNAS_DATOS_ECO_TEXTO = new Set([
  'efusion_pericardica', 'efusion_pleural', 'patron_llenado_vi', 'observaciones',
  'acvim_estadio', 'mine2_clasificacion', 'hp_clasificacion',
]);

// Heurística PDF → columna. `unidad` es la de DESTINO: solo 'cm' dispara
// conversión desde mm y solo 'm/s' desde cm/s; el resto se toma tal cual.
// `siglas` alimenta el fallback cuando el regex principal no matchea.
const MAPEO_EXTRACCION_PDF = [
  { columna: 'dvid', siglas: ['DIVId', 'LVIDd', 'LVEDD', 'DVId', 'DVI'],
    regex: /\b(?:DIVId|LVIDd|LVEDD|DVId|DVI)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'dvs', siglas: ['DIVIs', 'LVIDs', 'LVESD', 'DVIs', 'DVS'],
    regex: /\b(?:DIVIs|LVIDs|LVESD|DVIs|DVS)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'sivd', siglas: ['SIVd', 'IVSd'],
    regex: /\b(?:SIVd|IVSd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'sivs', siglas: ['SIVs', 'IVSs'],
    regex: /\b(?:SIVs|IVSs)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'ppvid', siglas: ['PPVId', 'LVPWd'],
    regex: /\b(?:PPVId|LVPWd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'ppvis', siglas: ['PPVIs', 'LVPWs'],
    regex: /\b(?:PPVIs|LVPWs)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'fe_modom', siglas: ['FE(Teich)', 'EF(Teich)', 'FE', 'EF'],
    regex: /\b(?:FE\(Teich\)|EF\(Teich\)|FE|EF)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'fs_modom', siglas: ['FS(Teich)', 'FS'],
    regex: /(?:%\s*)?\b(?:FS\(Teich\)|FS)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'fe_simpson', siglas: ['FE Simpson', 'EF Simpson', 'Simpson'],
    regex: /\b(?:FE|EF)\s*\(?\s*Simpson\s*\)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'ai_lineal', siglas: ['Diámetro AI', 'Diametro AI', 'AI', 'LA'],
    regex: /\b(?:Di[áa]metro\s+AI|AI|LA)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'ao_lineal', siglas: ['Ao Diam', 'Diámetro aorta', 'Diametro aorta', 'Ao'],
    regex: /\b(?:Ao\s?Diam|Di[áa]metro\s+aorta|Ao)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'cm' },
  { columna: 'ai_ao_lineal', siglas: ['AI/Ao', 'LA/Ao'],
    regex: /\b(?:AI\s*\/\s*Ao|LA\s*\/\s*Ao|Relaci[óo]n\s+AI\s*\/?\s*Ao)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  { columna: 'velocidad_e_mitral', siglas: ['Onda E', 'Vel E', 'E mitral'],
    regex: /\b(?:Onda\s*E|Vel\.?\s*E|E\s*mitral|Vmax\s*E)\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(m\/s|cm\/s)?/i, unidad: 'm/s' },
  // Campos que venían del "Apéndice Métrico" y no estaban ya arriba (2026-09-08).
  { columna: 'ai_ao_area', siglas: ['AI/Ao area', 'AI/Ao área', 'LA/Ao area'],
    regex: /\b(?:AI|LA)\s*\/\s*Ao\s*(?:\(?\s*[áa]rea\s*\)?|2D)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  { columna: 'dvid_indexado', siglas: ['LVIDDN', 'LVIDdN', 'DVIDn', 'LVIDDn'],
    regex: /\bLVID[dD]?\s*[nN]\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  { columna: 'volumen_ai_indexado', siglas: ['LAVI', 'LAV Index', 'LAV indexado'],
    regex: /\bLAVI\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(ml\/kg)?/i, unidad: null },
  // Electrocardiograma — se autollena en #eco-ekg_* pero NO va a la tabla eco;
  // leerBloqueEKG() lo separa a payload.bloque_ekg. FC/eje son best-effort;
  // ritmo (texto libre) y duración P casi nunca parsean bien: quedan manuales.
  { columna: 'ekg_fc', siglas: ['FC ECG', 'FC electro', 'HR ECG', 'FC EKG'],
    regex: /\bFC\s*(?:ECG|EKG|electro\w*)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(bpm|lpm)?/i, unidad: 'bpm' },
  { columna: 'ekg_eje', siglas: ['Eje eléctrico', 'Eje electrico', 'Eje', 'Axis'],
    regex: /\bEje\s*(?:el[ée]ctrico)?\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*[°º]?/i, unidad: null },
];

// "25,2" -> 25.2 ; "1.42" -> 1.42 ; basura -> NaN
function ecoANumero(valorCrudo) {
  if (valorCrudo == null) return NaN;
  return parseFloat(String(valorCrudo).replace(',', '.'));
}

// Devuelve el número ya en la unidad de destino, o null si no es numérico.
// Si la unidad no se detectó, se ASUME que ya viene en la de destino (RIESGO:
// un valor real en mm sin unidad explícita queda 10x más chico — no hay forma
// fiable de saberlo solo del texto).
function ecoNormalizarValor(valorCrudo, unidadDetectada, unidadDestino) {
  const num = ecoANumero(valorCrudo);
  if (isNaN(num)) return null;
  const u = String(unidadDetectada || '').toLowerCase();
  if (u === 'mm' && unidadDestino === 'cm') return Math.round((num / 10) * 1000) / 1000;
  if (u === 'cm/s' && unidadDestino === 'm/s') return Math.round((num / 100) * 1000) / 1000;
  return num;
}

function ecoEscaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ecoExtraerPorRegex(texto, config) {
  let match = texto.match(config.regex);

  // Fallback: sigla suelta, separador y unidad opcionales.
  if (!match) {
    for (const sigla of config.siglas) {
      const rf = new RegExp(
        ecoEscaparRegex(sigla) + '\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(mm|cm|%|m\\/s|cm\\/s)?',
        'i',
      );
      match = texto.match(rf);
      if (match) break;
    }
  }

  if (!match) return null;

  // Unidad: la del propio match; si no vino, ventana corta (5 chars) pegada al
  // final del número.
  let unidad = match[2];
  if (!unidad && typeof match.index === 'number') {
    const cola = texto.slice(match.index + match[0].length, match.index + match[0].length + 5);
    const m2 = cola.match(/^\s*(mm|cm|%|m\/s|cm\/s)/i);
    if (m2) unidad = m2[1];
  }

  return ecoNormalizarValor(match[1], unidad, config.unidad);
}

// Recorre MAPEO_EXTRACCION_PDF y devuelve { <columna>: number|null }.
function extraerDatosEcocardiografia(texto) {
  const resultados = {};
  for (const config of MAPEO_EXTRACCION_PDF) {
    resultados[config.columna] = ecoExtraerPorRegex(texto, config);
  }
  return resultados;
}

// Vuelca lo extraído en los inputs #eco-<columna> (solo los no-null que tengan
// campo). Devuelve cuántos campos se llenaron.
function autollenarCamposEco(datos) {
  let llenos = 0;
  for (const [columna, valor] of Object.entries(datos)) {
    const campo = document.getElementById(`eco-${columna}`);
    if (!campo || valor == null) continue;
    campo.value = valor;
    llenos += 1;
  }
  return llenos;
}

// Objeto con las 72 columnas de datos_ecocardiografia (null las vacías). Texto
// se manda trim; numéricos con Number (coma → punto). Devuelve null si no hay
// ni un dato cargado, para que n8n no inserte una fila vacía.
function leerBloqueEcocardiografia() {
  const obj = {};
  let algunDato = false;
  for (const columna of COLUMNAS_DATOS_ECO) {
    const campo = document.getElementById(`eco-${columna}`);
    const crudo = campo ? String(campo.value).trim() : '';
    if (crudo === '') {
      obj[columna] = null;
      continue;
    }
    if (COLUMNAS_DATOS_ECO_TEXTO.has(columna)) {
      obj[columna] = crudo;
    } else {
      const n = Number(crudo.replace(',', '.'));
      obj[columna] = Number.isFinite(n) ? n : null;
    }
    if (obj[columna] != null) algunDato = true;
  }
  return algunDato ? obj : null;
}

// Electrocardiograma — bloque separado (la tabla `datos_ecocardiografia` no
// tiene columnas EKG). Lee los 4 inputs #eco-ekg_* que viven visualmente dentro
// del bloque eco unificado, y devuelve un objeto plano (null los vacíos) o null
// si no se cargó ninguno. Va a payload.bloque_ekg — n8n lo ignora por ahora
// (igual que el viejo bloque_metrico).
const CAMPOS_EKG = {
  ekg_fc: 'numero',
  ekg_ritmo: 'texto',
  ekg_eje: 'numero',
  ekg_p_ms: 'numero',
};

function leerBloqueEKG() {
  const obj = {};
  let algunDato = false;
  for (const [clave, tipo] of Object.entries(CAMPOS_EKG)) {
    const campo = document.getElementById(`eco-${clave}`);
    const crudo = campo ? String(campo.value).trim() : '';
    if (crudo === '') {
      obj[clave] = null;
      continue;
    }
    if (tipo === 'texto') {
      obj[clave] = crudo;
    } else {
      const n = Number(crudo.replace(',', '.'));
      obj[clave] = Number.isFinite(n) ? n : null;
    }
    if (obj[clave] != null) algunDato = true;
  }
  return algunDato ? obj : null;
}

const btnEditarEco = document.getElementById('btn-editar-eco');
if (btnEditarEco) {
  btnEditarEco.addEventListener('click', () => {
    const campos = document.querySelectorAll('.campo-eco');
    // Si alguno sigue bloqueado, este clic desbloquea todos; si están todos
    // habilitados, los vuelve a bloquear.
    const habilitar = Array.from(campos).some((c) => c.disabled);
    campos.forEach((c) => { c.disabled = !habilitar; });
    btnEditarEco.textContent = habilitar ? '🔒 Bloquear campos' : '✏️ Editar campos';
  });
}

const btnExtraerEcoPdf = document.getElementById('btn-extraer-eco-pdf');
if (btnExtraerEcoPdf) {
  btnExtraerEcoPdf.addEventListener('click', async () => {
    const input = document.getElementById('eco-pdf-input');
    const log = document.getElementById('eco-pdf-log');
    const escribirLog = (txt) => { log.textContent = txt; log.hidden = false; };

    if (!input || !input.files || input.files.length === 0) {
      escribirLog('⚠️ Elegí un PDF primero.');
      return;
    }
    if (typeof pdfjsLib === 'undefined') {
      escribirLog('❌ PDF.js no cargó (revisá la conexión o los <script> de index.html).');
      return;
    }

    escribirLog('📄 Procesando PDF...');
    try {
      const arrayBuffer = await input.files[0].arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let textoCompleto = '';
      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textoCompleto += `\n--- PÁGINA ${i} ---\n${content.items.map((it) => it.str).join(' ')}`;
      }

      const datos = extraerDatosEcocardiografia(textoCompleto);
      const llenos = autollenarCamposEco(datos);

      let resumen = `📊 ${llenos} campo(s) autollenado(s). Revisá y usá "Editar campos" si hay que corregir.\n\n`;
      for (const [columna, valor] of Object.entries(datos)) {
        resumen += `${columna}: ${valor != null ? valor : '—'}\n`;
      }
      escribirLog(resumen);
    } catch (error) {
      escribirLog(`❌ Error al leer el PDF: ${error.message}`);
    }
  });
}
