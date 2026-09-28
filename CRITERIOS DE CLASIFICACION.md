# CRITERIOS DE CLASIFICACIÓN — MyVete

Versión 1.2 — 2026-09-28.
- v1.1: corrección de la v1.0 tras la auditoría de la Sub-fase 8.7 (errores
  E3–E13, decisiones de Marcelo P2–P8).
- v1.2: respuestas de Marcelo a las preguntas de la v1.1 (velocidades en cm/s,
  ecografía pulmonar, AT/ET, parámetros del VD, disclaimer solo en el SPA,
  procesamiento de la morfología pulmonar).

Propósito: criterios que el SPA usa para calcular las clasificaciones
ACVIM, MINE 2 y HP.

Este archivo es la fuente de verdad para la implementación de las funciones
de clasificación en `interface/app.js` (8.7b). Ningún umbral que no esté acá
se usa en el código.

---

## 0. Reglas generales

### 0.1 Dónde se guarda

- Las clasificaciones son de la **atención**: columnas en
  `atenciones_cardiologia` (`acvim_estadio`, `acvim_origen`, `mine2_puntaje`,
  `mine2_clasificacion`, `hp_clasificacion`, `hp_sospecha`, `hp_signos`,
  `hp_n_sitios`, `clasificacion_advertencias`), junto con los datos que carga
  el profesional para clasificar (`morfo_aortica`, `morfo_pulmonar`,
  `eco_pulmonar_hallazgos`).
- Las **medidas** y los **índices calculados** siguen en
  `datos_ecocardiografia`.
- `hp_gradiente` **no existe más** como dato propio: era un duplicado de
  `gp_tricuspideo`. (La columna vieja de `datos_ecocardiografia` quedó
  deprecada en 8.7a.)

### 0.2 Especie

Las tres clasificaciones son **solo para perros** (`especie = 'canino'`).
En gatos no se calcula ninguna y no se muestra disclaimer: devolver `null`.

### 0.3 Disclaimer (ACVIM, MINE 2 y HP)

Si la clasificación **aplica** pero falta algún dato para calcularla, no se
calcula y el SPA muestra:

> Falta [parámetro(s)] para clasificar. ¿Desea hacer clasificación manual?

- `[parámetro(s)]` = nombre legible de cada dato faltante, separados por coma
  (ej.: "LA/Ao, LVIDDN").
- Si el profesional acepta, el campo queda editable a mano. En ACVIM se
  registra `acvim_origen = 'manual'`.
- Si decide **no** completar los datos, se clasifica con lo que hay:
  - HP: se calcula con el TRV y los signos cargados (lo no cargado no cuenta);
  - ACVIM y MINE 2: sus variables son obligatorias (1.3, 2.4); sin ellas el
    resultado queda vacío (`valor = null`) salvo carga manual.
- Para los parámetros del VD (3.3, sitio 1) el texto es: "Faltan [DVDd,
  DVDs, PLVDd, PLVDs]. ¿Desea medirlos manualmente?".
- **El disclaimer es solo del SPA.** Es un aviso para que el colega mida lo
  que falta si quiere. **El informe PDF no lo muestra.**
- El aviso se guarda en `clasificacion_advertencias` (ver 0.5) para
  trazabilidad, no para el informe.

### 0.4bis Unidades

- **Todas las velocidades se guardan en cm/s** (`velocidad_e_mitral`,
  `vmax_tricuspideo`, `vel_regurg_pulmonar`, etc.). MINE 2 y HP convierten a
  m/s **solo para el cálculo**: `v (m/s) = v (cm/s) / 100`.
- Tiempos en ms (`at_pulmonar`, `et_pulmonar`).
- Parámetros del VD (`dvdd`, `dvds`, `plvdd`, `plvds`) en **mm**. El resto de
  las medidas lineales siguen en cm.

### 0.4 Redondeo y cortes

- Toda variable se **redondea a 2 decimales** antes de compararla con un umbral.
- Los cortes son **semiabiertos**: cada valor cae en exactamente un rango.
  Las tablas de este archivo ya están escritas así.

### 0.5 Estructura del resultado

Cada función devuelve `null` (no aplica) o:

    {
      valor,          // estadio / puntaje / probabilidad, o null si falta un dato
      datos_usados,   // { variable: valor } efectivamente usados
      faltantes,      // [ 'LA/Ao', ... ] → dispara el disclaimer si no está vacío
      advertencias    // [ texto ]
    }

