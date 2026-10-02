// 8.7h (2026-10-02) - código del nodo 'Evaluar rebote' (copia de referencia; el
// vivo es el del workflow lkOwTFmVTZu7EMoU).
//
// Loop de verificación del rebote (solo se entra si Gmail aceptó el mail):
//   Iniciar verificación de rebote -> IF - ¿Gmail aceptó el mail?
//     -> Esperar rebote (20 s) -> Buscar rebote inmediato -> Evaluar rebote
//     -> IF - ¿Seguir esperando rebote?
//          true  -> Esperar rebote (otra vuelta)
//          false -> Verificación final
//
// Sale del loop si:
//   - apareció un rebote;
//   - la búsqueda falló con un error que no va a cambiar (400, 401 o 403 que no
//     sea de cuota): en la primera;
//   - la búsqueda falló 3 veces seguidas por algo pasajero (cuota, 429, 5xx, red);
//   - se cumplió la ventana de 2 minutos desde el envío (unas 6 vueltas). Sin
//     rebote en la ventana, el mail se da por entregado.
// En las dos salidas por fallo de la búsqueda, si ninguna búsqueda anduvo, la
// planilla anota "no se pudo verificar el rebote".
//
// El rebote se decide con la búsqueda de esta vuelta ($input): como la búsqueda
// mira siempre desde la hora del envío, un rebote que ya llegó sigue apareciendo.
// Las corridas anteriores de 'Buscar rebote inmediato' ($runIndex de este nodo =
// vueltas anteriores) solo se leen para contar búsquedas buenas y fallos seguidos.
const VENTANA_MS = 2 * 60 * 1000;
const ESPERA_MS = 20 * 1000;
// Margen por lo que tardan las búsquedas: sin él, la 6.ª vuelta no entra.
const TOLERANCIA_MS = 5 * 1000;
const MAX_FALLOS_SEGUIDOS = 3;
const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
const textoError = (o) => {
  const e = o && o.error;
  if (!e) return '';
  const crudo = typeof e === 'string' ? e : (e.description || e.message || JSON.stringify(e));
  return String(crudo).replace(/\s+/g, ' ').slice(0, 200);
};
// Código HTTP del error: n8n lo deja en error.httpCode o al principio de
// error.cause.message ("403 - {...}").
const codigoHttp = (o) => {
  const e = (o && o.error) || {};
  if (typeof e !== 'object') return 0;
  const directo = Number(e.httpCode || e.status || (e.cause && e.cause.status));
  if (directo) return directo;
  const m = /^\s*(\d{3})\b/.exec(String((e.cause && e.cause.message) || ''));
  return m ? Number(m[1]) : 0;
};
const esCuota = (o) => /quota|rateLimit|RATE_LIMIT/i.test(JSON.stringify((o && o.error) || ''));
// 'ok' | 'permanente' | 'transitorio'
const clasificar = (o) => {
  if (o && !o.error) return 'ok';
  const codigo = codigoHttp(o);
  if ([400, 401, 403].includes(codigo) && !esCuota(o)) return 'permanente';
  return 'transitorio';
};

const ini = safe(() => $('Iniciar verificación de rebote').first(0).json) || {};
const t0 = Number(ini.t0) || Date.now();
const anteriores = Number.isInteger($runIndex) ? $runIndex : 0;
const vueltas = anteriores + 1;

let exitosas = 0;
let fallidas = 0;
let fallosSeguidos = 0;
for (let r = 0; r < anteriores; r++) {
  const o = safe(() => $('Buscar rebote inmediato').first(0, r).json);
  if (o === undefined) continue; // corrida que no se pudo leer: no cuenta
  if (clasificar(o) === 'ok') { exitosas++; fallosSeguidos = 0; }
  else { fallidas++; fallosSeguidos++; }
}

const actual = safe(() => $input.first().json);
const tipo = clasificar(actual);
let rebote = false;
let mensajes = [];
let ultimoError = '';
if (tipo === 'ok') {
  exitosas++;
  fallosSeguidos = 0;
  if (Array.isArray(actual.messages) && actual.messages.length > 0) {
    rebote = true;
    mensajes = actual.messages;
  }
} else {
  fallidas++;
  fallosSeguidos++;
  ultimoError = textoError(actual) || 'la búsqueda no devolvió datos';
}

const transcurridoMs = Date.now() - t0;
let motivo = '';
if (!ini.envio_ok) motivo = 'mail no aceptado por Gmail';
else if (rebote) motivo = 'rebote';
else if (tipo === 'permanente') motivo = 'la búsqueda de rebote falló con un error que no se resuelve reintentando';
else if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) motivo = 'la búsqueda de rebote falló ' + fallosSeguidos + ' veces seguidas';
else if (transcurridoMs + ESPERA_MS > VENTANA_MS + TOLERANCIA_MS) motivo = 'sin rebote en 2 minutos';

return [{
  json: {
    seguir: motivo === '',
    rebote,
    verificado: exitosas > 0,
    vueltas,
    busquedas_ok: exitosas,
    busquedas_fallidas: fallidas,
    fallos_seguidos: fallosSeguidos,
    ultimo_error: ultimoError,
    transcurrido_s: Math.round(transcurridoMs / 1000),
    motivo_salida: motivo,
    messages: mensajes,
  },
  pairedItem: { item: 0 },
}];
