# CRITERIOS DE CLASIFICACIÓN — MyVete

Versión 1.3 — 2026-09-29.
- v1.1: corrección de la v1.0 tras la auditoría de la Sub-fase 8.7 (errores
  E3–E13, decisiones de Marcelo P2–P8).
- v1.2: respuestas de Marcelo a las preguntas de la v1.1 (velocidades en cm/s,
  ecografía pulmonar, AT/ET, parámetros del VD, disclaimer solo en el SPA,
  procesamiento de la morfología pulmonar).
- v1.3: respuestas de Marcelo a las preguntas de la v1.2 (P1 prellenado de C
  por coincidencia de signos; P2 ecografía pulmonar vacía por defecto; P3
  "hemitórax"; P4 sección "Corazón derecho" y cálculo del VD; P5 prellenado
  siempre presente, con casilla en el disclaimer; P7 prellenado coherente de
  MINE 2 y HP; P8 "2 de 3" = sitios; relación DVD/DVI).

**Principio general (v1.3):** el SPA **siempre propone un valor** y el
profesional corrige. No se busca perfección: es una sugerencia.

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

### 0.3 Prellenado y disclaimer (ACVIM, MINE 2 y HP)

**Nunca queda vacío** (P5). Si la clasificación **aplica**, el SPA siempre
propone un valor, en este orden:

1. **Calculado**: están todos los datos → se calcula (1.3, 2.2, 3.2).
2. **Última consulta**: falta algún dato → se toma el valor de la última
   consulta del paciente (ej.: era ACVIM B2 y falta LVIDDN → queda B2).
   **Prima la última consulta** sobre cualquier estimación.
3. **Estimado**: no hay última consulta → el valor más probable con lo que
   hay (orientación parcial; ACVIM C: 1.4; HP: 3.1).

Aunque haya prellenado, si falta algún dato el disclaimer **aparece igual**:

> Falta [parámetro(s)] para clasificar. [casilla por cada dato faltante]

- `[parámetro(s)]` = nombre legible de cada dato faltante (ej.: "LA/Ao,
  LVIDDN").
- **Una casilla por cada dato faltante**, con su unidad. Es más fácil tipear
  el valor que volver a bajar el PDF.
- Al completar la casilla, el valor se guarda en su columna de
  `datos_ecocardiografia` (igual que si viniera del PDF) y **el SPA
  recalcula**. Si con eso ya no falta nada, el valor pasa a "calculado" y el
  disclaimer desaparece.
- El selector manual sigue disponible para pisar cualquier valor propuesto.
- Para los parámetros del VD (3.3, sitio 1) el texto es: "Faltan [DVDd,
  DVDs, PLVDd, PLVDs]." + casillas en mm.
- **El disclaimer es solo del SPA.** **El informe PDF no lo muestra.**
- Los faltantes y el origen del valor se guardan en
  `clasificacion_advertencias` (ver 0.5) para trazabilidad, no para el
  informe.

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
      valor,          // estadio / puntaje / probabilidad (nunca null si aplica, 0.3)
      origen,         // 'calculado' | 'ultima_consulta' | 'estimado' | 'manual'
      datos_usados,   // { variable: valor } efectivamente usados
      faltantes,      // [ 'LA/Ao', ... ] → dispara el disclaimer si no está vacío
      advertencias    // [ texto ]
    }

`clasificacion_advertencias` (jsonb) guarda, por clasificación, `origen`,
`faltantes` y `advertencias`:

    { "acvim": { "origen": "ultima_consulta", "faltantes": ["LVIDDN"], "advertencias": [] },
      "mine2": { ... }, "hp": { ... } }

`acvim_origen` (columna) usa los mismos cuatro valores. No tiene check
constraint, así que no hace falta migración.

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
| D | ICC refractaria al tratamiento estándar. | Selector manual, o última consulta (1.4; no se prellena por signos). |

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
- Faltantes posibles: "LA/Ao", "LVIDDN" → disclaimer con casillas (0.3). Con
  un faltante, el estadio propuesto es el de la última consulta; sin última
  consulta, el más probable con el criterio disponible (ej.: LA/Ao < 1.60 →
  B1 aunque falte LVIDDN, porque B2 exige los dos).

### 1.4 C y D: prellenado + corrección manual

- El SPA **prellena** el estadio para acelerar la carga. **No busca
  perfección: es una sugerencia.** El profesional corrige con el selector
  manual (B1 / B2 / C / D).
- **Con historial:** prima la última consulta (0.3). Un paciente que ya fue
  C (o D) se prellena como mínimo en ese estadio, porque C incluye signos de
  ICC **pasados** (1.2).
- **Sin historial (primer caso):** C se prellena por **coincidencia de
  signos**. Cada signo presente suma; cuantos más coinciden, más firme la
  sugerencia. **Prima lo ecográfico** (ecografía pulmonar y valores
  predictores de edema pesan más que lo clínico).