`clasificacion_advertencias` (jsonb) guarda, por clasificación, `faltantes`
y `advertencias`:

    { "acvim": { "faltantes": [], "advertencias": [] },
      "mine2": { ... }, "hp": { ... } }

---

## 1. ACVIM — Endocardiosis mitral (MMVD)

**Fuente:** Keene et al., 2019 (ACVIM consensus guidelines for the diagnosis
and treatment of myxomatous mitral valve disease in dogs).

### 1.1 Condición de aplicación

    function aplicaACVIM(ctx) {
      // Perro + al menos un soplo con foco 'Mitral' (cualquier intensidad).
      return ctx.especie === 'canino'
        && ctx.soplos.some((s) => s.foco === 'Mitral');
    }

- El soplo mitral es el **requisito** para considerar MMVD (P3). Se lee de
  `atenciones_cardiologia.soplos` (`foco`).
- El soplo **no estadifica** (P2): su intensidad no interviene en B1/B2.
- Si no aplica → `null` (sin disclaimer).

### 1.2 Estadios

| Estadio | Definición | Cómo se obtiene |
|---------|------------|-----------------|
| A | Predispuestos, sin soplo ni remodelado. | **No se calcula.** ACVIM empieza en B1. |
| B1 | Asintomático con soplo, **sin remodelado o con remodelado que no alcanza los criterios de B2**. | Calculado (1.3). |
| B2 | Asintomático con soplo y remodelado que cumple los criterios de B2. | Calculado (1.3). |
| C | Signos clínicos actuales o pasados de ICC por MMVD. | **Prellenado** + selector manual (1.4). |
| D | ICC refractaria al tratamiento estándar. | Selector manual (1.4; no se prellena). |

### 1.3 B1 vs B2 (criterios ecocardiográficos)

B2 si se cumplen **los dos**:

| Criterio | Umbral | Columna |
|----------|--------|---------|
| LA/Ao (2D, eje corto paraesternal derecho) | ≥ 1.60 | `datos_ecocardiografia.ai_ao_lineal` |
| LVIDDN | ≥ 1.70 | `datos_ecocardiografia.dvid_indexado` |

Si alguno no se cumple → B1.

- `ai_ao_lineal` es el LA/Ao **2D** en perros (decisión de Marcelo, E4).
  **No es modo M.** El modo M se usa solo en gatos, que no se clasifican.
- LVIDDN se toma **siempre** de `dvid_indexado` (E10), que el SPA ya calcula
  como `dvid (cm) / peso (kg)^0.294` (Cornell 2004, `interface/app.js`,
  `CORNELL_EXP`). No se recalcula aparte. Si no hay peso válido,
  `dvid_indexado` no existe → falta "LVIDDN".
- **VHS no se usa** (P4).
- Faltantes posibles: "LA/Ao", "LVIDDN" → disclaimer.

### 1.4 C y D: prellenado + corrección manual

- El SPA **prellena** C o D para acelerar la carga. El profesional revisa y
  corrige.
- El prellenado se basa en la **ecografía pulmonar** (§5,
  `eco_pulmonar_hallazgos`).
- Un **selector manual** (B1 / B2 / C / D) permite pisar el valor calculado o
  prellenado.
- `acvim_origen`:
  - `'calculado'`: el valor es el que produjo el SPA (1.3 o prellenado 1.4)
    y el profesional no lo cambió;
  - `'manual'`: el profesional eligió el estadio en el selector, o lo cargó a
    mano tras el disclaimer.
- **PROPUESTA (a confirmar):**
  - cualquier hallazgo 1–7 de §5 (síndrome alveolointersticial) → prellena
    **C**;
  - el hallazgo 8 (signo de nódulo) no prellena;
  - **D no se prellena nunca**: requiere saber que la ICC es refractaria al
    tratamiento, dato que la ecografía no aporta.
- Hasta que se confirme, 8.7b implementa la regla propuesta detrás de una
  constante única, fácil de cambiar.

---

## 2. MINE Score 2

**Fuente:** Vezzosi et al., 2025 (Risk stratification using Mitral
INsufficiency Echocardiographic score 2 in dogs with preclinical mitral valve
disease. J Vet Intern Med 39(5), doi:10.1111/jvim.70215).

