// ===== SPRINT 6 - Preparar Datos para PDF =====
// Lee EXPLICITAMENTE de los nodos origen. En esta posicion del workflow,
// $input seria la fila de respuesta de Supabase, NO el payload del webhook.
const payload  = $('Webhook').item.json.body;
const profesional = payload.profesional || {};
// Sprint 7 (3-bis): matriculas normalizadas en 4 columnas -> "M.N. 7356 - M.P. 10087".
const MAPA_TIPO_MATRICULA = { MN: 'M.N.', MP: 'M.P.' };
function formatearMatricula(tipo, numero) {
  if (!tipo || !numero) return null;
  return (MAPA_TIPO_MATRICULA[tipo] || tipo) + ' ' + numero;
}
function matriculasTexto(p) {
  return [
    formatearMatricula(p.matricula_tipo, p.matricula_numero),
    formatearMatricula(p.matricula_2_tipo, p.matricula_2_numero)
  ].filter(Boolean).join(' - ');
}
const iaOutput = $('IA - Estructurar Anamnesis').item.json;
const informe  = iaOutput.output?.[0]?.content?.[0]?.text || {};

const filiacion = payload.filiacion || {};
const tutor     = filiacion.tutor || {};
const mascota   = filiacion.mascota || {};

// Sprint 8.0 (2c): TODOS los valores clínicos salen del SPA (payload.examen_clinico).
// La IA ya no es fuente de FC/FR/PA/mucosas: solo aporta el resumen de anamnesis y,
// como respaldo, diagnóstico/indicaciones sugeridos si el SPA no los manda.
const examen = payload.examen_clinico || {};
const consulta = {
  motivo: examen.motivo || null,
  fc: examen.fc_numero ?? null,
  fr: examen.fr_numero ?? null,
  fr_tipo: examen.fr_tipo || null,
  pas: examen.pas ?? null,
  pam: examen.pam ?? null,
  pad: examen.pad ?? null,
  mucosas: examen.mucosas || null,
  diagnostico: examen.diagnostico || informe.diagnostico_sugerido || null,
  indicaciones: examen.indicaciones || informe.indicaciones_sugeridas || null,
  resumen: informe.resumen_anamnesis ?? null,
};

const eco = payload.datos_ecocardiografia || {};

// Sub-fase 8.7c (2026-09-29): TODAS las velocidades en cm/s (decisión 8.7);
// tiempos AT/ET en ms. hp_gradiente ya no existe (duplicaba gp_tricuspideo).
// 8.7d (2026-10-01): TODAS las medidas lineales en mm. El SPA ya las manda en
// mm (antes las de Modo M venían en cm); acá solo se rotula, no se convierte.
function obtenerUnidad(clave) {
  const u = {
    dvid:'mm', dvs:'mm', sivd:'mm', sivs:'mm', ppvid:'mm', ppvis:'mm',
    ai_lineal:'mm', ao_lineal:'mm', fe_modom:'%', fs_modom:'%', fe_simpson:'%',
    velocidad_e_mitral:'cm/s', velocidad_a_mitral:'cm/s',
    velocidad_e_tricuspideo:'cm/s', velocidad_a_tricuspideo:'cm/s',
    vmax_ao:'cm/s', vmax_pulmonar:'cm/s', vmax_mitral:'cm/s', vmax_tricuspideo:'cm/s',
    vel_regurg_pulmonar:'cm/s',
    at_pulmonar:'ms', et_pulmonar:'ms',
    dvdd:'mm', dvds:'mm', plvdd:'mm', plvds:'mm', dvccd:'mm',
    gp_tricuspideo:'mmHg', dapd:'%',
    masa_vi:'g', indice_masa_vi:'g/m2', masa_vi_indexada:'g/m2',
    mvcf:'circ/s', tapse:'mm', mapse:'mm',
  };
  return u[clave] || '';
}
function formatearNombreCampo(clave) {
  const n = {
    dvid:'DVI Diastole', dvs:'DVI Sistole', sivd:'SIV Diastole', sivs:'SIV Sistole',
    ppvid:'PPVI Diastole', ppvis:'PPVI Sistole', ai_lineal:'AI Lineal', ao_lineal:'Ao Lineal',
    ai_ao_lineal:'Relacion AI/Ao', ai_ao_area:'Relacion AI/Ao (area)',
    fe_modom:'FE (Modo M)', fs_modom:'FS (Modo M)', fe_simpson:'FE (Simpson)',
    velocidad_e_mitral:'Velocidad E Mitral', velocidad_a_mitral:'Velocidad A Mitral',
    relacion_ea_mitral:'Relacion E/A Mitral',
    masa_vi:'Masa VI', indice_masa_vi:'Indice Masa VI', masa_vi_indexada:'Masa VI Indexada',
    mvcf:'MVCF', epr:'EPR',
    dvid_indexado:'DVI Diastole Indexado (LVIDDn)', dvs_indexado:'DVI Sistole Indexado',
    volumen_ai_indexado:'Volumen AI Indexado (LAVI)',
    vmax_tricuspideo:'TRV (Vmax tricuspidea)', gp_tricuspideo:'Gradiente tricuspideo',
    at_pulmonar:'AT', et_pulmonar:'ET', at_et_pulmonar:'AT:ET',
    vel_regurg_pulmonar:'Vel. RP',
    dvdd:'DVDd', dvds:'DVDs', plvdd:'PLVDd', plvds:'PLVDs',
    ao_ap:'Ao/AP', vp_ap:'VP/AP', dapd:'RPAD', dvccd:'DVCCd',
  };
  return n[clave] || clave.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}
