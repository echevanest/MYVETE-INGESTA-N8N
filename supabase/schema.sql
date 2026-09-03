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
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tutores enable row level security;
alter table public.mascotas enable row level security;
alter table public.atenciones_cardiologia enable row level security;

-- Sin políticas definidas todavía (ver hallazgo crítico arriba). No se agregó
-- ninguna en esta sesión — pendiente de decisión.
