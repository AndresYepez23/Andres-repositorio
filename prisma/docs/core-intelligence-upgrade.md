# Prisma Core: comprensión, tareas y ejecución verificable

## Base y datos disponibles

Base de la comparación: `75036f9` (SEO publicado); se incorporó `ba997b3` antes de validar, conservando las correcciones de cuotas, historial, PDF y perfiles. No se modificaron credenciales ni se agregaron proveedores/modelos.

La inspección de la base D1 de producción encontró únicamente `ai_rate_limits` y `ai_provider_health`, además de la tabla interna de Cloudflare. No existía telemetría por herramienta ni un historial de solicitudes interpretadas. Por ello **no hay evidencia para identificar las veinte herramientas más usadas, sus categorías más activas o sus tasas de error**. Tampoco se dispone de una base de peticiones reales para afirmar una precisión representativa en producción.

El 10 de noviembre, la instantánea de contadores por proveedor mostraba 50 solicitudes contabilizadas: Groq 30, SenseNova 9, Cloudflare 7, Gemini 1, OpenRouter 1, Requesty 1 y Z.AI 1. Son contadores de cuota del sistema de entonces, no una medición de tokens, coste, usuarios únicos o uso por herramienta. Main posteriormente corrigió la devolución de cuota tras fallos; no deben compararse esos contadores directamente como ahorro de esta actualización.

## Implementación

- Capa de capacidades estructurada, independiente de proveedores: intención, tipo de entrada, parámetros, desambiguación, negaciones y comprobación de cláusulas. Los datos pegados se separan de las instrucciones antes de normalizar el lenguaje.
- Priorización provisional por casos explícitos de esta misión: compresión, transparencia y conversión de imágenes; unión, extracción y texto PDF; JSON, CSV, QR y conteo de palabras. Son diez familias de ingeniería, **no un ranking inventado de popularidad**.
- Extracción de dimensiones, calidad, límites de KB/MB, formatos, rangos de páginas, giros, indentación y contenido literal. Conserva el planificador especializado de división PDF reciente y los planificadores existentes para el resto del catálogo.
- Ejecución compartida por Core, Prisma Developer y los diez flujos originales: procesa todos los archivos de herramientas individuales, conserva orden, rechaza incompatibilidades/límites sin truncar y entrega una descarga por resultado. Hasta 20 adjuntos en Core; sigue vigente el límite total de 100 MB.
- Los análisis de paleta, metadatos, hash e iconos conservan la imagen/documento de trabajo. Un ZIP de iconos es un resultado adicional, no la entrada de la siguiente transformación.
- Hash e inspecciones independientes admiten dos trabajos concurrentes. Canvas, multimedia y modelos de herramientas existentes se ejecutan secuencialmente para limitar memoria en móviles.
- Memoria de tarea por conversación: archivos de trabajo, originales, pasos y texto resultante; seguimientos explícitos, selección del segundo archivo, inversión compatible y modificaciones de formato. Una nueva tarea no hereda parámetros anteriores. Las aclaraciones de adjuntos/tamaño quedan pendientes en la conversación correspondiente.
- Memoria de trabajo acotada a 120 MB, ocho conversaciones y 30 minutos. Es temporal y no sincroniza archivos. Los resultados descargables siguen usando el almacenamiento IndexedDB existente. Tras recargar, los adjuntos de trabajo deben seleccionarse otra vez.
- Resultado vacío, error o salida incompatible no se acepta como éxito. Se guardan y muestran resultados parciales; una cancelación no provoca reintentos ni llamadas duplicadas automáticas. El límite de bytes se comprueba también tras la secuencia.
- Aritmética local con precedencia y paréntesis mediante un parser acotado sin `eval`, y conocimiento técnico sobre formatos, privacidad y límites reales.

## Errores reparados

- `text-diff`: variables `body`/`headers` inexistentes y separación incorrecta de líneas. Ahora devuelve diferencias y cantidades de líneas añadidas/eliminadas.
- Anki: CRLF/LF/CR separan tarjetas correctamente.
- JSON: indentación pasa al tercer argumento de `JSON.stringify`, con espacios o tabulaciones.
- Conteo: segmentación de palabras Unicode y tiempo estimado en segundos, no un minuto mínimo por texto corto. La lectura sigue siendo una estimación a 200 palabras/minuto.
- URLs: retira puntuación exterior preservando paréntesis equilibrados dentro del enlace.
- JSON/CSV inline y entre bloques, QR con texto libre y URLs se extraen sin confundir datos con instrucciones.
- `image-social-kit`: el dispatcher específico se ejecuta antes del capturador genérico `image-*`.
- Core y puente Developer ya no usan solamente `files[0]` para un lote de herramientas individuales.
- Las tarjetas de resultados del chat ahora reciben cada artefacto de un lote; no queda oculto dentro de un objeto `artifacts` que el renderizador anterior no mostraba.

