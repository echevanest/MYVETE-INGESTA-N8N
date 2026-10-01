# FORMATOS DE INFORMES DE ECÓGRAFOS — parser de eco del SPA

*   **Fecha:** 2026-09-25
*   **Nota 2026-10-01 (8.7d):** el parser ahora guarda las lineales en **mm**
    (convierte cm → mm). Donde este documento dice "convierte mm→cm" o "×10"
    hay que leerlo al revés: con unidad no detectada se asume mm, así que el
    caso Vinno (mm sin unidad visible) queda bien y el riesgo pasa a un PDF en
    cm sin unidad visible (queda 10 veces más chico). El resto de la auditoría
    sigue vigente.
*   **Alcance:** auditoría de solo lectura del parser de PDF de eco
    (`interface/app.js` §8, `MAPEO_EXTRACCION_PDF`, líneas 961-1011) contra
    PDFs reales de ecógrafos. No se modificó el parser, n8n ni Supabase.
*   **Fixtures:** `INFORMES DE EQUIPOS/` (local, **en `.gitignore`**: son
    informes con datos reales de pacientes). Este documento NO contiene datos
    de pacientes: solo siglas, patrones y resultados del parser. Los valores de
    ejemplo se escriben como `<n>`. Los fixtures se nombran con códigos
    (Equipo A–E), sin nombres de personas. El formato SonoSite se quitó
    del documento (2026-09-29): ese equipo no se usa más.
*   **Método:** texto extraído con PDF.js **2.16.105** (misma versión que
    `index.html:597`) y unido igual que el SPA (`items.map(it => it.str).join(' ')`
    con separador `--- PÁGINA i ---`); después se corrió una copia literal de
    `app.js:961-1079` sobre ese texto. Conteo de caracteres/imágenes por
    página con pdfplumber.

---

## 1. PDFs analizados

| Archivo (fixture) | Formato | Equipo (según el PDF) | Págs. | Datos en |
|---|---|---|---|---|
| `CARD<fecha-hora>_Cardiología.PDF` (nombre con fecha del estudio, omitida) | **Mindray** (ES) | Mindray M8 Vet | 1 | texto |
| Equipo A | **Mindray** (ES) + ECG | Mindray Vetus E7 | 5 | texto (p.2 eco, p.4 ECG); p.1 = 44 imágenes sin texto |
| Equipo B | **Mindray** (ES/EN mixto) | Mindray M6Vet | 2 | texto |
| Equipo C (Vinno 6) | **Vinno** (ES) | Vinno 6 (según el nombre del fixture; en el texto no figura el modelo) | 3 | texto (p.1); p.2-3 = 12 imágenes |
| Equipo D | **"M-Teich / Informe CARD"** | **no identificado** (el texto no nombra el equipo) | 2 | texto (p.1); p.2 = 5 imágenes |
| Equipo E ⚠️ **no está en la carpeta** (sigue en Descargas) | **"Cube/Teich"** | **no identificado** | 2 | texto |

Ningún formato requiere OCR: en todos, las medidas están en el texto del PDF.
En Vinno, las imágenes de las págs. 2-3 tienen medidas superpuestas, pero son
**las mismas** que la tabla de la pág. 1 (verificado visualmente); los Doppler
espectrales de ese PDF no tienen mediciones.

---

## 2. Formatos: siglas y patrones

Notación: `<n>` = número; `␣+` = uno o más espacios (PDF.js suele separar
tokens con 2-3 espacios).

### 2.1 Mindray (M8 Vet, Vetus E7, M6Vet)

*   **Patrón:** `SIGLA:<n><unidad>` (M8 sin espacio tras `:`; E7 y M6 con
    espacio). Decimal con punto. Unidad pegada al número.
*   **Unidad lineal:** **cm** en M8 y E7, **mm** en M6Vet. La unidad siempre está
    presente, así que la conversión funciona.
*   **Firma de detección:** `Equipo usado:␣*Mindray` (en los 3).
*   **Secciones:** `Las mediciones 2D` / `2D Measurements`, `M Measurements` /
    `M-Mode Measurements`, `Teichholz(M)`, `Las mediciones Doppler` /
    `Doppler Measurements`.

