-- 2026-10-07 — Sub-fase 8.7u: columna `origen` en `patrones` (respuesta P8 de
-- Marcelo). SQL del prompt de Marcelo, sin cambios.
-- Solo agrega una columna. No modifica ni borra nada existente; la tabla
-- estaba vacía al ejecutarla.
--   - `origen` (text, default 'manual', admite NULL, sin CHECK): 'manual' para
--     los patrones cargados a mano (Fase 1), 'aprendido' para los que calcula
--     el aprendizaje (Fase 2). Sirve para que el recálculo de la Fase 2 no pise
--     lo cargado a mano.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

ALTER TABLE public.patrones
  ADD COLUMN origen text DEFAULT 'manual';
