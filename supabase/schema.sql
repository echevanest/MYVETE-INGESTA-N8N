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

-- email: UNIQUE (constraint plana, permite múltiples NULL). Invariante de
-- negocio: cada tutor tiene un email único. Es además la clave de la que
-- depende el fallback on_conflict=email del nodo n8n "Upsert Tutor" para
-- cuando el bookmarklet no pudo recuperar id_myvete (ver n8n/README.md).
-- El índice único parcial redundante `tutores_email_unq` (mismo alcance,
-- distinta forma) se eliminó el 2026-09-13 (migración
-- drop_redundant_tutores_email_unq_index) — no tenía dependencias y no era
-- el que usaba el on_conflict (Postgres no toma un índice con predicado
-- parcial como target de un ON CONFLICT (email) sin repetir el WHERE).
create unique index tutores_email_unique on public.tutores (email);

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
-- profesionales
-- ---------------------------------------------------------------------------
-- Sprint 7 (Identificación de Profesional), agregada 2026-09-17. Decisiones
-- cerradas por Marcelo: matrículas normalizadas en tipo + número (MN/MP);
-- la matrícula 2 es opcional (algunos profesionales tienen más de una); la
-- clave natural es (matricula_tipo, matricula_numero), UNIQUE, para
-- on_conflict=matricula_tipo,matricula_numero en el upsert (cambió el
-- 2026-09-21, Sprint 7 Prompt 3-bis: antes era email, que ahora es solo un
-- dato, no aparece en el informe); sin teléfono (dato personal sin uso);
-- índice en apellido
-- para la deduplicación de capa 2; firma_url guarda la URL pública del
-- archivo en el bucket Storage `firmas` (ver más abajo), nombrado
-- `{profesional_id}.{ext}`, un archivo por profesional con sobreescritura
-- bajo demanda.
create table public.profesionales (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  apellido     text not null,
  matricula_tipo     text not null,
  matricula_numero   text not null,
  matricula_2_tipo   text,
  matricula_2_numero text,
  email        text not null,
  especialidad text,
  firma_url    text not null,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profesionales_matricula_tipo_check
    check (matricula_tipo in ('MN', 'MP')),
  constraint profesionales_matricula_numero_check
    check (matricula_numero ~ '^[0-9]+$'),
  constraint profesionales_matricula_2_tipo_check
    check (matricula_2_tipo is null or matricula_2_tipo in ('MN', 'MP')),
  constraint profesionales_matricula_2_numero_check
    check (matricula_2_numero is null or matricula_2_numero ~ '^[0-9]+$'),
  -- matrícula 2: tipo y número van juntos o ninguno.
  constraint profesionales_matricula_2_coherente_check
    check ((matricula_2_tipo is null and matricula_2_numero is null)
        or (matricula_2_tipo is not null and matricula_2_numero is not null)),
  constraint profesionales_matricula_unique
    unique (matricula_tipo, matricula_numero)
);

create index profesionales_apellido_idx on public.profesionales (apellido);

-- updated_at se mantiene solo por trigger (no hay UPDATE manual esperado del
-- SPA/n8n que lo pise) — usa la función genérica public.set_updated_at(),
-- creada para este trigger y reutilizable por futuras tablas.
-- search_path fijo (public, pg_temp): hardening del security advisor, ya
-- aplicado en la base.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profesionales_set_updated_at
  before update on public.profesionales
  for each row
  execute function public.set_updated_at();

