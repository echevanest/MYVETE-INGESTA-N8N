# 🛡️ Estrategia de Resiliencia: Bypass de MCPs mediante CLI y API REST Directa

## Propósito
Evitar bloqueos operativos cuando los Model Context Protocols (MCPs) nativos de Claude fallen, pierdan conexión o no dispongan de herramientas gráficas/integradas para interactuar con servicios en la nube (como n8n, Supabase, GitHub, etc.). 

## Principio Rector
En lugar de depender de la interfaz web o de integraciones propietarias del agente, se traslada la ejecución al entorno local utilizando la **terminal, variables de entorno y llamadas directas a las APIs REST oficiales o CLIs** de la plataforma destino.

---

## Patrón de Ejecución de 3 Pasos (El Protocolo)

### 1. Preparación de Credenciales y Entorno (Variables de Shell)
Nunca dejes credenciales hardcodeadas. Exporta las claves necesarias directamente en el entorno de la terminal antes de invocar al agente:
- *Ejemplo n8n:* `export N8N_API_URL="https://tu-instancia.app.n8n.cloud"` y `export N8N_API_KEY="..."`
- *Ejemplo Supabase:* `export SUPABASE_PROJECT_REF="..."` y `export SUPABASE_ACCESS_TOKEN="..."`

### 2. Test de Conectividad Preventivo (Ping de Validación)
Obliga al agente a realizar una prueba de solo lectura antes de intentar cualquier modificación. Esto rompe cualquier "sesgo de bloqueo" en el modelo y confirma que la red/token responden:
- *Ejemplo:* Ejecutar un `GET` rápido a `/api/v1/` o un comando `status` de CLI para validar un código `HTTP 200`.

### 3. Preprocesamiento Local + Inyección por API (Push Atómico)
En lugar de pedirle al agente que "cree recursos desde cero en la nube" (lo que genera errores de sintaxis y timeouts):
* **Paso A:** El agente lee, valida y transforma los archivos estructurados directamente en el disco local (`.json`, `.sql`, `.js`).
* **Paso B:** El agente ejecuta un script o comando cURL/CLI empaquetado para inyectar el payload ya corregido directamente en el endpoint de la API remota.