// Tests de la interpretación diagnóstica (8.7b), del parser del PDF de eco y de
// los índices calculados (unidades 8.7d: lineales en mm).
// Corre con: node --test tests/
//
// app.js es un script de navegador (toca el DOM al cargar), así que acá se
// recortan solo las secciones puras, entre los marcadores
// `// >>> CLASIFICACION-PURA` / `// <<< CLASIFICACION-PURA`,
// `// >>> PARSER-ECO-PURO` / `// <<< PARSER-ECO-PURO` e
// `// >>> INDICES-ECO-PUROS` / `// <<< INDICES-ECO-PUROS`, y se corren en un
// contexto aislado de `vm`. Los umbrales salen de CRITERIOS DE CLASIFICACION.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fuente = readFileSync(new URL('../interface/app.js', import.meta.url), 'utf8');

function recortar(marca) {
  const inicio = fuente.indexOf(`// >>> ${marca}`);
  const fin = fuente.indexOf(`// <<< ${marca}`);
  assert.ok(inicio !== -1 && fin > inicio, `marcadores ${marca} en app.js`);
  return fuente.slice(inicio, fin);
}

const contexto = vm.createContext({});
vm.runInContext(recortar('PARSER-ECO-PURO'), contexto);
vm.runInContext(recortar('INDICES-ECO-PUROS'), contexto);
vm.runInContext(recortar('CLASIFICACION-PURA'), contexto);
const {
  calcularACVIM, calcularMINE2, calcularHP, calcularClasificaciones,
  evaluarSignosHP, detectarAscitis, extraerDatosEcocardiografia, calcularIndicesEco, r2,
} = contexto;

// ctx base: perro con soplo mitral, sin datos.
function ctx({ especie = 'canino', soplos = [{ foco: 'Mitral' }], eco = {}, manual = {}, anamnesis = null, historial = null } = {}) {
  return { especie, soplos, eco, manual: { hp_seccion: 'auto', ...manual }, anamnesis, historial };
}

// Objetos creados dentro del contexto vm tienen otro prototipo: se comparan
// como JSON.
const plano = (x) => JSON.parse(JSON.stringify(x));

// --- Redondeo ------------------------------------------------------------------
test('r2 redondea a 2 decimales sin error binario', () => {
  assert.equal(r2(1.905), 1.91);
  assert.equal(r2(2.005), 2.01);
  assert.equal(r2(1.004), 1);
});

// --- ACVIM ---------------------------------------------------------------------
test('ACVIM: B2 exige LA/Ao ≥ 1.60 y LVIDDN ≥ 1.70', () => {
  const b = (laAo, lviddn) => calcularACVIM(ctx({ eco: { ai_ao_lineal: laAo, dvid_indexado: lviddn } }));
  assert.equal(b(1.60, 1.70).valor, 'B2');
  assert.equal(b(1.60, 1.70).origen, 'calculado');
  assert.equal(b(1.59, 1.70).valor, 'B1');
  assert.equal(b(1.60, 1.69).valor, 'B1');
  assert.equal(b(1.595, 1.70).valor, 'B2', '1.595 redondea a 1.60');
});

test('ACVIM: felino → null', () => {
  assert.equal(calcularACVIM(ctx({ especie: 'felino', eco: { ai_ao_lineal: 2, dvid_indexado: 2 } })), null);
});

test('ACVIM: sin soplo mitral → null', () => {
  assert.equal(calcularACVIM(ctx({ soplos: [] })), null);
  assert.equal(calcularACVIM(ctx({ soplos: [{ foco: 'Tricuspídeo' }] })), null);
});

test('ACVIM: sin peso (sin LVIDDN) → estimado + faltante', () => {
  const r = calcularACVIM(ctx({ eco: { ai_ao_lineal: 1.40 } }));
  assert.equal(r.valor, 'B1');
  assert.equal(r.origen, 'estimado');
  assert.deepEqual(plano(r.faltantes), ['LVIDDN']);
  const r2b = calcularACVIM(ctx({ eco: { ai_ao_lineal: 1.80 } }));
  assert.equal(r2b.valor, 'B2', 'el único criterio disponible coincide con B2');
});

test('ACVIM: historial = null → salta "última consulta"', () => {
  const r = calcularACVIM(ctx({ historial: null }));
  assert.equal(r.origen, 'estimado');
  assert.equal(r.valor, 'B1');
  assert.deepEqual(plano(r.faltantes), ['LA/Ao', 'LVIDDN']);
});

