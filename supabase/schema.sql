-- MyVete Cardiología — schema real de Supabase (proyecto "myvete-cardiologia",
-- ref tuedigqvvkvgongpcnjx, region sa-east-1).
--
-- Este archivo es un volcado DESCRIPTIVO reconstruido por introspección directa
-- de la base el 2026-09-03 (information_schema.columns, pg_constraint,
-- pg_indexes) — no es el DDL que se ejecutó para crearlo. El schema ya existía
-- antes de esta sesión, vía las migraciones nativas de Supabase listadas abajo;
-- no hay un archivo previo en el repo que lo documentara.
--
-- Historial de migraciones (mcp Supabase list_migrations, 2026-09-03):
--   20260825223211  esquema_inicial_myvete
--   20260825224845  activar_rls
--   20260826163200  add_unique_constraints_tutor_mascota_upsert
--   20260826175134  fix_tutores_email_unique_constraint
--   20260826215712  drop_tutores_telefono_unique
--   20260901173847  add_id_myvete_to_tutores
--
-- ⚠️ HALLAZGO CRÍTICO (ver STATUS.md 2026-09-03): las 3 tablas tienen RLS
-- habilitado (`activar_rls`) pero CERO políticas definidas (pg_policies vacío).
-- Con RLS ON y sin políticas, Postgres deniega todo acceso por defecto —
-- incluido el rol `anon` que usa el nodo n8n vía apikey publicable. Es
-- consistente con que las 3 tablas tengan 0 filas hoy: todo POST del workflow
-- a estas tablas está siendo rechazado. Falta decidir e implementar la
-- política (¿anon abierto? ¿service_role restringido a n8n?) antes de que esto
-- pueda funcionar — no se agregó ninguna política en esta sesión sin
-- confirmación previa, por ser una decisión de seguridad.

-- ---------------------------------------------------------------------------
-- tutores
-- ---------------------------------------------------------------------------
create table public.tutores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  telefono   text,
  email      text,
  id_myvete  text,
  created_at timestamptz not null default now()
);

-- email: dos índices UNIQUE redundantes (limpieza pendiente, no bloqueante)
create unique index tutores_email_unique on public.tutores (email);
create unique index tutores_email_unq    on public.tutores (email)
  where (email is not null and email <> '');

-- id_myvete: UNIQUE simple (PG permite múltiples NULL, así que tutores sin
-- id_myvete resuelto por el scraper no chocan entre sí). Agregada 2026-09-01
-- (migración add_id_myvete_to_tutores) — ya existe, contra lo que se asumió
-- al abrir esta conversación.
create unique index tutores_id_myvete_unique on public.tutores (id_myvete);

-- El nodo "Upsert Tutor" del workflow (ver n8n/workflow_v5_supabase.sanitized.json)
-- sigue usando on_conflict=email y NO envía id_myvete en el body todavía,
-- aunque la columna y su UNIQUE ya están listas para el cambio.

-- ---------------------------------------------------------------------------
-- mascotas
-- ---------------------------------------------------------------------------
create table public.mascotas (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references public.tutores (id) on delete cascade,
  nombre     text not null,
  especie    text,
  raza       text,
  created_at timestamptz not null default now()
);

-- Dos índices UNIQUE redundantes sobre el mismo par de columnas (limpieza
-- pendiente, no bloqueante): idx_mascotas_tutor_nombre_unique y
-- mascotas_tutor_nombre_unq. Matchea on_conflict=tutor_id,nombre del nodo
-- "Upsert Mascota".
create unique index idx_mascotas_tutor_nombre_unique on public.mascotas (tutor_id, nombre);

create index mascotas_tutor_id_idx on public.mascotas (tutor_id);

-- Nota: el contrato de payload (CONTRATO-DE-DATOS-V2.7.md) incluye
-- filiacion.mascota.pesoActual, pero no hay columna para eso acá ni el nodo
-- lo envía — dato que hoy se descarta en el tramo Supabase.

-- ---------------------------------------------------------------------------
-- atenciones_cardiologia
-- ---------------------------------------------------------------------------
create table public.atenciones_cardiologia (
  id               uuid primary key default gen_random_uuid(),
  mascota_id       uuid not null references public.mascotas (id) on delete cascade,
  fecha            timestamptz not null default now(),
  datos_filiacion  jsonb not null,
  metricas         jsonb,
  informe_borrador jsonb,
  created_at       timestamptz not null default now(),
  anamnesis_raw    text,
  diagnostico_raw  text,
  indicaciones_raw text
);

create index atenciones_mascota_fecha_idx on public.atenciones_cardiologia (mascota_id, fecha desc);

-- anamnesis_raw/diagnostico_raw/indicaciones_raw agregadas 2026-09-03
-- (migración add_raw_dictation_columns_atenciones_cardiologia) para conservar
-- el texto tal como lo dictó el veterinario (body.consulta.*), no solo el
-- resumen que devuelve la IA. Todavía no las llena ningún nodo — falta editar
-- "Insert Atención Cardiología" en n8n para incluirlas en el jsonBody (sin
-- acceso a n8n desde este repo/sesión; ver STATUS.md).

