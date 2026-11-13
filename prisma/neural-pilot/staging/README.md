# Queen: staging aislado y validación desde el backend

Base de trabajo: PR #125, commit `3d3da5e19ec40f32d3b4f96f0aff51380dc3e634`.

## Recursos reales

| Recurso | Identificador | Uso |
| --- | --- | --- |
| Pages existente | `prismaspace` | Sin cambios de configuración |
| D1 existente | `e02104b5-0861-475a-a60f-7658439d4fe0` | No se aplicaron migraciones; continúa compartida por el Preview original y producción |
| Pages aislado | `prisma-queen-staging` | Backend privado de pruebas, rama Preview `queen-validation` |
| D1 aislada | `980bad8f-0356-48b9-87bc-56bcf363f69a` | `prisma-queen-staging`, sin datos de producción |

No usar la vista previa original del PR para las pruebas neuronales. El dominio de la rama aislada es `https://queen-validation.prisma-queen-staging.pages.dev`; exige la clave de operación y no publica una interfaz de usuario.

`wrangler.staging.toml` declara explícitamente los UUID de la D1 nueva tanto en el ámbito raíz como en Preview. `QUEEN_ENABLED` vale `0` en el ámbito raíz y `1` en Preview. El entorno Production del nuevo proyecto también permanece desactivado. `prisma/wrangler.toml` no se modifica.

Se comprobó el esquema previo mediante una consulta de solo lectura a `sqlite_schema`. Únicamente en la base nueva se aplicaron, en orden:

1. El marcador `queen_staging_identity`, con el UUID y el entorno staging.
2. `0000_prisma_schema.sql`: tablas previas de límites y salud de proveedores, vacías.
3. Las migraciones existentes `0002_core_metrics.sql` y `0003_prisma_welcome_emails.sql`.
4. La migración existente `0004_queen_control.sql`.

El wrapper verifica el marcador mediante el binding real antes de cualquier prueba. Un nombre correcto de proyecto o de variable no basta. La comprobación posterior de producción devolvió cero tablas `queen_%`.

## Protección y secretos pendientes

Todas las rutas del paquete requieren `X-Queen-Staging-Key`. El backend compara su SHA-256 con `QUEEN_STAGING_KEY_SHA256`, almacenado como secreto. La clave de operación se conserva únicamente en un archivo local privado y no se imprime ni se versiona. Sin autorización, el despliegue devuelve HTTP 404 antes de acceder a D1.

Ya existe `QUEEN_ACCESS_CLIENT_ID` como secreto de Preview. Su autenticación aún no está validada. Faltan:

```text
QUEEN_ACCESS_CLIENT_SECRET
QUEEN_API_KEY
```

Introducirlos directamente en **Cloudflare → Workers & Pages → prisma-queen-staging → Settings → Variables and Secrets → Preview → Add → Secret/Encrypt**. No introducirlos en `prismaspace`, en el entorno Production ni en el chat.

Después de guardarlos hay que crear otra versión **Preview del proyecto aislado** para que la instancia reciba los nuevos secretos. Cambiar las variables no actualiza el snapshot de una versión ya desplegada. Conservar la rama `queen-validation`, la D1 aislada y la clave de operación. Ningún paso requiere modificar el túnel, reinstalar Qwen ni desplegar producción.

## Construcción reproducible

El builder comprueba el proyecto y el UUID antes de compilar. No despliega ni ejecuta SQL. Utiliza Wrangler 4.161.0 y su esbuild, instalados fuera del repositorio:

```sh
QUEEN_TEST_TOOLING=/ruta/a/tooling \
QUEEN_STAGING_BUILD_OUTPUT=work/queen-staging-build \
node prisma/neural-pilot/staging/build.cjs
```

Ejecuta Pages Functions con `--config wrangler.staging.toml`. El paquete resultante es `work/queen-staging-build/worker.js`. Subirlo exclusivamente como `_worker.js` al proyecto `prisma-queen-staging`, rama Preview `queen-validation`, comprobando antes y después el binding remoto. El despliegue realizado utiliza la API de Pages del conector Cloudflare; no requiere copiar una API key administrativa al workspace.

El empaquetado detectó imports de `node:stream` y `node:events` en los polyfills de Wrangler. Se corrigió declarando `nodejs_compat` únicamente para staging y comprobando el paquete en workerd. No es un fallo observado de Qwen.

## Pruebas sin credenciales del modelo

```sh
node --test prisma/tests/queen-staging.test.mjs prisma/tests/queen.test.mjs
QUEEN_STAGING_OPERATOR_KEY_FILE=/ruta/privada/operator-key \
node prisma/neural-pilot/staging/evaluate.mjs \
  --base=https://queen-validation.prisma-queen-staging.pages.dev \
  --output=work/queen-staging-readiness.json
```

