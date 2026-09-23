# MyVete — Ingesta n8n

Este proyecto conecta MyVete (el sistema de historias clínicas) con n8n para automatizar la carga de consultas veterinarias. El diseño completo está en [`INFORME-ARQUITECTURA-MYVETE-V2.7.md`](./INFORME-ARQUITECTURA-MYVETE-V2.7.md).

## Estructura del proyecto

| Carpeta | Qué contiene |
|---|---|
| `/bookmarklet` | El "botón mágico" que se agrega a los marcadores de Chrome. Al hacer clic, abre el panel de carga. |
| `/interface` | El panel flotante donde se carga y confirma cada consulta. |
| `/n8n` | Respaldo y notas de los flujos automatizados que corren en la nube (n8n). |
| `/supabase` | Documentación del schema de la base de datos (`schema.sql`). |

## Estado actual (2026-09-23)

El sistema funciona de punta a punta. El veterinario:

1. abre al paciente en MyVete,
2. activa el bookmarklet,
3. completa la consulta en el panel (con dictado por voz y extracción automática del PDF del ecocardiograma),
4. envía.

n8n se encarga del resto:

- estructura la anamnesis con IA,
- guarda los datos en Supabase,
- genera el informe PDF firmado por el profesional,
- lo archiva en Google Drive y lo indexa en Google Sheets,
- se lo manda por mail al tutor.

- **Sprint 7 (Identificación de Profesional): cerrado.** Validado de punta a punta el 2026-09-22.
- **Sprint 8.0 (Examen clínico): implementado.**
  - El panel tiene un bloque único "Consulta y examen clínico".
  - Los valores clínicos que carga el veterinario se guardan en Supabase.
  - El informe suma la sección "EXAMEN CLÍNICO".
  - Falta la prueba de punta a punta con el workflow publicado.
- El workflow principal (`MYVETE - Ingesta`) queda **despublicado entre pruebas** para no recibir tráfico real. Se publica para validar.

## Documentación

- [`MANUAL MYVETE — VERSIÓN 2.1.md`](./MANUAL%20MYVETE%20—%20VERSIÓN%202.1.md): manual de usuario y documentación técnica.
- [`SPRINT-08-ESTADO.md`](./SPRINT-08-ESTADO.md): estado del Sprint 8, decisiones y pendientes.
- [`STATUS.md`](./STATUS.md): bitácora detallada del proyecto.
- [`n8n/README.md`](./n8n/README.md): workflows de n8n y sus respaldos.
- [`supabase/schema.sql`](./supabase/schema.sql): schema de la base.
