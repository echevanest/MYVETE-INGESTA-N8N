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
// 0.bis. Identificación del profesional (Sprint 7) — modal bloqueante
// ---------------------------------------------------------------------------
// profesional.html (iframe, mismo origen) guarda en localStorage bajo esta misma
// clave un objeto { profesional_id, nombre, apellido, matricula, ... }. Va DESPUÉS
// de notificarPanelListo() para no retrasar el handshake con el bookmarklet.
const CLAVE_PROFESIONAL = 'myvete_profesional';

function abrirModalProfesional() {
  const modal = document.getElementById('modal-profesional');
  if (modal) modal.hidden = false;
}

function cerrarModalProfesional() {
  const modal = document.getElementById('modal-profesional');
  if (modal) modal.hidden = true;
}

// Devuelve true si el valor es un profesional válido (con profesional_id).
function aplicarProfesional(crudo) {
  try {
    const datos = JSON.parse(crudo);
    if (!datos || !datos.profesional_id) return false;
    window.profesionalActual = datos;
    cerrarModalProfesional();
    return true;
  } catch (error) {
    console.error('Error parseando profesional de localStorage:', error);
    return false;
  }
}

let intervaloProfesional = null;

// Se registra SIEMPRE (haya o no identificación al arrancar): si window.profesionalActual
// se pierde y el modal se reabre, esto lo cierra cuando profesional.html vuelva a guardar.
// 'storage' se dispara en el documento padre cuando el iframe (mismo origen) escribe;
// el polling es respaldo por si el evento no llega.
function esperarIdentificacionProfesional() {
  window.addEventListener('storage', (evento) => {
    if (evento.key === CLAVE_PROFESIONAL && evento.newValue) aplicarProfesional(evento.newValue);
  });
  intervaloProfesional = setInterval(() => {
    const guardado = localStorage.getItem(CLAVE_PROFESIONAL);
    if (guardado) aplicarProfesional(guardado);
  }, 1000);
}

// --- Validación contra Supabase (8.7d, 2026-10-01) ---------------------------
// El profesional_id de localStorage puede haber dejado de existir en la base
// (E2E del 2026-09-30: el profesional se había borrado y el insert de la
// atención falló por la FK). Al arrancar se consulta `profesionales` con la
// clave publicable (la misma de profesional.html; RLS deja a anon leer solo
// activo = true):
//   · no existe (o está inactivo) → se descarta lo guardado y se abre el alta;
//   · existe → se refresca lo guardado con los datos de la base, porque el
//     informe se arma con payload.profesional;
//   · no se pudo consultar (sin red, proyecto pausado) → no se bloquea.
const SUPABASE_URL = 'https://tuedigqvvkvgongpcnjx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TQmn488CoLDoMoM0wKLzpw_N_nAa7fZ';
const COLUMNAS_PROFESIONAL = 'id,nombre,apellido,email,especialidad,matricula_tipo,matricula_numero,matricula_2_tipo,matricula_2_numero,firma_url';
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fila del profesional; null si no existe; undefined si no se pudo consultar.
async function buscarProfesionalEnSupabase(profesionalId) {
  if (!REGEX_UUID.test(String(profesionalId))) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/profesionales?id=eq.${profesionalId}&select=${COLUMNAS_PROFESIONAL}`;
    const respuesta = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!respuesta.ok) return undefined;
    const filas = await respuesta.json();
    if (!Array.isArray(filas)) return undefined;
    return filas[0] || null;
  } catch (error) {
    return undefined;
  }
}

async function validarProfesionalGuardado() {
  const guardado = window.profesionalActual;
  if (!guardado || !guardado.profesional_id) return;
  const idValidado = guardado.profesional_id;
  const fila = await buscarProfesionalEnSupabase(idValidado);

  // Si mientras tanto profesional.html guardó otro profesional, no se toca.
  if (!window.profesionalActual || window.profesionalActual.profesional_id !== idValidado) return;

  if (fila === undefined) {
    console.warn('MyVete Panel: no se pudo validar el profesional contra Supabase; se sigue con el guardado.');
    return;
  }
  if (fila === null) {
    console.warn(`MyVete Panel: el profesional ${idValidado} no existe en Supabase; se pide el alta de nuevo.`);
    localStorage.removeItem(CLAVE_PROFESIONAL);
    window.profesionalActual = null;
    abrirModalProfesional();
    return;
  }
  const { id, ...datos } = fila;
  const refrescado = { ...guardado, ...datos, profesional_id: id };
  window.profesionalActual = refrescado;
  localStorage.setItem(CLAVE_PROFESIONAL, JSON.stringify(refrescado));
}

const profesionalGuardado = localStorage.getItem(CLAVE_PROFESIONAL);
if (!profesionalGuardado || !aplicarProfesional(profesionalGuardado)) {
  abrirModalProfesional();
} else {
  validarProfesionalGuardado();
}
esperarIdentificacionProfesional();

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
// 1.bis E-mail del tutor — formato y corrección del dominio (8.7p)
// ---------------------------------------------------------------------------
// Va antes de la Sección 2: aplicarFiliacion corre durante la carga del script
// (leerFiliacionDesdeHash) y ya necesita estas constantes.
// >>> EMAIL-PURO
// Formato mínimo de e-mail: algo@algo.algo, sin espacios. La misma regla está
// en n8n ('IF - ¿Tutor con email?' y 'Verificación final').
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 8.7p (2026-10-05): corrección del dominio del e-mail del tutor. La misma
// lógica está copiada en n8n ('Preparar Datos para PDF'); si cambia acá, cambia
// allá (copia del nodo en n8n/preparar_datos_pdf.8.7p.js).
//
// Dominios a los que se corrige un error de tipeo ("gemail.com" → "gmail.com").
const DOMINIOS_EMAIL_CORREGIBLES = [
  'gmail.com',
  'hotmail.com', 'hotmail.com.ar', 'hotmail.es',
  'outlook.com', 'outlook.com.ar', 'outlook.es',
  'yahoo.com', 'yahoo.com.ar', 'yahoo.es',
  'live.com', 'live.com.ar',
  'icloud.com',
];
// Dominios que existen y se dejan como están: ni se corrigen ni dan aviso,
// aunque se parezcan a uno de arriba ("email.com", "hotmail.se").
const DOMINIOS_EMAIL_VALIDOS = [
  'googlemail.com', 'mail.com', 'email.com', 'ymail.com', 'rocketmail.com',
  'msn.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.es',
  'proton.me', 'protonmail.com',
  'hotmail.fr', 'hotmail.it', 'hotmail.de', 'hotmail.se', 'hotmail.co.uk',
  'outlook.fr', 'outlook.it', 'outlook.de', 'outlook.se',
  'yahoo.fr', 'yahoo.it', 'yahoo.de', 'yahoo.se', 'yahoo.co.uk',
  'yahoo.com.mx', 'yahoo.com.br', 'live.cl', 'live.it', 'live.fr',
  'fibertel.com.ar', 'speedy.com.ar', 'arnet.com.ar', 'ciudad.com.ar',
  'telecentro.com.ar', 'uolsinectis.com.ar',
];

// Distancia de edición con transposición de letras vecinas ("gmial" → "gmail"
// cuenta 1).
function distanciaEdicion(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i += 1) d.push([i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Revisa el dominio de un e-mail. Devuelve { estado, email, original, dominio }:
//   'vacio' | 'invalido' (no cumple EMAIL_VALIDO) | 'ok' (dominio conocido)
//   'corregido': el dominio está a una sola letra de exactamente un dominio
//                corregible; `email` trae el corregido.
//   'desconocido': no se puede deducir; `email` queda como llegó.
function revisarEmail(valor) {
  const original = String(valor == null ? '' : valor).trim();
  if (!original) return { estado: 'vacio', email: '', original, dominio: '' };
  if (!EMAIL_VALIDO.test(original)) return { estado: 'invalido', email: original, original, dominio: '' };
  const arroba = original.lastIndexOf('@');
  const usuario = original.slice(0, arroba);
  const dominio = original.slice(arroba + 1).toLowerCase();
  if (DOMINIOS_EMAIL_CORREGIBLES.includes(dominio) || DOMINIOS_EMAIL_VALIDOS.includes(dominio)) {
    return { estado: 'ok', email: original, original, dominio };
  }
  const candidatos = DOMINIOS_EMAIL_CORREGIBLES.filter((c) => distanciaEdicion(dominio, c) === 1);
  if (candidatos.length === 1) {
    return { estado: 'corregido', email: `${usuario}@${candidatos[0]}`, original, dominio: candidatos[0] };
  }
  return { estado: 'desconocido', email: original, original, dominio };
}
// <<< EMAIL-PURO

// 8.7p: corrige el e-mail del tutor en el campo o avisa que hay que mirarlo.
// Se llama al precargar la filiación, al salir del campo y al enviar. Si el
// profesional vuelve a escribir un e-mail que ya se le corrigió, se respeta
// (queda solo el aviso): la corrección no insiste.
const emailsTutorYaCorregidos = new Set();

function revisarEmailTutor() {
  const campo = document.getElementById('tutor-email');
  const aviso = document.getElementById('aviso-email-tutor');
  if (!campo || !aviso) return;
  let revision = revisarEmail(campo.value);
  if (revision.estado === 'corregido' && emailsTutorYaCorregidos.has(revision.original.toLowerCase())) {
    revision = { ...revision, estado: 'desconocido', email: revision.original, dominio: revision.original.split('@').pop() };
  }
  if (revision.estado === 'corregido') {
    emailsTutorYaCorregidos.add(revision.original.toLowerCase());
    campo.value = revision.email;
    aviso.textContent = `E-mail corregido: "${revision.original}" → "${revision.email}". Si el original estaba bien, volvé a escribirlo.`;
    aviso.hidden = false;
  } else if (revision.estado === 'desconocido') {
    aviso.textContent = `Verificá el email del tutor: "${revision.dominio}" no es un dominio conocido.`;
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
}

const campoEmailTutorRevision = document.getElementById('tutor-email');
if (campoEmailTutorRevision) campoEmailTutorRevision.addEventListener('change', revisarEmailTutor);

// ---------------------------------------------------------------------------
// 2. Bloque Filiación — precarga editable
// ---------------------------------------------------------------------------
// 8.7e (2026-10-01): los campos se editan con solo pararse adentro; ya no hay
// botón "Editar". bloqueFiliacionEditado pasa a true cuando el profesional
// cambia de verdad algún campo: la precarga (aplicarFiliacion) asigna .value
// sin disparar eventos, así que no lo activa.
let bloqueFiliacionEditado = false;

// ID de tutor de MyVete (segmento numérico de /customers/{id}). Este archivo
// corre en el origen del panel, no en MyVete, así que NO puede leerlo de la URL
// de MyVete: lo raspa el bookmarklet (launcher.js) y lo pasa como query param
// `?idTutor=` al abrir el panel, con respaldo dentro del payload del postMessage
// y dentro del hash `#data=` (ver Sección 2.bis). Viaja en el payload de salida
// como filiacion.tutor.id_myvete y es la clave de upsert prevista para la tabla
// `tutores`.
let idTutorMyVete = new URLSearchParams(window.location.search).get('idTutor') || null;

const bloqueFiliacion = document.getElementById('bloque-filiacion');
if (bloqueFiliacion) {
  const marcarFiliacionEditada = () => { bloqueFiliacionEditado = true; };
  bloqueFiliacion.addEventListener('input', marcarFiliacionEditada);
  bloqueFiliacion.addEventListener('change', marcarFiliacionEditada);
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
    if (tutor.email != null) {
      document.getElementById('tutor-email').value = tutor.email;
      // 8.7p: el e-mail copiado de MyVete puede venir con el dominio mal
      // escrito. revisarEmailTutor es una function declaration (hoisted).
      revisarEmailTutor();
    }
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

  // Especie y peso se fijan sin evento: se recalcula la interpretación (Sección
  // 10) si ya está inicializada.
  if (typeof window.recalcularClasificaciones === 'function') window.recalcularClasificaciones();
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
// 3. Bloque Medicación — filas dinámicas con estado (continua/nueva/modificada)
// ---------------------------------------------------------------------------
const listaMedicacion = document.getElementById('lista-medicacion');
const plantillaFilaMedicamento = document.getElementById('plantilla-fila-medicamento');

const ETIQUETAS_ESTADO = {
  nueva: 'Nueva',
  modificada: 'Modificada',
};

// 8.7f (2026-10-02): el intervalo es un desplegable (lista de Marcelo, en este
// orden), sin opción elegida por defecto. El texto elegido viaja tal cual en
// payload.medicacion[].frecuencia. 8.7i (2026-10-03): 14 opciones.
const OPCIONES_INTERVALO = [
  'Cada 12 hs',
  'Cada 8 hs',
  'Cada 6 hs',
  'Cada 4 hs',
  'Dosis inyectable interpolada',
  'Todas las mañanas',
  'Todas las noches',
  'Todas las tardes',
  '2 veces al día',
  '3 veces al día',
  '4 veces al día',
  'Dosis única nocturna',
  'Lun, Mie y Vie solo dosis nocturna',
  'Lun y Jue solo dosis nocturna',
];

// Llena el <select> de intervalo. Un valor que no está en la lista (fila
// precargada de una consulta vieja, de cuando el campo era texto libre) se
// agrega como opción propia para no perderlo.
function poblarIntervalo(select, valor) {
  const agregar = (texto, etiqueta) => {
    const opcion = document.createElement('option');
    opcion.value = texto;
    opcion.textContent = etiqueta || texto;
    select.appendChild(opcion);
  };
  agregar('', '—');
  OPCIONES_INTERVALO.forEach((texto) => agregar(texto));
  if (valor && !OPCIONES_INTERVALO.includes(valor)) agregar(valor);
  select.value = valor || '';
}

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

// Estado completo de una fila (lo que hace falta para copiarla a la otra lista).
function leerFilaMedicamento(fila) {
  const campoDosis = fila.querySelector('.campo-dosis');
  const campoFrecuencia = fila.querySelector('.campo-frecuencia');
  return {
    medicamento: fila.querySelector('.campo-medicamento').textContent,
    dosis: campoDosis.value,
    frecuencia: campoFrecuencia.value,
    estado: fila.dataset.estado,
    eliminada: fila.dataset.eliminada === 'true',
    originalDosis: campoDosis.dataset.original,
    originalFrecuencia: campoFrecuencia.dataset.original,
  };
}

// Vuelca un estado sobre una fila ya creada, sin reemplazarla (no se pierde el
// foco ni el clic en curso). Los campos solo se pisan si cambiaron.
function aplicarFilaMedicamento(fila, datos) {
  const campoMedicamento = fila.querySelector('.campo-medicamento');
  const campoDosis = fila.querySelector('.campo-dosis');
  const campoFrecuencia = fila.querySelector('.campo-frecuencia');
  const btnEliminar = fila.querySelector('.btn-eliminar');

  if (campoMedicamento.textContent !== datos.medicamento) campoMedicamento.textContent = datos.medicamento;
  if (campoDosis.value !== datos.dosis) campoDosis.value = datos.dosis;
  if (campoFrecuencia.value !== datos.frecuencia) {
    // Intervalo fuera de la lista (consulta vieja): se agrega como opción propia.
    if (!Array.from(campoFrecuencia.options).some((opcion) => opcion.value === datos.frecuencia)) {
      const opcion = document.createElement('option');
      opcion.value = datos.frecuencia;
      opcion.textContent = datos.frecuencia;
      campoFrecuencia.appendChild(opcion);
    }
    campoFrecuencia.value = datos.frecuencia;
  }
  // Snapshot para detectar ediciones reales sobre filas "continua" (Sección 2.1
  // del contrato: "modificada" es la fila que existía y cuya dosis/frecuencia
  // se editó hoy — no basta con haber tocado el botón de editar).
  campoDosis.dataset.original = datos.originalDosis;
  campoFrecuencia.dataset.original = datos.originalFrecuencia;

  fila.dataset.estado = datos.estado;
  // 8.7e: "Eliminar" (✕) reemplaza al viejo estado "suspendida". La fila no
  // sale del DOM: queda marcada con data-eliminada (atenuada y tachada, sin
  // edición) y el mismo botón pasa a "Rehacer" (↺), que la deja como estaba,
  // con su estado y sus valores. Sin cartel de confirmación. leerMedicacion()
  // saltea las marcadas: no viajan en el payload ni existe un estado
  // "eliminado".
  if (datos.eliminada) {
    fila.dataset.eliminada = 'true';
  } else {
    delete fila.dataset.eliminada;
  }
  campoDosis.disabled = datos.eliminada;
  campoFrecuencia.disabled = datos.eliminada;
  campoMedicamento.contentEditable = !datos.eliminada && datos.estado === 'nueva' ? 'true' : 'false';
  btnEliminar.textContent = datos.eliminada ? '↺' : '✕';
  btnEliminar.title = datos.eliminada ? 'Rehacer (recuperar el medicamento)' : 'Eliminar medicamento';
  btnEliminar.setAttribute('aria-label', datos.eliminada ? 'Rehacer' : 'Eliminar');

  actualizarBadge(fila);
}

function crearFilaMedicamento({
  medicamento = '', dosis = '', frecuencia = '', estado = 'nueva',
  eliminada = false, originalDosis = dosis, originalFrecuencia = frecuencia,
} = {}) {
  const fragmento = plantillaFilaMedicamento.content.cloneNode(true);
  const fila = fragmento.querySelector('.fila-medicamento');
  const campoMedicamento = fila.querySelector('.campo-medicamento');
  const campoDosis = fila.querySelector('.campo-dosis');
  const campoFrecuencia = fila.querySelector('.campo-frecuencia');
  const btnEliminar = fila.querySelector('.btn-eliminar');

  poblarIntervalo(campoFrecuencia, frecuencia);

  // El nombre es una sola línea: Enter pasa a la dosis en vez de cortar renglón.
  campoMedicamento.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    campoDosis.focus();
  });
  campoDosis.readOnly = estado !== 'nueva';

  // 8.7e: la dosis se edita con solo pararse adentro (clic o Tab), sin botón
  // de editar. El intervalo es un <select> (8.7f): siempre se puede cambiar.
  campoDosis.addEventListener('focus', () => { campoDosis.readOnly = false; });

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
  campoFrecuencia.addEventListener('change', marcarSiModificada);

  btnEliminar.addEventListener('click', () => {
    const actual = leerFilaMedicamento(fila);
    aplicarFilaMedicamento(fila, { ...actual, eliminada: !actual.eliminada });
  });

  aplicarFilaMedicamento(fila, {
    medicamento, dosis, frecuencia, estado, eliminada, originalDosis, originalFrecuencia,
  });
  return fila;
}