| Sigla en el PDF | Columna `datos_ecocardiografia` | Parser actual |
|---|---|---|
| `SIVd` / `SIVs` | `sivd` / `sivs` | ✅ |
| `DIVId` / `DIVIs` | `dvid` / `dvs` | ✅ |
| `PPVId` / `PPVIs` | `ppvid` / `ppvis` | ✅ |
| `FS` | `fs_modom` | ✅ |
| `FE(Teich)` | `fe_modom` | ✅ |
| `Diámetro AI` | `ai_lineal` | ✅ |
| `Diámetro aorta` | `ao_lineal` | ✅ |
| `AI/Ao` | `ai_ao_lineal` | ✅ |
| `VFD(Teich)` / `VFS(Teich)` / `SV(Teich)` | `volumen_fdi_modom` / `volumen_fsi_modom` / `volumen_si_modom` (*) | ❌ sin patrón |
| `CO(Teich)` (l/min) | `gasto_cardiaco_modom` (*) | ❌ sin patrón |
| `LV Mass`, `VI Mass(Cube)` (g) | `masa_vi` (ver §5, decisión pendiente) | ❌ sin patrón |
| `E Vel VM` (cm/s) | `velocidad_e_mitral` | ❌ el regex espera `Onda E` / `Vel E` / `E mitral` |
| `MV E PG` (mmHg) | `gp_mitral` (*) | ❌ sin patrón |
| `Vmáx VA` (cm/s) / `PGmáx VA` (mmHg) | `vmax_ao` / `gp_ao` | ❌ sin patrón |
| `HR` (bpm) | — (FC del eco; no hay columna) | — |
| `RWT`, `SIVd/PPVId`, `SIVs/PPVIs` | — sin columna | — |
| `IVSd Index`, `VIIDd índic`, `EDV Index`, `SI(Teich)`, `CI(Teich)`… | — índices del equipo; el SPA calcula los suyos | — |
| `MPA/Ao(2D)` | `ao_ap`? (*) | ❌ (en el M8 solo trae `Diámetro aorta`, sin MPA) |

(*) Mapeo inferido por el nombre de la columna; **confirmar** (ver §7).

**ECG** (pág. 4 de Equipo A, exportación de otro software):
`FC promedio␣+:␣+<n>bpm`, `Eje QRS␣+:␣+<n>°`, `Duración de P␣+:␣+<n>ms`.
El parser los extrae bien. El PDF no trae `Ritmo:`, así que `ekg_ritmo` queda
null. Las líneas `FC Mínimo`, `FC Máximo` y `Eje P` no generan falsos
positivos (verificado).

### 2.2 Vinno (Vinno 6)

*   **Patrón (tabla "Medidas"):** columnas `Nombre␣1␣Estadística␣Unidad`, y
    PDF.js las serializa como
    **`SIGLA␣+<n>␣+<n>␣+Fin␣+<unidad>`**: el valor aparece **dos veces** y la
    unidad queda **después de `Fin`**.
*   **Patrón (tabla "Elemento de cálculo"):** `SIGLA(M-Teich)␣+<n>␣+<unidad>`,
    dos pares por línea.
*   **Siglas en inglés con espacios internos:** `Ao␣+Diam`, `LA␣+Diam`,
    `Med␣+Vel␣+S'`, `LVd␣+Mass(M)`.
*   **Encabezados de sección que se pegan a la sigla:** `Cardiaco␣+M` precede a
    `EPSS` (por eso el campo se leyó como "Cardiaco MEPSS"; es **EPSS**, en
    **cm**) y `Cardiaco␣+Doppler` precede a `Med Vel S'`.
*   **Firma de detección:** `Elemento de cálculo` + `(M-Teich)` + el token
    `Fin` entre valor y unidad. **No** usar el encabezado (es el nombre de la
    clínica configurado en el equipo).