-- firma_url pasó a NOT NULL el 2026-09-19 (migración
-- `profesionales_firma_url_not_null`, Sprint 7 Prompt 2A): un profesional sin
-- firma no puede emitir informes, así que no hay estado válido con firma_url
-- nula. La tabla estaba vacía (0 filas), la migración no tuvo que rellenar
-- nada. Implicancia para el SPA: el alta de profesional debe subir la firma al
-- bucket ANTES del insert, o el insert falla con 23502.
--
-- Storage: bucket `firmas` (creado 2026-09-17 vía insert directo a
-- storage.buckets, sin acceso a la consola web en esta sesión) —
-- file_size_limit = 5 MB, allowed_mime_types = image/png, image/jpeg.
--
-- 2026-09-19 (Sprint 7 Prompt 2A): el bucket pasó a público (decisión P4-a,
-- Marcelo) con `update storage.buckets set public = true where id = 'firmas'`
-- — las firmas se sirven por URL pública directa, sin signed URLs, para que
-- n8n y el informe final puedan embeberlas sin renovar tokens. El límite de
-- 5 MB y el whitelist de MIME acotan el abuso.
--
-- Policies de storage.objects para el bucket (mismas 4, todas para `anon`,
-- todas acotadas por bucket_id = 'firmas'): el SPA sube/reemplaza/borra la
-- firma con la key anon, por eso necesita INSERT/UPDATE/DELETE además de
-- SELECT. DELETE hace falta porque reemplazar una firma .png por una .jpg
-- cambia el nombre del archivo ({profesional_id}.{ext}) y deja huérfano el
-- anterior. service_role sigue bypassando RLS.
--
-- Nota de alcance: estas policies NO están restringidas por profesional —
-- cualquier portador de la key anon puede sobreescribir la firma de cualquier
-- profesional. Es aceptable mientras la key anon no sea pública fuera del
-- consultorio; si eso cambia, hay que mover la subida a n8n/service_role.
--
-- 8.7d (2026-10-01): se eliminaron firmas_update_anon y firmas_delete_anon
-- (migración cerrar_policies_anon_delete_update_firmas_8_7d). Con la clave
-- publicable ya no se puede pisar ni borrar la firma de nadie. Quedan INSERT
-- (el formulario sube la firma, siempre con un nombre nuevo) y SELECT. La firma
-- reemplazada la borra n8n ("MYVETE - Alta Profesional") con service_role, y
-- solo si ningún profesional la sigue usando. Lo que sigue describe el estado
-- anterior de las 4 policies.
drop policy if exists "firmas_insert_anon" on storage.objects;
create policy "firmas_insert_anon"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'firmas');

-- Eliminadas en 8.7d (2026-10-01). Para volver atrás, recrearlas así:
--   create policy "firmas_update_anon" on storage.objects for update to anon
--     using (bucket_id = 'firmas') with check (bucket_id = 'firmas');
--   create policy "firmas_delete_anon" on storage.objects for delete to anon
--     using (bucket_id = 'firmas');
drop policy if exists "firmas_update_anon" on storage.objects;
drop policy if exists "firmas_delete_anon" on storage.objects;

drop policy if exists "firmas_select_anon" on storage.objects;
create policy "firmas_select_anon"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'firmas');

-- ---------------------------------------------------------------------------
-- atenciones_cardiologia
-- ---------------------------------------------------------------------------
create table public.atenciones_cardiologia (
  id               uuid primary key default gen_random_uuid(),
  mascota_id       uuid not null references public.mascotas (id) on delete cascade,
  profesional_id   uuid not null references public.profesionales (id) on delete restrict,
  fecha            timestamptz not null default now(),
  datos_filiacion  jsonb not null,
  informe_borrador jsonb,
  created_at       timestamptz not null default now(),
  anamnesis_raw    text,
  diagnostico_raw  text,
  indicaciones_raw text,
  -- Examen clínico (Sprint 8, ver bloque de comentarios más abajo)
  sensorio                       text,
  mucosas                        text,
  pulso_femoral                  text,
  reflejo_tusigeno               text,
  hidratacion                    text,
  tllc                           text,
  sucusion                       text,
  auscultacion_pulmonar_patron   text,
  auscultacion_pulmonar_amplitud text,
  auscultacion_pulmonar_sltb     text,
  fr_numero                      integer,
  fr_tipo                        text,
  auscultacion_cardiaca          jsonb,
  fc_numero                      integer,
  soplos                         jsonb,
  pas                            integer,
  pam                            integer,
  pad                            integer,
  -- Interpretación diagnóstica (Sub-fase 8.7a, ver bloque de comentarios más abajo)
  acvim_estadio                  text,
  mine2_puntaje                  integer,
  mine2_clasificacion            text,
  hp_clasificacion               text,
  -- 8.7a-bis
  acvim_origen                   text,
  hp_sospecha                    boolean,
  hp_signos                      jsonb,
  hp_n_sitios                    smallint,
  clasificacion_advertencias     jsonb,
  morfo_aortica                  text,
  morfo_pulmonar                 text,
  eco_pulmonar_hallazgos         jsonb,
  -- 8.7p; not null + default desde 8.7q
  medicacion                     jsonb not null default '[]'::jsonb
);