| # | Signo que suma para C | Origen en el SPA | Estado |
|---|-----------------------|------------------|--------|
| 1 | Botón rápido de perfil | Perfil aplicado (`PERFILES_BASE` / perfiles guardados) | Existe el botón; **falta** un perfil de ICC que marque "sugiere C" |
| 2 | Tos (no excluyente) | — | **Sin campo estructurado** (hoy solo en `anamnesis` texto libre) |
| 3 | Taquipnea o distrés respiratorio | `fr` (frecuencia respiratoria) | Existe `fr`; **umbral de taquipnea pendiente**. Distrés: sin campo |
| 4 | Colectas pleurales o abdominales asociadas a la cardiopatía | `efusion_pleural` (eco) | Pleural existe; **abdominal (ascitis) sin campo** |
| 5 | Ecografía pulmonar | `eco_pulmonar_hallazgos` (§5): hallazgos 1–7 | Existe (8.7a-bis). El 8 (nódulo) no suma |
| 6 | Valores predictores de alta probabilidad de edema | Medidas de `datos_ecocardiografia` | **Pendiente:** qué variables y qué umbrales |

- **Regla de decisión (P5, confirmada):** si hay **edema documentado**
  (ecografía pulmonar con hallazgos 1–7, ascitis o colecta pleural) →
  prellena **C**. Si no → el estadio más probable según los criterios
  ecográficos (1.3). **Si hay duda, el SPA elige el estadio más
  coincidente.** La regla va en una constante única, fácil de ajustar.
  - Colecta pleural = `efusion_pleural` cargado. Ascitis: **sin campo**
    todavía (§7); hasta que exista, no suma.
  - Los signos clínicos 1–4 de la tabla (perfil, tos, taquipnea, distrés)
    se muestran como apoyo, pero **no disparan C por sí solos** mientras no
    tengan campo y umbral (§7).
- **D no se prellena desde signos**: requiere saber que la ICC es refractaria
  al tratamiento, dato que la ecografía no aporta. Solo llega por historial
  (última consulta D) o por el selector.
- `acvim_origen` (0.5):
  - `'calculado'`: B1/B2 por 1.3, con todos los datos;
  - `'ultima_consulta'`: tomado de la consulta anterior (0.3);
  - `'estimado'`: prellenado por coincidencia de signos (C) o valor más
    probable con datos incompletos;
  - `'manual'`: el profesional eligió el estadio en el selector.

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
- En C o D (cualquier origen) → `null`.
- Se evalúa sobre el estadio ACVIM **propuesto** (0.3), sea calculado, de la
  última consulta o estimado.

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

Faltantes posibles: "LA/Ao", "LVIDDN", "velocidad E mitral" → disclaimer con
casillas (0.3). Mientras falte un dato, el puntaje y la severidad propuestos
son los de la última consulta. Sin última consulta (**P7**, `origen =
'estimado'`):

- la variable faltante se puntúa **en coherencia con las disponibles**:
  recibe el mismo puntaje que las variables presentes (si hay dos con
  distinto puntaje, el promedio redondeado hacia arriba, sin superar el
  máximo de la variable: 4 para LA/Ao y LVIDDn, 3 para E-vel);
- si los disponibles son graves, el faltante también;
- si no hay otra forma (ninguna variable disponible) → **1 punto**.

(La fórmula del promedio es la implementación propuesta de "coherencia";
confirmar.)

---

## 3. HP — Hipertensión pulmonar

**Fuente:** Reinero et al., 2020 (ACVIM consensus statement guidelines for the
diagnosis, classification, treatment, and monitoring of pulmonary
hypertension in dogs).

### 3.1 Condición de aplicación

    function aplicaHP(ctx) {
      // Perro + sección "Corazón derecho" habilitada (por el profesional o
      // por una alerta numérica) y no deshabilitada por el profesional.
      return ctx.especie === 'canino' && ctx.hpSospecha;
    }

**Sección "Corazón derecho" (HP) en el SPA** (P4):

- **Vacía y cerrada por defecto.**
- Se habilita si:
  - el profesional la habilita a mano; o
  - el SPA detecta un **signo de alerta numérico**: TRV > 3.0 m/s, o
    cualquier umbral numérico del sitio 2 de 3.3 (TP/Ao > 1.0, vel.
    regurgitación pulmonar > 250 cm/s, RPAD < 30 %, AT < 58 ms,
    AT:ET < 0.30). Los parámetros del VD **no disparan alerta** hasta que
    tengan umbrales (3.3, sitio 1).
- El profesional puede:
  - **deshabilitar toda la sección** → `hp_sospecha = false`, HP = `null`,
    aunque haya alertas;
  - **deshabilitar un ítem particular** con el que no coincide → ese signo
    no cuenta (queda `false` en `hp_signos`, con la marca de deshabilitado,
    ver 3.3).
- `hp_sospecha` = `true` cuando la sección está habilitada (a mano o por
  alerta) y no fue deshabilitada.

**El SPA calcula todo lo que pueda** (P4):

