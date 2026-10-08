-- 2026-10-08 — Sub-fase 8.7x: `atenciones_cardiologia.patologia` pasa de
-- `text` a `text[]` (respuesta de Marcelo: una atención puede tener varias
-- patologías y se guardan todas). SQL del prompt de Marcelo, sin cambios.
-- Cambia el tipo de una columna. No borra filas ni datos: la columna se creó
-- el mismo día (`20261008_patologia_origen.sql`) y estaba en NULL en las 4
-- atenciones que había; el USING deja NULL en NULL y envolvería en un arreglo
-- de un elemento cualquier valor que hubiera.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

ALTER TABLE public.atenciones_cardiologia
  ALTER COLUMN patologia TYPE text[]
  USING CASE
    WHEN patologia IS NULL THEN NULL
    ELSE ARRAY[patologia]
  END;