test('ACVIM: con historial y un faltante → última consulta', () => {
  const r = calcularACVIM(ctx({ eco: { ai_ao_lineal: 1.4 }, historial: { acvim_estadio: 'B2' } }));
  assert.equal(r.valor, 'B2');
  assert.equal(r.origen, 'ultima_consulta');
});

test('ACVIM: historial C/D nunca baja a B', () => {
  const datosB1 = { ai_ao_lineal: 1.2, dvid_indexado: 1.3 };
  assert.equal(calcularACVIM(ctx({ eco: datosB1, historial: { acvim_estadio: 'C' } })).valor, 'C');
  assert.equal(calcularACVIM(ctx({ eco: datosB1, historial: { acvim_estadio: 'D' } })).valor, 'D');
});

test('ACVIM: prellenado C con edema documentado', () => {
  const datosB1 = { ai_ao_lineal: 1.2, dvid_indexado: 1.3 };
  const porEco = calcularACVIM(ctx({
    eco: datosB1,
    manual: { eco_pulmonar_hallazgos: ['Síndrome alveolointersticial coalescente (líneas B en cortina)'] },
  }));
  assert.equal(porEco.valor, 'C');
  assert.equal(porEco.origen, 'estimado');
  const nodulo = calcularACVIM(ctx({ eco: datosB1, manual: { eco_pulmonar_hallazgos: ['Signo de nódulo'] } }));
  assert.equal(nodulo.valor, 'B1', 'el signo de nódulo no suma');
  assert.equal(calcularACVIM(ctx({ eco: { ...datosB1, efusion_pleural: 'Leve' } })).valor, 'C');
  assert.equal(calcularACVIM(ctx({ eco: { ...datosB1, efusion_pleural: 'No' } })).valor, 'B1');
  assert.equal(calcularACVIM(ctx({ eco: datosB1, anamnesis: 'Abdomen distendido con ascitis.' })).valor, 'C');
  assert.equal(calcularACVIM(ctx({ eco: datosB1, anamnesis: 'Sin ascitis ni edemas.' })).valor, 'B1');
});

test('ACVIM: el selector manual pisa todo', () => {
  const r = calcularACVIM(ctx({ eco: { ai_ao_lineal: 1.2, dvid_indexado: 1.3 }, manual: { acvim_estadio: 'D' } }));
  assert.equal(r.valor, 'D');
  assert.equal(r.origen, 'manual');
});

test('detectarAscitis: negaciones en las 3 palabras previas', () => {
  assert.equal(detectarAscitis('Presenta ascitis moderada'), true);
  assert.equal(detectarAscitis('no se observa ascitis'), false);
  assert.equal(detectarAscitis('Líquido libre abdominal'), true);
  assert.equal(detectarAscitis('niega efusión abdominal'), false);
  assert.equal(detectarAscitis(null), false);
});

// --- MINE 2 --------------------------------------------------------------------
function mine2(eco, extra = {}) {
  return calcularMINE2(ctx({ eco, ...extra }));
}
// Base con 1 punto en las variables que no se prueban.
const baseMine2 = { ai_ao_lineal: 1.0, dvid_indexado: 1.0, velocidad_e_mitral: 100 };

test('MINE 2: LA/Ao 1.60 / 1.70 / 1.90 / 1.905 / 1.91 / 2.50', () => {
  const p = (v) => mine2({ ...baseMine2, ai_ao_lineal: v }).datos_usados.puntos.laAo;
  assert.equal(p(1.60), 1);
  assert.equal(p(1.70), 2);
  assert.equal(p(1.90), 2);
  assert.equal(p(1.905), 3, '1.905 → 1.91 (> 1.90)');
  assert.equal(p(1.91), 3);
  assert.equal(p(2.50), 3);
  assert.equal(p(2.51), 4);
});

test('MINE 2: LVIDDN 2.00 / 2.005 / 2.30', () => {
  const p = (v) => mine2({ ...baseMine2, dvid_indexado: v }).datos_usados.puntos.lviddn;
  assert.equal(p(1.69), 1);
  assert.equal(p(2.00), 2);
  assert.equal(p(2.005), 3, '2.005 → 2.01 (> 2.00)');
  assert.equal(p(2.30), 3);
  assert.equal(p(2.31), 4);
});