function obtenerCamposConValor(objeto) {
  const campos = [];
  // Las 5 columnas de clasificación de datos_ecocardiografia están deprecadas
  // (8.7a): se excluyen por si un payload viejo todavía las trae.
  const excluir = ['id','created_at','updated_at','atencion_id','mascota_id','tutor_id',
    'acvim_estadio','mine2_puntaje','mine2_clasificacion','hp_clasificacion','hp_gradiente','observaciones',
    'efusion_pericardica','efusion_pleural','patron_llenado_vi'];
  for (const [clave, valor] of Object.entries(objeto)) {
    if (excluir.includes(clave)) continue;
    if (valor === null || valor === undefined || valor === '' || valor === 'null') continue;
    if (typeof valor === 'number' && isNaN(valor)) continue;
    const esIndexado = clave.includes('_indexado') || clave.includes('indexada') ||
      clave.includes('indice_') || ['masa_vi','mvcf','epr','lavi'].includes(clave);
    campos.push({ clave, nombreMostrar: formatearNombreCampo(clave), valor, esIndexado, unidad: obtenerUnidad(clave) });
  }
  return campos;
}

const todos = obtenerCamposConValor(eco);
const valoresMedidos   = todos.filter(function (c) { return !c.esIndexado; });
const valoresIndexados = todos.filter(function (c) { return  c.esIndexado; });

// ===== Sub-fase 8.7c - INTERPRETACIÓN DIAGNÓSTICA =====
// La calcula el SPA (8.7b) y viaja en examen_clinico. El informe NO muestra
// disclaimers, clasificacion_advertencias ni el origen del valor (8.7k: se
// sacó también la leyenda "indicado por el profesional"; solo va el valor).
const interpLines = [];
if (examen.acvim_estadio) {
  interpLines.push('Estadio ACVIM: ' + examen.acvim_estadio);
}
if (examen.mine2_puntaje != null) {
  const b2Avanzado = examen.acvim_estadio === 'B2' && examen.mine2_clasificacion === 'severo';
  interpLines.push('MINE 2: ' + examen.mine2_puntaje + '/11' +
    (examen.mine2_clasificacion ? ' - ' + examen.mine2_clasificacion : '') +
    (b2Avanzado ? ' (B2 avanzado)' : ''));
}
// HP no se informa si la sección "Corazón derecho" quedó deshabilitada o vacía.
if (examen.hp_sospecha === true && examen.hp_clasificacion) {
  const partesHp = [];
  if (eco.vmax_tricuspideo != null) partesHp.push('TRV ' + eco.vmax_tricuspideo + ' cm/s');
  if (examen.hp_n_sitios != null) partesHp.push('signos en ' + examen.hp_n_sitios + ' de 3 sitios');
  interpLines.push('Hipertension pulmonar: probabilidad ' + examen.hp_clasificacion +
    (partesHp.length ? ' (' + partesHp.join('; ') + ')' : ''));
}
// DVD/DVI (dvdd y dvid en mm desde 8.7d), sin unidad.
if (eco.dvdd != null && eco.dvid != null && Number(eco.dvid) > 0) {
  interpLines.push('Relacion DVD/DVI: ' + (Math.round(Number(eco.dvdd) / Number(eco.dvid) * 100) / 100));
}
if (examen.morfo_aortica) interpLines.push('Morfologia del flujo aortico: ' + examen.morfo_aortica);
if (examen.morfo_pulmonar) interpLines.push('Morfologia del flujo pulmonar: ' + examen.morfo_pulmonar);

