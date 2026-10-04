-- 2026-10-03 — Tablas `descripciones` y `patrones` (sistema de aprendizaje
-- futuro). SQL del prompt de Marcelo, sin cambios, en una sola transacción.
-- Solo crea: 2 tablas, 7 índices y RLS habilitado sin políticas (anon y
-- authenticated quedan sin acceso; service_role bypassa RLS, como en el resto).
-- No modifica ni borra nada existente.
-- Ejecutada por la API de administración (docs/SUPABASE-DDL.md).

begin;

CREATE TABLE public.descripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id uuid NOT NULL REFERENCES public.atenciones_cardiologia(id) ON DELETE CASCADE,
  grupo text NOT NULL,
  subgrupo text,
  opcion text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_descripciones_atencion ON public.descripciones (atencion_id);
CREATE INDEX idx_descripciones_grupo ON public.descripciones (grupo);
CREATE INDEX idx_descripciones_opcion ON public.descripciones (opcion);
CREATE INDEX idx_descripciones_grupo_subgrupo ON public.descripciones (grupo, subgrupo);

ALTER TABLE public.descripciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.patrones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patologia text NOT NULL,
  grupo text NOT NULL,
  subgrupo text,
  opcion text NOT NULL,
  frecuencia integer NOT NULL DEFAULT 0,
  confianza numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patrones_patologia ON public.patrones (patologia);
CREATE INDEX idx_patrones_grupo ON public.patrones (grupo);
CREATE INDEX idx_patrones_patologia_grupo ON public.patrones (patologia, grupo);

ALTER TABLE public.patrones ENABLE ROW LEVEL SECURITY;

commit;
