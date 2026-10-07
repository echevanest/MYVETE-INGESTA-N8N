// Tests de la corrección del dominio del e-mail del tutor (8.7p a 8.7r).
// Corre con: node --test tests/email.test.mjs
//
// Recorta de app.js la sección pura entre `// >>> EMAIL-PURO` y
// `// <<< EMAIL-PURO` (ver clasificacion.test.mjs) y corre los mismos casos
// contra las copias que llevan los nodos de n8n 'Preparar Datos para PDF' y
// 'Upsert Tutor' (8.7q).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function recortar(ruta) {
  const fuente = readFileSync(new URL(ruta, import.meta.url), 'utf8');
  const inicio = fuente.indexOf('// >>> EMAIL-PURO');
  const fin = fuente.indexOf('// <<< EMAIL-PURO');
  assert.ok(inicio !== -1 && fin > inicio, `marcadores EMAIL-PURO en ${ruta}`);
  return fuente.slice(inicio, fin);
}

function cargar(ruta) {
  const contexto = vm.createContext({});
  vm.runInContext(recortar(ruta), contexto);
  return contexto.revisarEmail;
}

const CASOS = [
  // [entrada, estado, email resultante]
  ['juan@gemail.com', 'corregido', 'juan@gmail.com'],
  ['juan@gmial.com', 'corregido', 'juan@gmail.com'],
  ['juan@gmail.con', 'corregido', 'juan@gmail.com'],
  ['juan@gmai.com', 'corregido', 'juan@gmail.com'],
  ['Juan.Perez@GMAIL.CON', 'corregido', 'Juan.Perez@gmail.com'],
  ['juan@hotmial.com', 'corregido', 'juan@hotmail.com'],
  ['juan@hotmail.co', 'corregido', 'juan@hotmail.com'],
  ['juan@hotmail.com.a', 'corregido', 'juan@hotmail.com.ar'],
  ['juan@yaho.com.ar', 'corregido', 'juan@yahoo.com.ar'],
  ['juan@outlok.es', 'corregido', 'juan@outlook.es'],
  ['juan@iclod.com', 'corregido', 'juan@icloud.com'],
  ['juan@gmail.com', 'ok', 'juan@gmail.com'],
  ['juan@Gmail.com', 'ok', 'juan@Gmail.com'],
  ['juan@hotmail.com.ar', 'ok', 'juan@hotmail.com.ar'],
  // Existen y se parecen a uno corregible: no se tocan.
  ['juan@email.com', 'ok', 'juan@email.com'],
  ['juan@mail.com', 'ok', 'juan@mail.com'],
  ['juan@ymail.com', 'ok', 'juan@ymail.com'],
  ['juan@hotmail.se', 'ok', 'juan@hotmail.se'],
  ['juan@fibertel.com.ar', 'ok', 'juan@fibertel.com.ar'],
  // Variantes regionales de los proveedores (8.7r).
  ['juan@yahoo.com.co', 'ok', 'juan@yahoo.com.co'],
  ['juan@outlook.cl', 'ok', 'juan@outlook.cl'],
  ['juan@live.com.mx', 'ok', 'juan@live.com.mx'],
  ['juan@hotmail.com.br', 'ok', 'juan@hotmail.com.br'],
  // Se parece a uno conocido y no es deducible: queda como llegó, con aviso.
  ['juan@gmeil.con', 'sospechoso', 'juan@gmeil.con'],
  ['juan@gemial.com', 'sospechoso', 'juan@gemial.com'],
  ['juan@gmail.com.ar', 'sospechoso', 'juan@gmail.com.ar'],
  ['juan@gmial.com.ar', 'sospechoso', 'juan@gmial.com.ar'],
  ['juan@hotmail.net', 'sospechoso', 'juan@hotmail.net'],
  ['juan@hotmal.con', 'sospechoso', 'juan@hotmal.con'],
  ['juan@live.com.uy', 'sospechoso', 'juan@live.com.uy'],
  // Dominio propio, no se parece a ninguno: queda como llegó, sin aviso (8.7q).
  ['juan@dominio-inexistente.com', 'desconocido', 'juan@dominio-inexistente.com'],
  ['juan@clinica.vet', 'desconocido', 'juan@clinica.vet'],
  ['juan@veterinaria-sanmartin.com.ar', 'desconocido', 'juan@veterinaria-sanmartin.com.ar'],
  ['juan@mail.clinica.vet', 'desconocido', 'juan@mail.clinica.vet'],
  ['juan@email.empresa.com', 'desconocido', 'juan@email.empresa.com'],
  ['juan@nike.com', 'desconocido', 'juan@nike.com'],
  ['juan@uba.ar', 'desconocido', 'juan@uba.ar'],
  ['juan@gmail', 'invalido', 'juan@gmail'],
  ['juan gmail.com', 'invalido', 'juan gmail.com'],
  ['', 'vacio', ''],
  [null, 'vacio', ''],
  ['   ', 'vacio', ''],
];

for (const [nombre, ruta] of [
  ['SPA (app.js)', '../interface/app.js'],
  ['n8n (Preparar Datos para PDF)', '../n8n/preparar_datos_pdf.8.7r.js'],
  ['n8n (Upsert Tutor)', '../n8n/upsert_tutor.8.7r.js'],
]) {
  const revisarEmail = cargar(ruta);
  for (const [entrada, estado, email] of CASOS) {
    test(`${nombre}: ${JSON.stringify(entrada)} → ${estado}`, () => {
      const r = revisarEmail(entrada);
      assert.equal(r.estado, estado);
      assert.equal(r.email, email);
    });
  }
}

test('las copias de n8n son idénticas a la del SPA', () => {
  assert.equal(recortar('../n8n/preparar_datos_pdf.8.7r.js'), recortar('../interface/app.js'));
  assert.equal(recortar('../n8n/upsert_tutor.8.7r.js'), recortar('../interface/app.js'));
});