// 8.7i: la lista se muestra dos veces, en "Tratamiento crónico" y dentro de
// "Indicaciones". Es una sola lista: cada cambio en una (agregar, editar,
// eliminar, rehacer) se copia fila por fila a la otra. `focusout` cubre el paso
// a "modificada", que se decide al salir de la dosis.
const listaMedicacionIndicaciones = document.getElementById('lista-medicacion-indicaciones');
const LISTAS_MEDICACION = [listaMedicacion, listaMedicacionIndicaciones].filter(Boolean);

function espejarMedicacion(origen) {
  const filas = Array.from(origen.children);
  LISTAS_MEDICACION.filter((lista) => lista !== origen).forEach((destino) => {
    filas.forEach((fila, i) => {
      const datos = leerFilaMedicamento(fila);
      if (destino.children[i]) aplicarFilaMedicamento(destino.children[i], datos);
      else destino.appendChild(crearFilaMedicamento(datos));
    });
  });
}

LISTAS_MEDICACION.forEach((lista) => {
  ['input', 'change', 'click', 'focusout'].forEach((tipo) => {
    lista.addEventListener(tipo, () => espejarMedicacion(lista));
  });
});

[
  ['btn-agregar-medicamento', listaMedicacion],
  ['btn-agregar-medicamento-indicaciones', listaMedicacionIndicaciones],
].forEach(([idBoton, lista]) => {
  const boton = document.getElementById(idBoton);
  if (!boton || !lista) return;
  boton.addEventListener('click', () => {
    const fila = crearFilaMedicamento({ estado: 'nueva' });
    lista.appendChild(fila);
    espejarMedicacion(lista);
    fila.querySelector('.campo-medicamento').focus();
  });
});