create index atenciones_mascota_fecha_idx on public.atenciones_cardiologia (mascota_id, fecha desc);

-- profesional_id agregada 2026-09-17 (Sprint 7) y endurecida 2026-09-19
-- (migración `atenciones_profesional_id_not_null_restrict`): NOT NULL + ON
-- DELETE RESTRICT. Los profesionales no se borran, se marcan activo = false;
-- RESTRICT impide borrar uno que tenga atenciones asociadas, y NOT NULL
-- garantiza que toda atención tenga profesional responsable. Antes de la
-- migración se borraron las 6 atenciones de prueba del prototipo (2026-09-06 a
-- 2026-09-14, confirmadas como descartables por Marcelo) que tenían
-- profesional_id nulo; sus datos_ecocardiografia cayeron antes por id.
-- Todavía no la llena ningún nodo n8n (falta editar "Insert Atención
-- Cardiología"): hasta entonces, todo insert sin profesional_id falla con 23502.
create index atenciones_cardiologia_profesional_id_idx on public.atenciones_cardiologia (profesional_id);

-- anamnesis_raw/diagnostico_raw/indicaciones_raw agregadas 2026-09-03
-- (migración add_raw_dictation_columns_atenciones_cardiologia) para conservar
-- el texto tal como lo dictó el veterinario (body.consulta.*), no solo el
-- resumen que devuelve la IA. Todavía no las llena ningún nodo — falta editar
-- "Insert Atención Cardiología" en n8n para incluirlas en el jsonBody (sin
-- acceso a n8n desde este repo/sesión; ver STATUS.md).

-- Examen clínico — Sprint 8, Prompt 1 (migración
-- `sprint8_examen_clinico_atenciones`, 2026-09-23). Decisión cerrada: el
-- examen vive en columnas de esta tabla (no tabla aparte, no jsonb único), así
-- se persiste en el mismo INSERT que la atención (atómico, sin nodo n8n extra).
-- Todas nullable y sin CHECK: los textos de los dropdowns se guardan tal cual
-- los muestra el SPA (con tildes); null = no evaluado / no informado.
--   - fc_numero (lpm) / fr_numero (por minuto): integer, sin CHECK.
--   - fr_tipo: calificador de la FR (Polipnea, Eupneico, Distrés ...).
--   - auscultacion_cardiaca: jsonb (admite más de un hallazgo). Queda vacía
--     cuando hay soplos, salvo elección explícita del profesional.
--   - soplos: jsonb, array de { momento, foco, intensidad } (N por atención).
--     Formato en informe: "SOPLO [MOMENTO] [FOCO] [INTENSIDAD]".
--   - pas / pam / pad (mmHg): integer, sin CHECK. Agregadas en el Prompt 2a
--     (migración `sprint8_pa_columns_drop_metricas_updated_at`, 2026-09-23)
--     para reemplazar la presión arterial que antes viajaba en `metricas`.
-- Al 2026-09-23 ningún nodo n8n ni el SPA las llenan todavía (Prompts 2b/2c).
--
-- `metricas` (jsonb) ELIMINADA en el Prompt 2a (misma migración): n8n la armaba
-- con la salida de la IA, no con lo que carga el profesional (hallazgo H2), y
-- sus valores pasan a fc_numero/fr_numero/mucosas/pas/pam/pad. La tabla tenía 0
-- filas, no hubo datos que migrar. OJO: el nodo n8n "Insert Atención
-- Cardiología" del workflow `MYVETE - Ingesta` (lkOwTFmVTZu7EMoU, inactivo) y
-- del backup CORE (5gGWXOjY2BBOAfuw, inactivo) todavía mandan `metricas` en el
-- jsonBody: hasta el Prompt 2c, ese insert falla con PGRST204 (columna
-- inexistente).
--
-- updated_at + trigger `atenciones_cardiologia_set_updated_at`: agregados en el
-- Prompt 1 y eliminados en el Prompt 2a (decisión: no aportaba valor). La
-- función public.set_updated_at() se conserva: la sigue usando profesionales.

-- Interpretación diagnóstica — Sub-fase 8.7a (migración
-- `sprint87a_clasificaciones_a_atenciones`, 2026-09-28). Decisión cerrada: las
-- clasificaciones (ACVIM, MINE 2, HP) son de la atención, no de la tabla de
-- medidas; los índices calculados siguen en datos_ecocardiografia. Criterios:
-- `CRITERIOS DE CLASIFICACION.md`. Todas nullable, sin CHECK hasta que el SPA
-- (8.7b) fije los valores. mine2_puntaje pasa a integer (suma de puntos, 3–11).
-- hp_gradiente NO se movió: duplicaba gp_tricuspideo (se elimina). Las columnas
-- equivalentes de datos_ecocardiografia quedan DEPRECADAS (no se borran hasta
-- que 8.7b deje de enviarlas). Ningún nodo n8n ni el SPA las llenan todavía.
--
-- 8.7a-bis (migración `sprint87a_bis_columnas_interpretacion`, 2026-09-28),
-- también sin CHECK (valores en CRITERIOS §0.5, §1.4, §3, §4):
--   - acvim_origen: 'calculado' | 'manual'.
--   - hp_sospecha / hp_signos (jsonb, signos visuales por sitio: true/false,
--     ausente = no evaluado) / hp_n_sitios (0–3).
--   - clasificacion_advertencias (jsonb): faltantes y advertencias por
--     clasificación. Solo para el SPA; el informe PDF no las muestra.
--   - morfo_aortica / morfo_pulmonar: texto del dropdown del SPA.
--   - eco_pulmonar_hallazgos (jsonb): array de hallazgos de ecografía
--     pulmonar (selección múltiple); base del prellenado ACVIM C.
--
-- 8.7p (migración `20261005_medicacion.sql`, 2026-10-05):
--   - medicacion (jsonb): tratamiento crónico de la atención, con la forma de
--     `payload.medicacion`: `[{ medicamento, dosis, frecuencia, estado }]`,
--     `estado` = 'continua' | 'nueva' | 'modificada'. Los fármacos eliminados
--     no viajan. `[]` = sin fármacos.
-- 8.7q (migración `20261007_medicacion_notnull.sql`, 2026-10-07):
--   - medicacion pasa a `not null default '[]'`: siempre es un arreglo. Las
--     atenciones anteriores a 8.7p, que estaban en NULL, quedaron en `[]`.
create index idx_atenciones_acvim     on public.atenciones_cardiologia (acvim_estadio);
create index idx_atenciones_mine2_clas on public.atenciones_cardiologia (mine2_clasificacion);
create index idx_atenciones_hp_clas    on public.atenciones_cardiologia (hp_clasificacion);

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
-- Sección 8, y este comentario): lineales en mm (8.7d, 2026-10-01: antes las
-- de Modo M iban en cm; la tabla tenía 0 filas, no hubo datos que convertir),
-- fracciones en %, velocidades
-- en m/s — OJO: decisión 8.7 (2026-09-28): TODAS las velocidades pasan a cm/s
-- (MINE 2 y HP convierten a m/s solo para calcular); rige cuando 8.7b cambie el
-- SPA. La tabla tenía 0 filas, no hubo datos que convertir. Las 7 columnas `text`: efusion_pericardica, efusion_pleural,
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
  masa_vi numeric, indice_masa_vi numeric, mvcf numeric, epr numeric, tiempo_eyectivo numeric,
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
  -- ao_ap = Ao/AP (TP/Ao = 1/ao_ap), vp_ap = VP/AP, dapd = RPAD (%),
  -- dvccd = DVCCd (semántica confirmada por Marcelo, 2026-09-28).
  vp_ap numeric, ao_ap numeric, dapd numeric, dvccd numeric,
  -- 8.7a-bis (2026-09-28): flujo pulmonar y VD. at/et en ms; vel_regurg_pulmonar
  -- en cm/s; dvdd/dvds/plvdd/plvds en mm (como todas las lineales desde 8.7d).
  at_pulmonar numeric, et_pulmonar numeric, at_et_pulmonar numeric,
  vel_regurg_pulmonar numeric,
  dvdd numeric, dvds numeric, plvdd numeric, plvds numeric,
  -- Efusiones / patrón (text)
  efusion_pericardica text, efusion_pleural text, patron_llenado_vi text, observaciones text,
  -- Indexados a superficie corporal / peso
  dvid_indexado numeric, dvs_indexado numeric, sivd_indexado numeric, sivs_indexado numeric,
  ppvid_indexado numeric, ppvis_indexado numeric,
  ai_indexado numeric, ao_indexado numeric, masa_vi_indexada numeric, volumen_ai_indexado numeric,
  volumen_fdi_indexado numeric, volumen_fsi_indexado numeric, volumen_si_indexado numeric,
  gasto_cardiaco_indexado numeric,
  volumen_vi_fd_indexado numeric, volumen_vi_fs_indexado numeric,
  -- Clasificación / scores — DEPRECADAS 8.7a (2026-09-28): movidas a
  -- atenciones_cardiologia (hp_gradiente no se movió: duplicaba gp_tricuspideo).
  -- Se eliminan, con sus índices, cuando 8.7b deje de enviarlas. Marcadas
  -- también con COMMENT ON COLUMN en la base.
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
-- Las columnas derivadas las calcula el SPA (interface/app.js §8), no se cargan
-- a mano (ampliado 2026-09-08): *_indexado = crudo / peso^exp (Cornell 2004,
-- exponente propio de cada parámetro: dvid .294, dvs .315, sivd .241, sivs .228,
-- ppvid .232, ppvis .224, ai .273, ao .309); volumen_ai_indexado =
-- volumen_ai_simp_simpson / peso (mL/kg); masa_vi (Devereux) =
-- 1.04·((dvid+sivd+ppvid)^3 − dvid^3) + 0.6; masa_vi_indexada = indice_masa_vi =
-- masa_vi / BSA (g/m²), BSA = 0.1017·peso^0.6667; mvcf =
-- (dvid − dvs) / (dvid · tiempo_eyectivo); epr = (sivd+ppvid)/dvid.
-- `tiempo_eyectivo` (LVET, s) y `epr` se agregaron como columnas propias
-- (migración `add_epr_tiempo_eyectivo_to_datos_ecocardiografia`, 2026-09-13)
-- para persistir la comparación histórica — antes viajaban solo en la UI.
--
-- El SPA también tiene 4 campos de electrocardiograma (FC/ritmo/eje/duración P)
-- en el mismo bloque visual, pero NO hay columnas EKG en esta tabla: viajan
-- aparte en `payload.bloque_ekg` y n8n los ignora por ahora (2026-09-08, al
-- unificar el viejo "Apéndice Métrico" dentro de este bloque).

