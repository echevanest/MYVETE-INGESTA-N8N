# Experimento: widget inyectado (thin-client standalone)

## Propósito

`app.js` es un widget standalone auto-contenido (una IIFE, sin dependencias
externas) pensado como una **estrategia de distribución alternativa** a la
actual: en vez de un bookmarklet que abre una ventana popup (`window.open` +
handshake `postMessage`, el camino ya validado E2E — ver `STATUS.md` Sección
E), este widget se inyectaría directo en la página de MyVete — publicado en un
bucket **público** de Supabase Storage y cargado vía `<script>` tag o un
bookmarklet de una sola línea — en las 8 computadoras de los veterinarios,
reemplazando una extensión de navegador que se venía usando antes (mencionada
en el comentario original del archivo, sin más detalle documentado en el
repo).

Incluye su propia decisión de seguridad explícita: no lleva ninguna API key
embebida, porque un valor "secreto" dentro de un archivo servido desde una URL
pública deja de ser secreto en el momento en que se publica — la
autenticación real tendría que resolverse del lado de n8n, no en el cliente.

## Fecha

Creado el 2026-08-27 (según conversación con el usuario referenciada en el
comentario del archivo). Apareció sin comitear en el repo, descubierto y
movido acá el 2026-09-04.

## Estado: prototipo, desactualizado frente a la interfaz oficial

El código es válido y funcional — apunta al webhook real de producción
(`ingesta-filiacion-v4`) y correría sin errores si se inyectara en una página.
No está roto. Pero quedó congelado en el estado del 27/08 y no seguido el
ritmo de la arquitectura activa (`interface/app.js` + `bookmarklet/launcher.js`),
que en este momento es la interfaz oficial del proyecto.

## Por qué no se adoptó (comparación contra `interface/app.js` + `bookmarklet/launcher.js`)

* **Sin `id_myvete`:** el payload que arma (`armarPayload()`) no incluye
  `filiacion.tutor.id_myvete` — todo el trabajo de conciliación de tutores por
  ID (propagado desde el 2026-09-01, y la corrección del nodo `Upsert Tutor`
  en n8n del 2026-09-03) lo dejó atrás. Si se usara hoy, cada tutor nuevo se
  conciliaría solo por email, perdiendo el objetivo original de sobrevivir a
  cambios de email/teléfono.
* **Scraping genérico, nunca validado contra MyVete real:** intenta
  precompletar los campos de tutor con selectores CSS genéricos
  (`input[name="tutor"]`, `#tutor`, `input[type="email"]`) en vez de los
  selectores específicos que `bookmarklet/launcher.js` sí validó E2E contra el
  DOM real de MyVete (`.patient-info h1`, `#modalcustomerDetail_customers`,
  con el blindaje anti-contaminación documentado en `STATUS.md` Sección E).
* **`consulta` incompleta:** un solo `<textarea>` de dictado se manda como
  `consulta.anamnesis`; `consulta.diagnostico` queda hardcodeado a `''` y
  `consulta.indicaciones` **no se manda nunca**. Como el nodo
  `Insert Atención Cardiología` de n8n ahora persiste `diagnostico_raw` e
  `indicaciones_raw` (ver `supabase/schema.sql`), usar este widget hoy
  generaría atenciones con esos dos campos vacíos o ausentes.
* **Sin dictado por voz, sin historial de medicación, sin perfiles
  clínicos** — funcionalidad que sí tiene `interface/app.js`.

## Si se retoma en el futuro

No es un descarte definitivo de la idea de distribución (script público en
vez de extensión/bookmarklet+popup) — es una decisión de arquitectura, no
técnica. Si se decide retomarla, como mínimo hace falta: agregar `id_myvete`
al payload, completar `consulta.diagnostico`/`consulta.indicaciones`, y
decidir si conviene reusar la lógica de scraping ya validada de
`bookmarklet/launcher.js` en vez de los selectores genéricos actuales.
