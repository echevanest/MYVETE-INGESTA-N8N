# `descripciones` y `patrones` — quién las escribe y cómo

Decisiones de Marcelo del 2026-10-07 (8.7s). **Nada de esto está implementado:**
las dos tablas existen desde el 2026-10-03 y están vacías. La implementación es
de 8.1 / 8.2.

La estructura de las tablas está en `supabase/schema.sql`.

## Quién escribe

**n8n.** El SPA no escribe ninguna de las dos tablas.

- Escribe con la credencial `service_role` que ya usan los nodos de Supabase
  del workflow `MYVETE - Ingesta` (`lkOwTFmVTZu7EMoU`). Las tablas tienen RLS
  habilitado sin políticas, así que ninguna otra vía puede escribirlas.
- `descripciones` cuelga de una atención (`atencion_id`, FK con
  `on delete cascade`): las filas se insertan después de
  `Insert Atención Cardiología`, que es el nodo que devuelve ese `id`.
- `patrones` es un agregado sin FK. El `UNIQUE NULLS NOT DISTINCT
  (patologia, grupo, subgrupo, opcion)` sirve de destino para un upsert.
  `updated_at` no tiene trigger: lo actualiza quien escribe.

## Normalización

La hace el código de n8n antes de insertar o hacer upsert. La base no la
fuerza.

| Columna | Tablas | Regla |
|---|---|---|
| `patologia` | `patrones` | MAYÚSCULAS (`MMVD`, `CMD`) |
| `grupo` | `descripciones`, `patrones` | minúsculas (`valvulas`, `cmd`) |
| `subgrupo` | `descripciones`, `patrones` | minúsculas (`mitral`, `vi`); puede ser NULL |

- **Sin CHECK ni validación:** las tres columnas son texto libre. Las listas de
  `schema.sql` (19 patologías, 21 grupos) son los valores previstos; un valor
  fuera de ellas se guarda igual.
- **Por qué importa:** para el UNIQUE de `patrones`, `CMD` y `cmd` son dos filas
  distintas. Sin normalizar, la frecuencia de una misma opción se reparte entre
  filas.
- **`patologia` y `grupo` no se unifican:** son entidades distintas. Hay grupos
  sin patología equivalente (`valvulas`, `camaras`, `funcion`) y los que se
  parecen no comparten nombre (grupo `estenosis_pulmonar`, patología `EP`).

## Sin definir

- Qué manda el SPA en el payload para que n8n arme las filas de
  `descripciones` (hoy el payload no trae grupo, subgrupo ni opción).
- De dónde sale la `patologia` de una atención para `patrones`.
- En qué workflow y en qué nodos se escribe, y si un fallo ahí alerta o sigue de
  largo como el tramo del eco.
- Cómo se calculan `frecuencia` y `confianza` (`confianza` no tiene escala).
- Si la normalización incluye algo más que mayúsculas y minúsculas: espacios al
  borde, acentos (`tricuspidea` / `tricuspídea`) o espacios internos
  (`tetralogia fallot` / `tetralogia_fallot`).
- Si `opcion` se normaliza. Hoy no hay regla: `Leve` y `leve` serían dos filas.