| Sigla en el PDF | Columna | Parser actual |
|---|---|---|
| `IVSd` / `IVSs` (mm) | `sivd` / `sivs` | ❌ **×10**: no ve la unidad → no convierte mm→cm |
| `LVIDd` / `LVIDs` (mm) | `dvid` / `dvs` | ❌ **×10** |
| `LVPWd` / `LVPWs` (mm) | `ppvid` / `ppvis` | ❌ **×10** |
| `Ao Diam` (mm) | `ao_lineal` | ❌ toma el valor de `LA/Ao` (`Ao\s?Diam` no admite 3 espacios) |
| `LA Diam` (mm) | `ai_lineal` | ❌ null |
| `LA/Ao` | `ai_ao_lineal` | ✅ |
| `EF(M-Teich)` (%) | `fe_modom` | ❌ null |
| `%FS(M)` (%) | `fs_modom` | ❌ null |
| `LVEDV(M-Teich)` / `LVESV(M-Teich)` / `SV(M-Teich)` (ml) | `volumen_fdi_modom` / `volumen_fsi_modom` / `volumen_si_modom` (*) | ❌ sin patrón |
| `LVd Mass(M)` (g) | `masa_vi` (ver §5) | ❌ sin patrón |
| `EPSS` (cm) | — **sin columna** | — |
| `Med Vel S'` / `Lat Vel S'` (cm/s, TDI) | — **sin columna** | — |
| `%IVS(M)` / `%LVPW(M)` (%) | — sin columna (derivable) | — |

**Efecto en cascada:** con las lineales ×10, `calcularIndicesEco` produce una
masa VI de Devereux absurda (~158.000 g) e índices de Cornell inflados, y
reemplaza cualquier masa cargada. El log del SPA muestra los valores como
"extraídos", sin ninguna advertencia.

### 2.3 "M-Teich / Informe CARD" (Equipo D, equipo no identificado)

*   **Patrón:** `SIGLA␣:␣<n>␣<unidad>` (espacio antes y después de `:`).
    Unidad **cm**. Muchos títulos aparecen **duplicados** en el texto
    (`LA LA`, `AO AO`, `M M`, `Imagen Imagen`).
*   **Vocabulario muy parecido al de Vinno:** `(M-Teich)`, `LA Diam`,
    `Ao Diam`, `FS(M)`, pero con `IVS%(M)` / `LVPW%(M)` (el % va **después**;
    en Vinno va antes) y **sin** el token `Fin`.
*   **Firma de detección (propuesta):** `(M-Teich)` + `␣:␣` + ausencia de
    `Fin` / `Elemento de cálculo`. `Informe CARD` puede ser el título
    configurable: no usarlo solo.

| Sigla en el PDF | Columna | Parser actual |
|---|---|---|
| `IVSd`/`IVSs`, `LVIDd`/`LVIDs`, `LVPWd`/`LVPWs` (cm) | lineales | ✅ |
| `LA Diam` | `ai_lineal` | ❌ null |
| `Ao Diam` | `ao_lineal` | ❌ toma el valor de `LA Diam/Ao Diam` (aparece antes en el texto) |
| `LA Diam/Ao Diam` | `ai_ao_lineal` | ❌ null |
| `Ao Diam/LA Diam` | — (inversa; no guardar) | — |
| `EF(M-Teich)` / `FS(M)` | `fe_modom` / `fs_modom` | ❌ null |
| `EDV(M-Teich)` / `ESV(M-Teich)` / `SV(M-Teich)` (mL) | volúmenes Modo M (*) | ❌ sin patrón |
| `LA ESV(A4C)` (mL) | `volumen_ai_esv_simpson`? (*) | ❌ sin patrón |
| `AV Vmax` (cm/s) / `AV PGmax` (mmHg) | `vmax_ao` / `gp_ao` | ❌ sin patrón |
| `IVS%(M)` / `LVPW%(M)` | — sin columna (derivable) | — |
| `IVSd/LVPWd(M)`, `RWT(M)` | — sin columna | — |

### 2.4 "Cube/Teich" (Equipo E, equipo no identificado, **no está en la carpeta**)

Analizado desde Descargas en la auditoría previa (mismo método).

*   **Patrón:** `SIGLA:␣<n><unidad>`, unidad **mm** pegada.
    Secciones `Mediciones de Modo B`, `Mediciones del Modo M`, `Cube/Teich`.
    Varias medidas se repiten en más de una sección.
*   **Firma (propuesta):** `Cube/Teich` o `Ao Root Diam`.