test('MINE 2: E 119 / 120 / 150 / 151 cm/s', () => {
  const p = (v) => mine2({ ...baseMine2, velocidad_e_mitral: v }).datos_usados.puntos.eVel;
  assert.equal(p(119), 1);
  assert.equal(p(120), 2);
  assert.equal(p(150), 2);
  assert.equal(p(151), 3);
});

test('MINE 2: severidad, "B2 avanzado" y no aplica en C/felino', () => {
  const r = mine2({ ai_ao_lineal: 2.6, dvid_indexado: 2.4, velocidad_e_mitral: 160 });
  assert.equal(r.valor, 11);
  assert.equal(r.clasificacion, 'tardio');
  const severo = mine2({ ai_ao_lineal: 2.0, dvid_indexado: 2.1, velocidad_e_mitral: 130 });
  assert.equal(severo.valor, 3 + 3 + 2);
  assert.equal(severo.clasificacion, 'severo');
  assert.equal(severo.b2_avanzado, true);
  assert.equal(mine2(baseMine2).clasificacion, 'leve');
  assert.equal(calcularMINE2(ctx({ eco: baseMine2, manual: { acvim_estadio: 'C' } })), null);
  assert.equal(calcularMINE2(ctx({ especie: 'felino', eco: baseMine2 })), null);
});

// 8.7i: en C o D la medicación y los signos clínicos alteran las variables.
test('MINE 2: solo B1/B2 — no se calcula en C ni en D, sea cual sea el origen', () => {
  const datosB2 = { ai_ao_lineal: 2.0, dvid_indexado: 2.1, velocidad_e_mitral: 130 };
  const datosB1 = { ai_ao_lineal: 1.2, dvid_indexado: 1.3, velocidad_e_mitral: 100 };
  assert.equal(mine2(datosB1).valor, 3, 'B1 calculado → se calcula');
  assert.equal(mine2(datosB2).valor, 8, 'B2 calculado → se calcula');
  ['B1', 'B2'].forEach((estadio) => {
    assert.notEqual(mine2(datosB2, { manual: { acvim_estadio: estadio } }), null, `${estadio} manual`);
  });
  ['C', 'D'].forEach((estadio) => {
    assert.equal(mine2(datosB2, { manual: { acvim_estadio: estadio } }), null, `${estadio} manual`);
    assert.equal(mine2(datosB2, { historial: { acvim_estadio: estadio, mine2_puntaje: 8 } }), null, `${estadio} de la última consulta`);
    assert.equal(calcularMINE2({ ...ctx({ eco: datosB2 }), estadioACVIM: estadio }), null, `${estadio} pasado en ctx`);
  });
  // C prellenado por edema documentado (estimado).
  assert.equal(mine2({ ...datosB2, efusion_pleural: 'Leve' }), null);
  const todo = calcularClasificaciones(ctx({ eco: datosB2, manual: { acvim_estadio: 'D' } }));
  assert.equal(todo.acvim.valor, 'D');
  assert.equal(todo.mine2, null);
});

test('MINE 2: una variable faltante → coherencia (promedio hacia arriba)', () => {
  // LA/Ao 3 puntos, LVIDDN 2 puntos → E recibe ceil(2.5) = 3 (máx. de E = 3).
  const r = mine2({ ai_ao_lineal: 2.0, dvid_indexado: 1.8 });
  assert.equal(r.origen, 'estimado');
  assert.deepEqual(plano(r.faltantes), ['velocidad E mitral']);
  assert.equal(r.datos_usados.puntos_estimados.eVel, 3);
  assert.equal(r.valor, 3 + 2 + 3);
  // Tope: LA/Ao 4 y LVIDDN 4 → E recibe min(4, 3) = 3.
  assert.equal(mine2({ ai_ao_lineal: 2.6, dvid_indexado: 2.4 }).datos_usados.puntos_estimados.eVel, 3);
});

test('MINE 2: todas faltantes → 1 punto cada una', () => {
  const r = mine2({});
  assert.equal(r.valor, 3);
  assert.equal(r.clasificacion, 'leve');
  assert.equal(r.origen, 'estimado');
});

