// interface/app.js — MyVete Panel de carga (Módulo base V4.8)
// Reconstruido tras detectar que el archivo no existía en disco (ReferenceError
// consolidarPayloadFinal is not defined). Ver INFORME_CODE V4.8 e
// INFORME_CODE "reconstrucción app.js" para el alcance exacto de esta versión.

// ---------------------------------------------------------------------------
// 1. Perfiles clínicos — placeholder modular (Paso A pendiente, ver STATUS.md)
// ---------------------------------------------------------------------------
// PROPUESTA-MODELO-ELASTICO-V3.5.md plantea dar de baja el diccionario fijo
// que existía acá y reemplazarlo por datos dinámicos (Sheets/Supabase). Esa
// decisión sigue abierta, así que este objeto queda vacío a propósito: no se
// inventan valores clínicos. Cuando se resuelva, cada clave (sano/acvim_b1/
// acvim_b2) debe mapear a { fc, fr, mucosas, anamnesis, diagnostico, indicaciones }.
const PERFILES_CLINICOS = {};

const controlPerfilClinico = document.getElementById('control-perfil-clinico');
if (controlPerfilClinico) {
  controlPerfilClinico.addEventListener('change', (evento) => {
    const perfil = PERFILES_CLINICOS[evento.target.value];
    if (!perfil) return; // 'personalizado' y perfiles aún no definidos: no-op

    if (perfil.fc !== undefined) document.getElementById('clinica-fc').value = perfil.fc;
    if (perfil.fr !== undefined) document.getElementById('clinica-fr').value = perfil.fr;
    if (perfil.mucosas !== undefined) document.getElementById('clinica-mucosas').value = perfil.mucosas;
    if (perfil.anamnesis !== undefined) document.getElementById('consulta-anamnesis').value = perfil.anamnesis;
    if (perfil.diagnostico !== undefined) document.getElementById('consulta-diagnostico').value = perfil.diagnostico;
    if (perfil.indicaciones !== undefined) document.getElementById('consulta-indicaciones').value = perfil.indicaciones;
  });
}

// ---------------------------------------------------------------------------
// 2. Bloque Filiación — modo lectura / edición
// ---------------------------------------------------------------------------
let bloqueFiliacionEditado = false;

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

  if (tutor) {
    if (tutor.nombre != null) document.getElementById('tutor-nombre').value = tutor.nombre;
    if (tutor.telefono != null) document.getElementById('tutor-telefono').value = tutor.telefono;
    if (tutor.email != null) document.getElementById('tutor-email').value = tutor.email;
  }

  if (mascota) {
    if (mascota.nombre != null) document.getElementById('paciente-nombre').value = mascota.nombre;
    if (mascota.especie != null) asignarValorSelect(document.getElementById('paciente-especie'), mascota.especie);
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
// publicado y activo en n8n Cloud el 28/07/2026 — ver n8n/README.md.
const WEBHOOK_URL_N8N = 'https://echevanest.app.n8n.cloud/webhook/ingesta-filiacion-v4';

const btnSubmitFormulario = document.getElementById('btn-submit-formulario');
const avisoFormulario = document.getElementById('aviso-formulario');

function mostrarAviso(mensaje) {
  avisoFormulario.textContent = mensaje;
  avisoFormulario.hidden = false;
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