const ecoPulmonar = Array.isArray(examen.eco_pulmonar_hallazgos)
  ? examen.eco_pulmonar_hallazgos.filter(Boolean) : [];

// Se conserva la clave `scores` en la salida (ningún nodo la lee) con los
// valores de la interpretación, para trazabilidad.
const scores = {};
['acvim_estadio', 'mine2_puntaje', 'mine2_clasificacion', 'hp_clasificacion', 'hp_n_sitios']
  .forEach(function (k) { if (examen[k] != null) scores[k] = examen[k]; });

// ===== ECG - PREPARADO PARA LA PROXIMA ITERACION (no se renderiza aun) =====
// const ekg = payload.bloque_ekg || {};
// const datosEKG = {};
// if (ekg.ekg_fc)    datosEKG.fc    = ekg.ekg_fc;
// if (ekg.ekg_ritmo) datosEKG.ritmo = ekg.ekg_ritmo;
// if (ekg.ekg_eje)   datosEKG.eje   = ekg.ekg_eje;
// if (ekg.ekg_p_ms)  datosEKG.p_ms  = ekg.ekg_p_ms;
// -> agregar seccion 'ELECTROCARDIOGRAMA' en doc_content usando datosEKG

const peso  = mascota.peso ?? mascota.pesoActual ?? null;
// 8.7p (2026-10-05): correccion del dominio del email del tutor, segunda
// barrera despues del SPA. El bloque EMAIL-PURO es copia textual del de
// interface/app.js (tests/email.test.mjs comprueba que sean iguales). Solo se
// corrige lo deducible ("gemail.com" -> "gmail.com"); el resto sigue como
// llego. El mail y el informe salen con el corregido; 'Upsert Tutor' guarda el
// recibido.
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
const emailRecibido = tutor.email || null;
const revisionEmail = revisarEmail(emailRecibido);
const email = revisionEmail.estado === 'corregido' ? revisionEmail.email : emailRecibido;
const paciente = mascota.nombre || 'Paciente';
// 8.7d: hora de Argentina explícita (el servidor de n8n no corre en esa zona).
const fecha = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'America/Argentina/Buenos_Aires' });

const L = '-'.repeat(56);
const HR = '='.repeat(56);
let t = '';
t += 'INFORME CARDIOLOGICO VETERINARIO\n' + HR + '\n\n';
if (profesional.nombre || profesional.apellido) {
  t += 'PROFESIONAL ACTUANTE\n' + L + '\n';
  t += 'Dr. ' + (profesional.nombre || '') + ' ' + (profesional.apellido || '') + '\n';
  t += 'Veterinario\n';
  if (profesional.especialidad) t += profesional.especialidad + '\n';
  const mats = matriculasTexto(profesional);
  if (mats) t += 'Matrícula: ' + mats + '\n';
  t += '\n';
}
// 8.7d: la fecha va justo arriba de los datos filiatorios.
t += 'Fecha: ' + fecha + '\n\n';
t += 'DATOS DEL PACIENTE\n' + L + '\n';
t += 'Paciente: ' + paciente + '\n';
t += 'Especie: ' + (mascota.especie || 'N/D') + '    Raza: ' + (mascota.raza || 'N/D') + '\n';
if (peso != null) t += 'Peso: ' + peso + ' kg\n';
t += 'Tutor: ' + (tutor.nombre || 'N/D') + '\n';
t += 'Tel: ' + (tutor.telefono || 'N/D') + '    Email: ' + (email || 'N/D') + '\n\n';

if (consulta.motivo) t += 'MOTIVO DE LA CONSULTA\n' + L + '\n' + consulta.motivo + '\n\n';

const constLines = [];
if (consulta.fc != null) constLines.push('FC: ' + consulta.fc + ' lpm');
if (consulta.fr != null) constLines.push('FR: ' + consulta.fr + ' rpm' + (consulta.fr_tipo ? ' (' + consulta.fr_tipo + ')' : ''));
else if (consulta.fr_tipo) constLines.push('FR: ' + consulta.fr_tipo);
if (consulta.pas != null || consulta.pam != null || consulta.pad != null)
  constLines.push('PAS/PAM/PAD: ' + [consulta.pas, consulta.pam, consulta.pad].map(function (x) { return x == null ? '-' : x; }).join('/') + ' mmHg');
if (consulta.mucosas) constLines.push('Mucosas: ' + consulta.mucosas);
if (constLines.length) t += 'CONSTANTES FISIOLOGICAS\n' + L + '\n' + constLines.join('\n') + '\n\n';