test('MINE 2: faltante con historial → última consulta', () => {
  const r = mine2({ ai_ao_lineal: 2.0 }, { historial: { mine2_puntaje: 6, mine2_clasificacion: 'moderado' } });
  assert.equal(r.valor, 6);
  assert.equal(r.origen, 'ultima_consulta');
});

// --- HP ------------------------------------------------------------------------
function hp(eco, manual = {}, extra = {}) {
  return calcularHP(ctx({ eco, manual, ...extra }));
}

test('HP: TRV 300 / 301 / 340 / 341 cm/s (alerta y franjas)', () => {
  assert.equal(hp({ vmax_tricuspideo: 300 }), null, '3.00 no es > 3.0: sin alerta, sección vacía');
  assert.equal(hp({ vmax_tricuspideo: 301 }).valor, 'intermedia');
  assert.equal(hp({ vmax_tricuspideo: 340 }).valor, 'intermedia');
  const alto = hp({ vmax_tricuspideo: 341, at_pulmonar: 50 });
  assert.equal(alto.valor, 'alta', '> 3.4 con 1 sitio');
  assert.equal(hp({ vmax_tricuspideo: 341 }).valor, 'intermedia', '> 3.4 con 0 sitios');
  assert.equal(hp({ vmax_tricuspideo: 300 }, { hp_seccion: 'habilitada' }).valor, 'baja');
});

test('HP: AT 57 / 58 ms', () => {
  assert.equal(evaluarSignosHP(ctx({ eco: { at_pulmonar: 57 } })).items.sitio2.at_pulmonar, true);
  assert.equal(evaluarSignosHP(ctx({ eco: { at_pulmonar: 58 } })).items.sitio2.at_pulmonar, false);
});

test('HP: AT:ET 0.29 / 0.30 y calculado desde AT/ET', () => {
  assert.equal(evaluarSignosHP(ctx({ eco: { at_et_pulmonar: 0.29 } })).items.sitio2.at_et_pulmonar, true);
  assert.equal(evaluarSignosHP(ctx({ eco: { at_et_pulmonar: 0.30 } })).items.sitio2.at_et_pulmonar, false);
  const calc = evaluarSignosHP(ctx({ eco: { at_pulmonar: 60, et_pulmonar: 210 } }));
  assert.equal(calc.valores.at_et_pulmonar, 0.29);
  assert.equal(calc.items.sitio2.at_et_pulmonar, true);
  assert.equal(evaluarSignosHP(ctx({ eco: { at_pulmonar: 60, et_pulmonar: 200 } })).items.sitio2.at_et_pulmonar, false);
});

test('HP: morfología Tipo I no cuenta; Tipo III (notching) sí', () => {
  assert.equal(evaluarSignosHP(ctx({ manual: { morfo_pulmonar: 'Aortisada Tipo I' } })).items.sitio2.notching, false);
  assert.equal(evaluarSignosHP(ctx({ manual: { morfo_pulmonar: 'Aortisada Tipo III' } })).items.sitio2.notching, true);
  const e = evaluarSignosHP(ctx({ manual: { morfo_pulmonar: 'Aortisada Tipo III' } }));
  assert.equal(e.alerta, false, 'el notching no es alerta numérica');
});

test('HP: DVD/DVI 0.50…1.01 (dvid y dvdd en mm)', () => {
  // dvid = 40 mm → dvdd = ratio × 40.
  const casos = [[0.50, false], [0.51, false], [0.69, false], [0.70, true], [0.71, true],
    [0.99, true], [1.00, true], [1.01, true]];
  casos.forEach(([ratio, presente]) => {
    const e = evaluarSignosHP(ctx({ eco: { dvid: 40, dvdd: r2(ratio * 40) } }));
    assert.equal(e.valores.dvd_dvi, ratio, `DVD/DVI ${ratio}`);
    assert.equal(e.items.sitio1.dvd_dvi, presente, `DVD/DVI ${ratio}`);
    assert.equal(e.alerta, presente, `alerta con DVD/DVI ${ratio}`);
  });
  const r = hp({ dvid: 40, dvdd: 28 });
  assert.ok(r.advertencias.some((a) => a.includes('DVD/DVI ≥ 0.70')));
});

test('HP: signos no cargados no cuentan', () => {
  const r = hp({ vmax_tricuspideo: 320 });
  assert.equal(r.n_sitios, 0);
  assert.equal(r.sitios_evaluados, 0);
  const e = evaluarSignosHP(ctx({}));
  assert.equal(e.items.sitio1.aplanamiento_septal, undefined);
  assert.equal(e.items.sitio3.dilatacion_ad, undefined);
});

