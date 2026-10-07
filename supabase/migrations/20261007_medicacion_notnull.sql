-- 2026-10-07 — Sub-fase 8.7q: `atenciones_cardiologia.medicacion` siempre es un
-- arreglo (respuesta P5 de Marcelo: default '[]', nunca NULL). SQL del prompt de
-- Marcelo, envuelto en una transacción.
-- No borra tablas, columnas ni filas. Cambia:
--   - la columna pasa a tener default '[]' y a no admitir NULL;
--   - las atenciones que estaban en NULL (anteriores a 8.7p: tratamiento no
--     registrado) pasan a '[]' y ya no se distinguen de una atención sin
--     fármacos. Al ejecutarla eran las 4 filas de la tabla (2026-10-02 a
--     2026-10-04):
--       66a429ff-8269-4e97-98ad-e1ee54517183
--       82c39918-a1e9-4124-80a1-0a0cf7751151
--       cd75d2d2-a3d6-4727-984a-f49a8eaf8d51
--       ac5f6f64-e58c-43ee-b8eb-a0f44ba6bae9
-- Un insert que mande `medicacion: null` explícito falla desde ahora; el nodo
-- `Insert Atención Cardiología` manda siempre un arreglo.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

begin;

ALTER TABLE public.atenciones_cardiologia
  ALTER COLUMN medicacion SET DEFAULT '[]'::jsonb;

UPDATE public.atenciones_cardiologia
  SET medicacion = '[]'::jsonb
  WHERE medicacion IS NULL;

ALTER TABLE public.atenciones_cardiologia
  ALTER COLUMN medicacion SET NOT NULL;

commit;