// ===== Sprint 8.0 (2c) - EXAMEN CLÍNICO =====
// Mismo orden que el SPA. Vacío/null no se imprime. Mucosas y FR ya salen en
// CONSTANTES FISIOLOGICAS, no se repiten acá.
const examLines = [];
function agregarExamen(etiqueta, valor) {
  if (valor != null && String(valor).trim() !== '') examLines.push(etiqueta + ': ' + valor);
}
const auscCardiaca = Array.isArray(examen.auscultacion_cardiaca) ? examen.auscultacion_cardiaca.filter(Boolean) : [];
const soplos = (Array.isArray(examen.soplos) ? examen.soplos : [])
  .slice()
  .sort(function (a, b) { return (a.orden ?? 0) - (b.orden ?? 0); })
  .map(function (s) { return [s.momento, s.foco, s.intensidad].filter(Boolean).join(' '); })
  .filter(Boolean)
  .map(function (s) { return ('SOPLO ' + s).toUpperCase(); });
agregarExamen('Sensorio', examen.sensorio);
agregarExamen('Pulso femoral', examen.pulso_femoral);
agregarExamen('Reflejo tusígeno', examen.reflejo_tusigeno);
agregarExamen('Hidratación', examen.hidratacion);
agregarExamen('TLLC', examen.tllc);
agregarExamen('Sucusión', examen.sucusion);
agregarExamen('Auscultación pulmonar - Patrón', examen.auscultacion_pulmonar_patron);
agregarExamen('Auscultación pulmonar - Amplitud', examen.auscultacion_pulmonar_amplitud);
agregarExamen('Auscultación pulmonar - SLTB', examen.auscultacion_pulmonar_sltb);
if (auscCardiaca.length) examLines.push('Auscultación cardíaca: ' + auscCardiaca.join(', '));
soplos.forEach(function (s) { examLines.push(s); });
if (examLines.length) t += 'EXAMEN CLÍNICO\n' + L + '\n' + examLines.join('\n') + '\n\n';

if (consulta.resumen) t += 'RESUMEN DE ANAMNESIS\n' + L + '\n' + consulta.resumen + '\n\n';

if (valoresMedidos.length) {
  t += 'ECOCARDIOGRAFIA - VALORES MEDIDOS\n' + L + '\n';
  valoresMedidos.forEach(function (c) { t += c.nombreMostrar + ': ' + c.valor + (c.unidad ? ' ' + c.unidad : '') + '\n'; });
  t += '\n';
}
if (valoresIndexados.length) {
  t += 'ECOCARDIOGRAFIA - INDICES / CALCULADOS\n' + L + '\n';
  valoresIndexados.forEach(function (c) { t += c.nombreMostrar + ': ' + c.valor + (c.unidad ? ' ' + c.unidad : '') + '\n'; });
  t += '\n';
}
if (ecoPulmonar.length) {
  t += 'ECOGRAFÍA PULMONAR\n' + L + '\n' + ecoPulmonar.map(function (h) { return '- ' + h; }).join('\n') + '\n\n';
}
if (interpLines.length) t += 'INTERPRETACIÓN DIAGNÓSTICA\n' + L + '\n' + interpLines.join('\n') + '\n\n';

if (consulta.diagnostico) t += 'DIAGNOSTICO\n' + L + '\n' + consulta.diagnostico + '\n\n';
if (consulta.indicaciones) t += 'INDICACIONES\n' + L + '\n' + consulta.indicaciones + '\n\n';

// 8.7p: TRATAMIENTO, una linea por farmaco de payload.medicacion (medicamento,
// dosis, intervalo y estado). Los eliminados no viajan en el payload. Las filas
// sin nombre de farmaco no se muestran (tampoco se guardan en Supabase).
const ETIQUETAS_ESTADO_MEDICACION = { continua: 'Continúa', nueva: 'Nueva', modificada: 'Modificada' };
const medicacion = (Array.isArray(payload.medicacion) ? payload.medicacion : [])
  .filter(function (m) { return m && String(m.medicamento || '').trim() !== ''; });
if (medicacion.length) {
  t += 'TRATAMIENTO\n' + L + '\n' + medicacion.map(function (m) {
    const datos = [m.medicamento, m.dosis, m.frecuencia]
      .map(function (x) { return String(x == null ? '' : x).trim(); })
      .filter(Boolean).join(' - ');
    const estado = ETIQUETAS_ESTADO_MEDICACION[m.estado] || '';
    return '- ' + datos + (estado ? ' (' + estado + ')' : '');
  }).join('\n') + '\n\n';
}