| Sigla en el PDF | Columna | Parser actual |
|---|---|---|
| `IVSd`…`LVPWs` (mm) | lineales | ✅ (convierte mm→cm) |
| `EF(Teich)` / `%FS` | `fe_modom` / `fs_modom` | ✅ |
| `LA/Ao` | `ai_ao_lineal` | ✅ |
| `Ao Root Diam` | `ao_lineal` | ❌ toma el valor de `LA/Ao` |
| `LA Diam` | `ai_lineal` | ❌ null |
| `EDV(Teich)` / `ESV(Teich)` / `SV(Teich)` | volúmenes Modo M (*) | ❌ sin patrón |
| `LV Mass` (g) / `LV Mass Index` | `masa_vi` (ver §5) | ❌ sin patrón |
| `%IVS` / `%LVPW` | — sin columna (derivable) | — |

---

## 3. Resumen: parser actual por formato

| Formato | ✅ Correctos | ❌ Incorrectos (valor erróneo) | ❌ No reconocidos (con columna) |
|---|---|---|---|
| Mindray (×3) | 11 (lineales, FE, FS, AI, Ao, AI/Ao) | 0 | volúmenes, GC, masa, E mitral, Vmax/GP Ao, GP mitral |
| Vinno | 1 (AI/Ao) | **7** (6 lineales ×10, `ao_lineal`) | AI, FE, FS, volúmenes, masa |
| M-Teich (Equipo D) | 6 (lineales) | **1** (`ao_lineal`) | AI, AI/Ao, FE, FS, volúmenes, Vmax/GP Ao |
| Cube/Teich (Equipo E) | 9 | **1** (`ao_lineal`) | AI, volúmenes, masa |

## 4. Bugs detectados (transversales)

1.  **Unidad no detectada → se asume la de destino** (`ecoNormalizarValor`,
    `app.js:1020-1029`). Si la unidad no queda dentro de los 5 caracteres
    siguientes al número, un valor en mm entra como cm. Afecta a Vinno.
2.  **`ao_lineal` con el alias suelto `Ao`**: el regex toma la **primera**
    coincidencia de `Ao<sep><n>` en todo el texto, que en 3 formatos es el
    cociente `LA/Ao` o `LA Diam/Ao Diam`. Además, `Ao\s?Diam` solo admite un
    espacio.
3.  **`ai_lineal` no reconoce `LA Diam`** (Vinno, Equipo D, Equipo E).
4.  **FE/FS con sufijo de método** (`EF(M-Teich)`, `%FS(M)`, `FS(M)`) no
    coinciden: el alias exige `(Teich)` exacto o la sigla seguida de número.
5.  **Respaldo laxo sin `\b`** (`ecoExtraerPorRegex`, `app.js:1040-1049`):
    `new RegExp(sigla + …)` sin límite de palabra. Por ejemplo, la sigla `LA`
    coincidiría con "…la 12…" dentro de un comentario. No se observó en estos
    PDFs, pero el riesgo existe.
6.  **Primera coincidencia gana**: en formatos con secciones duplicadas
    (Mindray con `AI/Ao(2D)` y `Ao/AI(2D)`) el resultado
    depende del orden del texto, no de una decisión explícita.
7.  **Sin validación de rango**: un DVId de 46 cm o una masa de 158.000 g
    pasan sin advertencia.
8.  **Comentario desactualizado**: `app.js:1168` dice que no existe la
    columna `epr`, pero sí existe (`supabase/schema.sql:324`, migración
    2026-09-13) y está en `COLUMNAS_DATOS_ECO`.
9.  **`RWT` del equipo ≠ `epr` del SPA**: Mindray y el formato M-Teich reportan
    `RWT = 2·PPVId/DIVId` (verificado con los valores); el SPA calcula
    `epr = (sivd+ppvid)/dvid`. No es un bug, pero no hay que mapear `RWT` → `epr`.

## 5. Campos sin columna y derivables

| Campo | Formatos | ¿Columna? | Recomendación |
|---|---|---|---|
| **EPSS** (`EPSS`) | Vinno | no | **Agregar** `epss` (cm) |
| **TDI S' medial / lateral** (`Med Vel S'`, `Lat Vel S'`) | Vinno | no | Agregar si se van a informar |
| **%IVS / %LVPW** (`%IVS(M)`, `IVS%(M)`; `%LVPW(M)`, `LVPW%(M)`) | Vinno, Equipo D, Equipo E | no | **No agregar**: se derivan de (s−d)/d. Coinciden con el equipo salvo redondeo en Vinno y Equipo D. En Equipo E, %IVS del equipo = 50 % y el calculado = 51.6 %: **diferencia sin explicar** |
| RWT | Mindray, Equipo D | no | No agregar (derivable) |
| FC del eco (`HR`) | Mindray | no | Fuera de alcance |

