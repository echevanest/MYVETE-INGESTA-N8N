# DDL de Supabase por la API de administración

Decisión del 2026-10-01 (Marcelo): los cambios de estructura de la base
(`create`, `alter`, `drop`, policies, índices) **no van por el MCP de Supabase**.
Van por `curl` a la API de administración, con el SQL guardado antes en un
archivo del repo.

Motivo: el 2026-10-01 una migración (`drop policy`) llegó al diálogo de
aprobación del MCP sin que se supiera qué iba a borrar. Con esta vía, el SQL
se lee en el chat y queda en el repo antes de ejecutarse.

Las lecturas (`select`) pueden seguir yendo por el MCP o por esta misma API.
El trabajo sobre filas y archivos sigue por REST con la service key (ver
`ACCESS_STRATEGY.md`).

## Datos

| | |
|---|---|
| Proyecto | `myvete-cardiologia` |
| `project_ref` | `tuedigqvvkvgongpcnjx` |
| Endpoint | `POST https://api.supabase.com/v1/projects/tuedigqvvkvgongpcnjx/database/query` |
| Autenticación | `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` |
| Token | Variable de entorno `SUPABASE_ACCESS_TOKEN` (token personal `sbp_…`, de la cuenta, no del proyecto). No está en `.secrets/` ni se versiona. |
| Cuerpo | `{"query": "<SQL>"}`; con `"read_only": true` la consulta corre en una transacción de solo lectura |
| Respuesta | **HTTP 201** con las filas en JSON (no 200). Un error de SQL devuelve 400 con el mensaje de Postgres. |

El token da acceso a **todos** los proyectos de la cuenta (hoy 3). El
`project_ref` de la URL es lo único que apunta la consulta a este proyecto:
revisarlo antes de cada ejecución.

## Procedimiento

1. **Escribir el SQL en un archivo del repo**, en `supabase/migrations/`, con
   nombre `AAAAMMDD_descripcion.sql` (la carpeta se crea con la primera
   migración).
2. **Pegar el SQL completo en el chat** y decir qué crea, cambia o borra
   (tablas, columnas, policies, filas).
3. **Esperar el OK de Marcelo.** Esta vía no tiene diálogo de aprobación: el
   freno es ese OK. Sin OK no se ejecuta.
4. **Ping de solo lectura** (ver abajo) para confirmar token y proyecto.
5. **Ejecutar** el archivo.
6. **Verificar** con un `select` (`pg_policies`, `information_schema`, etc.) y
   reportar el resultado.
7. **Actualizar `supabase/schema.sql`** para que siga describiendo el estado
   real, y commitear la migración junto con ese cambio.

## Comandos

Ping de solo lectura:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/tuedigqvvkvgongpcnjx/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select current_user, count(*) as profesionales from public.profesionales","read_only":true}' \
  -w "\nhttp=%{http_code}\n"
# [{"current_user":"supabase_read_only_user","profesionales":7}]
# http=201
```

Ejecutar un archivo `.sql` (el SQL se pasa a JSON con Node para no pelear con
las comillas):

```bash
ARCHIVO="supabase/migrations/20261001_ejemplo.sql"
node -e 'process.stdout.write(JSON.stringify({query:require("fs").readFileSync(process.argv[1],"utf8")}))' "$ARCHIVO" \
  | curl -s -X POST "https://api.supabase.com/v1/projects/tuedigqvvkvgongpcnjx/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @- \
      -w "\nhttp=%{http_code}\n"
```

Para una consulta de verificación, el mismo comando con
`{query: ..., read_only: true}`.

## Límites y cuidados

- **Verificado el 2026-10-01:** el `select` de solo lectura (HTTP 201) y que
  `read_only: true` rechaza escrituras (`cannot execute CREATE TABLE in a
  read-only transaction`, HTTP 400). **DDL ejecutado por esta vía el
  2026-10-03** (`20261003_descripciones_patrones.sql`: 2 tablas, 7 índices y
  RLS, en una transacción): responde `[]` con HTTP 201. También
  `20261004_patrones_unique_minusculas.sql` el 2026-10-04,
  `20261005_medicacion.sql` el 2026-10-05, y
  `20261007_medicacion_notnull.sql` y `20261007_patrones_origen.sql` el
  2026-10-07.
- Sin `read_only`, la consulta corre con un rol con permisos amplios: un
  `drop` o un `delete` sin `where` se ejecutan sin preguntar.
- Esta vía **no registra la migración** en el historial de migraciones de
  Supabase (el MCP sí lo hacía con `apply_migration`). El registro es el
  archivo en `supabase/migrations/` y el commit.
- Varias sentencias en un mismo archivo: envolverlas en `begin; … commit;`
  para que se apliquen todas o ninguna.
- Si el proyecto está pausado (plan free), la consulta falla: reactivarlo y
  repetir la lectura antes de confiar en el resultado (gotcha #1 de
  `ACCESS_STRATEGY.md`).
- No hay CLI de Supabase instalada en esta máquina (verificado el
  2026-10-01); no hace falta para este procedimiento.