// firma_index: indice de Google Docs (base 1) donde va la imagen de la firma,
// en la linea que sigue a la matricula. NO es doc_content_length: ese
// indice caeria despues del pie de pagina.
//
// 8.7d: la fecha se repite abajo, en la misma linea de la firma y sobre el
// margen opuesto. El contenido es texto plano y la API de Docs no deja definir
// tabulaciones, asi que se llega con las tabulaciones por defecto (cada 36 pt):
// el ancho util en A4 es 451 pt y "Fecha: dd/mm/aaaa" ocupa ~92 pt, por lo que
// empieza en 324 pt = 9 tabulaciones desde el margen. La imagen de la firma
// (200 pt de ancho) va al inicio de esa linea y ocupa 5 de esas paradas.
const TAB_FECHA_SIN_FIRMA = 9;
const TAB_FECHA_CON_FIRMA = 4;
const fechaAlPie = function (conFirma) {
  return '\t'.repeat(conFirma ? TAB_FECHA_CON_FIRMA : TAB_FECHA_SIN_FIRMA) + 'Fecha: ' + fecha;
};
let firma_index = null;
if (profesional.nombre || profesional.apellido) {
  t += 'FIRMA DEL PROFESIONAL\n' + L + '\n';
  t += 'Dr. ' + (profesional.nombre || '') + ' ' + (profesional.apellido || '') + '\n';
  t += 'Veterinario\n';
  if (profesional.especialidad) t += profesional.especialidad + '\n';
  const matsFirma = matriculasTexto(profesional);
  if (matsFirma) t += 'Matrícula: ' + matsFirma + '\n';
  firma_index = 1 + t.length;
  t += fechaAlPie(Boolean(profesional.firma_url)) + '\n\n';
} else {
  t += fechaAlPie(false) + '\n\n';
}

t += L + '\nGenerado automaticamente por el sistema de ingesta MyVete.\n';


// ===== SPRINT 6 v2 - parseo de tutor y nombres de archivo PDF =====
const _rawTutor = (tutor.nombre || '').trim();
let apellidoTutor = '', nombreTutor = '';
if (_rawTutor.includes(',')) {
  apellidoTutor = _rawTutor.split(',')[0].trim();
  nombreTutor   = _rawTutor.split(',').slice(1).join(',').trim();
} else {
  nombreTutor = _rawTutor;   // sin coma: todo va a "nombre", apellido queda vacio
}
const _norm = (s) => (s || '')
  .toUpperCase()
  .replace(/[ÁÀÄÂ]/g, 'A')
  .replace(/[ÉÈËÊ]/g, 'E')
  .replace(/[ÍÌÏÎ]/g, 'I')
  .replace(/[ÓÒÖÔ]/g, 'O')
  .replace(/[ÚÙÜÛ]/g, 'U')
  .replace(/[^A-ZÑ0-9]/g, '');
const _MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const _hoy = new Date();
const mesAnio = _MESES[_hoy.getMonth()] + ' ' + _hoy.getFullYear();
const _basePrefix = _norm(paciente) + _norm(apellidoTutor);
const nombrePdfBase         = (_basePrefix + ' ' + mesAnio).trim();
const nombrePdfDesambiguado = (_basePrefix + ' (' + _norm(nombreTutor) + ') ' + mesAnio).trim();

return [{ json: {
  paciente: paciente,
  nombreTutor: nombreTutor,
  apellidoTutor: apellidoTutor,
  mesAnio: mesAnio,
  nombrePdfBase: nombrePdfBase,
  nombrePdfDesambiguado: nombrePdfDesambiguado,
  especie: mascota.especie || 'N/D',
  raza: mascota.raza || 'N/D',
  peso: peso == null ? 'N/D' : peso,
  tutor: tutor.nombre || 'N/D',
  telefono: tutor.telefono || 'N/D',
  email: email,
  email_recibido: emailRecibido,
  email_corregido: revisionEmail.estado === 'corregido',
  motivo: consulta.motivo || '',
  fc: consulta.fc, fr: consulta.fr, fr_tipo: consulta.fr_tipo, pas: consulta.pas, pam: consulta.pam, pad: consulta.pad,
  mucosas: consulta.mucosas || 'N/D',
  diagnostico: consulta.diagnostico || '',
  indicaciones: consulta.indicaciones || '',
  resumen: consulta.resumen || '',
  valoresMedidos: valoresMedidos,
  valoresIndexados: valoresIndexados,
  scores: scores,
  fecha: fecha,
  doc_content: t,
  doc_content_length: t.length,
  firma_index: firma_index,
  profesional: profesional,
}}];