**Masa VI:** los equipos reportan masas con fórmulas distintas (Mindray trae
dos: `VI Mass(Cube)` y `LV Mass`; Vinno `LVd Mass(M)`;
Equipo E `LV Mass`), y el SPA **siempre reemplaza** `masa_vi` con Devereux cuando
tiene dvid, sivd y ppvid. Decisión pendiente (§7).

## 6. Detección de formato (propuesta)

Una función `detectarFormatoEco(texto)` que evalúe firmas en este orden y
devuelva la primera que coincida:

| Orden | Formato | Firma (todas deben cumplirse) |
|---|---|---|
| 1 | `mindray` | `/Equipo usado:\s*Mindray/i` |
| 2 | `vinno` | `/Elemento\s+de\s+c[áa]lculo/` y `/\(M-Teich\)/` y `/\d\s+Fin\s+(mm\|cm\|cm\/s\|%)/` |
| 3 | `mteich` (Equipo D) | `/\(M-Teich\)/` y `/\s:\s/`, sin `Fin` |
| 4 | `cubeteich` (Equipo E) | `/Cube\/Teich/` o `/Ao Root Diam/` |
| — | `generico` | ninguna → parser actual sin cambios |

El formato detectado debe mostrarse en el log del SPA ("Formato detectado:
Vinno"), para que el profesional note una detección equivocada.

## 7. Preguntas abiertas (para decidir antes de implementar)

1.  **Masa VI:** ¿se guarda la del equipo o la de Devereux del SPA? ¿Y cuál de
    las dos de Mindray (`Cube` o `LV Mass`)?
2.  **EPSS y TDI S':** ¿se muestran en el informe final? Eso define si se crean
    columnas. Unidad de S': ¿m/s (convención del SPA para velocidades) o cm/s
    (la habitual en TDI)?
3.  **Mapeo de volúmenes:** confirmar que `volumen_fdi_modom` / `volumen_fsi_modom`
    / `volumen_si_modom` / `gasto_cardiaco_modom` = EDV / ESV / SV / CO por
    Teichholz, y que `LA ESV(A4C)` va a `volumen_ai_esv_simpson`.
4.  **Un segundo PDF de Vinno con Doppler medido** (E/A mitral, Vmax Ao/Pulm),
    para conocer esas siglas.
5.  ¿Qué equipos generan los formatos "M-Teich" (Equipo D) y "Cube/Teich" (Equipo E)?
    ¿Se sigue usando alguno? (Equipo E no está en `INFORMES DE EQUIPOS/`.)

## 8. Plan de implementación (resumen)

Recomendado: **extractor por formato + respaldo genérico** (la ruta actual
queda intacta para PDFs no reconocidos). Orden:

0.  Aislar el parser en `interface/eco-parser.js` (script clásico, sin
    bundler) para poder probarlo en Node. Harness de regresión con los
    fixtures locales + un JSON de valores esperados (solo medidas, sin datos
    de pacientes).
1.  **Guarda inmediata:** detección de formato + si es Vinno y aún
    no está soportado, no autollenar y avisar en el log. Más validación de
    rangos (p. ej. lineal > 15 cm → advertencia).
2.  Extractor **Vinno** (unidad después de `Fin`, siglas con espacios, tabla
    `M-Teich`).
3.  Correcciones del genérico con impacto en Equipo D y Equipo E: `ao_lineal` sin el
    alias `Ao` suelto y con `Ao\s+Diam` / `Ao Root Diam` / `Diámetro aorta`;
    `LA\s+Diam` → `ai_lineal`; FE/FS con `(M-Teich)`, `(M)` y `%` inicial;
    `\b` en el respaldo.
4.  Ampliar **Mindray** (volúmenes, GC, E mitral, Vmax/GP Ao, GP mitral).
5.  Migración Supabase `epss` (+ `tdi_s_medial`, `tdi_s_lateral` si se aprueba)
    **antes** de que el SPA mande esas claves (el nodo n8n `Insert Datos
    Ecocardiografía` reenvía el objeto entero a PostgREST: una clave sin
    columna haría fallar el insert; con la columna creada no hay que tocar
    n8n) → inputs `#eco-epss`… → plantilla del informe.