// Las filas eliminadas (data-eliminada, a la espera de un posible "Rehacer")
// no se envían. Se lee una sola de las dos listas: son iguales.
function leerMedicacion() {
  return Array.from(
    listaMedicacion.querySelectorAll('.fila-medicamento:not([data-eliminada="true"])'),
  ).map((fila) => ({
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
//     payload.bloque_metrico ya no se emite. La columna `metricas` de
//     atenciones_cardiologia se eliminó en el Sprint 8 (Prompt 2a): las
//     constantes viajan ahora en payload.examen_clinico (Sección 9).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Consolidación del Payload Final
// ---------------------------------------------------------------------------
function consolidarPayloadFinal() {
  return {
    profesional_id: window.profesionalActual?.profesional_id || null,
    profesional: window.profesionalActual || null,
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
    // Consulta + examen clínico (Sprint 8.0). Reemplaza al viejo
    // payload.consulta: n8n (Prompt 2c) mapea cada clave a su columna de
    // atenciones_cardiologia. leerExamenClinico está en la Sección 9 (hoisted).
    examen_clinico: leerExamenClinico(),
    medicacion: leerMedicacion(),
    // Bloque para la tabla Supabase `datos_ecocardiografia` (Sección 8). Objeto
    // con todas las columnas de COLUMNAS_DATOS_ECO (null las vacías) o null si no se cargó ningún dato;
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
// Workflow "MYVETE - Ingesta" (id lkOwTFmVTZu7EMoU, path "ingesta-filiacion")
// — ver n8n/README.md. El id 5gGWXOjY2BBOAfuw es el backup ("MYVETE - Ingesta
// (CORE) [BACKUP - NO TOCAR]", inactivo, path "ingesta-filiacion-v4"), no el
// workflow que atiende esta URL. El nodo
// "IA - Estructurar Anamnesis" (31/07/2026) devuelve el borrador en la clave
// `borrador_medico` de la respuesta del webhook.
const WEBHOOK_URL_N8N = 'https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion';

// EMAIL_VALIDO y la corrección de dominios (8.7p) están en la Sección 1.bis.

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
    // Alcanza con el diagnóstico de lista o con el dictado (8.7i).
    if (!leerDiagnostico()) {
      mostrarAviso('Completá el diagnóstico antes de enviar la consulta.');
      // El diagnóstico está dentro de "Interpretación diagnóstica": si el
      // bloque está cerrado, se abre para que se vea qué falta.
      const bloqueDiagnostico = document.getElementById('bloque-interpretacion');
      if (bloqueDiagnostico) bloqueDiagnostico.open = true;
      return;
    }

    // 8.7h: un e-mail mal formado no se envía a n8n (el informe no podría
    // salir). Vacío sí se permite: tutor sin e-mail, informe sin mail.
    const campoEmailTutor = document.getElementById('tutor-email');
    // 8.7p: por si el campo nunca perdió el foco, se revisa antes de leerlo.
    revisarEmailTutor();
    const emailTutor = campoEmailTutor.value.trim();
    if (emailTutor && !EMAIL_VALIDO.test(emailTutor)) {
      mostrarAviso('El e-mail del tutor no tiene un formato válido (ej: juan@mail.com). Corregilo, o dejalo vacío para enviar sin mail al tutor.');
      campoEmailTutor.focus();
      return;
    }
    avisoFormulario.hidden = true;

    if (!window.profesionalActual?.profesional_id) {
      mostrarAviso('Necesitás identificarte antes de enviar.');
      abrirModalProfesional();
      return;
    }

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

      btnSubmitFormulario.textContent = 'Informe enviado';
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
//     bloque "Datos Ecocardiográficos". El PDF prellena, el profesional revisa
//     y corrige con solo pararse en el campo (8.7e, 2026-10-01: ya no hay que
//     habilitarlos), después envía. El botón "Mostrar campos vacíos" solo
//     decide si se ven los campos sin valor.
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
// Unidades (la tabla es `numeric` sin unidad): TODAS las lineales en mm (8.7d,
// 2026-10-01: antes las de Modo M iban en cm; el extractor convierte cm → mm),
// fracciones en %, TODAS las velocidades en cm/s (el extractor convierte
// m/s → cm/s; decisión 8.7, 2026-09-28), tiempos en ms, gradientes en mmHg.
// Se muestra y se guarda en esas unidades; los cálculos convierten por dentro
// (lineales a cm en calcularIndicesEco, velocidades a m/s en la Sección 10).
// Es una convención elegida acá, no un dato del schema.
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
  'masa_vi', 'indice_masa_vi', 'mvcf', 'epr', 'tiempo_eyectivo',
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
  // 8.7a-bis (2026-09-28): flujo pulmonar (at/et en ms, vel. en cm/s) y VD (mm).
  // Las 5 columnas de clasificación (acvim_estadio, mine2_puntaje,
  // mine2_clasificacion, hp_gradiente, hp_clasificacion) quedaron deprecadas en
  // 8.7a y ya no se envían: la interpretación viaja en payload.examen_clinico.
  'at_pulmonar', 'et_pulmonar', 'at_et_pulmonar', 'vel_regurg_pulmonar',
  'dvdd', 'dvds', 'plvdd', 'plvds',
];

// Columnas `text` de la tabla (el resto son `numeric`).
const COLUMNAS_DATOS_ECO_TEXTO = new Set([
  'efusion_pericardica', 'efusion_pleural', 'patron_llenado_vi', 'observaciones',
]);

// >>> PARSER-ECO-PURO
// Heurística PDF → columna. `unidad` es la de DESTINO: 'mm' dispara conversión
// desde cm (todas las lineales se guardan en mm) y 'cm/s' desde m/s (todas las
// velocidades se guardan en cm/s); el resto se toma tal cual.
// `siglas` alimenta el fallback cuando el regex principal no matchea.
const MAPEO_EXTRACCION_PDF = [
  { columna: 'dvid', siglas: ['DIVId', 'LVIDd', 'LVEDD', 'DVId', 'DVI'],
    regex: /\b(?:DIVId|LVIDd|LVEDD|DVId|DVI)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'dvs', siglas: ['DIVIs', 'LVIDs', 'LVESD', 'DVIs', 'DVS'],
    regex: /\b(?:DIVIs|LVIDs|LVESD|DVIs|DVS)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'sivd', siglas: ['SIVd', 'IVSd'],
    regex: /\b(?:SIVd|IVSd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'sivs', siglas: ['SIVs', 'IVSs'],
    regex: /\b(?:SIVs|IVSs)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'ppvid', siglas: ['PPVId', 'LVPWd'],
    regex: /\b(?:PPVId|LVPWd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'ppvis', siglas: ['PPVIs', 'LVPWs'],
    regex: /\b(?:PPVIs|LVPWs)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'fe_modom', siglas: ['FE(Teich)', 'EF(Teich)', 'FE', 'EF'],
    regex: /\b(?:FE\(Teich\)|EF\(Teich\)|FE|EF)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'fs_modom', siglas: ['FS(Teich)', 'FS'],
    regex: /(?:%\s*)?\b(?:FS\(Teich\)|FS)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'fe_simpson', siglas: ['FE Simpson', 'EF Simpson', 'Simpson'],
    regex: /\b(?:FE|EF)\s*\(?\s*Simpson\s*\)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(%)?/i, unidad: '%' },
  { columna: 'ai_lineal', siglas: ['Diámetro AI', 'Diametro AI', 'AI', 'LA'],
    regex: /\b(?:Di[áa]metro\s+AI|AI|LA)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'ao_lineal', siglas: ['Ao Diam', 'Diámetro aorta', 'Diametro aorta', 'Ao'],
    regex: /\b(?:Ao\s?Diam|Di[áa]metro\s+aorta|Ao)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)?/i, unidad: 'mm' },
  { columna: 'ai_ao_lineal', siglas: ['AI/Ao', 'LA/Ao'],
    regex: /\b(?:AI\s*\/\s*Ao|LA\s*\/\s*Ao|Relaci[óo]n\s+AI\s*\/?\s*Ao)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  // "E Vel VM" = formato Mindray (FORMATOS-ECO.md §2.1), en cm/s.
  { columna: 'velocidad_e_mitral', siglas: ['E Vel VM', 'Onda E', 'Vel E', 'E mitral'],
    regex: /\b(?:E\s*Vel\.?\s*(?:VM|MV)|Onda\s*E|Vel\.?\s*E|E\s*mitral|Vmax\s*E)\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(cm\/s|m\/s)?/i, unidad: 'cm/s' },
  // Campos que venían del "Apéndice Métrico" y no estaban ya arriba (2026-09-08).
  { columna: 'ai_ao_area', siglas: ['AI/Ao area', 'AI/Ao área', 'LA/Ao area'],
    regex: /\b(?:AI|LA)\s*\/\s*Ao\s*(?:\(?\s*[áa]rea\s*\)?|2D)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  { columna: 'dvid_indexado', siglas: ['LVIDDN', 'LVIDdN', 'DVIDn', 'LVIDDn'],
    regex: /\bLVID[dD]?\s*[nN]\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i, unidad: null },
  { columna: 'volumen_ai_indexado', siglas: ['LAVI', 'LAV Index', 'LAV indexado'],
    regex: /\bLAVI\b\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(ml\/kg)?/i, unidad: null },
  // Electrocardiograma — se autollena en #eco-ekg_* pero NO va a la tabla eco;
  // leerBloqueEKG() lo separa a payload.bloque_ekg. Formato observado en el PDF
  // de prueba: "FC promedio   :   138bpm" / "Eje QRS   :   63°". Los regex
  // EXIGEN la unidad pegada (bpm / °) para no confundir "FC" con la frecuencia
  // cardíaca de las constantes vitales. `siglas: []` desactiva el fallback laxo.
  { columna: 'ekg_fc', siglas: [],
    regex: /\bFC(?:\s*(?:promedio|media|prom\.?))?\s*:?\s*(\d+(?:[.,]\d+)?)\s*bpm/i, unidad: null },
  { columna: 'ekg_eje', siglas: [],
    regex: /\bEje(?:\s*(?:QRS|el[ée]ctrico|medio))?\s*:?\s*(-?\d+(?:[.,]\d+)?)\s*[°º]/i, unidad: null },
  { columna: 'ekg_ritmo', siglas: [], tipo: 'texto',
    // Espacio ÚNICO entre palabras a propósito: el texto de PDF separa columnas
    // con 2+ espacios, así "Ritmo: Sinusal respiratorio   Eje QRS..." corta en
    // "Sinusal respiratorio" y no arrastra la etiqueta siguiente.
    regex: /\bRitmo\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñ]+(?: [A-Za-zÁÉÍÓÚáéíóúñ]+){0,3})/i },
  { columna: 'ekg_p_ms', siglas: [],
    regex: /\bDuraci[óo]n\s*(?:de\s*)?(?:la\s*)?(?:onda\s*)?P\b\s*:?\s*(\d+(?:[.,]\d+)?)\s*ms/i, unidad: null },
];

// "25,2" -> 25.2 ; "1.42" -> 1.42 ; basura -> NaN
function ecoANumero(valorCrudo) {
  if (valorCrudo == null) return NaN;
  return parseFloat(String(valorCrudo).replace(',', '.'));
}

// Devuelve el número ya en la unidad de destino, o null si no es numérico.
// Si la unidad no se detectó, se ASUME que ya viene en la de destino (RIESGO:
// un valor real en cm sin unidad explícita queda 10x más chico — no hay forma
// fiable de saberlo solo del texto). Excepción para velocidades: sin unidad y
// < 10 se toma como m/s (una velocidad cardíaca en cm/s no baja de 10; en m/s
// casi nunca pasa de 7).
function ecoNormalizarValor(valorCrudo, unidadDetectada, unidadDestino) {
  const num = ecoANumero(valorCrudo);
  if (isNaN(num)) return null;
  const u = String(unidadDetectada || '').toLowerCase();
  if (u === 'cm' && unidadDestino === 'mm') return Math.round(num * 10 * 1000) / 1000;
  if (unidadDestino === 'cm/s' && (u === 'm/s' || (u === '' && num < 10))) {
    return Math.round(num * 100 * 1000) / 1000;
  }
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

  // Campos de texto (p. ej. ekg_ritmo): se devuelve el grupo 1 tal cual, sin
  // pasar por el parseo numérico.
  if (config.tipo === 'texto') {
    const txt = String(match[1] || '').trim();
    return txt === '' ? null : txt;
  }

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
// <<< PARSER-ECO-PURO

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

// Objeto con todas las columnas de datos_ecocardiografia (null las vacías). Texto
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

// --- Índices calculados a partir de las medidas y el peso ------------------
// Ampliado 2026-09-08 (antes solo dvid_indexado / volumen_ai_indexado /
// masa_vi_indexada). Cuando están los valores crudos necesarios se derivan:
//
//  · Índices por peso (Cornell 2004, crudo / peso^exp con EXPONENTE PROPIO de
//    cada parámetro — ver CORNELL_EXP): dvid_indexado, dvs_indexado,
//    sivd_indexado, sivs_indexado, ppvid_indexado, ppvis_indexado, ai_indexado,
//    ao_indexado.
//  · volumen_ai_indexado = volumen_ai_simp_simpson / peso   (LAVI, mL/kg).
//  · masa_vi (Devereux modif.) = 1.04·((dvid+sivd+ppvid)^3 − dvid^3) + 0.6
//    — solo con dvid, sivd y ppvid; pisa el campo (no hay extracción de masa_vi
//    del PDF). Si faltan los 3 linelares, el campo queda para carga manual.
//  · masa_vi_indexada = indice_masa_vi = masa_vi / BSA (g/m²),
//    BSA = 0.1017·peso^0.6667 (Meeh-Rubner). El schema tiene las dos columnas,
//    se llenan con el mismo valor.
//  · mvcf = (dvid − dvs) / (dvid · tiempo_eyectivo)  — solo con dvid, dvs y
//    tiempo_eyectivo (LVET en segundos, > 0). Si falta LVET → no se calcula.
//  · epr = (sivd + ppvid) / dvid  — solo con sivd, ppvid y dvid. OJO: NO hay
//    columna `epr` en datos_ecocardiografia; se muestra en la UI pero NO viaja
//    en el payload.
//
// Regla general: si falta un crudo, esa clave no aparece en el objeto devuelto
// (recalcular… no toca el campo). Si el peso es 0/negativo/no numérico no se
// calcula ningún índice por peso; masa_vi y epr sí, que no dependen del peso.
//
// Unidades (8.7d): las lineales llegan en mm, que es como se muestran y se
// guardan, y acá se pasan a cm SOLO para calcular: Cornell y Devereux están
// definidos en cm. Los índices resultantes no cambian respecto de antes.
// tests/clasificacion.test.mjs recorta este bloque entre los marcadores.

// >>> INDICES-ECO-PUROS
const BSA_K = 0.1017;
const BSA_EXP = 0.6667;

// Exponentes alométricos de Cornell (2004), uno por parámetro lineal:
// índice = medida (cm) / peso(kg)^exp. Hasta 2026-09-08 se usaba 0.294 para
// todos (aproximación); ahora cada parámetro lleva el suyo. La clave es el
// nombre de la columna de salida.
const CORNELL_EXP = {
  dvid_indexado: 0.294,  // LVIDd
  dvs_indexado: 0.315,   // LVIDs
  sivd_indexado: 0.241,  // IVSd
  sivs_indexado: 0.228,  // IVSs
  ppvid_indexado: 0.232, // LVFWd
  ppvis_indexado: 0.224, // LVFWs
  ai_indexado: 0.273,    // LA
  ao_indexado: 0.309,    // Ao
};

function redondear3(x) {
  return Math.round(x * 1000) / 1000;
}

function calcularIndicesEco(datos, peso) {
  const p = ecoANumero(peso);
  const pesoValido = Number.isFinite(p) && p > 0;
  const n = (clave) => ecoANumero(datos[clave]);
  const cm = (clave) => n(clave) / 10; // lineal en mm → cm para calcular

  const dvid = cm('dvid');
  const dvs = cm('dvs');
  const sivd = cm('sivd');
  const sivs = cm('sivs');
  const ppvid = cm('ppvid');
  const ppvis = cm('ppvis');
  const aiLineal = cm('ai_lineal');
  const aoLineal = cm('ao_lineal');
  const volAi = n('volumen_ai_simp_simpson');
  const lvet = n('tiempo_eyectivo');

  const indices = {};

  // Índices lineales por peso (Cornell 2004: medida / peso^exp, con el exponente
  // propio de cada parámetro — ver CORNELL_EXP).
  if (pesoValido) {
    const idx = (v, columna) => redondear3(v / Math.pow(p, CORNELL_EXP[columna]));
    if (Number.isFinite(dvid)) indices.dvid_indexado = idx(dvid, 'dvid_indexado');
    if (Number.isFinite(dvs)) indices.dvs_indexado = idx(dvs, 'dvs_indexado');
    if (Number.isFinite(sivd)) indices.sivd_indexado = idx(sivd, 'sivd_indexado');
    if (Number.isFinite(sivs)) indices.sivs_indexado = idx(sivs, 'sivs_indexado');
    if (Number.isFinite(ppvid)) indices.ppvid_indexado = idx(ppvid, 'ppvid_indexado');
    if (Number.isFinite(ppvis)) indices.ppvis_indexado = idx(ppvis, 'ppvis_indexado');
    if (Number.isFinite(aiLineal)) indices.ai_indexado = idx(aiLineal, 'ai_indexado');
    if (Number.isFinite(aoLineal)) indices.ao_indexado = idx(aoLineal, 'ao_indexado');
    if (Number.isFinite(volAi)) indices.volumen_ai_indexado = redondear3(volAi / p);
  }

  // Masa VI (Devereux modificada) — requiere dvid, sivd y ppvid.
  let masaVi = n('masa_vi');
  if (Number.isFinite(dvid) && Number.isFinite(sivd) && Number.isFinite(ppvid)) {
    masaVi = redondear3(
      1.04 * (Math.pow(dvid + sivd + ppvid, 3) - Math.pow(dvid, 3)) + 0.6,
    );
    indices.masa_vi = masaVi;
  }

  // Índice de masa VI = masa_vi / BSA (se llenan las dos columnas del schema).
  if (Number.isFinite(masaVi) && pesoValido) {
    const bsa = BSA_K * Math.pow(p, BSA_EXP);
    const indiceMasa = redondear3(masaVi / bsa);
    indices.masa_vi_indexada = indiceMasa;
    indices.indice_masa_vi = indiceMasa;
  }

  // MVCF — requiere dvid, dvs y tiempo_eyectivo (LVET en s, > 0).
  if (Number.isFinite(dvid) && dvid > 0 && Number.isFinite(dvs)
      && Number.isFinite(lvet) && lvet > 0) {
    indices.mvcf = redondear3((dvid - dvs) / (dvid * lvet));
  }

  // EPR — requiere sivd, ppvid y dvid (> 0). Sin columna en la tabla: solo UI.
  if (Number.isFinite(sivd) && Number.isFinite(ppvid) && Number.isFinite(dvid) && dvid > 0) {
    indices.epr = redondear3((sivd + ppvid) / dvid);
  }

  return indices;
}
// <<< INDICES-ECO-PUROS

// Estado de "Mostrar campos vacíos" del bloque eco (lo alterna
// btnMostrarVaciosEco, más abajo). En true, actualizarVisibilidadTodosEco()
// muestra todos los campos aunque estén vacíos, para poder cargarlos a mano.
let ecoMostrarVacios = false;

// Ids de los inputs con el valor CRUDO que alimenta algún índice. Escribir en
// cualquiera de ellos dispara un recálculo (listener delegado en §8.bis).
const CAMPOS_CRUDOS_INDICES_ECO = [
  'eco-dvid', 'eco-dvs', 'eco-sivd', 'eco-sivs', 'eco-ppvid', 'eco-ppvis',
  'eco-ai_lineal', 'eco-ao_lineal', 'eco-volumen_ai_simp_simpson',
  'eco-masa_vi', 'eco-tiempo_eyectivo',
];

// Lee los valores crudos + #paciente-peso, calcula los índices y los vuelca en
// los campos #eco-*. Solo pisa los índices que se pudieron calcular — no borra
// un valor (del PDF o a mano) cuando falta su crudo. Refresca la visibilidad de
// los campos al terminar. Se llama tras autollenar el PDF, al cambiar el peso y
// al editar cualquier crudo.
function recalcularIndicesEcoDesdeFormulario() {
  const leerCampo = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const datos = {};
  CAMPOS_CRUDOS_INDICES_ECO.forEach((id) => {
    datos[id.replace(/^eco-/, '')] = leerCampo(id);
  });

  const indices = calcularIndicesEco(datos, leerCampo('paciente-peso'));
  for (const [columna, valor] of Object.entries(indices)) {
    const campo = document.getElementById(`eco-${columna}`);
    if (campo) campo.value = valor;
  }

  actualizarVisibilidadTodosEco();
  return indices;
}

const campoPesoPaciente = document.getElementById('paciente-peso');
if (campoPesoPaciente) {
  campoPesoPaciente.addEventListener('input', recalcularIndicesEcoDesdeFormulario);
}

// 8.7e: los campos del eco están siempre habilitados; el botón ya no los
// habilita ni los bloquea, solo muestra u oculta los que no tienen valor.
const btnMostrarVaciosEco = document.getElementById('btn-mostrar-vacios-eco');
if (btnMostrarVaciosEco) {
  btnMostrarVaciosEco.addEventListener('click', () => {
    ecoMostrarVacios = !ecoMostrarVacios;
    btnMostrarVaciosEco.textContent = ecoMostrarVacios ? '➖ Ocultar campos vacíos' : '➕ Mostrar campos vacíos';
    actualizarVisibilidadTodosEco();
  });
}

// ---------------------------------------------------------------------------
// 8.bis. Visibilidad — ocultar los campos del bloque eco que no tienen valor
// ---------------------------------------------------------------------------
// Pedido 2026-09-08: tras autollenar el PDF y calcular los índices, el bloque de
// estudios complementarios muestra decenas de campos vacíos que ensucian la
// lectura. Reglas:
//   · por defecto: se oculta el <label> de cada input .campo-eco sin valor, y
//     el <fieldset> que quedó entero vacío;
//   · "Mostrar campos vacíos" (ecoMostrarVacios=true): se muestran TODOS,
//     también los vacíos, para poder cargar a mano; "Ocultar campos vacíos"
//     re-oculta los que quedaron sin valor;
//   · en vivo: escribir un valor lo muestra; un campo que se vacía mientras se
//     edita sigue visible hasta que pierde el foco (si no, desaparecería al
//     borrar el valor para corregirlo).
//
// Se usa element.style.display y NO el atributo `hidden` porque
// .campo-label { display: flex } (assets/styles.css) le gana a la regla de
// user-agent de `hidden` y el campo seguiría visible.
function contenedorCampoEco(campo) {
  return campo.closest('label') || campo.parentElement;
}

function campoEcoTieneValor(campo) {
  const crudo = String(campo.value == null ? '' : campo.value).trim();
  if (crudo === '') return false;
  if (campo.type === 'number') return Number.isFinite(Number(crudo.replace(',', '.')));
  return true;
}

function actualizarVisibilidadTodosEco() {
  const bloque = document.getElementById('bloque-ecocardiografia');
  if (!bloque) return;

  bloque.querySelectorAll('.campo-eco').forEach((campo) => {
    const cont = contenedorCampoEco(campo);
    if (!cont) return;
    const visible = ecoMostrarVacios || campoEcoTieneValor(campo) || campo === document.activeElement;
    cont.style.display = visible ? '' : 'none';
  });

  // Un <fieldset> con todos sus campos ocultos también se oculta.
  bloque.querySelectorAll('fieldset.grid-metricas').forEach((fs) => {
    const campos = fs.querySelectorAll('.campo-eco');
    if (!campos.length) return;
    const algunoVisible = Array.from(campos)
      .some((c) => contenedorCampoEco(c).style.display !== 'none');
    fs.style.display = (ecoMostrarVacios || algunoVisible) ? '' : 'none';
  });
}

// Listener delegado único: si el campo tocado es un crudo, recalcula los índices
// (que ya refresca la visibilidad); si no, solo refresca la visibilidad.
const bloqueEcoInteractivo = document.getElementById('bloque-ecocardiografia');
if (bloqueEcoInteractivo) {
  bloqueEcoInteractivo.addEventListener('input', (evento) => {
    const campo = evento.target;
    if (!campo.classList || !campo.classList.contains('campo-eco')) return;
    if (CAMPOS_CRUDOS_INDICES_ECO.includes(campo.id)) {
      recalcularIndicesEcoDesdeFormulario();
    } else {
      actualizarVisibilidadTodosEco();
    }
  });
  // Al salir de un campo que quedó vacío, se oculta (ver reglas de arriba). El
  // setTimeout espera a que document.activeElement ya sea el campo siguiente.
  bloqueEcoInteractivo.addEventListener('focusout', (evento) => {
    const campo = evento.target;
    if (!campo.classList || !campo.classList.contains('campo-eco')) return;
    setTimeout(actualizarVisibilidadTodosEco, 0);
  });
}

// Estado inicial: bloque colapsado y sin datos → todos los campos ocultos. Se
// revelan al pulsar "Mostrar campos vacíos" o al extraer el PDF.
actualizarVisibilidadTodosEco();

// 8.7f (2026-10-02): la extracción arranca sola al elegir el archivo; ya no
// hay botón "Extraer datos del PDF". Elegir otro archivo vuelve a extraer.
// Cancelar el selector deja el input sin archivo y no hace nada.
const inputEcoPdf = document.getElementById('eco-pdf-input');
if (inputEcoPdf) {
  inputEcoPdf.addEventListener('change', async () => {
    const input = inputEcoPdf;
    const log = document.getElementById('eco-pdf-log');
    const escribirLog = (txt) => { log.textContent = txt; log.hidden = false; };

    if (!input.files || input.files.length === 0) return;
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
      const indices = recalcularIndicesEcoDesdeFormulario();
      if (typeof window.recalcularClasificaciones === 'function') window.recalcularClasificaciones();

      // El log lista SOLO lo que se pudo autollenar / calcular (2026-09-08): los
      // campos que el PDF no trae ya no aparecen como ruido.
      let resumen = `📊 ${llenos} campo(s) autollenado(s) desde el PDF. Revisá y corregí directamente en cada campo; "Mostrar campos vacíos" muestra los que el PDF no trajo.\n\n`;
      const extraidos = Object.entries(datos).filter(([, valor]) => valor != null);
      if (extraidos.length) {
        resumen += 'Campos extraídos del PDF:\n';
        for (const [columna, valor] of extraidos) resumen += `  ${columna}: ${valor}\n`;
      } else {
        resumen += 'No se reconoció ningún campo del PDF.\n';
      }
      const entradasIndices = Object.entries(indices);
      if (entradasIndices.length) {
        resumen += `\nÍndices calculados (peso ${document.getElementById('paciente-peso')?.value || '?'} kg):\n`;
        for (const [columna, valor] of entradasIndices) resumen += `  ${columna}: ${valor}\n`;
      } else {
        resumen += '\nÍndices calculados: — (falta el peso o los valores crudos).\n';
      }
      escribirLog(resumen);
    } catch (error) {
      escribirLog(`❌ Error al leer el PDF: ${error.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 9. Examen clínico (Sprint 8.0, Prompt 2b — 2026-09-23)
// ---------------------------------------------------------------------------
// Fuente única de opciones y defaults del examen clínico. index.html solo trae
// los <select data-catalogo="..."> vacíos; acá se llenan. Las opciones se
// guardan TAL CUAL (con tildes) en las columnas text de atenciones_cardiologia,
// así que corregir un texto después deja historial con el texto viejo.
// Todos los selects llevan una opción vacía "—" (value ""), que viaja como null
// y no se imprime en el informe. Los defaults son los del paciente típico de
// consultorio (mayormente nervioso), no el estado normal.
// Última opción del motivo: habilita el campo de texto libre (leerMotivo).
const MOTIVO_OTRO = 'Otro';

const CATALOGO_EXAMEN = {
  // 8.7i: el motivo de la consulta pasó de texto libre a desplegable.
  motivo: {
    opciones: [
      'Control evolutivo',
      'Tos',
      'Soplo detectado en consulta',
      'Agitación',
      'Disritmia',
      'Ascitis',
      'Descompensación hemodinámica',
      'Evaluación prequirúrgica',
      'Evaluación preanestésica',
      'Evaluación prequimioterápica',
      'Pérdida transitoria de la conciencia',
      'Pérdida abrupta de la visión',
      'Mareo o trastorno de la marcha',
      'Control por la edad',
      'Apto físico / Deporte',
      'IRC',
      MOTIVO_OTRO,
    ],
    default: 'Soplo detectado en consulta',
  },
  fr_tipo: {
    opciones: [
      'Polipnea',
      'Eupneico',
      'Distrés respiratorio obstructivo leve',
      'Distrés respiratorio obstructivo moderado',
      'Distrés respiratorio leve',
      'Distrés respiratorio moderado',
      'Distrés respiratorio severo',
    ],
    default: 'Eupneico',
  },
  sensorio: {
    opciones: [
      'Excitación',
      'Excitación y agresividad',
      'Alerta',
      'Alerta (relatan decaimiento leve)',
      'Alerta (relatan decaimiento moderado)',
      'Depresión leve',
      'Depresión moderada',
      'Estupor',
      'Coma',
    ],
    default: 'Excitación',
  },
  mucosas: {
    opciones: [
      'Rosadas y húmedas',
      'Rosadas y secas',
      'Rosado pálido y húmedas',
      'Rosado pálido y secas',
      'Rosado intenso y húmedas',
      'Rosado intenso y secas',
      'Levemente cianóticas (lengua)',
      'Francamente cianóticas',
      'Ictéricas',
    ],
    default: 'Rosadas y húmedas',
  },
  pulso_femoral: {
    opciones: [
      'Imperceptible',
      'Débil',
      'Moderado. Coincidente con auscultación y sin déficit',
      'Moderado. Coincidente con auscultación con déficit esporádico',
      'Moderado. Coincidente con auscultación con déficit frecuente',
      'Moderado. Coincidente con auscultación con déficit muy frecuente',
      'Caótico',
      'Hipercinético',
    ],
    default: 'Moderado. Coincidente con auscultación y sin déficit',
  },
  reflejo_tusigeno: {
    opciones: ['Negativo', 'Levemente positivo', 'Francamente positivo', 'No provocado'],
    default: 'No provocado',
  },
  hidratacion: {
    opciones: [
      'Normal',
      'Déficit menor a 5 %',
      'Déficit 5 %',
      'Déficit 8 %',
      'Déficit 10 a 12 %',
      'Déficit mayor a 12 %',
    ],
    default: 'Normal',
  },
  tllc: {
    opciones: ['Normal', 'Disminuido', 'Aumentado'],
    default: '', // frecuentemente no se evalúa
  },
  sucusion: {
    opciones: ['Positiva', 'Negativa', 'No evaluada'],
    default: '',
  },
  auscultacion_pulmonar_patron: {
    opciones: [
      'Toraco-abdominal',
      'Refuerzo abdominal',
      'Francamente abdominal',
      'Obstructivo inspiratorio',
      'Obstructivo espiratorio',
      'Restrictivo',
    ],
    default: 'Toraco-abdominal',
  },
  auscultacion_pulmonar_amplitud: {
    opciones: ['Muy superficial', 'Superficial', 'Media', 'Profunda'],
    default: 'Superficial',
  },
  auscultacion_pulmonar_sltb: {
    opciones: ['Normal', 'Aumentado', 'Disminuido'],
    default: 'Aumentado',
  },
};

// Atributos de cada soplo. En el informe: "SOPLO [MOMENTO] [FOCO] [INTENSIDAD]".
const CATALOGO_SOPLO = {
  momento: {
    opciones: ['Sistólico', 'Diastólico', 'Holosistólico', 'Continuo', 'Sistodiastólico / vaivén'],
    default: 'Sistólico',
  },
  foco: {
    opciones: [
      'Mitral',
      'Tricuspídeo',
      'Aórtico',
      'Pulmonar',
      'Basal izquierdo',
      'Basal derecho',
      'Esternal izquierdo',
      'Esternal derecho',
    ],
    default: 'Mitral',
  },
  intensidad: {
    opciones: ['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'],
    default: '3/6',
  },
};

// Auscultación cardíaca: selección múltiple; "Normal" es excluyente.
const AUSC_CARDIACA_NORMAL = 'Normal';
const OPCIONES_AUSC_CARDIACA = [
  AUSC_CARDIACA_NORMAL,
  'Refuerzo del segundo ruido',
  'Desdoblamiento del segundo ruido',
  'Cadencia con ritmo de galope',
  'Sonidos cardíacos levemente apagados',
  'Sonidos cardíacos francamente apagados',
];

function poblarSelect(select, { opciones, default: valorDefault }) {
  select.innerHTML = '';
  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = '—';
  select.appendChild(vacia);
  opciones.forEach((texto) => {
    const opcion = document.createElement('option');
    opcion.value = texto;
    opcion.textContent = texto;
    select.appendChild(opcion);
  });
  select.value = valorDefault;
}

document.querySelectorAll('select[data-catalogo]').forEach((select) => {
  const catalogo = CATALOGO_EXAMEN[select.dataset.catalogo];
  if (catalogo) poblarSelect(select, catalogo);
});

// --- Auscultación cardíaca ---------------------------------------------------
// Mientras el profesional no la toque, el campo sigue a los soplos: con soplos
// cargados queda vacío; si se borran todos, vuelve a ["Normal"]. Una vez que
// el profesional la toca a mano (elección adrede), deja de ajustarse sola.
const grupoAuscCardiaca = document.getElementById('clinica-ausc-cardiaca');
let auscCardiacaTocadaAMano = false;

function checksAuscCardiaca() {
  return grupoAuscCardiaca
    ? Array.from(grupoAuscCardiaca.querySelectorAll('input[type="checkbox"]'))
    : [];
}

function marcarAuscCardiaca(valores) {
  checksAuscCardiaca().forEach((check) => {
    check.checked = valores.includes(check.value);
  });
}

if (grupoAuscCardiaca) {
  OPCIONES_AUSC_CARDIACA.forEach((texto) => {
    const label = document.createElement('label');
    label.className = 'opcion-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = texto;
    label.append(check, ` ${texto}`);
    grupoAuscCardiaca.appendChild(label);
  });

  grupoAuscCardiaca.addEventListener('change', (evento) => {
    const check = evento.target;
    auscCardiacaTocadaAMano = true;
    if (!check.checked) return;
    // Marcar "Normal" desmarca el resto; marcar otra desmarca "Normal".
    checksAuscCardiaca().forEach((otro) => {
      if (otro === check) return;
      if (check.value === AUSC_CARDIACA_NORMAL || otro.value === AUSC_CARDIACA_NORMAL) otro.checked = false;
    });
  });

  marcarAuscCardiaca([AUSC_CARDIACA_NORMAL]);
}

// --- Soplos ------------------------------------------------------------------
const listaSoplos = document.getElementById('lista-soplos');
const plantillaFilaSoplo = document.getElementById('plantilla-fila-soplo');
const btnAgregarSoplo = document.getElementById('btn-agregar-soplo');

// Renglones con al menos un atributo cargado; los totalmente vacíos no cuentan
// (ni para la regla de auscultación ni para el payload). `orden` = posición
// entre los renglones que sí se envían.
function leerSoplos() {
  if (!listaSoplos) return [];
  return Array.from(listaSoplos.querySelectorAll('.fila-soplo'))
    .map((fila) => {
      const valor = (clave) => fila.querySelector(`[data-soplo="${clave}"]`).value || null;
      return { momento: valor('momento'), foco: valor('foco'), intensidad: valor('intensidad') };
    })
    .filter((soplo) => soplo.momento || soplo.foco || soplo.intensidad)
    .map((soplo, orden) => ({ ...soplo, orden }));
}

function sincronizarAuscCardiacaConSoplos() {
  if (auscCardiacaTocadaAMano) return;
  marcarAuscCardiaca(leerSoplos().length ? [] : [AUSC_CARDIACA_NORMAL]);
}

function crearFilaSoplo() {
  const fila = plantillaFilaSoplo.content.firstElementChild.cloneNode(true);
  fila.querySelectorAll('select[data-soplo]').forEach((select) => {
    poblarSelect(select, CATALOGO_SOPLO[select.dataset.soplo]);
  });
  fila.addEventListener('change', sincronizarAuscCardiacaConSoplos);
  fila.querySelector('.btn-eliminar-soplo').addEventListener('click', () => {
    fila.remove();
    sincronizarAuscCardiacaConSoplos();
  });
  return fila;
}

if (btnAgregarSoplo && listaSoplos && plantillaFilaSoplo) {
  btnAgregarSoplo.addEventListener('click', () => {
    const fila = crearFilaSoplo();
    listaSoplos.appendChild(fila);
    sincronizarAuscCardiacaConSoplos();
    fila.querySelector('select').focus();
  });
}

// --- Flechas de los campos numéricos con valor de referencia (8.7e) ----------
// Con el campo vacío, el navegador arranca las flechas (↑↓ del teclado o del
// control) desde `min`: PAS pasaba de vacío a 1. Los campos con data-referencia
// (FC, FR, PAS, PAM, PAD) parten de ese valor: vacío + ↑ = referencia + paso,
// vacío + ↓ = referencia − paso. Con valor cargado, las flechas siguen siendo
// las nativas. La referencia NO es un valor cargado: si el profesional no toca
// el campo, viaja null.
const valorPrevioNumerico = new WeakMap();

function pasoDesdeReferencia(campo, sentido) {
  const paso = Number(campo.step) || 1;
  let valor = Number(campo.dataset.referencia) + sentido * paso;
  if (campo.min !== '') valor = Math.max(valor, Number(campo.min));
  return String(valor);
}

document.querySelectorAll('input[type="number"][data-referencia]').forEach((campo) => {
  const recordar = () => valorPrevioNumerico.set(campo, campo.value);
  campo.addEventListener('focus', recordar);
  campo.addEventListener('pointerdown', recordar);

  // Teclado: se intercepta antes de que el navegador dé el paso.
  campo.addEventListener('keydown', (evento) => {
    if (campo.value !== '' || (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown')) return;
    evento.preventDefault();
    campo.value = pasoDesdeReferencia(campo, evento.key === 'ArrowUp' ? 1 : -1);
    recordar();
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Flechas del control (mouse): no se pueden interceptar, así que se corrige
  // el paso ya dado. Se distingue del tipeo porque el evento no trae inputType.
  // Desde vacío el navegador deja min + paso al subir y min al bajar.
  campo.addEventListener('input', (evento) => {
    const estabaVacio = valorPrevioNumerico.get(campo) === '';
    if (estabaVacio && !evento.inputType && campo.value !== '') {
      const minimo = campo.min === '' ? 0 : Number(campo.min);
      campo.value = pasoDesdeReferencia(campo, Number(campo.value) > minimo ? 1 : -1);
    }
    recordar();
  });
});

// --- Lectura para el payload -------------------------------------------------
// Los números son integer en Supabase: se redondean (un 120.5 rompería el
// insert) y vacío / inválido viaja como null. Los textos vacíos también.
function leerEntero(idCampo) {
  const campo = document.getElementById(idCampo);
  if (!campo || campo.value === '') return null;
  const numero = Number(campo.value);
  return Number.isFinite(numero) ? Math.round(numero) : null;
}

function leerTexto(idCampo) {
  const campo = document.getElementById(idCampo);
  const valor = campo ? campo.value.trim() : '';
  return valor === '' ? null : valor;
}

// Con "Otro" viaja el texto que escribió el profesional; si lo dejó vacío,
// viaja "Otro".
function leerMotivo() {
  const motivo = leerTexto('consulta-motivo');
  return motivo === MOTIVO_OTRO ? leerTexto('consulta-motivo-otro') || MOTIVO_OTRO : motivo;
}

const selectMotivo = document.getElementById('consulta-motivo');
const grupoMotivoOtro = document.getElementById('grupo-motivo-otro');
if (selectMotivo && grupoMotivoOtro) {
  selectMotivo.addEventListener('change', () => {
    const esOtro = selectMotivo.value === MOTIVO_OTRO;
    grupoMotivoOtro.hidden = !esOtro;
    if (esOtro) document.getElementById('consulta-motivo-otro').focus();
  });
}

// 8.7i: el diagnóstico de lista (Interpretación diagnóstica) va antes del
// dictado del profesional, en renglones separados de la misma clave.
function leerDiagnostico() {
  const partes = [leerTexto('interp-diagnostico'), leerTexto('consulta-diagnostico')].filter(Boolean);
  return partes.length ? partes.join('\n') : null;
}

function leerExamenClinico() {
  return {
    motivo: leerMotivo(),
    anamnesis: leerTexto('consulta-anamnesis'),
    fc_numero: leerEntero('clinica-fc'),
    soplos: leerSoplos(),
    fr_numero: leerEntero('clinica-fr'),
    fr_tipo: leerTexto('clinica-fr-tipo'),
    sensorio: leerTexto('clinica-sensorio'),
    mucosas: leerTexto('clinica-mucosas'),
    pulso_femoral: leerTexto('clinica-pulso-femoral'),
    reflejo_tusigeno: leerTexto('clinica-reflejo-tusigeno'),
    hidratacion: leerTexto('clinica-hidratacion'),
    tllc: leerTexto('clinica-tllc'),
    sucusion: leerTexto('clinica-sucusion'),
    auscultacion_pulmonar_patron: leerTexto('clinica-ausc-pulmonar-patron'),
    auscultacion_pulmonar_amplitud: leerTexto('clinica-ausc-pulmonar-amplitud'),
    auscultacion_pulmonar_sltb: leerTexto('clinica-ausc-pulmonar-sltb'),
    auscultacion_cardiaca: checksAuscCardiaca().filter((check) => check.checked).map((check) => check.value),
    pas: leerEntero('clinica-pas'),
    pam: leerEntero('clinica-pam'),
    pad: leerEntero('clinica-pad'),
    diagnostico: leerDiagnostico(),
    indicaciones: leerTexto('consulta-indicaciones'),
    // Interpretación diagnóstica (8.7b, Sección 10). leerInterpretacion es una
    // function declaration (hoisted).
    ...leerInterpretacion(),
  };
}

// ---------------------------------------------------------------------------
// 10. Interpretación diagnóstica — ACVIM, MINE 2 y HP (Sub-fase 8.7b)
// ---------------------------------------------------------------------------
// Fuente única de umbrales: CRITERIOS DE CLASIFICACION.md (v1.4). Ningún umbral
// que no esté en ese archivo se usa acá. La parte 10a son funciones PURAS (sin
// DOM): tests/clasificacion.test.mjs la recorta entre los marcadores >>> / <<<
// y la corre en Node. La 10b cablea la UI.
//
// Unidades: todas las velocidades se guardan en cm/s; MINE 2 y HP las pasan a
// m/s solo para calcular. Tiempos en ms. Todas las lineales en mm (8.7d).

// >>> CLASIFICACION-PURA
const ESTADIOS_ACVIM = ['B1', 'B2', 'C', 'D'];

// §1.3 — B2 si se cumplen los dos.
const UMBRALES_ACVIM = { laAoB2: 1.60, lviddnB2: 1.70 };

// §5 — hallazgos de ecografía pulmonar (orden = número del hallazgo).
const HALLAZGOS_ECO_PULMONAR = [
  'Síndrome alveolointersticial leve en región perihiliar',
  'Síndrome alveolointersticial leve que excede la región perihiliar en hemitórax izquierdo',
  'Síndrome alveolointersticial leve que excede la región perihiliar en hemitórax derecho',
  'Síndrome alveolointersticial leve que excede la región perihiliar en ambos hemitórax',
  'Síndrome alveolointersticial en todos los campos pulmonares con abundantes líneas B',
  'Síndrome alveolointersticial coalescente (líneas B en cortina)',
  'Síndrome alveolointersticial con signo de fragmentación',
  'Signo de nódulo',
];

// §1.4 — regla de prellenado de C (una sola constante, fácil de ajustar).
// Edema documentado = ecografía pulmonar 1–7, colecta pleural o ascitis.
const REGLA_PRELLENADO_C = {
  hallazgosEcoPulmonarQueSuman: HALLAZGOS_ECO_PULMONAR.slice(0, 7),
  colectaPleural: true,
  ascitisDesdeAnamnesis: true,
};

// §1.4 (v1.4) — ascitis leída de la anamnesis. Textos ya normalizados
// (minúsculas, sin tildes). Una negación en las 3 palabras previas la descarta.
const ASCITIS_TERMINOS = ['ascitis', 'efusion abdominal', 'liquido libre abdominal'];
const ASCITIS_NEGACIONES = ['sin', 'no', 'niega', 'descarta'];

// §2.2 / §2.3 — MINE 2.
const MINE2_MAX_PUNTOS = { laAo: 4, lviddn: 4, eVel: 3 };
const MINE2_ETIQUETAS = { laAo: 'LA/Ao', lviddn: 'LVIDDN', eVel: 'velocidad E mitral' };

// §3.2 / §3.3 — HP.
const UMBRALES_HP = {
  trvBajo: 3.0,           // m/s — alerta y franja: TRV > 3.0
  trvAlto: 3.4,           // m/s — franja: TRV > 3.4
  tpAo: 1.0,              // TP/Ao > 1.0
  velRegurgPulmonar: 2.5, // m/s (> 250 cm/s)
  rpad: 30,               // RPAD < 30 %
  at: 58,                 // AT < 58 ms
  atEt: 0.30,             // AT:ET < 0.30
  dvdDvi: 0.70,           // DVD/DVI ≥ 0.70 (v1.4)
};
// Umbrales absolutos de DVDd/DVDs/PLVDd/PLVDs (mm): PENDIENTES (§7). Vacía a
// propósito; no disparan signo ni alerta hasta que se completen.
const UMBRALES_VD_MM = {};
const MORFO_NOTCHING = 'Aortisada Tipo III';
const OPCIONES_MORFO_AORTICA = ['Conservada', 'En Daga'];
const OPCIONES_MORFO_PULMONAR = [
  'Conservada', 'Aortisada Tipo I', 'Aortisada Tipo II', 'Aortisada Tipo III', 'En Daga',
];

// Signos visuales (hp_signos). Ausente = no evaluado.
const SIGNOS_HP_VISUALES = [
  { sitio: 'sitio1', clave: 'aplanamiento_septal', etiqueta: 'Aplanamiento del septo interventricular' },
  { sitio: 'sitio1', clave: 'llenado_insuficiente_vi', etiqueta: 'Llenado insuficiente del VI' },
  { sitio: 'sitio1', clave: 'hipertrofia_dilatacion_vd', etiqueta: 'Hipertrofia y/o dilatación del VD' },
  { sitio: 'sitio1', clave: 'disfuncion_sistolica_vd', etiqueta: 'Disfunción sistólica del VD' },
  { sitio: 'sitio3', clave: 'dilatacion_ad', etiqueta: 'Dilatación del AD' },
  { sitio: 'sitio3', clave: 'vena_cava_dilatada', etiqueta: 'Vena cava caudal dilatada (sin colapso respiratorio)' },
];

// Signos numéricos (salen de las medidas). `alerta` = habilita "Corazón derecho".
const SIGNOS_HP_NUMERICOS = [
  { sitio: 'sitio1', clave: 'dvd_dvi', etiqueta: 'DVD/DVI ≥ 0.70', alerta: true },
  { sitio: 'sitio2', clave: 'tp_ao', etiqueta: 'TP/Ao > 1.0', alerta: true },
  { sitio: 'sitio2', clave: 'vel_regurg_pulmonar', etiqueta: 'Vel. regurgitación pulmonar > 250 cm/s', alerta: true },
  { sitio: 'sitio2', clave: 'rpad', etiqueta: 'RPAD < 30 %', alerta: true },
  { sitio: 'sitio2', clave: 'at_pulmonar', etiqueta: 'AT < 58 ms', alerta: true },
  { sitio: 'sitio2', clave: 'at_et_pulmonar', etiqueta: 'AT:ET < 0.30', alerta: true },
  { sitio: 'sitio2', clave: 'notching', etiqueta: 'Muesca sistólica (Aortisada Tipo III)', alerta: false },
];

// Faltante → columna eco + unidad (casilla del disclaimer, §0.3).
const DESTINO_FALTANTES = {
  'LA/Ao': { columna: 'ai_ao_lineal', unidad: '' },
  LVIDDN: { columna: 'dvid_indexado', unidad: '' },
  'velocidad E mitral': { columna: 'velocidad_e_mitral', unidad: 'cm/s' },
  TRV: { columna: 'vmax_tricuspideo', unidad: 'cm/s' },
  DVDd: { columna: 'dvdd', unidad: 'mm' },
  DVDs: { columna: 'dvds', unidad: 'mm' },
  PLVDd: { columna: 'plvdd', unidad: 'mm' },
  PLVDs: { columna: 'plvds', unidad: 'mm' },
};

// §0.4 — redondeo a 2 decimales (vía notación exponencial, para que 1.905 dé
// 1.91 y no 1.9 por el error binario de coma flotante).
function r2(x) {
  return Number(`${Math.round(Number(`${x}e2`))}e-2`);
}

// null / '' / no numérico → null; si no, el número redondeado a 2 decimales.
function num2(valor) {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? r2(n) : null;
}

function normalizarTexto(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// §1.4 — true si la anamnesis menciona ascitis sin negarla.
function detectarAscitis(anamnesis) {
  const texto = normalizarTexto(anamnesis);
  if (!texto) return false;
  return ASCITIS_TERMINOS.some((termino) => {
    let desde = 0;
    for (;;) {
      const i = texto.indexOf(termino, desde);
      if (i === -1) return false;
      const previas = texto.slice(0, i).split(/[^a-z0-9ñ]+/).filter(Boolean).slice(-3);
      if (!previas.some((p) => ASCITIS_NEGACIONES.includes(p))) return true;
      desde = i + termino.length;
    }
  });
}

// `efusion_pleural` es text: cuenta si está cargado y no es una negación.
function colectaPleuralPresente(valor) {
  const t = normalizarTexto(valor).trim();
  if (!t) return false;
  return !/^(no\b|sin\b|ausente|negativ|-)/.test(t);
}

// §1.4 — edema documentado → { presente, fuentes[] }.
function detectarEdemaDocumentado(ctx) {
  const fuentes = [];
  const hallazgos = (ctx.manual && ctx.manual.eco_pulmonar_hallazgos) || [];
  if (hallazgos.some((h) => REGLA_PRELLENADO_C.hallazgosEcoPulmonarQueSuman.includes(h))) {
    fuentes.push('ecografía pulmonar');
  }
  if (REGLA_PRELLENADO_C.colectaPleural && colectaPleuralPresente(ctx.eco && ctx.eco.efusion_pleural)) {
    fuentes.push('colecta pleural');
  }
  if (REGLA_PRELLENADO_C.ascitisDesdeAnamnesis && detectarAscitis(ctx.anamnesis)) {
    fuentes.push('ascitis (anamnesis)');
  }
  return { presente: fuentes.length > 0, fuentes };
}

function aplicaACVIM(ctx) {
  return ctx.especie === 'canino' && (ctx.soplos || []).some((s) => s && s.foco === 'Mitral');
}

// §1 — ACVIM. Orden: manual → historial D → edema documentado (C) → historial C
// (nunca baja a B) → B1/B2 calculado → última consulta → estimado.
function calcularACVIM(ctx) {
  if (!aplicaACVIM(ctx)) return null;
  const eco = ctx.eco || {};
  const laAo = num2(eco.ai_ao_lineal);
  const lviddn = num2(eco.dvid_indexado);
  const datosUsados = { 'LA/Ao': laAo, LVIDDN: lviddn };
  const faltantesB = [];
  if (laAo == null) faltantesB.push('LA/Ao');
  if (lviddn == null) faltantesB.push('LVIDDN');
  const advertencias = [];
  const historial = ctx.historial && ESTADIOS_ACVIM.includes(ctx.historial.acvim_estadio)
    ? ctx.historial.acvim_estadio : null;
  const resultado = (valor, origen, faltantes = []) => ({
    valor, origen, datos_usados: datosUsados, faltantes, advertencias,
  });

  const manual = ctx.manual && ESTADIOS_ACVIM.includes(ctx.manual.acvim_estadio)
    ? ctx.manual.acvim_estadio : null;
  if (manual) return resultado(manual, 'manual');

  const edema = detectarEdemaDocumentado(ctx);
  if (edema.presente) datosUsados.edema_documentado = edema.fuentes;
  if (historial === 'D') {
    advertencias.push('Estadio D tomado de la última consulta.');
    return resultado('D', 'ultima_consulta');
  }
  if (edema.presente) {
    advertencias.push(`Prellenado C por edema documentado: ${edema.fuentes.join(', ')}.`);
    return resultado('C', 'estimado');
  }
  if (historial === 'C') {
    advertencias.push('Estadio C tomado de la última consulta (no vuelve a B).');
    return resultado('C', 'ultima_consulta');
  }

  if (!faltantesB.length) {
    const b2 = laAo >= UMBRALES_ACVIM.laAoB2 && lviddn >= UMBRALES_ACVIM.lviddnB2;
    return resultado(b2 ? 'B2' : 'B1', 'calculado');
  }
  if (historial) return resultado(historial, 'ultima_consulta', faltantesB);

  // Estimado con un solo criterio: si el que hay no cumple → B1 (B2 exige los
  // dos); si cumple → B2 (el estadio más coincidente); sin ninguno → B1.
  let cumpleDisponible = false;
  if (laAo != null) cumpleDisponible = laAo >= UMBRALES_ACVIM.laAoB2;
  else if (lviddn != null) cumpleDisponible = lviddn >= UMBRALES_ACVIM.lviddnB2;
  return resultado(cumpleDisponible ? 'B2' : 'B1', 'estimado', faltantesB);
}

function puntosLaAo(v) {
  if (v < 1.70) return 1;
  if (v <= 1.90) return 2;
  if (v <= 2.50) return 3;
  return 4;
}

function puntosLviddn(v) {
  if (v < 1.70) return 1;
  if (v <= 2.00) return 2;
  if (v <= 2.30) return 3;
  return 4;
}

function puntosEVel(vMs) {
  if (vMs < 1.20) return 1;
  if (vMs <= 1.50) return 2;
  return 3;
}

function clasificacionMINE2(puntaje) {
  if (puntaje == null) return null;
  if (puntaje <= 4) return 'leve';
  if (puntaje <= 6) return 'moderado';
  if (puntaje <= 10) return 'severo';
  return 'tardio';
}

// §2.1 — solo preclínicos (B1 / B2). En C o D no se calcula: la medicación y
// los signos clínicos alteran las variables y el puntaje no es válido.
function aplicaMINE2(ctx) {
  return ctx.especie === 'canino' && (ctx.estadioACVIM === 'B1' || ctx.estadioACVIM === 'B2');
}

// §2 — MINE 2. ctx.estadioACVIM = estadio propuesto por calcularACVIM (si no
// viene, se calcula acá).
function calcularMINE2(ctx) {
  const estadio = ctx.estadioACVIM !== undefined
    ? ctx.estadioACVIM
    : (calcularACVIM(ctx) || {}).valor;
  if (!aplicaMINE2({ ...ctx, estadioACVIM: estadio })) return null;

  const eco = ctx.eco || {};
  const eCms = num2(eco.velocidad_e_mitral);
  const valores = {
    laAo: num2(eco.ai_ao_lineal),
    lviddn: num2(eco.dvid_indexado),
    eVel: eCms == null ? null : r2(eCms / 100), // cm/s → m/s solo para puntuar
  };
  const puntuar = { laAo: puntosLaAo, lviddn: puntosLviddn, eVel: puntosEVel };
  const puntos = {};
  const faltantes = [];
  Object.keys(valores).forEach((k) => {
    if (valores[k] == null) faltantes.push(MINE2_ETIQUETAS[k]);
    else puntos[k] = puntuar[k](valores[k]);
  });
  const datosUsados = {
    'LA/Ao': valores.laAo, LVIDDN: valores.lviddn, 'E (m/s)': valores.eVel, puntos,
  };
  const advertencias = [];
  const resultado = (puntaje, origen, clasificacion) => {
    const clas = clasificacion || clasificacionMINE2(puntaje);
    return {
      valor: puntaje,
      clasificacion: clas,
      b2_avanzado: estadio === 'B2' && clas === 'severo',
      origen,
      datos_usados: datosUsados,
      faltantes,
      advertencias,
    };
  };

  if (!faltantes.length) {
    return resultado(puntos.laAo + puntos.lviddn + puntos.eVel, 'calculado');
  }

  const h = ctx.historial;
  if (h && Number.isInteger(h.mine2_puntaje)) {
    return resultado(h.mine2_puntaje, 'ultima_consulta', h.mine2_clasificacion || null);
  }

  // P7 — coherencia: el faltante recibe el promedio de los presentes,
  // redondeado hacia arriba, sin pasar el máximo de su variable. Sin ninguno → 1.
  const presentes = Object.values(puntos);
  const promedio = presentes.length
    ? Math.ceil(presentes.reduce((a, b) => a + b, 0) / presentes.length)
    : 1;
  const completos = { ...puntos };
  Object.keys(valores).forEach((k) => {
    if (completos[k] == null) completos[k] = Math.min(promedio, MINE2_MAX_PUNTOS[k]);
  });
  datosUsados.puntos_estimados = completos;
  advertencias.push('Puntaje estimado: los datos faltantes se puntuaron en coherencia con los disponibles.');
  return resultado(completos.laAo + completos.lviddn + completos.eVel, 'estimado');
}

// §3.3 — evalúa cada signo HP. Devuelve { items, valores, alerta }.
// items[sitio][clave] = true (presente) | false (evaluado: ausente o
// deshabilitado) | undefined (no evaluado).
function evaluarSignosHP(ctx) {
  const eco = ctx.eco || {};
  const manual = ctx.manual || {};
  const signos = manual.hp_signos || {};
  const deshabilitados = new Set(signos.deshabilitados || []);

  const trvCms = num2(eco.vmax_tricuspideo);
  const aoAp = num2(eco.ao_ap);
  const velRpCms = num2(eco.vel_regurg_pulmonar);
  const at = num2(eco.at_pulmonar);
  const et = num2(eco.et_pulmonar);
  let atEt = num2(eco.at_et_pulmonar);
  if (atEt == null && at != null && et != null && et > 0) atEt = r2(at / et);
  const dvdd = num2(eco.dvdd);
  const dvid = num2(eco.dvid);

  const valores = {
    trv: trvCms == null ? null : r2(trvCms / 100),
    tp_ao: aoAp != null && aoAp > 0 ? r2(1 / aoAp) : null,
    vel_regurg_pulmonar: velRpCms == null ? null : r2(velRpCms / 100),
    rpad: num2(eco.dapd),
    at_pulmonar: at,
    at_et_pulmonar: atEt,
    // dvdd y dvid en mm (8.7d): el cociente no necesita conversión.
    dvd_dvi: dvdd != null && dvid != null && dvid > 0 ? r2(dvdd / dvid) : null,
    morfo_pulmonar: manual.morfo_pulmonar || null,
  };

  const evaluar = (v, presente) => (v == null ? undefined : presente(v));
  const numericos = {
    dvd_dvi: evaluar(valores.dvd_dvi, (v) => v >= UMBRALES_HP.dvdDvi),
    tp_ao: evaluar(valores.tp_ao, (v) => v > UMBRALES_HP.tpAo),
    vel_regurg_pulmonar: evaluar(valores.vel_regurg_pulmonar, (v) => v > UMBRALES_HP.velRegurgPulmonar),
    rpad: evaluar(valores.rpad, (v) => v < UMBRALES_HP.rpad),
    at_pulmonar: evaluar(valores.at_pulmonar, (v) => v < UMBRALES_HP.at),
    at_et_pulmonar: evaluar(valores.at_et_pulmonar, (v) => v < UMBRALES_HP.atEt),
    notching: evaluar(valores.morfo_pulmonar, (v) => v === MORFO_NOTCHING),
  };

  const items = { sitio1: {}, sitio2: {}, sitio3: {} };
  SIGNOS_HP_VISUALES.forEach(({ sitio, clave }) => {
    const v = signos[sitio] ? signos[sitio][clave] : undefined;
    items[sitio][clave] = typeof v === 'boolean' ? v : undefined;
  });
  SIGNOS_HP_NUMERICOS.forEach(({ sitio, clave }) => {
    items[sitio][clave] = numericos[clave];
  });
  // Deshabilitado por el profesional → evaluado, pero no cuenta.
  Object.keys(items).forEach((sitio) => {
    Object.keys(items[sitio]).forEach((clave) => {
      if (deshabilitados.has(`${sitio}.${clave}`) && items[sitio][clave] !== undefined) {
        items[sitio][clave] = false;
      }
    });
  });

  const alertaTrv = valores.trv != null && valores.trv > UMBRALES_HP.trvBajo
    && !deshabilitados.has('trv');
  const alertaSignos = SIGNOS_HP_NUMERICOS
    .filter((s) => s.alerta)
    .some((s) => items[s.sitio][s.clave] === true);
  return { items, valores, alerta: alertaTrv || alertaSignos };
}

function matrizHP(trv, nSitios) {
  if (trv == null || trv <= UMBRALES_HP.trvBajo) {
    if (nSitios <= 1) return 'baja';
    return nSitios === 2 ? 'intermedia' : 'alta';
  }
  if (trv <= UMBRALES_HP.trvAlto) return nSitios <= 1 ? 'intermedia' : 'alta';
  return nSitios === 0 ? 'intermedia' : 'alta';
}

// hp_sospecha (§3.1): sección habilitada a mano, o por alerta numérica, y no
// deshabilitada. manual.hp_seccion ∈ 'auto' | 'habilitada' | 'deshabilitada'.
function hpSospecha(ctx, evaluacion) {
  if (ctx.especie !== 'canino') return false;
  const seccion = (ctx.manual && ctx.manual.hp_seccion) || 'auto';
  if (seccion === 'deshabilitada') return false;
  if (seccion === 'habilitada') return true;
  return (evaluacion || evaluarSignosHP(ctx)).alerta;
}

// §3 — HP.
function calcularHP(ctx) {
  if (ctx.especie !== 'canino') return null;
  const evaluacion = evaluarSignosHP(ctx);
  if (!hpSospecha(ctx, evaluacion)) return null;

  const { items, valores } = evaluacion;
  const sitios = ['sitio1', 'sitio2', 'sitio3'];
  const evaluados = sitios.filter((s) => Object.values(items[s]).some((v) => v !== undefined));
  const conSigno = sitios.filter((s) => Object.values(items[s]).some((v) => v === true));
  const nSitios = conSigno.length;

  const faltantes = [];
  if (valores.trv == null) faltantes.push('TRV');
  const eco = ctx.eco || {};
  [['DVDd', 'dvdd'], ['DVDs', 'dvds'], ['PLVDd', 'plvdd'], ['PLVDs', 'plvds']].forEach(([etiqueta, col]) => {
    if (num2(eco[col]) == null) faltantes.push(etiqueta);
  });

  const advertencias = [];
  if (items.sitio1.dvd_dvi === true) {
    advertencias.push('DVD/DVI ≥ 0.70: sobrecarga del VD sospechosa.');
  }
  const base = {
    n_sitios: nSitios,
    sitios_evaluados: evaluados.length,
    alerta: evaluacion.alerta,
    datos_usados: { ...valores, sitios_con_signo: conSigno },
    faltantes,
    advertencias,
  };

  // Tabla de §3.1: TRV + 3 sitios evaluados → cerrado. Si no, prima la última
  // consulta; sin ella, se estima con la matriz y lo disponible (sin nada → baja).
  if (valores.trv != null && evaluados.length === 3) {
    return { ...base, valor: matrizHP(valores.trv, nSitios), origen: 'calculado' };
  }
  const h = ctx.historial;
  if (h && ['baja', 'intermedia', 'alta'].includes(h.hp_clasificacion)) {
    return { ...base, valor: h.hp_clasificacion, origen: 'ultima_consulta' };
  }
  if (evaluados.length === 2) advertencias.push('Orientación con 2 de los 3 sitios evaluados.');
  return { ...base, valor: matrizHP(valores.trv, nSitios), origen: 'estimado' };
}

// Orquestador: las tres clasificaciones con un mismo ctx.
function calcularClasificaciones(ctx) {
  const acvim = calcularACVIM(ctx);
  const mine2 = calcularMINE2({ ...ctx, estadioACVIM: acvim ? acvim.valor : null });
  const hp = calcularHP(ctx);
  return { acvim, mine2, hp };
}
// <<< CLASIFICACION-PURA

// --- 10b. UI -------------------------------------------------------------------
// Historial de "última consulta": lo va a cargar un webhook nuevo de n8n (fuera
// de 8.7b). Mientras tanto queda null y las funciones saltan ese paso.
window.historialUltimaConsulta = window.historialUltimaConsulta || null;

const ORIGEN_TEXTO = {
  calculado: 'calculado',
  ultima_consulta: 'última consulta',
  estimado: 'estimado',
  manual: 'manual',
};

const bloqueInterpretacion = document.getElementById('bloque-interpretacion');
const interpResultados = document.getElementById('interp-resultados');
const interpDisclaimers = document.getElementById('interp-disclaimers');
const selectAcvimManual = document.getElementById('interp-acvim-manual');
const selectMorfoAortica = document.getElementById('interp-morfo-aortica');
const selectMorfoPulmonar = document.getElementById('interp-morfo-pulmonar');
// 8.7f: la ecografía pulmonar ya no tiene casilla "Activar". Queda activada
// al abrir el bloque por primera vez (y sigue activada aunque se lo vuelva a
// cerrar, para no perder lo elegido).
const bloqueEcoPulmonar = document.getElementById('bloque-eco-pulmonar');
let ecoPulmonarActivada = false;
const selectEcoPulmonar = document.getElementById('eco-pulmonar-hallazgos');
const bloqueCorazonDerecho = document.getElementById('bloque-corazon-derecho');
const selectHpSeccion = document.getElementById('hp-seccion-estado');
const hpAlerta = document.getElementById('hp-alerta');
const hpSignosVisuales = document.getElementById('hp-signos-visuales');
const hpSignosNumericos = document.getElementById('hp-signos-numericos');

function valorEco(columna) {
  const campo = document.getElementById(`eco-${columna}`);
  return campo ? String(campo.value).trim() : '';
}

// AT:ET (§3.3): si el PDF no lo trae y hay AT y ET, se calcula at/et. El campo
// calculado lleva data-auto para recalcularlo (o vaciarlo) cuando cambian AT/ET;
// un valor cargado a mano o del PDF no se pisa.
function sincronizarAtEtPulmonar() {
  const campo = document.getElementById('eco-at_et_pulmonar');
  if (!campo) return;
  const esAuto = campo.dataset.auto === '1';
  if (campo.value !== '' && !esAuto) return;
  const at = num2(valorEco('at_pulmonar'));
  const et = num2(valorEco('et_pulmonar'));
  const antes = campo.value;
  if (at != null && et != null && et > 0) {
    campo.value = r2(at / et);
    campo.dataset.auto = '1';
  } else if (esAuto) {
    campo.value = '';
    delete campo.dataset.auto;
  }
  if (campo.value !== antes) actualizarVisibilidadTodosEco();
}

function leerSignosHP() {
  const signos = {};
  if (hpSignosVisuales) {
    hpSignosVisuales.querySelectorAll('select[data-sitio]').forEach((select) => {
      if (select.value === '') return;
      const { sitio, clave } = select.dataset;
      signos[sitio] = signos[sitio] || {};
      signos[sitio][clave] = select.value === 'si';
    });
  }
  const deshabilitados = hpSignosNumericos
    ? Array.from(hpSignosNumericos.querySelectorAll('input[data-item]:checked')).map((c) => c.dataset.item)
    : [];
  if (deshabilitados.length) signos.deshabilitados = deshabilitados;
  return signos;
}

function leerContextoClasificacion() {
  const hallazgos = ecoPulmonarActivada && selectEcoPulmonar
    ? Array.from(selectEcoPulmonar.selectedOptions).map((o) => o.value)
    : null;
  return {
    especie: document.getElementById('paciente-especie').value || null,
    soplos: leerSoplos(),
    anamnesis: leerTexto('consulta-anamnesis'),
    eco: leerBloqueEcocardiografia() || {},
    manual: {
      acvim_estadio: selectAcvimManual ? selectAcvimManual.value || null : null,
      eco_pulmonar_hallazgos: hallazgos,
      morfo_aortica: selectMorfoAortica ? selectMorfoAortica.value || null : null,
      morfo_pulmonar: selectMorfoPulmonar ? selectMorfoPulmonar.value || null : null,
      hp_signos: leerSignosHP(),
      hp_seccion: selectHpSeccion ? selectHpSeccion.value : 'auto',
    },
    historial: window.historialUltimaConsulta || null,
  };
}

function textoResultados(ctx, { acvim, mine2, hp }) {
  const lineas = [];
  lineas.push(acvim
    ? `ACVIM: ${acvim.valor} (${ORIGEN_TEXTO[acvim.origen]})`
    : 'ACVIM: no aplica (solo perros con soplo de foco mitral).');
  if (mine2) {
    const avanzado = mine2.b2_avanzado ? ' · B2 avanzado' : '';
    lineas.push(`MINE 2: ${mine2.valor}/11 — ${mine2.clasificacion}${avanzado} (${ORIGEN_TEXTO[mine2.origen]})`);
  } else {
    lineas.push(acvim && (acvim.valor === 'C' || acvim.valor === 'D')
      ? `MINE 2: no se calcula en estadio ${acvim.valor} (solo es válido en B1 o B2).`
      : 'MINE 2: no aplica (solo perros en estadio B1 o B2).');
  }
  if (hp) {
    const trv = hp.datos_usados.trv == null ? 'no medible' : `${hp.datos_usados.trv} m/s`;
    lineas.push(`HP: probabilidad ${hp.valor} · TRV ${trv} · ${hp.n_sitios} sitio(s) con signos (${ORIGEN_TEXTO[hp.origen]})`);
  } else {
    lineas.push(ctx.especie === 'canino'
      ? 'HP: sección "Corazón derecho" sin habilitar.'
      : 'HP: no aplica (solo perros).');
  }
  [acvim, mine2, hp].forEach((r) => {
    if (r) r.advertencias.forEach((a) => lineas.push(`⚠️ ${a}`));
  });
  return lineas.join('\n');
}

// §0.3 — disclaimer con una casilla por dato faltante. Solo en pantalla.
function renderizarDisclaimers(resultados) {
  if (!interpDisclaimers) return;
  interpDisclaimers.innerHTML = '';
  const nombres = { acvim: 'ACVIM', mine2: 'MINE 2', hp: 'HP' };
  const yaMostrados = new Set();
  Object.entries(resultados).forEach(([clave, r]) => {
    if (!r || !r.faltantes.length) return;
    const caja = document.createElement('div');
    caja.className = 'interp-disclaimer';
    const texto = document.createElement('p');
    texto.textContent = `${nombres[clave]}: falta ${r.faltantes.join(', ')} para clasificar.`;
    caja.appendChild(texto);
    r.faltantes.forEach((faltante) => {
      const destino = DESTINO_FALTANTES[faltante];
      if (!destino || yaMostrados.has(destino.columna)) return;
      yaMostrados.add(destino.columna);
      const label = document.createElement('label');
      label.className = 'campo-label';
      label.textContent = destino.unidad ? `${faltante} (${destino.unidad})` : faltante;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'input-control';
      input.dataset.columna = destino.columna;
      label.appendChild(input);
      caja.appendChild(label);
    });
    interpDisclaimers.appendChild(caja);
  });
}

function textoItemNumerico(evaluacion, sitio, clave) {
  const estado = evaluacion.items[sitio][clave];
  const valor = clave === 'notching' ? evaluacion.valores.morfo_pulmonar : evaluacion.valores[clave];
  if (estado === undefined) return 'sin dato';
  return `${valor} → ${estado ? 'presente' : 'no cuenta'}`;
}

function renderizarSignosNumericos(evaluacion) {
  if (!hpSignosNumericos) return;
  hpSignosNumericos.querySelectorAll('[data-valor-item]').forEach((span) => {
    const item = span.dataset.valorItem;
    if (item === 'trv') {
      const trv = evaluacion.valores.trv;
      span.textContent = trv == null ? 'sin dato' : `${trv} m/s${trv > UMBRALES_HP.trvBajo ? ' → alerta' : ''}`;
      return;
    }
    const [sitio, clave] = item.split('.');
    span.textContent = textoItemNumerico(evaluacion, sitio, clave);
  });
}

function recalcularClasificaciones() {
  if (!bloqueInterpretacion) return null;
  sincronizarAtEtPulmonar();
  const ctx = leerContextoClasificacion();
  const resultados = calcularClasificaciones(ctx);
  const evaluacion = evaluarSignosHP(ctx);

  // "Corazón derecho" vacía por defecto; una alerta numérica la abre sola
  // (salvo que el profesional la haya deshabilitado).
  const alertaActiva = ctx.especie === 'canino' && evaluacion.alerta
    && ctx.manual.hp_seccion !== 'deshabilitada';
  if (hpAlerta) {
    hpAlerta.hidden = !alertaActiva;
    hpAlerta.textContent = alertaActiva ? '⚠️ Signo de alerta numérico: se habilitó la sección.' : '';
  }
  if (alertaActiva && bloqueCorazonDerecho && ctx.manual.hp_seccion === 'auto') {
    bloqueCorazonDerecho.open = true;
  }

  if (interpResultados) interpResultados.textContent = textoResultados(ctx, resultados);
  renderizarDisclaimers(resultados);
  renderizarSignosNumericos(evaluacion);
  return resultados;
}

// Claves de la interpretación para payload.examen_clinico (n8n las mapea a
// atenciones_cardiologia en 8.7c). Recalcula en el momento del envío.
function leerInterpretacion() {
  if (!bloqueInterpretacion) return {};
  const ctx = leerContextoClasificacion();
  const { acvim, mine2, hp } = calcularClasificaciones(ctx);
  const traza = (r) => (r ? { origen: r.origen, faltantes: r.faltantes, advertencias: r.advertencias } : null);
  const advertencias = { acvim: traza(acvim), mine2: traza(mine2), hp: traza(hp) };
  const hayAdvertencias = Object.values(advertencias).some(Boolean);
  return {
    acvim_estadio: acvim ? acvim.valor : null,
    acvim_origen: acvim ? acvim.origen : null,
    mine2_puntaje: mine2 ? mine2.valor : null,
    mine2_clasificacion: mine2 ? mine2.clasificacion : null,
    hp_clasificacion: hp ? hp.valor : null,
    hp_sospecha: ctx.especie === 'canino' ? Boolean(hp) : null,
    hp_signos: hp ? ctx.manual.hp_signos : null,
    hp_n_sitios: hp ? hp.n_sitios : null,
    clasificacion_advertencias: hayAdvertencias ? advertencias : null,
    morfo_aortica: ctx.manual.morfo_aortica,
    morfo_pulmonar: ctx.manual.morfo_pulmonar,
    eco_pulmonar_hallazgos: ctx.manual.eco_pulmonar_hallazgos,
  };
}

// --- Armado de los controles ---------------------------------------------------
if (selectMorfoAortica) poblarSelect(selectMorfoAortica, { opciones: OPCIONES_MORFO_AORTICA, default: '' });
if (selectMorfoPulmonar) poblarSelect(selectMorfoPulmonar, { opciones: OPCIONES_MORFO_PULMONAR, default: '' });

// 8.7i: diagnóstico de lista, agrupado por patología (42 opciones). Selección
// única, vacío por defecto. El texto elegido viaja tal cual (leerDiagnostico,
// Sección 9).
const DIAGNOSTICOS_INTERPRETACION = [
  ['Mitral', [
    'Hallazgos compatibles con: ENFERMEDAD MITRAL ACVIM B1.',
    'Hallazgos compatibles con: ENFERMEDAD MITRAL ACVIM B2.',
    'Hallazgos compatibles con: INSUFICIENCIA MITRAL ACVIM Ca.',
    'Hallazgos compatibles con: INSUFICIENCIA MITRAL ACVIM Cc.',
    'Hallazgos compatibles con: INSUFICIENCIA MITRAL ACVIM Da.',
    'Hallazgos compatibles con: INSUFICIENCIA MITRAL ACVIM Dc.',
  ]],
  ['Tricuspídea', [
    'Hallazgos compatibles con: ENFERMEDAD TRICUSPÍDEA ACVIM B1.',
    'Hallazgos compatibles con: ENFERMEDAD TRICUSPÍDEA ACVIM B2.',
    'Hallazgos compatibles con: INSUFICIENCIA TRICUSPÍDEA ACVIM Ca.',
    'Hallazgos compatibles con: INSUFICIENCIA TRICUSPÍDEA ACVIM Cc.',
    'Hallazgos compatibles con: INSUFICIENCIA TRICUSPÍDEA ACVIM Da.',
    'Hallazgos compatibles con: INSUFICIENCIA TRICUSPÍDEA ACVIM Dc.',
  ]],
  ['AV Bilateral', [
    'Hallazgos compatibles con: ENFERMEDAD AV BILATERAL ACVIM B1.',
    'Hallazgos compatibles con: ENFERMEDAD AV BILATERAL ACVIM B2.',
    'Hallazgos compatibles con: INSUFICIENCIA AV BILATERAL ACVIM Ca.',
    'Hallazgos compatibles con: INSUFICIENCIA AV BILATERAL ACVIM Cc.',
    'Hallazgos compatibles con: INSUFICIENCIA AV BILATERAL ACVIM Da.',
  ]],
  ['CMD', [
    'Hallazgos sugerentes de: CMD/ Miocarditis / Hipotiroidismo.',
    'Hallazgos sugerentes de: Hipotiroidismo / CMD/ Miocarditis.',
    'Hallazgos sugerentes de: CMD en fase oculta / CMAVD.',
    'Hallazgos compatibles con: CMD LEVE.',
    'Hallazgos compatibles con: CMD MODERADA.',
    'Hallazgos compatibles con: CMD SEVERA.',
  ]],
  ['CMAVD', [
    'Hallazgos compatibles con: CMAVD LEVE.',
    'Hallazgos compatibles con: CMAVD MODERADA.',
    'Hallazgos compatibles con: CMAVD SEVERA.',
  ]],
  ['Estenosis Pulmonar', [
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO I LEVE.',
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO I MODERADA.',
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO I SEVERA.',
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO II LEVE.',
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO II MODERADA.',
    'Hallazgos compatibles con: ESTENOSIS PULMONAR TIPO II SEVERA.',
  ]],
  ['Conducto Arterioso Persistente', [
    'Hallazgos compatibles con: CONDUCTO ARTERIOSO PERSISTENTE LEVE.',
    'Hallazgos compatibles con: CONDUCTO ARTERIOSO PERSISTENTE MODERADO.',
    'Hallazgos compatibles con: CONDUCTO ARTERIOSO PERSISTENTE SEVERO.',
    'Hallazgos sugerentes de: CONDUCTO ARTERIOSO PERSISTENTE LEVE.',
    'Hallazgos sugerentes de: CONDUCTO ARTERIOSO PERSISTENTE MODERADO.',
    'Hallazgos sugerentes de: CONDUCTO ARTERIOSO PERSISTENTE SEVERO.',
  ]],
  ['Comunicación Interatrial', [
    'Hallazgos sugerentes de: Comunicación interatrial.',
    'Hallazgos compatibles con: Comunicación interatrial.',
  ]],
  ['Estructura y función conservada', [
    'Hallazgos compatibles con: Estructura y función cardíaca conservada sin evidencias de cardiopatía primaria.',
    'Hallazgos compatibles con: Estructura y función cardíaca conservada.',
  ]],
];

const selectDiagnostico = document.getElementById('interp-diagnostico');
if (selectDiagnostico) {
  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = '—';
  selectDiagnostico.appendChild(vacia);
  DIAGNOSTICOS_INTERPRETACION.forEach(([grupo, opciones]) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = grupo;
    opciones.forEach((texto) => {
      const opcion = document.createElement('option');
      opcion.value = texto;
      opcion.textContent = texto;
      optgroup.appendChild(opcion);
    });
    selectDiagnostico.appendChild(optgroup);
  });
}

if (selectEcoPulmonar) {
  HALLAZGOS_ECO_PULMONAR.forEach((texto, i) => {
    const opcion = document.createElement('option');
    opcion.value = texto;
    opcion.textContent = `${i + 1}. ${texto}`;
    selectEcoPulmonar.appendChild(opcion);
  });
}
if (bloqueEcoPulmonar && selectEcoPulmonar) {
  bloqueEcoPulmonar.addEventListener('toggle', () => {
    if (!bloqueEcoPulmonar.open || ecoPulmonarActivada) return;
    ecoPulmonarActivada = true;
    recalcularClasificaciones();
  });
}

if (hpSignosVisuales) {
  SIGNOS_HP_VISUALES.forEach(({ sitio, clave, etiqueta }) => {
    const label = document.createElement('label');
    label.className = 'campo-label';
    label.textContent = etiqueta;
    const select = document.createElement('select');
    select.className = 'input-control';
    select.dataset.sitio = sitio;
    select.dataset.clave = clave;
    [['', 'Sin evaluar'], ['si', 'Sí'], ['no', 'No']].forEach(([valor, texto]) => {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = texto;
      select.appendChild(opcion);
    });
    label.appendChild(select);
    hpSignosVisuales.appendChild(label);
  });
}

if (hpSignosNumericos) {
  const items = [{ item: 'trv', etiqueta: 'TRV > 3.0 m/s' }]
    .concat(SIGNOS_HP_NUMERICOS.map((s) => ({ item: `${s.sitio}.${s.clave}`, etiqueta: s.etiqueta })));
  items.forEach(({ item, etiqueta }) => {
    const fila = document.createElement('div');
    fila.className = 'fila-signo-hp';
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const valor = document.createElement('span');
    valor.className = 'valor-signo-hp';
    valor.dataset.valorItem = item;
    const label = document.createElement('label');
    label.className = 'opcion-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.dataset.item = item;
    label.append(check, ' No coincide (deshabilitar)');
    fila.append(nombre, valor, label);
    hpSignosNumericos.appendChild(fila);
  });
}

// --- Disparadores de recálculo -------------------------------------------------
if (bloqueInterpretacion) {
  // Selector ACVIM, morfologías, estado de la sección, signos y deshabilitados.
  bloqueInterpretacion.addEventListener('change', (evento) => {
    const objetivo = evento.target;
    if (objetivo.dataset && objetivo.dataset.columna) return; // casillas: abajo
    // Marcar un signo visual a mano habilita la sección si estaba en automático.
    if (objetivo.dataset && objetivo.dataset.sitio && objetivo.value !== ''
        && selectHpSeccion && selectHpSeccion.value === 'auto') {
      selectHpSeccion.value = 'habilitada';
    }
    recalcularClasificaciones();
  });
}

// Casillas del disclaimer: el valor tipeado va a su campo eco (y de ahí al
// payload, como si viniera del PDF) y se recalcula todo.
if (interpDisclaimers) {
  interpDisclaimers.addEventListener('change', (evento) => {
    const input = evento.target;
    if (!input.dataset || !input.dataset.columna || input.value === '') return;
    const campo = document.getElementById(`eco-${input.dataset.columna}`);
    if (!campo) return;
    campo.value = input.value;
    recalcularIndicesEcoDesdeFormulario();
    recalcularClasificaciones();
  });
}

if (selectEcoPulmonar) selectEcoPulmonar.addEventListener('change', recalcularClasificaciones);
if (bloqueEcoInteractivo) bloqueEcoInteractivo.addEventListener('input', recalcularClasificaciones);
if (campoPesoPaciente) campoPesoPaciente.addEventListener('input', recalcularClasificaciones);
if (selectEspecie) selectEspecie.addEventListener('change', recalcularClasificaciones);
if (listaSoplos) {
  listaSoplos.addEventListener('change', recalcularClasificaciones);
  listaSoplos.addEventListener('click', (evento) => {
    if (evento.target.closest('.btn-eliminar-soplo')) recalcularClasificaciones();
  });
}
if (btnAgregarSoplo) btnAgregarSoplo.addEventListener('click', recalcularClasificaciones);
const campoAnamnesis = document.getElementById('consulta-anamnesis');
if (campoAnamnesis) campoAnamnesis.addEventListener('input', recalcularClasificaciones);

// Para los llamados desde secciones anteriores (filiación, PDF), que pueden
// correr antes de que esta sección se haya inicializado.
window.recalcularClasificaciones = recalcularClasificaciones;
recalcularClasificaciones();