-- ---------------------------------------------------------------------------
-- descripciones
-- ---------------------------------------------------------------------------
-- Opciones descriptivas elegidas en una atención (hallazgos por grupo), para el
-- sistema de aprendizaje futuro. Varias filas por atención; se borran con ella
-- (ON DELETE CASCADE). Migración
-- `supabase/migrations/20261003_descripciones_patrones.sql` (2026-10-03, por la
-- API de administración: no figura en el historial de migraciones de Supabase).
-- Hoy nada la escribe: ni el SPA ni n8n. La va a escribir n8n (8.1 / 8.2; ver
-- `docs/APRENDIZAJE-DESCRIPCIONES-PATRONES.md`).
--
-- Normalización (8.7s, 2026-10-07; decisión de Marcelo):
--   * `grupo` y `subgrupo` van en minúsculas.
--   * Sin CHECK: son texto libre. Las listas de abajo son los valores
--     previstos, no una validación; un valor que no esté en ellas se guarda.
--   * Normaliza el código que escribe (n8n), antes de insertar. La base no lo
--     fuerza: `Mitral` y `mitral` serían dos valores distintos.
--   * 8.7t (2026-10-07): la normalización de `grupo` y `subgrupo` incluye
--     también espacios al borde, acentos y espacios internos; `opcion` va en
--     minúsculas. Las filas llegan en `payload.descripciones`, un arreglo de
--     `{ grupo, subgrupo, opcion, orden }`; n8n guarda una fila por elemento.
--   * 8.7u (2026-10-07): `opcion` lleva solo minúsculas (acentos y espacios
--     se conservan); `orden` es la posición dentro del grupo y lo manda el
--     SPA; n8n inserta el arreglo entero en un solo pedido y, si falla, sigue
--     de largo y alerta, como el tramo del eco.
--   * 8.7v (2026-10-08), respuestas de Marcelo pendientes de su OK final:
--     `opcion` sale de un desplegable y se normaliza entera, como `grupo`
--     (reemplazaría el "solo minúsculas" de 8.7u); `orden` reinicia en cada
--     grupo. La patología de la atención iría en una columna nueva,
--     `atenciones_cardiologia.patologia` (text, admite NULL): no existe
--     todavía, la migración no se ejecutó.
--     Detalle en `docs/APRENDIZAJE-DESCRIPCIONES-PATRONES.md`.
--
-- `grupo` (text, sin CHECK), 21 valores previstos: valvulas, camaras, funcion,
-- regurgitaciones, cmh, cmd, estenosis_pulmonar, estenosis_aortica,
-- conducto_arterioso, tetralogia_fallot, cmavd, cardiopatia_arritmias,
-- cardiopatia_doxorrubicina, cardiopatias_nutricionales,
-- cardiopatia_restrictiva, hipertension_pulmonar, endocarditis,
-- tumores_cardiacos, pericardio, masas, otros.
--
-- `subgrupo` (text, opcional, sin CHECK), ejemplos:
--   valvulas / regurgitaciones: mitral, tricuspidea, aortica, pulmonar
--   camaras: vi, vd, ai, ad
--   cmh: hipertrofia, obstruccion, sam
--   cmd: dilatacion, hipoquinesia
create table public.descripciones (
  id          uuid primary key default gen_random_uuid(),
  atencion_id uuid not null references public.atenciones_cardiologia (id) on delete cascade,
  grupo       text not null,                  -- uno de los 21 grupos de arriba
  subgrupo    text,                           -- detalle dentro del grupo
  opcion      text not null,                  -- texto de la opción elegida
  orden       integer not null default 0,     -- posición dentro de la atención
  created_at  timestamptz not null default now()
);

