-- 2026-10-05 — Sub-fase 8.7p: columna `medicacion` en `atenciones_cardiologia`
-- (Fase 1 de docs/AUTOFILL-TRATAMIENTO.md). SQL del prompt de Marcelo, sin
-- cambios.
-- Solo agrega una columna. Admite NULL y no tiene default: las atenciones
-- anteriores quedan en NULL (tratamiento no registrado); las nuevas guardan un
-- arreglo JSON con la forma de `payload.medicacion`
-- (`[{ medicamento, dosis, frecuencia, estado }]`), `[]` si no hay fármacos.
-- No modifica ni borra nada existente.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

ALTER TABLE public.atenciones_cardiologia
  ADD COLUMN medicacion jsonb;