-- ---------------------------------------------------------------------------
-- datos_ecocardiografia
-- ---------------------------------------------------------------------------
-- Una fila por atención (relación 1:1). NO se creó por migración nativa de
-- Supabase (no aparece en supabase_migrations.schema_migrations) — se creó
-- directo en el proyecto antes de la sesión del 2026-09-08. Este bloque es
-- introspección de information_schema/pg_constraint/pg_indexes del 2026-09-08.
--
-- PK = atencion_id (no hay columna `id` propia): la fila se identifica por la
-- atención a la que pertenece. FK a atenciones_cardiologia con ON DELETE
-- CASCADE, así que borrar una atención (o su mascota, o su tutor) se lleva la
-- fila de eco. El workflow n8n hace UPSERT con on_conflict=atencion_id.
--
-- ~72 columnas de datos (todas nullable), casi todas `numeric` sin unidad
-- declarada. Convención de unidades fijada del lado del SPA (interface/app.js
-- Sección 8, y este comentario): lineales en cm, fracciones en %, velocidades
-- en m/s. Las 7 columnas `text`: efusion_pericardica, efusion_pleural,
-- patron_llenado_vi, observaciones, acvim_estadio, mine2_clasificacion,
-- hp_clasificacion.
create table public.datos_ecocardiografia (
  atencion_id uuid primary key references public.atenciones_cardiologia (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Modo M / lineales
  sivd numeric, sivs numeric, dvid numeric, dvs numeric, ppvid numeric, ppvis numeric,
  -- Función sistólica Modo M / Teichholz
  fe_modom numeric, fs_modom numeric,
  volumen_fdi_modom numeric, volumen_fsi_modom numeric, volumen_si_modom numeric,
  gasto_cardiaco_modom numeric,
  masa_vi numeric, indice_masa_vi numeric, mvcf numeric,
  -- Simpson
  fe_simpson numeric,
  volumen_ai_esv_simpson numeric, volumen_ai_simp_simpson numeric,
  volumen_vi_fd_simpson numeric, volumen_vi_fs_simpson numeric,
  -- Aurícula izq / aorta
  ai_lineal numeric, ao_lineal numeric, ai_ao_lineal numeric, ai_ao_area numeric,
  -- Doppler aórtico / pulmonar
  vmax_ao numeric, gp_ao numeric, vti_ao numeric, thp_ao numeric,
  vmax_pulmonar numeric, gp_pulmonar numeric,
  -- Doppler mitral / tricúspide
  vmax_mitral numeric, gp_mitral numeric,
  velocidad_e_mitral numeric, velocidad_a_mitral numeric, relacion_ea_mitral numeric,
  vmax_tricuspideo numeric, gp_tricuspideo numeric,
  velocidad_e_tricuspideo numeric, velocidad_a_tricuspideo numeric, relacion_ea_tricuspideo numeric,
  -- Función longitudinal / atrial / derecho
  mapse numeric, tapse numeric, fa_atrial numeric,
  vp_ap numeric, ao_ap numeric, dapd numeric, dvccd numeric,
  -- Efusiones / patrón (text)
  efusion_pericardica text, efusion_pleural text, patron_llenado_vi text, observaciones text,
  -- Indexados a superficie corporal / peso
  dvid_indexado numeric, dvs_indexado numeric, sivd_indexado numeric, sivs_indexado numeric,
  ppvid_indexado numeric, ppvis_indexado numeric,
  ai_indexado numeric, ao_indexado numeric, masa_vi_indexada numeric, volumen_ai_indexado numeric,
  volumen_fdi_indexado numeric, volumen_fsi_indexado numeric, volumen_si_indexado numeric,
  gasto_cardiaco_indexado numeric,
  volumen_vi_fd_indexado numeric, volumen_vi_fs_indexado numeric,
  -- Clasificación / scores
  acvim_estadio text, mine2_puntaje numeric, mine2_clasificacion text,
  hp_gradiente numeric, hp_clasificacion text
);

create index idx_datos_eco_acvim       on public.datos_ecocardiografia (acvim_estadio);
create index idx_datos_eco_mine2_clas  on public.datos_ecocardiografia (mine2_clasificacion);
create index idx_datos_eco_hp_clas     on public.datos_ecocardiografia (hp_clasificacion);
create index idx_datos_eco_created_at  on public.datos_ecocardiografia (created_at);

-- El SPA (interface/app.js Sección 8) tiene campos para un subconjunto (~30) de
-- estas columnas — el resto viaja siempre como null hasta que se decida sumarlas
-- a la UI. Nodo n8n que la puebla: "Insert Datos Ecocardiografía" (ver
-- n8n/README.md).
--
-- 3 columnas *_indexado/a las calcula el SPA desde #paciente-peso, no se cargan
-- a mano: dvid_indexado = dvid/peso^0.294 (Cornell); volumen_ai_indexado =
-- volumen_ai_simp_simpson/peso (mL/kg); masa_vi_indexada = masa_vi/BSA (g/m²),
-- BSA = 0.1017·peso^0.6667.
--
-- El SPA también tiene 4 campos de electrocardiograma (FC/ritmo/eje/duración P)
-- en el mismo bloque visual, pero NO hay columnas EKG en esta tabla: viajan
-- aparte en `payload.bloque_ekg` y n8n los ignora por ahora (2026-09-08, al
-- unificar el viejo "Apéndice Métrico" dentro de este bloque).

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tutores enable row level security;
alter table public.mascotas enable row level security;
alter table public.atenciones_cardiologia enable row level security;
alter table public.datos_ecocardiografia enable row level security;

-- Sin políticas definidas todavía (ver hallazgo crítico arriba); las 4 tablas
-- igual. Los nodos n8n escriben con la credencial service_role, que bypassa
-- RLS — no hace falta política para `anon`. No se agregó ninguna en esta
-- sesión.