### 2.1 Condición de aplicación

    function aplicaMINE2(ctx) {
      // Perros preclínicos: estadio ACVIM B1 o B2 (E3).
      return ctx.especie === 'canino'
        && (ctx.estadioACVIM === 'B1' || ctx.estadioACVIM === 'B2');
    }

- El paper incluyó perros B1 **y** B2 (374 + 375). No se limita a B2.
- En C o D (calculado o manual) → `null`.
- Si ACVIM no se pudo calcular (disclaimer en ACVIM) → MINE 2 tampoco;
  sus faltantes se informan igual.

### 2.2 Variables y puntos

Todas redondeadas a 2 decimales antes de puntuar (0.4).

| Variable | 1 punto | 2 puntos | 3 puntos | 4 puntos |
|----------|---------|----------|----------|----------|
| LA/Ao | < 1.70 | 1.70 – 1.90 | > 1.90 y ≤ 2.50 | > 2.50 |
| LVIDDn | < 1.70 | 1.70 – 2.00 | > 2.00 y ≤ 2.30 | > 2.30 |
| E-vel (m/s) | < 1.20 | 1.20 – 1.50 | > 1.50 | — |

("1.70 – 1.90" incluye ambos extremos.) Es la tabla del paper, con los
huecos 1.90/1.91 y 2.00/2.01 cerrados como cortes semiabiertos (E5/P7).

### 2.3 Severidad

| Severidad | Puntaje total |
|-----------|---------------|
| Leve | 3 – 4 |
| Moderado | 5 – 6 |
| Severo | 7 – 10 |
| Tardío | 11 (el paper no identificó casos) |

- `mine2_puntaje` = suma (integer, 3–11).
- `mine2_clasificacion` ∈ {`leve`, `moderado`, `severo`, `tardio`}.
- **"B2 avanzado"** = estadio ACVIM **B2** con MINE 2 **severo** (7–10).
  Se informa como etiqueta derivada; no tiene columna propia.

### 2.4 Datos

| Dato | Columna | Nota |
|------|---------|------|
| LA/Ao | `ai_ao_lineal` | 2D, eje corto (igual que el paper). |
| LVIDDn | `dvid_indexado` | Modo M, exponente 0.294 (igual que el paper). |
| E-vel | `velocidad_e_mitral` | **Se guarda en cm/s** (E6). Para MINE 2 se convierte: `E (m/s) = velocidad_e_mitral / 100`. |

Faltantes posibles: "LA/Ao", "LVIDDN", "velocidad E mitral" → disclaimer.

---

## 3. HP — Hipertensión pulmonar

**Fuente:** Reinero et al., 2020 (ACVIM consensus statement guidelines for the
diagnosis, classification, treatment, and monitoring of pulmonary
hypertension in dogs).

### 3.1 Condición de aplicación

    function aplicaHP(ctx) {
      // Perro + el estudio aporta al menos un parámetro que sugiere HP
      // (TRV o cualquiera de los signos de 3.3).
      return ctx.especie === 'canino' && ctx.hpSospecha;
    }

- `hp_sospecha` = `true` cuando el PDF o el profesional aportan al menos uno
  de: TRV (`vmax_tricuspideo`), una medida de 3.3, un signo visual de 3.3 o
  una `morfo_pulmonar` que cuente como signo (§4).
- Si hay sospecha → se clasifica. Si falta algo → disclaimer (P5).
- Los signos se cuentan **solo si el profesional los llenó** (o vinieron del
  PDF). Un signo no cargado no cuenta como presente (E12).
- Sin ningún parámetro de HP → `null`, `hp_sospecha = false`.

### 3.2 Matriz de probabilidad

TRV (m/s) = `vmax_tricuspideo` (cm/s) / 100, redondeado a 2 decimales.

| TRV (m/s) | Sitios con signos | Probabilidad |
|-----------|-------------------|--------------|
| ≤ 3.0 o no medible | 0 o 1 | Baja |
| ≤ 3.0 o no medible | 2 | Intermedia |
| ≤ 3.0 o no medible | 3 | Alta |
| > 3.0 y ≤ 3.4 | 0 o 1 | Intermedia |
| > 3.0 y ≤ 3.4 | 2 o 3 | Alta |
| > 3.4 | 0 | Intermedia |
| > 3.4 | 1 a 3 | Alta |

