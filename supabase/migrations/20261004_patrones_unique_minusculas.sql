-- 2026-10-04 — Sub-fase 8.7m: `patrones` con UNIQUE y patologías en minúsculas.
-- Una sola transacción. No borra nada.
--
-- 1. Pasa `patologia` a minúsculas. La tabla está vacía al 2026-10-04, así que
--    hoy no cambia ninguna fila; queda por si alguien cargó algo antes de
--    ejecutar. Va primero para que el UNIQUE se cree sobre los valores finales.
-- 2. UNIQUE sobre (patologia, grupo, subgrupo, opcion). `subgrupo` admite NULL
--    y en un UNIQUE común dos NULL no chocan: NULLS NOT DISTINCT (Postgres 15+,
--    el proyecto corre 17.6) hace que dos filas con subgrupo NULL y el resto
--    igual sí choquen. Es una constraint sobre columnas, no un índice sobre
--    COALESCE(subgrupo, ''), para poder usarla después como destino de un
--    upsert (`on conflict (patologia, grupo, subgrupo, opcion)`).
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

begin;

UPDATE public.patrones SET patologia = LOWER(patologia)
  WHERE patologia <> LOWER(patologia);

ALTER TABLE public.patrones
  ADD CONSTRAINT patrones_unique
  UNIQUE NULLS NOT DISTINCT (patologia, grupo, subgrupo, opcion);

commit;