test('HP: 3 sitios + TRV → calculado; 2 de 3 → estimado', () => {
  const signos = { sitio1: { aplanamiento_septal: true }, sitio3: { dilatacion_ad: false } };
  const cerrado = hp({ vmax_tricuspideo: 280, at_pulmonar: 50 }, { hp_seccion: 'habilitada', hp_signos: signos });
  assert.equal(cerrado.origen, 'calculado');
  assert.equal(cerrado.sitios_evaluados, 3);
  assert.equal(cerrado.n_sitios, 2);
  assert.equal(cerrado.valor, 'intermedia');
  const dos = hp({ vmax_tricuspideo: 280, at_pulmonar: 50 },
    { hp_seccion: 'habilitada', hp_signos: { sitio1: { aplanamiento_septal: true } } });
  assert.equal(dos.origen, 'estimado');
  assert.equal(dos.sitios_evaluados, 2);
});

test('HP sin datos (sección habilitada) → baja', () => {
  const r = hp({}, { hp_seccion: 'habilitada' });
  assert.equal(r.valor, 'baja');
  assert.equal(r.origen, 'estimado');
  assert.deepEqual(plano(r.faltantes), ['TRV', 'DVDd', 'DVDs', 'PLVDd', 'PLVDs']);
});

test('HP: sección deshabilitada, ítem deshabilitado y felino', () => {
  assert.equal(hp({ vmax_tricuspideo: 350 }, { hp_seccion: 'deshabilitada' }), null);
  const e = evaluarSignosHP(ctx({ eco: { at_pulmonar: 50 }, manual: { hp_signos: { deshabilitados: ['sitio2.at_pulmonar'] } } }));
  assert.equal(e.items.sitio2.at_pulmonar, false);
  assert.equal(e.alerta, false);
  assert.equal(hp({ vmax_tricuspideo: 350 }, {}, { especie: 'felino' }), null);
});

test('HP: TP/Ao = 1 / ao_ap, RPAD < 30 %, regurgitación > 250 cm/s', () => {
  assert.equal(evaluarSignosHP(ctx({ eco: { ao_ap: 1.0 } })).items.sitio2.tp_ao, false);
  assert.equal(evaluarSignosHP(ctx({ eco: { ao_ap: 0.9 } })).items.sitio2.tp_ao, true);
  assert.equal(evaluarSignosHP(ctx({ eco: { dapd: 29 } })).items.sitio2.rpad, true);
  assert.equal(evaluarSignosHP(ctx({ eco: { dapd: 30 } })).items.sitio2.rpad, false);
  assert.equal(evaluarSignosHP(ctx({ eco: { vel_regurg_pulmonar: 250 } })).items.sitio2.vel_regurg_pulmonar, false);
  assert.equal(evaluarSignosHP(ctx({ eco: { vel_regurg_pulmonar: 251 } })).items.sitio2.vel_regurg_pulmonar, true);
});

test('HP con historial y datos incompletos → última consulta', () => {
  const r = hp({ vmax_tricuspideo: 320 }, {}, { historial: { hp_clasificacion: 'alta' } });
  assert.equal(r.valor, 'alta');
  assert.equal(r.origen, 'ultima_consulta');
});

test('calcularClasificaciones: MINE 2 usa el estadio propuesto por ACVIM', () => {
  const r = calcularClasificaciones(ctx({ eco: { ai_ao_lineal: 2.0, dvid_indexado: 2.1, velocidad_e_mitral: 130 } }));
  assert.equal(r.acvim.valor, 'B2');
  assert.equal(r.mine2.b2_avanzado, true);
  assert.equal(r.hp, null);
});

// --- Parser: velocidades en cm/s ----------------------------------------------
test('Parser: "E Vel VM" (Mindray, cm/s) y conversión m/s → cm/s', () => {
  assert.equal(extraerDatosEcocardiografia('E Vel VM:85.3cm/s').velocidad_e_mitral, 85.3);
  assert.equal(extraerDatosEcocardiografia('E Vel VM: 112 cm/s').velocidad_e_mitral, 112);
  assert.equal(extraerDatosEcocardiografia('Onda E: 0.95 m/s').velocidad_e_mitral, 95);
  assert.equal(extraerDatosEcocardiografia('Onda E: 0,95').velocidad_e_mitral, 95, 'sin unidad y < 10 → m/s');
});

