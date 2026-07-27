# MyVete — Ingesta n8n

Este proyecto conecta MyVete (el sistema de historias clínicas) con n8n para automatizar la carga de consultas veterinarias. El diseño completo está en [`INFORME-ARQUITECTURA-MYVETE-V2.7.md`](./INFORME-ARQUITECTURA-MYVETE-V2.7.md).

## Estructura del proyecto

| Carpeta | Qué contiene |
|---|---|
| `/bookmarklet` | El "botón mágico" que se agrega a los marcadores de Chrome. Al hacer clic, abre el panel de carga. |
| `/interface` | El panel flotante donde se carga y confirma cada consulta. |
| `/n8n` | Respaldo y notas de los flujos automatizados que corren en la nube (n8n). |

**Estado actual:** solo está armada la estructura de carpetas. Todavía no hay funcionalidad real cargada — eso viene en el siguiente paso.

## Cómo probar el bookmarklet en tu computadora (cuando esté listo)

Por ahora esta sección queda como guía para cuando el bookmarklet tenga lógica real adentro. El proceso, en ese momento, va a ser:

1. Vas a recibir un archivo listo para instalar (o una instrucción de un solo paso) que agrega el botón a tu barra de marcadores de Chrome.
2. Con la ficha de un paciente abierta en MyVete, hacés clic en ese botón.
3. Se abre una ventana chica al costado con los datos de esa consulta ya precargados.

No hace falta que hoy hagas nada — esta guía se completa cuando avancemos con la lógica interna.