(E11/P8: la tercera franja es **> 3.4**, no ≥ 3.4.)

- `hp_clasificacion` ∈ {`baja`, `intermedia`, `alta`}.
- `hp_n_sitios` = cantidad de sitios (0–3) con al menos un signo presente.
- El gradiente tricuspídeo se informa desde `gp_tricuspideo`; no hay
  `hp_gradiente`.

### 3.3 Signos por sitio anatómico

Un sitio cuenta si tiene **al menos un** signo presente.

**Sitio 1 — Ventrículos**

| Signo | Origen |
|-------|--------|
| Aplanamiento del septo interventricular | Visual (`hp_signos`) |
| Llenado insuficiente del VI | Visual (`hp_signos`) |
| Hipertrofia y/o dilatación del VD | Visual (`hp_signos`) |
| Disfunción sistólica del VD | Visual (`hp_signos`) |

Parámetros del VD: DVDd, DVDs, PLVDd y PLVDs vienen en el PDF (`dvdd`,
`dvds`, `plvdd`, `plvds`, en mm). Si faltan → disclaimer "¿Desea medirlos
manualmente?" (0.3). **PENDIENTE:** no hay umbrales numéricos para que
cuenten como signo. Por ahora se informan y ayudan al profesional a marcar
"Hipertrofia y/o dilatación del VD", pero el signo sigue siendo visual.

**Sitio 2 — Tronco pulmonar**

| Signo | Umbral | Origen |
|-------|--------|--------|
| Dilatación del tronco pulmonar | TP/Ao > 1.0 | `1 / ao_ap` (`ao_ap` = Ao/AP) |
| Velocidad de regurgitación pulmonar diastólica | > 2.5 m/s (> 250 cm/s) | `vel_regurg_pulmonar` (cm/s) |
| Índice de distensibilidad de la arteria pulmonar derecha (RPAD) | < 30 % | `dapd` (= RPAD) |
| Tiempo de aceleración del flujo pulmonar (AT) | < 58 ms | `at_pulmonar` (ms) |
| AT:ET | < 0.30 | `at_et_pulmonar` |
| Muesca sistólica (*notching*) | Presente | `morfo_pulmonar` = Aortisada Tipo III |

AT:ET:
- se toma de `at_et_pulmonar` si viene en el PDF;
- si no viene y hay `at_pulmonar` y `et_pulmonar`, el SPA lo calcula como
  `at / et`, redondeado a 2 decimales;
- valor normal ≈ 0.5. Cuanto más bajo el AT:ET, más "aortizado" es el flujo
  pulmonar.

**Sitio 3 — Atrio derecho y vena cava caudal**

| Signo | Origen |
|-------|--------|
| Dilatación del AD | Visual (`hp_signos`) |
| Vena cava caudal dilatada (sin colapso respiratorio) | Visual (`hp_signos`); `dvccd` (DVCCd) se informa pero **no tiene umbral numérico** |

`hp_signos` (jsonb) guarda cada signo visual con su valor
(`true` / `false`; ausente = no evaluado). Ej.:

    { "sitio1": { "aplanamiento_septal": true, "llenado_insuficiente_vi": false },
      "sitio3": { "dilatacion_ad": true } }

### 3.4 Datos

| Dato | Columna | Estado |
|------|---------|--------|
| TRV (cm/s) | `vmax_tricuspideo` | Existe |
| Gradiente tricuspídeo (informativo) | `gp_tricuspideo` | Existe |
| Ao/AP → TP/Ao | `ao_ap` | Existe |
| VP/AP (informativo) | `vp_ap` | Existe |
| RPAD | `dapd` | Existe |
| DVCCd | `dvccd` | Existe |
| Vel. regurgitación pulmonar (cm/s) | `vel_regurg_pulmonar` | 8.7a-bis |
| AT pulmonar (ms) | `at_pulmonar` | 8.7a-bis |
| ET pulmonar (ms) | `et_pulmonar` | 8.7a-bis |
| AT:ET | `at_et_pulmonar` | 8.7a-bis |
| DVDd / DVDs / PLVDd / PLVDs (mm) | `dvdd` / `dvds` / `plvdd` / `plvds` | 8.7a-bis |
| Morfología del flujo pulmonar | `morfo_pulmonar` (atenciones) | 8.7a-bis |
| Signos visuales | `hp_signos` (atenciones) | 8.7a-bis |

