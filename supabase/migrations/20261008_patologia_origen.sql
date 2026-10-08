-- 2026-10-08 — Sub-fase 8.7w: columna `patologia` en `atenciones_cardiologia`
-- (respuesta P1 de Marcelo) y `origen` NOT NULL + CHECK en `patrones`
-- (respuesta P8). SQL del prompt de Marcelo; CODE solo agregó el
-- `begin; … commit;` para que se apliquen las tres sentencias o ninguna.
-- No borra ni modifica filas.
--   - `atenciones_cardiologia.patologia` (text, admite NULL, sin default, sin
--     CHECK): patología de la atención. Las 4 atenciones que había quedan en
--     NULL. Hoy nada la escribe.
--   - `patrones.origen`: pasa a NOT NULL (conserva el default 'manual') y
--     suma el CHECK `patrones_origen_check` ('manual' / 'aprendido'). La tabla
--     estaba vacía al ejecutarla.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

begin;

ALTER TABLE public.atenciones_cardiologia
  ADD COLUMN patologia text;

ALTER TABLE public.patrones
  ALTER COLUMN origen SET NOT NULL;

ALTER TABLE public.patrones
  ADD CONSTRAINT patrones_origen_check
  CHECK (origen IN ('manual', 'aprendido'));

commit;
