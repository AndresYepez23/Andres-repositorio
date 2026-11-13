# Queen: integración central sobre Prisma Core

Estado: implementación en la rama `feature/prisma-neural-genixnode-qwen35-pilot`, PR #125. No fusionada ni activada en producción.

## Recorrido de una solicitud

1. Prisma conserva los resolutores deterministas para operaciones sencillas, saludos, hechos del producto y cálculos locales.
2. Las solicitudes semánticas y los planes compuestos consultan `POST /api/core/plan` antes del antiguo planificador multimodelo.
3. Queen recibe la instrucción actual, metadatos de archivos y las referencias de procedimiento necesarias. No recibe una conversación completa ni archivos binarios.
4. El catálogo procede de `registry.js`. Los parámetros se obtienen de `tool-fields.js`, el mismo código que utiliza Explorar. El catálogo Developer también expone estos contratos.
5. La búsqueda inicial utiliza el índice existente de capacidades y herramientas relacionadas. Queen puede reformular una búsqueda semántica una vez mediante `intent: retrieve`. No se descargan modelos de embeddings en el dispositivo.
6. Queen devuelve una propuesta JSON. Prisma valida identificadores, parámetros, modalidades, referencias de archivos, dependencias, límites y preferencias manuales. Las operaciones que el planificador determinista ya identificó no pueden desaparecer de la propuesta.
7. El DAG se ordena y ejecuta mediante `runToolBatch` y `runTool`. La autorización existente sigue controlando los pasos externos. Los pasos completados mantienen una identidad de herramienta, parámetros y entradas para impedir repeticiones al continuar una tarea.
8. Un verificador independiente inspecciona los resultados. `executed`, `verification-pending` y `verified` son estados diferentes.
9. Ante indisponibilidad de Queen, Prisma conserva las rutas y proveedores anteriores. Queen no se incorpora al selector de modelos del usuario.

## Conexión y recursos

`functions/_lib/queen.js` es exclusivo del backend. Todas las rutas permitidas —modelos, tokenización y completions— comparten la autenticación:

- `Authorization: Bearer …`
- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`

No se siguen redirecciones. Se exige HTTPS y se limita el tamaño de las respuestas. Los errores públicos usan códigos fijos; no se devuelven cuerpos de error del upstream ni cabeceras privadas.

La integración mantiene contexto de 2048 tokens y salida máxima de 256. El tokenizador de llama.cpp comprueba el presupuesto antes de generar y permite una compactación adicional del catálogo, con una reserva adicional para el formato del chat. La comprobación definitiva sigue siendo el límite del servidor. No se han cambiado RAM, contexto, concurrencia, Docker ni túnel del VPS.

El planificador solicita JSON estructurado, desactiva thinking en la plantilla y solicita `cache_prompt`. Estos parámetros requieren una comprobación autenticada con la versión instalada de llama.cpp. No se afirma una mejora de latencia sin esa medición.

Límites implementados:

- Una reserva de inferencia compartida en D1, independiente del isolate.
- Máximo dos propuestas por planificación, incluyendo búsqueda adicional o corrección.
- Máximo una corrección durante ejecución; solo para fallos locales antes de obtener un resultado, con presupuesto de inferencias restante.
- No se repiten automáticamente operaciones externas ni resultados cuya verificación falle.
- Plazo de 55 segundos por inferencia y 120 segundos por tarea.
- Cinco solicitudes de planificación por minuto y treinta por día por visitante, separadas de las cuotas de proveedores externos.
- Ocho pasos por plan y cincuenta MiB de resultados por ejecución.

Cuando el VPS está ocupado, la reserva falla con `QUEEN_BUSY` y se conserva el fallback. No se introduce una cola ilimitada. La planificación utiliza JSON no streaming; no se ha añadido un proxy SSE ni una ruta de streaming sin autenticar.

## Proveedores y selección manual

`queen-providers.js` proyecta el estado, catálogos, cuotas y circuit breakers existentes. No añade AMD ni Baidu. Las capacidades de catálogo creativo que carecen de ejecutor no se convierten en modalidades disponibles.

Las decisiones automáticas reutilizan `rankProviders` y `selectTaskModel`, limitadas a modalidades y modelos realmente presentes en el registro. La selección manual mantiene prioridad. La ejecución conserva la rotación de credenciales y el fallback ya implementados.

`queen_provider_observations` registra evidencia de respuestas API por proveedor, modelo y modalidad: éxito, fallo, duración y tokens cuando se conocen. Una respuesta de chat no acredita imágenes ni transcripción. Un éxito de API tampoco equivale a una verificación semántica del artefacto. Contextos, costes y límites de generación desconocidos permanecen como `null`.

En la consulta pública de estado del 13/11/2026, Hugging Face y Requesty figuraban sin configurar. Los otros nueve proveedores figuraban disponibles. Esta observación no acredita sus inferencias ni todas sus modalidades. No se consumieron cuotas de inferencia para probarlos indiscriminadamente.

## Memoria y recuperación

Se conserva `createTaskMemory`. Las referencias a procedimientos recuperan formato y parámetros operativos sin reenviar el texto de una conversación anterior. «Haz lo mismo con este otro archivo» conserva el procedimiento y usa el archivo nuevo; «No, no hagas lo anterior» cancela la referencia previa.

Los fallos de Queen conservan los resultados parciales y el estado de ejecución dentro de la memoria existente. Una continuación explícita reutiliza los pasos terminados. Una tarea nueva y una cancelación no pueden heredar ese registro de completados. El estado permanece en memoria, con el TTL y el presupuesto del sistema existente; no se añade almacenamiento indiscriminado de chats ni entrenamiento externo.

## Evidencia de verificación

Además de las protecciones existentes de formato y firma:

- JSON: estructura y, en formato/minificación, preservación de los datos originales.
- Ordenación y deduplicación: transformación comprobada de forma independiente.
- Imágenes: decodificación real y dimensiones solicitadas para resize/crop.
- PDF: estructura, número real de páginas y comprobaciones de extracción, eliminación, combinación y rotación cuando corresponden.
- Office/ZIP: presupuesto de expansión, lectura de archivo, CRC y entradas estructurales requeridas.
- Archivos: existencia, tamaño no vacío y SHA-256.

El contenido semántico de un DOCX/XLSX, la exactitud de OCR, las operaciones visuales sin comprobación específica y la duración/parámetros de audio o vídeo quedan como verificación parcial. El chat enumera comprobaciones pendientes y no anuncia verificación completa para esos casos.

Un PDF escaneado no se considera compatible con `image-ocr` directamente. `pdf-to-image` produce un ZIP, que tampoco es una imagen individual aceptada por OCR. No se declara resuelta automáticamente la cadena PDF escaneado → OCR → estructuración → Excel sin implementar y probar esas transiciones.

## Activación y pruebas

La integración permanece desactivada si falta `QUEEN_ENABLED=1`. Para probarla en un entorno aislado, configurar como secretos del backend:

```text
QUEEN_ACCESS_CLIENT_ID
QUEEN_ACCESS_CLIENT_SECRET
QUEEN_API_KEY
```

Configuración no secreta:

```text
QUEEN_ENABLED=1
QUEEN_BASE_URL=https://queen.prismaspace.space/v1
QUEEN_MODEL=unsloth/Qwen3.5-2B-GGUF:Q4_K_M
```

Aplicar `migrations/0004_queen_control.sql` exclusivamente a la base aislada elegida para la prueba, que debe conservar el esquema previo de Prisma. La migración es aditiva. No se ha aplicado a la base remota de producción. La conexión falla de forma controlada si faltan las tablas de control.

Comprobaciones sin credenciales:

```sh
node prisma/build.mjs
node --test prisma/tests/*.test.mjs
node prisma/neural-pilot/evaluate-queen.mjs --output=work/queen-evaluation.json
```

La evaluación real es explícita y secuencial:

```sh
node prisma/neural-pilot/evaluate-queen.mjs --live --output=work/queen-live.json
```

Toma las credenciales del entorno; no las admite por argumentos. No imprime prompts, respuestas completas ni secretos. Los ocho casos etiquetados evalúan selección de planes y no prueban ejecución ni autonomía operativa. No se calibra un umbral de confianza a partir de mocks.

Scripts adicionales:

- `verify-queen-browser.cjs`: Chromium/Playwright, ejecución local real de JSON, imágenes, PDF, rechazo de DOCX falso y recorrido del chat con respuesta de Queen simulada. Servir `prisma/` localmente y ejecutar el script. `QUEEN_TEST_PROXY_FETCH=1` permite obtener dependencias oficiales mediante curl con la confianza TLS del entorno.
- `verify-queen-runtime.cjs`: paquete Pages y pruebas workerd/D1 local, sin bindings de producción. Requiere Wrangler 4.161.0, Miniflare y esbuild; `QUEEN_TEST_TOOLING` puede señalar su instalación fuera del repositorio. `QUEEN_TEST_WORKER` indica el paquete generado.

La matriz histórica de 381 casos se conserva dentro del archivo ampliado `docs/core-matrix-388.csv`. No se han borrado ni reclasificado resultados anteriores; tampoco se han declarado reejecutadas todas sus filas.

Pendientes que requieren evidencia real: autenticación de Queen desde el backend, compatibilidad exacta del tokenizador/plantilla/JSON estructurado, calidad semántica, calibración, uso de RAM del VPS, rendimiento, costes de especialistas y cobertura restante del verificador. El endpoint remoto devolvió HTTP 403 sin credenciales en este entorno. No hay un porcentaje de autonomía medido.

## Resultado de esta ejecución

- 181 pruebas Node aprobadas, incluidas 45 nuevas de Queen.
- Compilación estática y paquete de Pages Functions aprobados.
- Chromium: JSON, dimensiones de imagen, páginas de PDF, rechazo de DOCX falso y ambos recorridos del chat aprobados. Las respuestas de Queen del chat se simularon; las herramientas y verificaciones fueron reales.
- workerd/D1 local: endpoint desactivado con respuesta explícita, propuesta validada sin ejecución, métricas persistidas y reserva liberada.
- Cero inferencias reales de Queen; cero porcentajes de autonomía inventados.
- Evidencia estructurada: `queen-validation-2026-11-13.json`.
