# Estrategia de acceso — MyVete Ingesta n8n

Qué herramientas están realmente disponibles para trabajar en este repo, y dónde
están las credenciales cuando el MCP no alcanza. Escrito el 2026-09-03 después de
una sesión en la que se reportó "no tengo acceso" a n8n y a la service_role de
Supabase, cuando en realidad las credenciales ya estaban en el repo — esto existe
para no repetir esa pérdida de tiempo.

**Nota sobre nombres de archivo:** los nombres reales en disco tienen espacios y
guiones bajos mezclados, no son consistentes entre sí. Verificar con `ls .secrets/`
antes de asumir un nombre — esta tabla puede quedar desactualizada si alguien
agrega o renombra un archivo.

## 1. Supabase

**Proyecto:** `myvete-cardiologia`, ref `tuedigqvvkvgongpcnjx`, región `sa-east-1`.
Plan free — **se pausa solo por inactividad** (ver gotcha #1 abajo).

**Resumen (actualizado 2026-10-01):** lecturas → MCP o API de administración;
filas y archivos → REST con la service key; **DDL → API de administración, no
MCP** (ver "Vía API de administración" y `docs/SUPABASE-DDL.md`).

### Vía MCP (`mcp__claude_ai_Supabase__*`) — para lecturas y SQL de datos
El MCP es el conector de Supabase de la cuenta de claude.ai (no hay ningún MCP
configurado en la máquina: ni `.mcp.json` en el repo ni servidores en
`~/.claude.json`). **No usar `apply_migration` ni DDL por esta vía** (decisión
de Marcelo, 2026-10-01).
Herramientas disponibles: `list_projects`, `get_project`, `restore_project`,
`pause_project`, `list_tables`, `execute_sql`, `apply_migration`,
`list_migrations`, `get_publishable_keys`, `list_extensions`, `get_advisors`,
`query_logs`, entre otras (rama `create_branch`/`merge_branch`/etc. para
branching, no usada todavía en este proyecto).

**Límite real, no un bug:** el MCP **no expone la `service_role` key** —
`get_publishable_keys` da solo la publishable/anon. Es intencional (esa key
bypassea RLS por completo). Para acciones que la necesiten, ver la sección REST
abajo.

### Vía API REST con `service_role` key — cuando el MCP no alcanza
- **Ubicación de la clave:** `.secrets/supabase service role key.txt` (con
  espacios en el nombre, sin extensión `.key`). Gitignoreada (`.secrets/` en
  `.gitignore`), nunca se commitea.
- **Endpoint:** `https://tuedigqvvkvgongpcnjx.supabase.co/rest/v1/<tabla>`
- **Headers:** `apikey: <service_role key>` (alcanza solo con ese; Supabase usa
  el mismo valor como Authorization si no se manda uno aparte).
- Con esta key, RLS no aplica. Sirve para filas (PostgREST) y archivos
  (Storage, `/storage/v1/object/...`); **no ejecuta DDL**.
- **OJO con las variables de entorno:** el shell tiene `SUPABASE_SERVICE_ROLE_KEY`
  y `SUPABASE_ANON_KEY`, pero **son de otro proyecto**: contra
  `myvete-cardiologia` responden 401 (verificado 2026-10-01). Para este
  proyecto valen la service key de `.secrets/` y la clave publicable que está
  en `interface/app.js` y `interface/profesional.html`.

### Vía API de administración — la vía para DDL
- **Endpoint:** `POST https://api.supabase.com/v1/projects/tuedigqvvkvgongpcnjx/database/query`
- **Auth:** `Authorization: Bearer $SUPABASE_ACCESS_TOKEN` — variable de entorno
  del shell (token personal `sbp_…`, vale para todos los proyectos de la
  cuenta). No está en `.secrets/`.
- **Cuerpo:** `{"query": "<SQL>"}`; `"read_only": true` para lecturas. Responde
  **HTTP 201**.
- **Regla:** el SQL se guarda en un archivo del repo, se pega en el chat y se
  espera el OK de Marcelo antes de ejecutar (esta vía no tiene diálogo de
  aprobación). Procedimiento y comandos en `docs/SUPABASE-DDL.md`.
- **CLI de Supabase:** no está instalada (ni `psql`); no hace falta.

## 2. n8n

- **No hay MCP de n8n en este entorno.** No es "falla a veces" — no existe
  ningún `mcp__n8n__*` en la lista de herramientas. La única vía es la API REST.
- **Endpoint:** `https://echevanest.app.n8n.cloud/api/v1`
- **Auth:** header `X-N8N-API-KEY: <key>`
- **Ubicación de la clave:** `.secrets/n8n_api_key.txt` (con guion bajo, `.txt`,
  no `.key`). Gitignoreada. El shell también tiene `N8N_HOST` y `N8N_API_KEY`,
  con la misma clave (verificado 2026-10-01).
- **Workflows de este proyecto:** ver la tabla de `n8n/README.md`. **Un `PUT`
  sobre un workflow activo lo republica en el acto** (verificado 2026-10-01 con
  `MlEGaxt7k6H9SAfP`); sobre uno inactivo queda sin publicar.
- **Workflow de este proyecto:** id `lkOwTFmVTZu7EMoU` (`MYVETE - Ingesta`,
  path `ingesta-filiacion`; publicado al 2026-10-02, verificado por `GET`).
  **`5gGWXOjY2BBOAfuw` es el backup, no el activo**
  (`MYVETE - Ingesta (CORE) [BACKUP - NO TOCAR]`, `active: false`, path
  `ingesta-filiacion-v4`): no modificarlo ni tomarlo como referencia.
- Llamadas típicas: `GET /workflows/{id}` (leer, incluye `nodes`/`connections`
  reales), `PUT /workflows/{id}` (actualizar — ver gotcha #2), `POST /credentials`
  / `DELETE /credentials/{id}` (crear/borrar — **no hay update**, ver gotcha #2),
  `GET /credentials?limit=N` (listar metadata, nunca devuelve valores).

## 3. GitHub

- **No hay MCP de GitHub en este entorno** (se verificó por `ToolSearch` el
  2026-09-03, cero resultados) y **`gh` CLI no está instalado** en este sandbox
  (`which gh` falla) — aunque las instrucciones base de Claude Code lo mencionen
  como disponible, acá no lo está. No asumir que existe sin probarlo primero.
- **`git` CLI sí está siempre disponible** (usado todo el tiempo en esta sesión)
  — add/commit/log sin problema. `push`/`pull` no se probaron todavía en esta
  sesión — no asumir que están autenticados sin probarlos primero.
- **Remoto confirmado:** `origin` →
  `https://github.com/echevanest/MYVETE-INGESTA-N8N.git`
- **API REST de GitHub (`https://api.github.com/repos/echevanest/MYVETE-INGESTA-N8N/...`)
  para operaciones que `git` no cubre (crear PR, comentar issues, etc.):**
  necesita un token. **`.secrets/github_token.txt` no existe** (verificado
  2026-09-03) — si hace falta un token para algo puntual, hay que pedirlo o
  confirmar con el usuario dónde está, no asumir que ya está en `.secrets/`.

## 4. Estrategia general cuando un MCP no alcanza o no existe

El principio (CLI o API REST directa, credenciales en variables de entorno,
ping de solo lectura antes de modificar, archivo local preparado y después
enviado por API) está en `docs/PROBLEMA-MCPs.md`.

0. Mirar también las variables de entorno (`env | cut -d= -f1`, solo nombres):
   el 2026-10-01 se dijo "no hay vía para DDL sin MCP" sin haberlas revisado, y
   `SUPABASE_ACCESS_TOKEN` ya estaba ahí.
1. `ls .secrets/` primero — no asumir nombres de archivo, confirmar los reales.
2. Si el archivo existe, leerlo y usarlo vía `curl`/API REST directa (ver
   secciones de arriba para cada servicio).
3. Si no existe la credencial que se necesita, decirlo explícitamente en vez de
   reportar "no tengo acceso" sin haber mirado `.secrets/` primero.
4. **Tener la credencial no es autorización automática para acciones de alto
   impacto.** n8n workflow activo en producción, cambios de schema/RLS en
   Supabase, etc. siguen siendo cambios sobre sistemas compartidos — anunciar el
   plan antes de ejecutar, igual que si no hubiera credencial a mano. Esta
   estrategia resuelve "no sabía que existía la herramienta", no reemplaza el
   criterio de "esto es una acción riesgosa, aviso antes de hacerla".

## Gotchas encontrados en la práctica (2026-09-03)

1. **Lecturas obsoletas justo después de reactivar un proyecto Supabase
   pausado (`restore_project`):** el primer `execute_sql`/`list_tables`
   inmediatamente después de que el proyecto pasa a `ACTIVE` puede devolver un
   estado stale (en esta sesión, un schema que parecía vacío y en realidad no
   lo estaba). Esperar unos segundos y **repetir la lectura antes de confiar en
   un resultado inesperado** — sobre todo antes de un `CREATE TABLE` o
   cualquier DDL que asuma que algo no existe.
2. **La API pública de n8n no tiene endpoint para editar una credencial
   existente** (solo `POST` crear / `DELETE` borrar, no `PUT`/`PATCH`). Para
   cambiar el valor de una credencial en uso: crear una credencial nueva,
   repuntar los nodos que la usaban (vía `PUT /workflows/{id}` con el nodo
   modificado) a la credencial nueva, y dejar la vieja sin usar en vez de
   intentar sobreescribirla.
3. **Al mandar un valor secreto a una API vía `curl`:** evitar que la key
   quede como texto plano en el comando bash visible — escribirla primero a un
   archivo temporal (leyéndola de `.secrets/` con un script) y pasarla a `curl`
   con `--data @archivo`, no inline.