create index idx_descripciones_atencion       on public.descripciones (atencion_id);
create index idx_descripciones_grupo          on public.descripciones (grupo);
create index idx_descripciones_opcion         on public.descripciones (opcion);
create index idx_descripciones_grupo_subgrupo on public.descripciones (grupo, subgrupo);

-- ---------------------------------------------------------------------------
-- patrones
-- ---------------------------------------------------------------------------
-- Qué opciones se eligen con cada patología y con qué frecuencia (sistema de
-- aprendizaje futuro). Sin FK: es un agregado, no cuelga de una atención. Misma
-- migración que `descripciones`. Hoy nada la escribe; la va a escribir n8n
-- (8.1 / 8.2; ver `docs/APRENDIZAJE-DESCRIPCIONES-PATRONES.md`).
--
-- `patologia` (text, sin CHECK), 19 valores previstos, en MAYÚSCULAS (8.7n,
-- 2026-10-04; decisión de Marcelo, reemplaza las minúsculas de 8.7m): MMVD, CMD,
-- CMH, CIA, CIV, EP, EA, CAP, TETRALOGIA_FALLOT, CMAVD, CARDIOPATIA_ARRITMIAS,
-- CARDIOPATIA_DOXORRUBICINA, CARDIOPATIAS_NUTRICIONALES,
-- CARDIOPATIA_RESTRICTIVA, HIPERTENSION_PULMONAR, ENDOCARDITIS,
-- TUMORES_CARDIACOS, PERICARDIO, OTROS.
--
-- Normalización (confirmada en 8.7s, 2026-10-07; decisión de Marcelo). La
-- aplica el código que escriba esta tabla, que va a ser n8n (8.1 / 8.2; hoy no
-- existe), antes de insertar o hacer upsert:
--   * `patologia` → MAYÚSCULAS.
--   * `grupo` y `subgrupo` → minúsculas, como en `descripciones`.
--   * Sin CHECK: `patologia`, `grupo` y `subgrupo` son texto libre. Las listas
--     son los valores previstos, no una validación.
--   * 8.7t (2026-10-07): además de mayúsculas y minúsculas, se normalizan
--     espacios al borde, acentos y espacios internos; `opcion` va en
--     minúsculas.
-- `frecuencia` y `confianza` (8.7t, 8.7u): Fase 1 a mano; Fase 2 por
-- aprendizaje. Los patrones de la Fase 1 se cargan a mano (8.7u): los perfiles
-- y los botones rápidos no están en Supabase (`PERFILES_BASE` + localStorage)
-- y no se espera a que 8.2 los migre.
--
-- `confianza` (8.7u): escala de 0 a 1 = atenciones con la opción / atenciones
-- de la patología. La base no la fuerza (`numeric`, sin CHECK).
--
-- `origen` (8.7u, migración `20261007_patrones_origen.sql`): `manual` para los
-- patrones cargados a mano, `aprendido` para los que calcula el aprendizaje.
-- Default `'manual'`, admite NULL, sin CHECK. Sirve para que el recálculo de
-- la Fase 2 no pise lo cargado a mano.
-- 8.7v (2026-10-08): Marcelo respondió NOT NULL + CHECK (`manual` /
-- `aprendido`), pendiente de su OK final. No se ejecutó: la columna sigue
-- como está abajo.
-- Nada en la base lo fuerza: `CMD` y `cmd` serían dos filas distintas para el
-- UNIQUE, así que la normalización es responsabilidad de quien escribe.
--
-- `patologia` y `grupo` son entidades distintas y no se unifican (8.7s): hay
-- grupos sin patología equivalente (valvulas, camaras, funcion, …) y los que
-- se parecen no comparten nombre (grupo `estenosis_pulmonar`, patología `EP`).
--
-- UNIQUE sobre (patologia, grupo, subgrupo, opcion) desde 8.7m
-- (`supabase/migrations/20261004_patrones_unique_minusculas.sql`). NULLS NOT
-- DISTINCT: dos filas con subgrupo NULL y el resto igual también chocan. Sirve
-- de destino para un upsert. La migración de 8.7m también pasó `patologia` a
-- minúsculas con un UPDATE, pero la tabla estaba vacía: no quedó ninguna fila
-- en minúsculas.
create table public.patrones (
  id         uuid primary key default gen_random_uuid(),
  patologia  text not null,                   -- una de las 19 de arriba
  grupo      text not null,                   -- mismos grupos que descripciones
  subgrupo   text,
  opcion     text not null,
  frecuencia integer not null default 0,      -- veces que se eligió la opción
  confianza  numeric,                         -- de 0 a 1 (8.7u); sin CHECK
  updated_at timestamptz not null default now(),  -- sin trigger: lo actualiza quien escribe
  origen     text default 'manual',           -- 'manual' | 'aprendido' (8.7u); sin CHECK
  constraint patrones_unique unique nulls not distinct (patologia, grupo, subgrupo, opcion)
);