// --- Parser: lineales en mm (8.7d) ----------------------------------------------
test('Parser: lineales en mm; convierte desde cm', () => {
  // Mindray M8 / Vetus E7: cm con la unidad pegada.
  const cm = extraerDatosEcocardiografia('SIVd:0.35cm DIVId:3.11cm PPVId: 0.43 cm Diámetro AI:1.79cm Diámetro aorta:1.18cm');
  assert.equal(cm.sivd, 3.5);
  assert.equal(cm.dvid, 31.1);
  assert.equal(cm.ppvid, 4.3);
  assert.equal(cm.ai_lineal, 17.9);
  assert.equal(cm.ao_lineal, 11.8);
  // Mindray M6Vet / Cube-Teich: ya viene en mm, no se toca.
  const mm = extraerDatosEcocardiografia('IVSd: 3.5mm LVIDd: 31.1mm LVIDs: 12mm');
  assert.equal(mm.sivd, 3.5);
  assert.equal(mm.dvid, 31.1);
  assert.equal(mm.dvs, 12);
  // Sin unidad detectable: se asume mm (la de destino).
  assert.equal(extraerDatosEcocardiografia('LVIDd 31.1').dvid, 31.1);
  // Coma decimal y redondeo sin ruido binario.
  assert.equal(extraerDatosEcocardiografia('DIVId: 3,11 cm').dvid, 31.1);
  assert.equal(extraerDatosEcocardiografia('DIVIs:1.2cm').dvs, 12);
});

// --- Índices: entran mm, se calcula en cm ---------------------------------------
test('Índices: Cornell, Devereux, MVCF y EPR con lineales en mm', () => {
  const peso = 7.5;
  const r = plano(calcularIndicesEco(
    { dvid: 31.1, dvs: 12, sivd: 3.5, sivs: 9.5, ppvid: 4.3, ppvis: 12, ai_lineal: 17.9, ao_lineal: 11.8, tiempo_eyectivo: 0.2 },
    peso,
  ));
  const red3 = (x) => Math.round(x * 1000) / 1000;
  // LVIDDN = DVId (cm) / peso^0.294 (Cornell 2004): el umbral ACVIM (1.70) es en cm.
  assert.equal(r.dvid_indexado, red3(3.11 / peso ** 0.294));
  assert.equal(r.dvs_indexado, red3(1.2 / peso ** 0.315));
  assert.equal(r.sivd_indexado, red3(0.35 / peso ** 0.241));
  assert.equal(r.ai_indexado, red3(1.79 / peso ** 0.273));
  assert.equal(r.ao_indexado, red3(1.18 / peso ** 0.309));
  // Devereux en cm → gramos.
  const masa = red3(1.04 * ((3.11 + 0.35 + 0.43) ** 3 - 3.11 ** 3) + 0.6);
  assert.equal(r.masa_vi, masa);
  assert.ok(r.masa_vi > 20 && r.masa_vi < 40, 'masa VI en un rango fisiológico, no ×1000');
  assert.equal(r.indice_masa_vi, red3(masa / (0.1017 * peso ** 0.6667)));
  // Cocientes: no dependen de la unidad.
  assert.equal(r.epr, red3((0.35 + 0.43) / 3.11));
  assert.equal(r.mvcf, red3((3.11 - 1.2) / (3.11 * 0.2)));
});

test('Índices: los mismos valores en mm dan el mismo LVIDDN que antes en cm', () => {
  // Caso de la ejecución 2992 (2026-09-30): DVId 3.11 cm → LVIDDN 1.207.
  const peso = (3.11 / 1.207) ** (1 / 0.294);
  assert.equal(calcularIndicesEco({ dvid: 31.1 }, peso).dvid_indexado, 1.207);
});

test('Índices: sin peso no hay índices por peso, pero sí masa y EPR', () => {
  const r = plano(calcularIndicesEco({ dvid: 31.1, sivd: 3.5, ppvid: 4.3 }, ''));
  assert.equal(r.dvid_indexado, undefined);
  assert.ok(r.masa_vi > 0);
  assert.ok(r.epr > 0);
});