## Evidencia y límites del benchmark

`node --test prisma/tests/*.test.mjs` ejecuta todas las regresiones. El build incluye el benchmark nuevo como puerta de publicación.

| Medición reproducible | Antes | Después |
|---|---:|---:|
| Selección de herramienta en 150 formulaciones etiquetadas | 28/150 | 150/150 |
| Casos de parámetros con valores esperados | Sin corpus comparable | 12/12 |
| Ejecuciones locales con resultado esperado (bloque principal) | Sin corpus comparable | 21/21 |
| Llamadas a proveedores en ese bloque determinista | No se ejecutó una campaña remota anterior | 0 |
| Inferencia generativa normal, transporte simulado | — | 1 |
| Inferencias con primer proveedor 503, transporte simulado | — | 2, respaldo después del fallo |

Además: ambigüedades, negaciones, datos que parecen instrucciones, límites, memoria, aislamiento de conversaciones, errores parciales, cancelación, URLs equilibradas, JSON inline y preservación de la conversión a PDF. El corpus incluye 15 formulaciones por cada una de las diez familias provisionales. No es un conjunto independiente de usuarios: fue utilizado durante el desarrollo. No se debe anunciar “100% de inteligencia” ni generalizar estos porcentajes a todas las peticiones reales.

**Ahorro comprobado:** cero inferencias en las pruebas deterministas. Hay 122 formulaciones adicionales resueltas por el nuevo planificador en este corpus, pero no se contabilizan como 122 llamadas históricas evitadas: otros caminos anteriores o aclaraciones podían intervenir. No se han consumido cuotas remotas para simular un antes/después ficticio.

Benchmark manual de navegador: `/src/core-browser-benchmark.html`. Genera archivos sintéticos; comprueba MIME, dimensiones y todas las salidas de diez imágenes; paleta, contenido de ZIP de iconos, división PDF, extracción y rotación. Está fuera del sitemap y tiene `noindex`. No descarga nuevos modelos de IA. Las bibliotecas de PDF/ZIP son las existentes.

## Medición futura

`0002_core_metrics.sql` añade una tabla agregada a la D1 existente sin alterar tablas de límites. `/api/core/metrics` recibe eventos limitados y validados; no ofrece un GET público. Solo IDs de herramientas, evento, tiempo y cantidad de archivos. No recibe mensajes, contenido, nombres de archivo, IDs de usuario ni errores sin filtrar. Respeta Do Not Track y está desactivada en previews. La política de privacidad describe esta medición.

Los eventos distinguen solicitudes, éxito, fallo, aclaración, ausencia de plan determinista e intentos de proveedores. Son observaciones de clientes no autenticadas: pueden perderse, bloquearse o falsificarse y **no representan usuarios únicos**. El evento `unresolved` significa que los planificadores deterministas no resolvieron la solicitud, no necesariamente que Core haya respondido mal. No se guardan conversaciones para investigar errores de interpretación; los casos nuevos deben añadirse al corpus con consentimiento y datos sintéticos.

Consultas de auditoría (acceso propietario a D1):

```sql
SELECT tool_id, SUM(CASE WHEN event='requested' THEN count ELSE 0 END) AS solicitudes,
 SUM(CASE WHEN event='failed' THEN count ELSE 0 END) AS fallos
FROM core_metrics WHERE tool_id <> 'core'
GROUP BY tool_id ORDER BY solicitudes DESC LIMIT 20;

SELECT day,event,SUM(count) AS cantidad FROM core_metrics
WHERE event LIKE 'provider-%' OR tool_id='core'
GROUP BY day,event ORDER BY day DESC;
```

Para categorías, unir esos IDs con `registry.js`. Todavía hay que acumular tráfico real y ampliar el corpus con los errores observados antes de medir los objetivos 95%/98% de forma representativa. No se promete un rendimiento de modelos externos, FFmpeg, OCR o eliminación de fondos en todos los navegadores/dispositivos; sus motores existentes se conservan.