create index idx_patrones_patologia       on public.patrones (patologia);
create index idx_patrones_grupo           on public.patrones (grupo);
create index idx_patrones_patologia_grupo on public.patrones (patologia, grupo);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tutores enable row level security;
alter table public.mascotas enable row level security;
alter table public.atenciones_cardiologia enable row level security;
alter table public.datos_ecocardiografia enable row level security;

alter table public.descripciones enable row level security;
alter table public.patrones enable row level security;

-- descripciones y patrones (2026-10-03): RLS habilitado, sin políticas, igual
-- que las 4 de arriba.
--
-- Sin políticas definidas todavía (ver hallazgo crítico arriba); las 4 tablas
-- igual. Los nodos n8n escriben con la credencial service_role, que bypassa
-- RLS — no hace falta política para `anon`. No se agregó ninguna en esta
-- sesión.

-- profesionales: única tabla con política de `anon` definida. Habilitada y
-- con policy en la MISMA transacción (2026-09-17) para no dejar ventana de
-- RLS-on-sin-políticas. INSERT/UPDATE/DELETE quedan denegados para
-- anon/authenticated por default (sin política = deny); service_role sigue
-- bypassando RLS como en las otras 4 tablas.
alter table public.profesionales enable row level security;

create policy "profesionales_select_anon"
  on public.profesionales
  for select
  to anon
  using (activo = true);
