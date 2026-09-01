// interface/app.js — MyVete Panel de carga (Módulo base V4.8)
// Reconstruido tras detectar que el archivo no existía en disco (ReferenceError
// consolidarPayloadFinal is not defined). Ver INFORME_CODE V4.8 e
// INFORME_CODE "reconstrucción app.js" para el alcance exacto de esta versión.

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
// `?idTutor=` al abrir el panel, con respaldo dentro del payload del postMessage.
// Viaja en el payload de salida como filiacion.tutor.id_myvete y es la clave de
// upsert prevista para la tabla `tutores`.
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

// Recepción de filiación raspada por el Bookmarklet de MyVete.
window.addEventListener('message', (evento) => {
  if (!evento.data || evento.data.type !== 'MYVETE_FILIACION') return;

  const { tutor, mascota } = evento.data.payload || {};

  // Respaldo del query param: si el bookmarklet no pudo poner el idTutor en la
  // URL (o el panel ya estaba abierto de antes), todavía llega dentro del mensaje.
  if (!idTutorMyVete && evento.data.payload && evento.data.payload.idTutor != null) {
    idTutorMyVete = String(evento.data.payload.idTutor);
  }

  if (tutor) {
    if (tutor.nombre != null) document.getElementById('tutor-nombre').value = tutor.nombre;
    if (tutor.telefono != null) document.getElementById('tutor-telefono').value = tutor.telefono;
    if (tutor.email != null) document.getElementById('tutor-email').value = tutor.email;
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
});

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
// 4. Apéndice Métrico — MAPEO_METRICAS (contrato final de bloque_metrico, V4.8)
// ---------------------------------------------------------------------------
const MAPEO_METRICAS = {
  'metrica-eco-ai-ao': 'eco_ai_ao',
  'metrica-eco-ai-ao-area': 'eco_ai_ao_area',
  'metrica-eco-lviddn': 'eco_lviddn',
  'metrica-eco-e-vel': 'eco_e_vel',
  'metrica-eco-fs': 'eco_fs',
  'metrica-eco-fe-teichholz': 'eco_fe_teichholz',
  'metrica-eco-fe-simpson': 'eco_fe_simpson',
  'metrica-eco-lav': 'eco_lav',
  'metrica-eco-lavi': 'eco_lavi',
  'metrica-eco-lvid-d-crudo': 'eco_lvid_d_crudo',
  'metrica-eco-lvid-s-crudo': 'eco_lvid_s_crudo',
  'metrica-eco-sivd': 'eco_sivd',
  'metrica-eco-ppd': 'eco_ppd',
  'metrica-ekg-fc': 'ekg_fc',
  'metrica-ekg-ritmo': 'ekg_ritmo',
  'metrica-ekg-eje': 'ekg_eje',
  'metrica-ekg-p-ms': 'ekg_p_ms',
};

function leerBloqueMetrico() {
  const bloque = {};
  Object.entries(MAPEO_METRICAS).forEach(([idCampo, clave]) => {
    const campo = document.getElementById(idCampo);
    if (!campo) return;
    const valorCrudo = campo.value.trim();
    if (valorCrudo === '') return; // omitir claves nulas/vacías
    bloque[clave] = campo.type === 'number' ? Number(valorCrudo) : valorCrudo;
  });
  return bloque;
}

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
    bloque_metrico: leerBloqueMetrico(),
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
      if (window.opener) {
        window.opener.postMessage({ type: 'MYVETE_SUBMIT_OK' }, '*');
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
