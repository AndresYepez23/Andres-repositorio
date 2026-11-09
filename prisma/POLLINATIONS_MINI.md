# Pollinations y Prisma Mini

## Pollinations: dos modalidades de conexión

1. **Compartida (opcional):** crear una secret key `sk_...` en https://enter.pollinations.ai/keys con presupuesto, duración y permisos limitados para chat e imágenes. Configurar **solo en Cloudflare Pages → prismaspace → Settings → Variables and Secrets → Production** con el nombre `POLLINATIONS_API_KEY`, tipo Secret. Redesplegar. Jamás subir la clave al repositorio ni ponerla en el navegador.
2. **Personal (existente):** registrar App Key pública `pk_...` con callback `https://prismaspace.pages.dev/`, colocarla en Laboratorio IA → Pollinations Connect. Cada visitante autoriza su propia cuenta y su presupuesto; `pk_` no sirve para generar contenido directamente.

El backend compartido implementa **chat** con `openai/gpt-5.4-nano` e **imágenes** con `black-forest-labs/flux.1-schnell` y `tongyi-mai/z-image-turbo`. El modelo se comprueba contra una allowlist, la clave central nunca se entrega al cliente y el límite D1 es 10 solicitudes de texto y 2 imágenes por día para todo el proyecto, dentro del límite total. Este límite solo protege el endpoint; **no equivale a una garantía de coste cero**. Comprobar el gasto de Pollinations antes de habilitarlo para visitantes.

Sin `POLLINATIONS_API_KEY`, la tarjeta central se muestra como no configurada; Pollinations Connect personal sigue siendo una alternativa válida para usuarios autorizados. El código no crea una cuenta, saldo, token ni credencial automáticamente.

## Prisma Mini: clasificación local sin API de inferencia

Prisma Core ofrece un botón opt-in **Activar Prisma Mini**. Al pulsarlo, se descarga `Xenova/all-MiniLM-L6-v2` en formato ONNX cuantizado (~23 MB de pesos, más biblioteca y tokenizador). La inferencia se realiza por WebAssembly en el navegador mediante Transformers.js. No necesita credenciales, llamadas de inferencia ni saldo. El navegador puede guardar el modelo en caché y reutilizarlo.

La función actual es **ordenar semánticamente las herramientas** antes de planificar tareas. No es un asistente generativo capaz de redactar respuestas por sí solo, y su clasificación en español puede ser menos precisa que la de un modelo multilingüe más grande. Si la descarga falla o el navegador carece de recursos, Prisma conserva sus reglas locales y sus demás proveedores; no inicia descargas a espaldas del visitante.

Para disponer de un chatbot local sin API habrá que incorporar un modelo generativo cuantizado más pesado y comprobar compatibilidad, memoria, batería y tiempos de ejecución en teléfonos. Para que un único modelo responda centralmente a todos se necesita un servidor GPU o servicio administrado, con infraestructura y coste asociados.

## Verificación

- El endpoint público `/api/providers/status` debe indicar `configured.pollinations` y `providers.pollinations` como verdaderos solo después de configurar `POLLINATIONS_API_KEY`.
- Probar una conversación corta usando Pollinations central, una generación de imagen, el modo personal, el respaldo automático y el botón de Prisma Mini.
- Tras verificar los modelos y los límites, activar gradualmente nuevas capacidades multimedia, sin habilitarlas silenciosamente.
