={{ (() => {
// 8.7q (2026-10-07): el email se guarda con el dominio corregido, igual que
// sale en el mail y en el informe. Este nodo corre antes que 'Preparar Datos
// para PDF', por eso lleva su propia copia del bloque EMAIL-PURO de
// interface/app.js (tests/email.test.mjs comprueba que sean iguales).
// >>> EMAIL-PURO
// Formato mínimo de e-mail: algo@algo.algo, sin espacios. La misma regla está
// en n8n ('IF - ¿Tutor con email?' y 'Verificación final').
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 8.7p (2026-10-05): corrección del dominio del e-mail del tutor. La misma
// lógica está copiada en n8n ('Preparar Datos para PDF'); si cambia acá, cambia
// allá (copia del nodo en n8n/preparar_datos_pdf.8.7s.js). Desde 8.7q también
// está en la expresión de 'Upsert Tutor' (n8n/upsert_tutor.8.7s.js).
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
  // 8.7r: variantes regionales de los mismos proveedores; sin esto daban el
  // aviso de "se parece a un dominio conocido".
  'yahoo.com.co', 'yahoo.com.pe', 'yahoo.com.ve', 'yahoo.cl',
  'outlook.cl', 'outlook.com.br', 'outlook.pt',
  'hotmail.cl', 'hotmail.com.br', 'live.com.mx', 'live.com.pt',
  'live.com.uy', // 8.7s
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

// Primera etiqueta de un dominio: "gmail" en "gmail.com.ar".
function etiquetaDominio(dominio) {
  return dominio.split('.')[0];
}

// 8.7q (2026-10-07): ¿el dominio se parece a uno de los corregibles? Los
// dominios propios ("clinica.vet") no se parecen y pasan sin aviso. Se parece
// si:
//   - la etiqueta es la de un proveedor corregible con otra terminación
//     ("gmail.com.ar", "hotmail.net");
//   - la etiqueta está a una letra de la de un proveedor ("gmeil.con"), salvo
//     que sea la de un dominio válido ("mail.clinica.vet", "email.x.com");
//   - el dominio entero está a dos letras de un corregible ("gemial.com").
// Las dos últimas no se aplican a etiquetas de menos de 5 letras ("live"):
// "nike.com" quedaría a dos letras de "live.com".
function dominioParecido(dominio) {
  const etiqueta = etiquetaDominio(dominio);
  const etiquetasCorregibles = DOMINIOS_EMAIL_CORREGIBLES.map(etiquetaDominio);
  if (etiquetasCorregibles.includes(etiqueta)) return true;
  const esEtiquetaValida = DOMINIOS_EMAIL_VALIDOS.map(etiquetaDominio).includes(etiqueta);
  return DOMINIOS_EMAIL_CORREGIBLES.some((c) => {
    const etiquetaC = etiquetaDominio(c);
    if (etiquetaC.length < 5) return false;
    if (!esEtiquetaValida && distanciaEdicion(etiqueta, etiquetaC) === 1) return true;
    return distanciaEdicion(dominio, c) <= 2;
  });
}

// Revisa el dominio de un e-mail. Devuelve { estado, email, original, dominio }:
//   'vacio' | 'invalido' (no cumple EMAIL_VALIDO) | 'ok' (dominio conocido)
//   'corregido': el dominio está a una sola letra de exactamente un dominio
//                corregible; `email` trae el corregido.
//   'sospechoso': se parece a un dominio corregible, pero no se puede deducir
//                 cuál quiso escribir; `email` queda como llegó. Da aviso.
//   'desconocido': no se parece a ninguno (dominio propio); `email` queda como
//                  llegó, sin aviso.
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
  return { estado: dominioParecido(dominio) ? 'sospechoso' : 'desconocido', email: original, original, dominio };
}
// <<< EMAIL-PURO
const tutor = $('Webhook').item.json.body.filiacion.tutor;
const revision = revisarEmail(tutor.email);
return JSON.stringify({
  id_myvete: tutor.id_myvete,
  nombre: tutor.nombre,
  telefono: tutor.telefono,
  email: revision.estado === 'corregido' ? revision.email : tutor.email,
});
})() }}