/**
 * bookmarklet/verificar.mjs — Prueba anti-regresión del bookmarklet de MyVete.
 *
 * Uso:
 *   node bookmarklet/verificar.mjs
 *
 * Qué comprueba (todo offline, sin navegador):
 *   1. Sintaxis de loader.js, launcher.js y interface/app.js (`node --check`).
 *   2. VERSION de launcher.js === VERSION de app.js.
 *   3. bookmarklet.txt es un `javascript:` de UNA línea, sin espacios, que
 *      apunta al launcher.js de GitHub Pages (es el cargador oficial).
 *   4. La LÓGICA DE LA API sigue intacta: se extraen del propio launcher.js las
 *      funciones puras (obtenerSessionIdMyVete, tutorDesdeApiMyVete,
 *      tutorDesdeObjetoJson, esValorBasura) y se corren contra fixtures con la
 *      forma real de /api/customers/{id} (cuenta 444, verificada 07/09/2026).
 *   5. Invariantes de texto en launcher.js (endpoint, sessionId, placeholders…).
 *
 * Si algo falla, imprime cómo revertir al último estado estable:
 *   git checkout v1.0.0-estable
 *
 * Pensado para correr también en CI (.github/workflows/verificar.yml): exit 1
 * en cualquier fallo.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const TAG_ESTABLE = "v1.0.0-estable";

const p = (rel) => join(RAIZ, rel);
const leer = (rel) => readFileSync(p(rel), "utf8");

let fallos = 0;
const ok = (msg) => console.log("  \x1b[32mOK\x1b[0m   " + msg);
const mal = (msg) => {
  fallos += 1;
  console.log("  \x1b[31mFAIL\x1b[0m " + msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : mal(msg));

// ---------------------------------------------------------------------------
// 1. Sintaxis
// ---------------------------------------------------------------------------
console.log("\n[1] Sintaxis (node --check)");
for (const rel of ["bookmarklet/loader.js", "bookmarklet/launcher.js", "interface/app.js"]) {
  try {
    execSync(`node --check "${p(rel)}"`, { stdio: "pipe" });
    ok(rel);
  } catch (e) {
    mal(rel + " — " + String(e.stderr || e).slice(0, 200));
  }
}

// ---------------------------------------------------------------------------
// 2. VERSION coherente entre launcher.js y app.js
// ---------------------------------------------------------------------------
console.log("\n[2] VERSION coherente");
const vLauncher = (leer("bookmarklet/launcher.js").match(/VERSION\s*=\s*["']([^"']+)["']/) || [])[1];
const vApp = (leer("interface/app.js").match(/VERSION\s*=\s*["']([^"']+)["']/) || [])[1];
assert(!!vLauncher, "launcher.js declara const VERSION");
assert(!!vApp, "app.js declara const VERSION");
assert(vLauncher && vLauncher === vApp, `VERSION coincide (launcher=${vLauncher} / app=${vApp})`);

// ---------------------------------------------------------------------------
// 3. bookmarklet.txt = cargador oficial
// ---------------------------------------------------------------------------
console.log("\n[3] bookmarklet.txt (cargador oficial)");
const txt = leer("bookmarklet/bookmarklet.txt").replace(/\n$/, "");
assert(txt.startsWith("javascript:"), "empieza con javascript:");
assert(!txt.includes("\n"), "es una sola línea");
assert(!txt.includes(" "), "no tiene espacios literales (100% percent-encoded)");
let decodificado = "";
try {
  decodificado = decodeURIComponent(txt.slice("javascript:".length));
} catch {
  /* queda "" y falla el assert de abajo */
}
assert(
  /fetch\s*\(/.test(decodificado) && /eval/.test(decodificado),
  "el cargador hace fetch + eval",
);
assert(
  decodificado.includes("echevanest.github.io/MYVETE-INGESTA-N8N/bookmarklet/launcher.js"),
  "el cargador apunta a launcher.js en GitHub Pages",
);
assert(
  txt.length < 2000,
  `es corto (${txt.length} chars < 2000) — no es el código largo pegado`,
);

// ---------------------------------------------------------------------------
// 4. Lógica de la API — funciones puras extraídas del launcher.js real
// ---------------------------------------------------------------------------
console.log("\n[4] Lógica de tutor por API (funciones reales de launcher.js)");
const src = leer("bookmarklet/launcher.js");
const desde = src.indexOf("  const REGEX_TELEFONO");
const hasta = src.indexOf("  function obtenerTutorPorFetch");
let api = null;
if (desde === -1 || hasta === -1 || hasta <= desde) {
  mal("no se pudo recortar el bloque de funciones puras del launcher.js (¿cambió la estructura?)");
} else {
  const bloque = src.slice(desde, hasta);
  try {
    // Stubs mínimos: las funciones puras no los tocan; obtenerSessionIdMyVete sí.
    const fabricar = new Function(
      "window",
      "document",
      "performance",
      "Node",
      bloque +
        "\nreturn { obtenerSessionIdMyVete, tutorDesdeApiMyVete, tutorDesdeObjetoJson, esValorBasura };",
    );
    api = fabricar(
      { location: { href: "https://app.myvete.com/patient/1/charts" }, name: "" },
      { documentElement: { innerHTML: "" } },
      { getEntriesByType: () => [] },
      { DOCUMENT_POSITION_FOLLOWING: 4 },
    );
    ok("bloque de funciones puras evaluado sin error");
  } catch (e) {
    mal("el bloque de funciones puras no evalúa: " + String(e).slice(0, 200));
  }
}

if (api) {
  // 4a. esValorBasura — placeholders / fechas / timestamps
  const basura = [
    "Sin asignar",
    "06/09/2026 - Hace 0 segundos",
    "hace 2 días",
    "-",
    "",
    "N/D",
  ];
  const noBasura = ["Juan Pérez", "1130000019", "ana@mail.com", "ARTES, SILVIA"];
  assert(
    basura.every((v) => api.esValorBasura(v)),
    "esValorBasura() detecta placeholders/fechas/timestamps",
  );
  assert(
    noBasura.every((v) => !api.esValorBasura(v)),
    "esValorBasura() NO descarta datos reales (nombre/tel/email)",
  );

  // 4b. tutorDesdeApiMyVete — forma real de /api/customers/{id}
  const respuestaReal = {
    id: 3496651,
    customerFullName: "ARTES, SILVIA",
    customerName: "Silvia",
    customerLastName: "Artes",
    Contacts: [
      { contactValue: "1130000019", Attribute: { attributeName: "Telefono movil" } },
      { contactValue: "", Attribute: { attributeName: "Telefono laboral" } },
      { contactValue: "silvia@yahoo.com.ar", Attribute: { attributeName: "Email personal" } },
      { contactValue: "", Attribute: { attributeName: "Telefono fijo" } },
    ],
  };
  const t1 = api.tutorDesdeApiMyVete(respuestaReal);
  assert(t1.nombre === "ARTES, SILVIA", "nombre <- customerFullName");
  assert(t1.telefono === "1130000019", "telefono <- Contacts[Telefono movil]");
  assert(t1.email === "silvia@yahoo.com.ar", "email <- Contacts[Email personal]");

  // 4c. prefiere celular/móvil sobre fijo; arma nombre si falta fullName
  const t2 = api.tutorDesdeApiMyVete({
    customerName: "Ana",
    customerLastName: "Gómez",
    Contacts: [
      { contactValue: "4444-5555", Attribute: { attributeName: "Telefono fijo" } },
      { contactValue: "11 5555 1234", Attribute: { attributeName: "Celular" } },
    ],
  });
  assert(t2.nombre === "Ana Gómez", "nombre <- customerName + customerLastName cuando falta fullName");
  assert(t2.telefono === "11 5555 1234", "prefiere celular/móvil sobre teléfono fijo");

  // 4d. placeholders en la API tampoco pasan
  const t3 = api.tutorDesdeApiMyVete({
    customerFullName: "Sin asignar",
    Contacts: [{ contactValue: "Hace 0 segundos", Attribute: { attributeName: "Telefono movil" } }],
  });
  assert(
    t3.nombre === null && t3.telefono === null && t3.email === null,
    "descarta 'Sin asignar' / 'Hace 0 segundos' también viniendo de la API",
  );

  // 4e. red de seguridad: tutorDesdeObjetoJson (BFS por clave)
  const t4 = api.tutorDesdeObjetoJson({
    data: { nombre: "María", apellido: "López", telefono_celular: "1140001111", email: "m@x.com" },
  });
  assert(
    t4.nombre === "María López" && t4.telefono === "1140001111" && t4.email === "m@x.com",
    "tutorDesdeObjetoJson() mapea una forma genérica (fallback)",
  );

  // 4f. obtenerSessionIdMyVete lee ?sessionId= del Resource Timing
  const fabricar2 = new Function(
    "window",
    "document",
    "performance",
    "Node",
    leer("bookmarklet/launcher.js")
      .slice(desde, hasta)
      .concat("\nreturn { obtenerSessionIdMyVete };"),
  );
  const api2 = fabricar2(
    { location: { href: "https://app.myvete.com/" }, name: "" },
    { documentElement: { innerHTML: "" } },
    {
      getEntriesByType: () => [
        { name: "https://app.myvete.com/api/kpis/444/444/0/-180?sessionId=1spaw20ha47" },
      ],
    },
    {},
  );
  assert(
    api2.obtenerSessionIdMyVete() === "1spaw20ha47",
    "obtenerSessionIdMyVete() extrae el token de una llamada /api/…?sessionId=",
  );
}

// ---------------------------------------------------------------------------
// 5. Invariantes de texto en launcher.js
// ---------------------------------------------------------------------------
console.log("\n[5] Invariantes en launcher.js");
const invariantes = [
  ["endpoint de cliente", /["']\/api\/customers\/["']|\/api\/customers\//],
  ["sessionId en la query", /\?sessionId=/],
  ["lectura del sessionId por Resource Timing", /getEntriesByType\(\s*["']resource["']\s*\)/],
  ["mapeo customerFullName", /customerFullName/],
  ["mapeo Contacts[].Attribute.attributeName", /attributeName/],
  ["lista de placeholders basura", /PLACEHOLDERS_BASURA/],
  ["aviso manual al panel", /tutorAutoFallo/],
  ["NO se abre pestaña de tutor", /^(?!.*window\.open\([^)]*customers).*$/s],
];
for (const [nombre, re] of invariantes) {
  assert(re.test(src), nombre);
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log("");
if (fallos === 0) {
  console.log(`\x1b[32m✓ TODO OK — versión ${vLauncher} estable.\x1b[0m`);
  process.exit(0);
} else {
  console.log(
    `\x1b[31m✗ ${fallos} comprobación(es) FALLARON — VERSIÓN INESTABLE.\x1b[0m\n` +
      `  Revertí al último estado estable conocido:\n` +
      `      git checkout ${TAG_ESTABLE}\n` +
      `  (o 'git checkout ${TAG_ESTABLE} -- bookmarklet/launcher.js interface/app.js' para solo el código).`,
  );
  process.exit(1);
}