| Datos disponibles | Resultado | `origen` |
|-------------------|-----------|----------|
| TRV + los 3 sitios evaluados | **Clasificación cerrada** (matriz 3.2) | `calculado` |
| 2 de los 3 sitios evaluados | Se orienta y prellena (matriz con los sitios que hay) | `estimado` |
| Menos | Prellena la probabilidad más probable (P7: coherente con los datos disponibles; si no hay otra forma → **baja**) | `estimado` |

"2 de 3" = **2 de los 3 sitios anatómicos** de 3.3 (P8, confirmado).

- Con historial, si faltan datos prima la última consulta (0.3).
- Un sitio está "evaluado" si tiene al menos un signo cargado (`true` o
  `false`) o una medida con umbral. Un signo no cargado no cuenta como
  presente (E12).
- Sin la sección habilitada → `null`, `hp_sospecha = false`.

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
`dvds`, `plvdd`, `plvds`, **en mm**). Si faltan → disclaimer con casillas en
mm (0.3). **PENDIENTE: umbrales absolutos** de DVDd/DVDs/PLVDd/PLVDs. Van en
una constante vacía, lista para completarse; hasta entonces no disparan la
alerta de 3.1.

**Relación DVD/DVI** (decisión de Marcelo, 2026-09-29). Se calcula en
diástole: `DVD/DVI = dvdd (mm) / (dvid (cm) × 10)`, redondeado a 2
decimales (`dvid` está en cm y `dvdd` en mm: hay que convertir).

| DVD/DVI | Interpretación | Signo "Hipertrofia y/o dilatación del VD" |
|---------|----------------|-------------------------------------------|
| < 0.33 | Por debajo de lo normal | No cuenta |
| ≥ 0.33 y ≤ 0.50 | Normal (1/3 – 1/2) | No cuenta |
| > 0.50 y < 1.00 | **Zona gris** (Marcelo no la definió) | No cuenta (propuesta; confirmar) |
| = 1.00 | Sospecha | Cuenta (sitio 1) |
| > 1.00 | Sobrecarga del VD | Cuenta (sitio 1) |

Con redondeo a 2 decimales, "= 1" es exactamente 1.00. DVD/DVI ≥ 1.00 **no**
dispara la alerta de 3.1 (la alerta es solo de TRV y del sitio 2), salvo que
se decida lo contrario (§7).

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
(`true` / `false`; ausente = no evaluado) y la lista de ítems que el
profesional deshabilitó (3.1). Ej.:

    { "sitio1": { "aplanamiento_septal": true, "llenado_insuficiente_vi": false },
      "sitio3": { "dilatacion_ad": true },
      "deshabilitados": ["sitio2.at_pulmonar"] }

Un ítem en `deshabilitados` no cuenta como signo aunque su medida supere el
umbral. (Formato propuesto; no requiere migración.)

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

Sección nueva del SPA (P2):

- **Vacía y cerrada por defecto.** El profesional la activa si la quiere.
- **Dropdown de selección múltiple** con los hallazgos de la tabla; sin
  selección por defecto.
- Se guarda en `atenciones_cardiologia.eco_pulmonar_hallazgos` (jsonb, array
  con los textos elegidos). Sección no activada → `null`.
- Es uno de los signos que más pesan en el prellenado de ACVIM C (1.4).

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

"**Hemitórax**" (lado del tórax), confirmado por Marcelo (P3).

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

v1.3 no agrega columnas: `origen` va en `clasificacion_advertencias` y en
`acvim_origen` (text sin check), los ítems deshabilitados en `hp_signos`.

---

## 7. Pendientes (v1.3)

| # | Tema | Sección |
|---|------|---------|
| 1 | Qué variables y umbrales son "valores predictores de alta probabilidad de edema". | 1.4 |
| 2 | Tos, distrés respiratorio y colecta abdominal no tienen campo estructurado: ¿se agregan checkboxes (y columnas) o se leen de la anamnesis? | 1.4 |
| 3 | Umbral de taquipnea (`fr`). | 1.4 |
| 4 | Perfil rápido de ICC que marque "sugiere C" (hoy solo hay "Chequeo Sano" y "MVD B2"). | 1.4 |
| 5 | Ascitis: sin campo estructurado; hasta que exista no suma a "edema documentado". | 1.4 |
| 6 | Umbrales absolutos de DVDd, DVDs, PLVDd, PLVDs (mm). | 3.3 |
| 7 | DVD/DVI entre 0.50 y 1.00 (zona gris) y si DVD/DVI ≥ 1 debe disparar la alerta. | 3.3 |
| 8 | Fórmula de "coherencia con los disponibles" en MINE 2 (propuesta: promedio redondeado hacia arriba). | 2.4 |
| 9 | Mejora de la escala "Aortisada" (Tipos I y II). | 4 |

Resueltos en v1.3: P7 (prellenado de MINE 2 y HP), P8 ("2 de 3" = sitios),
regla de edema documentado para C (P5), DVD/DVI.

---

FIN DEL ARCHIVO