---

## 4. Morfología de flujos (Doppler)

Se capturan con **dropdowns** en el SPA.

| Válvula | Opciones | Columna |
|---------|----------|---------|
| Aórtica | Conservada / En Daga | `morfo_aortica` |
| Pulmonar | Conservada / Aortisada Tipo I / Aortisada Tipo II / Aortisada Tipo III / En Daga | `morfo_pulmonar` |
| Mitral | — (sin morfología) | — |
| Tricuspídea | — (sin morfología) | — |

- **"En Daga"** = obstrucción dinámica del tracto de salida.
- Procesamiento de `morfo_pulmonar` para HP. El dropdown muestra las 5
  opciones, pero por ahora solo cuentan así:

| Opción | Para HP |
|--------|---------|
| Conservada | Normal, no cuenta |
| Aortisada Tipo III | *Notching*, **cuenta** (sitio 2) |
| Aortisada Tipo I | No cuenta (por ahora) |
| Aortisada Tipo II | No cuenta (por ahora) |
| En Daga | No cuenta |

- `morfo_aortica` no interviene en ninguna clasificación: se guarda y se
  informa.
- **Mejora pendiente:** la escala "Aortisada" (Tipos I y II).

---

## 5. Ecografía pulmonar

Sección nueva del SPA, que **se habilita según contexto**. Selección
múltiple, sin selección por defecto. Se guarda en
`atenciones_cardiologia.eco_pulmonar_hallazgos` (jsonb, array con los textos
elegidos). Es la base del prellenado de ACVIM C (1.4).

| # | Hallazgo |
|---|----------|
| 1 | Síndrome alveolointersticial leve en región perihiliar |
| 2 | Síndrome alveolointersticial leve que excede la región perihiliar en hemitórax izquierdo |
| 3 | Síndrome alveolointersticial leve que excede la región perihiliar en hemitórax derecho |
| 4 | Síndrome alveolointersticial leve que excede la región perihiliar en ambos hemitórax |
| 5 | Síndrome alveolointersticial en todos los campos pulmonares con abundantes líneas B |
| 6 | Síndrome alveolointersticial coalescente (líneas B en cortina) |
| 7 | Síndrome alveolointersticial con signo de fragmentación |
| 8 | Signo de nódulo |

(En las respuestas figuraba "hemotórax"; se escribe "hemitórax" porque se
refiere al lado del tórax. Confirmar.)

**PENDIENTE:** qué "contexto" habilita la sección. Propuesta: cuando aplica
ACVIM (perro con soplo mitral), con opción de habilitarla a mano.

---

## 6. Columnas

### 6.1 Aplicadas en 8.7a (2026-09-28)

`atenciones_cardiologia`: `acvim_estadio` text, `mine2_puntaje` integer,
`mine2_clasificacion` text, `hp_clasificacion` text (+ 3 índices).
Deprecadas en `datos_ecocardiografia`: `acvim_estadio`, `mine2_puntaje`,
`mine2_clasificacion`, `hp_gradiente`, `hp_clasificacion`.

### 6.2 Aplicadas en 8.7a-bis (2026-09-28)

`atenciones_cardiologia`:

| Columna | Tipo |
|---------|------|
| `acvim_origen` | text (`calculado` / `manual`) |
| `hp_sospecha` | boolean |
| `hp_signos` | jsonb |
| `hp_n_sitios` | smallint |
| `clasificacion_advertencias` | jsonb |
| `morfo_aortica` | text |
| `morfo_pulmonar` | text |
| `eco_pulmonar_hallazgos` | jsonb |

`datos_ecocardiografia`:

| Columna | Tipo |
|---------|------|
| `at_pulmonar` | numeric (ms) |
| `et_pulmonar` | numeric (ms) |
| `at_et_pulmonar` | numeric |
| `vel_regurg_pulmonar` | numeric (cm/s) |
| `dvdd` / `dvds` | numeric (mm) |
| `plvdd` / `plvds` | numeric (mm) |

**No se crean:** `vhs` (P4), `hp_gradiente` (E13), `ai_ao_2d`
(`ai_ao_lineal` ya es 2D, E4), `rpad_indice` (`dapd` ya es RPAD, P6).
Una columna de LA/Ao en modo M para gatos queda para cuando haga falta.

---

FIN DEL ARCHIVO
