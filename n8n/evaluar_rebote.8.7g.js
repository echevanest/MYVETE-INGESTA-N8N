// 8.7g (2026-10-02) - código del nodo 'Evaluar rebote' (copia de referencia; el
// vivo es el del workflow lkOwTFmVTZu7EMoU).
//
// Loop de verificación del rebote:
//   Iniciar verificación de rebote -> Esperar rebote (20 s) -> Buscar rebote
//   inmediato -> Evaluar rebote -> IF - ¿Seguir esperando rebote?
//     true  -> Esperar rebote (otra vuelta)
//     false -> Verificación final
//
// Sale del loop si: Gmail no aceptó el mail (no hay nada que esperar), apareció
// un rebote, o pasaron 10 minutos desde el envío. Sin rebote en 10 minutos, el
// mail se da por entregado.
//
// El rebote se decide con la búsqueda de esta vuelta ($input): como la búsqueda
// mira siempre desde la hora del envío, un rebote que ya llegó sigue apareciendo.
// Las corridas anteriores de 'Buscar rebote inmediato' ($runIndex de este nodo =
// vueltas anteriores) solo se leen para saber si alguna búsqueda anduvo: una que
// falla al final no tapa las buenas de antes.
const LIMITE_MS = 10 * 60 * 1000;
const ESPERA_MS = 20 * 1000;
const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
const textoError = (o) => {
  const e = o && o.error;
  if (!e) return '';
  const crudo = typeof e === 'string' ? e : (e.description || e.message || JSON.stringify(e));
  return String(crudo).replace(/\s+/g, ' ').slice(0, 200);
};

const ini = safe(() => $('Iniciar verificación de rebote').first(0).json) || {};
const t0 = Number(ini.t0) || Date.now();
const anteriores = Number.isInteger($runIndex) ? $runIndex : 0;
const vueltas = anteriores + 1;

let exitosas = 0;
let fallidas = 0;
let ultimoError = '';
let rebote = false;
let mensajes = [];
const mirar = (o) => {
  if (!o || o.error) {
    fallidas++;
    ultimoError = textoError(o) || 'la búsqueda no devolvió datos';
    return;
  }
  exitosas++;
  if (Array.isArray(o.messages) && o.messages.length > 0) {
    rebote = true;
    mensajes = o.messages;
  }
};
for (let r = 0; r < anteriores; r++) {
  mirar(safe(() => $('Buscar rebote inmediato').first(0, r).json));
}
mirar(safe(() => $input.first().json));

const transcurridoMs = Date.now() - t0;
// Otra vuelta solo si todavía entra entera (espera + búsqueda) en los 10 minutos.
const seguir = Boolean(ini.envio_ok) && !rebote && (transcurridoMs + ESPERA_MS < LIMITE_MS);

return [{
  json: {
    seguir,
    rebote,
    verificado: exitosas > 0,
    vueltas,
    busquedas_ok: exitosas,
    busquedas_fallidas: fallidas,
    ultimo_error: ultimoError,
    transcurrido_s: Math.round(transcurridoMs / 1000),
    motivo_salida: seguir ? '' : !ini.envio_ok ? 'mail no aceptado por Gmail' : rebote ? 'rebote' : 'sin rebote en 10 minutos',
    messages: mensajes,
  },
  pairedItem: { item: 0 },
}];
