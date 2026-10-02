// 8.7f (2026-10-02) - verificación final del informe: ¿se envió el mail Y se
// guardó el PDF? Código del nodo 'Verificación final' (copia de referencia; el
// vivo es el del workflow lkOwTFmVTZu7EMoU).
//
// Motivo: en el E2E del 2026-10-02 (ejecución 3050) la subida a Drive falló por
// cuota (403) y, como los nodos de Drive siguen de largo con el error
// (onError: continueRegularOutput), la ejecución terminó "Succeeded", la
// planilla dijo OK sin link y el Google Doc se borró igual.
//
// Corre al final de la rama del mail. La rama de Drive sale del mismo nodo
// ('Exportar PDF (autenticado)') y está ubicada ARRIBA en el lienzo: con
// executionOrder v1 termina antes de que arranque esta. Si ese orden se
// rompiera, los nodos de Drive se leerían como "no ejecutado" y el resultado
// sería FALLO (falla hacia el lado seguro: no se borra el Doc).
const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
const j = (nm) => {
  const salida = safe(() => $(nm).first(0).json);
  return salida !== undefined ? salida : safe(() => $(nm).item.json);
};
const rowId = (o) => o && (o.id || (Array.isArray(o) && o[0] && o[0].id));
const textoError = (o) => {
  if (!o || !o.error) return '';
  const e = o.error;
  const crudo = typeof e === 'string' ? e : (e.description || e.message || JSON.stringify(e));
  // Google devuelve HTML en algunos errores (404): no va a la planilla.
  const limpio = /<html|<!doctype/i.test(crudo) ? (e.message || 'error HTTP') : crudo;
  return String(limpio).replace(/\s+/g, ' ').slice(0, 220).replace(/[.\s]+$/, '');
};
const esCuota = (o) => /quota|rateLimit|RATE_LIMIT/i.test(JSON.stringify((o && o.error) || ''));

const prep = j('Preparar Datos para PDF') || {};
const atn  = j('Insert Atención Cardiología');
const doc  = j('Crear Google Doc') || {};
const sub  = j('Guardar PDF en Drive (subir)');
const drv  = j('Nombrar y mover PDF');
const ren  = j('Renombrar PDF (colisión)');
const mail = j('Enviar informe al tutor');
const reb  = j('Buscar rebote inmediato');

// --- PDF en Drive -----------------------------------------------------------
const archivoFinal = (ren && ren.webViewLink) ? ren : (drv && drv.webViewLink ? drv : null);
const nombrePdf = archivoFinal ? (archivoFinal.name || '') : '';
const linkPdf = archivoFinal ? archivoFinal.webViewLink : '';
const pdfOk = Boolean(sub && sub.id && linkPdf);

let pdfError = '';
if (!pdfOk) {
  if (sub === undefined) pdfError = 'la subida no se ejecutó';
  else if (!sub.id) pdfError = (esCuota(sub) ? 'error de cuota de Google: ' : 'falló la subida: ') + (textoError(sub) || 'sin detalle');
  else if (drv === undefined) pdfError = 'se subió (id ' + sub.id + ') pero no se nombró ni se movió a la carpeta';
  else pdfError = 'se subió (id ' + sub.id + ') pero falló al nombrar/mover: ' + (textoError(drv) || 'sin detalle');
}

// --- Mail al tutor ----------------------------------------------------------
const emailTutor = (prep.email && prep.email !== 'N/D') ? String(prep.email) : '';
const mailAplica = Boolean(emailTutor);
// Envío: Gmail devuelve un id cuando acepta el mensaje.
const mailEnviado = Boolean(mail && !mail.error && mail.id);
// Rebote inmediato: mail de mailer-daemon "Delivery Status Notification
// (Failure)" en la casilla que envía. Los "(Delay)" no se miran: llegan tarde.
const reboteVerificado = Boolean(reb && !reb.error);
const mailRebote = reboteVerificado && Array.isArray(reb.messages) && reb.messages.length > 0;

let mailError = '';
if (mailAplica && !mailEnviado) {
  mailError = mail === undefined ? 'el envío no se ejecutó' : (textoError(mail) || 'Gmail no devolvió el id del mensaje');
} else if (mailRebote) {
  mailError = 'rebotó (Delivery Status Notification - Failure) para ' + emailTutor;
}
// Tutor sin email: no hay mail que enviar, no cuenta como fallo.
const mailOk = mailAplica ? (mailEnviado && !mailRebote) : true;

// --- Supabase ---------------------------------------------------------------
const persistio = Boolean(rowId(atn));

// --- Resultado --------------------------------------------------------------
const observaciones = [];
if (!persistio) observaciones.push('Atención no guardada en Supabase.');
if (!pdfOk) observaciones.push('PDF no guardado en Drive (' + pdfError + ').');
if (!mailAplica) observaciones.push('Tutor sin email: informe no enviado.');
else if (!mailOk) observaciones.push('Mail al tutor: ' + mailError + '.');
else if (!reboteVerificado) observaciones.push('Mail enviado; no se pudo verificar el rebote.');

const informeOk = mailOk && pdfOk;
const documentId = doc.documentId || '';
const docLink = documentId ? 'https://docs.google.com/document/d/' + documentId + '/edit' : '';
if (!informeOk && docLink) observaciones.push('Google Doc conservado: ' + docLink);

const paciente = prep.paciente || 'paciente s/d';
const fecha = prep.fecha || new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });

const alertaDriveCuerpo = [
  'El PDF del informe no se pudo guardar en Drive.',
  '',
  'Paciente: ' + paciente + '.',
  'Error: ' + (pdfError || 's/d') + '.',
  '',
  'Tutor: ' + (prep.tutor || 's/d'),
  'Fecha: ' + fecha,
  'Mail al tutor: ' + (!mailAplica ? 'no aplica (tutor sin email)' : mailOk ? 'ENVIADO' : 'FALLO - ' + mailError),
  docLink
    ? 'El Google Doc del informe NO se borró. Para recuperarlo: abrir ' + docLink + ' y descargarlo como PDF.'
    : 'No hay Google Doc para recuperar el informe.',
].join('\n');

return [{
  json: {
    fecha,
    paciente,
    tutor: prep.tutor || '',
    nombre_pdf_final: nombrePdf,
    link_pdf_final: linkPdf,
    estado_final: (persistio && informeOk) ? 'OK' : 'FALLO',
    observaciones: observaciones.join(' '),
    informe_ok: informeOk,
    pdf_ok: pdfOk,
    pdf_error: pdfError,
    mail_aplica: mailAplica,
    mail_enviado: mailEnviado,
    mail_rebote: mailRebote,
    rebote_verificado: reboteVerificado,
    mail_ok: mailOk,
    mail_error: mailError,
    persistio,
    documentId,
    doc_link: docLink,
    alerta_drive_asunto: 'El PDF del informe no se pudo guardar en Drive',
    alerta_drive_cuerpo: alertaDriveCuerpo,
  },
  pairedItem: { item: 0 },
}];