El informe no sobrescribe resultados anteriores. La prueba remota ejecuta realmente las herramientas existentes `json-format → json-minify`, conserva los datos y comprueba un archivo JSON exportado por el harness. El plan de esa prueba es un fixture determinista, y el informe lo identifica con `realInference: false`.

También se prueban los validadores reales con fixtures adversariales: herramienta inventada, ciclo, pregunta con acciones, parámetros inventados y JSON corrupto. La descarga `/__queen/artifact` devuelve el archivo generado y su SHA-256. Los tiempos de cliente incluyen red y backend; un `durationMs: 0` del trabajo síncrono puede reflejar la resolución del reloj de Workers y no acredita latencia cero.

## Primera inferencia real y ocho casos

Con ambos secretos presentes en una nueva versión Preview:

```sh
QUEEN_STAGING_OPERATOR_KEY_FILE=/ruta/privada/operator-key \
node prisma/neural-pilot/staging/evaluate.mjs --live \
  --base=https://queen-validation.prisma-queen-staging.pages.dev \
  --output=work/queen-staging-live.json
```

Orden del runner:

1. Verificar autorización, entorno y UUID de la base real.
2. Comprobar `/v1/models` y `/tokenize` desde el backend mediante el adaptador existente y ambas capas de autenticación.
3. Consultar solo valores numéricos de `/props` y `/slots` cuando estén disponibles. No registrar prompts, plantillas ni cuerpos privados.
4. Generar un plan JSON mínimo con Qwen, validarlo, ejecutar una herramienta existente y verificar su resultado y artefacto. Este smoke debe pasar antes de la evaluación.
5. Ejecutar los ocho IDs de `queen-cases.json` con el planificador existente y una opción interna que fuerza la inferencia para la evaluación. Esa opción no se acepta desde el payload público del producto.
6. Registrar por caso plan, resultado esperado, latencia, tokens, intentos y comprobaciones de thinking. Calcular selección correcta entre respuestas validadas y la tasa de resolución del conjunto, indicando los denominadores.
7. Evaluar una composición JSON con plan neuronal y un control de salida truncada a ocho tokens. El límite normal de generación sigue en 256; no se aumenta contexto ni concurrencia.

Si faltan secretos, los ocho casos quedan `blocked` con latencia, tokens y porcentaje en `null`, sin solicitudes al modelo. No se contabilizan como fallos de Qwen. Los errores del upstream solo devuelven estado HTTP y categorías fijas; nunca sus mensajes completos ni cabeceras.

## RAM, CPU y estabilidad del VPS

Este workspace no dispone de acceso SSH al VPS. Por ello no se atribuyen a GenixNode las mediciones del entorno de desarrollo ni de Cloudflare. `/slots` y los timings de completions tampoco miden RAM física o CPU.

Se prepararon dos scripts sin dependencias externas ni cambios de infraestructura. Ejecutar el primero **en el VPS**, durante la evaluación real:

```sh
python3 monitor-vps.py --container prisma-neural-qwen \
  --samples 60 --interval 5 --output queen-vps-metrics.jsonl
python3 analyze-vps.py queen-vps-metrics.jsonl
```

Leen `/proc`, `docker stats` y solo el estado del contenedor: RAM disponible, CPU, uso de memoria, OOM, reinicios y timestamps. No leen variables de entorno, claves, prompts ni configuración de Docker. No reinician servicios ni cambian límites. El analizador informa las muestras reales; no estima resultados ausentes.

No se realizaron ajustes del modelo o hardware sin medición. La primera inferencia, los ocho casos neuronales, la precisión, los timings y el consumo del VPS permanecen pendientes de las credenciales y de las mediciones correspondientes.

## Evidencia registrada el 13/11/2026

- Código de staging: `bb38210d4fd687894dcef05ae0730001455d5b22`.
- Versión Preview comprobada: `30c48f54-9dd9-4aed-b099-a673834d885a`, estado `success`, commit sin cambios locales.
- Health autorizado HTTP 200 y acceso sin clave HTTP 404.
- Identidad de la D1 real comprobada contra `980bad8f-0356-48b9-87bc-56bcf363f69a`.
- Cadena real de herramientas ejecutada y verificada, con plan determinista de prueba.
- Archivo descargado: JSON de 25 bytes, datos originales conservados, SHA-256 `ad343fada0903d30d6b5f72b395924c174c21b2fe25cbf54d7e8ec80ab2a4b6c`.
- 192 pruebas Node y compilación aprobadas.
- Cero inferencias neuronales realizadas; los ocho casos están bloqueados por los dos secretos indicados, con porcentajes y tokens en `null`.
- RAM y CPU del VPS sin medir; no se modificó el modelo, su concurrencia, contexto ni hardware.

Informe detallado: `prisma/docs/queen-staging-2026-11-13.json`. Este informe distingue los fixtures de planificación de la ejecución real de herramientas.
