# Queen: validación real en el proyecto aislado

PR #125, rama `feature/prisma-neural-genixnode-qwen35-pilot`. El historial anterior, incluido el informe que tenía las inferencias bloqueadas, se conserva en `prisma/docs/queen-staging-2026-11-13.json`.

## Aislamiento vigente

| Recurso | Uso |
| --- | --- |
| `prismaspace` | Proyecto principal; no cambiar configuración, desplegar ni migrar su D1 |
| D1 `e02104b5-0861-475a-a60f-7658439d4fe0` | Base principal compartida por los entornos originales; no aplicar migraciones |
| `prisma-queen-staging`, entorno **Production** | Validación privada autorizada por el usuario; `QUEEN_ENABLED=1` |
| D1 `980bad8f-0356-48b9-87bc-56bcf363f69a` | Base independiente de staging, sin datos de producción |
| Preview del proyecto aislado | `QUEEN_ENABLED=0`; no necesita duplicar los secretos |

Los tres secretos de Queen están configurados como secretos de **Production de prisma-queen-staging**. Su presencia se comprueba sin devolver sus valores. Las solicitudes reales a `/v1/models`, `/tokenize` y completions confirmaron las dos capas de autenticación. No copiar secretos del proyecto principal.

El proyecto aislado es Direct Upload. Cloudflare no permite convertir un proyecto Direct Upload existente a integración Git. Se configuró su `production_branch` con la rama del PR; los paquetes se construyen desde esa rama y se suben con su SHA y `commit_dirty`. Eso registra procedencia, **no constituye una conexión Git automática**. No se recreó el proyecto ni se movieron secretos. Referencia: https://developers.cloudflare.com/pages/get-started/direct-upload/.

`wrangler.staging.toml` declara la D1 independiente en el ámbito raíz y en Preview. `prisma/wrangler.toml` permanece intacto. El wrapper consulta `queen_staging_identity` mediante el binding real antes de cualquier prueba; rechaza un UUID o marcador incorrecto. La base nueva ya contiene el esquema previo vacío y las migraciones 0002, 0003 y 0004; no volver a aplicarlas durante la evaluación.

## Protección y construcción

Todas las rutas del paquete exigen `X-Queen-Staging-Key`, comparada con `QUEEN_STAGING_KEY_SHA256`. Sin autorización responden 404 antes de acceder a D1. La clave de operación se lee desde un archivo privado y nunca se registra. Las credenciales de Queen permanecen en el backend. El paquete privado no ofrece una interfaz pública.

```sh
QUEEN_TEST_TOOLING=/ruta/a/tooling \
QUEEN_STAGING_BUILD_OUTPUT=work/queen-staging-build \
node prisma/neural-pilot/staging/build.cjs
```

Wrangler 4.161.0 y esbuild están en tooling, fuera del repositorio. El builder compila usando `--config wrangler.staging.toml` y verifica el UUID. No despliega ni ejecuta SQL. Subir `worker.js` como `_worker.js` **solo a prisma-queen-staging**, con la rama del PR y el SHA real. Los paquetes experimentales llevan `commit_dirty=true`; la evidencia distingue esas versiones de un paquete construido desde un commit limpio. Staging necesita `nodejs_compat` por los polyfills de Wrangler.

Al actualizar el PR, usar un mensaje de commit que empiece por **`[CF-Pages-Skip]`**. El proyecto principal tiene previews automáticos para todas las ramas: este prefijo documentado evita que el push genere un despliegue allí, sin cambiar su configuración. Los checks de GitHub continúan disponibles. Referencia: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message.

## Evaluación neuronal real

```sh
node --test prisma/tests/queen*.test.mjs
QUEEN_STAGING_OPERATOR_KEY_FILE=/ruta/privada/operator-key \
node prisma/neural-pilot/staging/evaluate.mjs --live \
  --base=https://VERSION.prisma-queen-staging.pages.dev \
  --output=work/queen-live.json
```

El runner acepta únicamente hosts HTTPS del proyecto aislado y no sobrescribe informes anteriores. Para recuperar una ejecución parcial de la misma versión inmutable, dentro de una hora, añadir `--resume-from=work/informe-parcial.json` y elegir otro archivo de salida. Conserva los resultados ya obtenidos, verifica de nuevo el binding y reutiliza un smoke real previamente verificado. Un error de readiness se conserva aunque una repetición posterior pase.

Los ocho casos utilizan solicitudes reales al modelo. La opción interna `forceNeural` evita que el benchmark omita Qwen en casos que el planificador local ya resuelve. El producto conserva ese atajo local. La metodología final es **híbrida**: hechos del planificador existente, gramática del catálogo, inferencia Qwen y validación independiente. Las expectativas del benchmark nunca se insertan en el prompt ni se usan para construir la gramática. La tasa mide resolución de estos ocho casos, no precisión general de Qwen sin restricciones.

Se registran planes, intención, herramientas, DAG, tokens devueltos por llama.cpp, latencias, reparaciones y thinking. Los fallos conservan la información disponible de las inferencias anteriores. Tokens desconocidos quedan sin medir; el runner no estima consumo de una solicitud cuyo resultado se perdió. Los informes históricos conservan sus contadores originales; la evidencia nueva explica cualquier cobertura incompleta de aquellas métricas.

Los endpoints privados adicionales cubren auth negativa por capa, streaming SSE con TTFT, truncación, timeout controlado, fallo de conexión contra un dominio reservado `.invalid`, presupuesto de contexto, disponibilidad de proveedores y atajo local. Un error inducido de transporte no acredita una caída del servidor. El streaming se mide como capacidad de transporte; el planificador del producto sigue solicitando JSON completo sin streaming.

## Composición, archivos y recuperación

`browser-operations.cjs` genera PDFs reales con contenido conocido y ejecuta los motores existentes en Chromium. Con `QUEEN_STAGING_URL`, solicita planes auténticos al backend aislado; sin esa variable utiliza planes deterministas identificados como controles. El puente de Playwright remite las solicitudes reales con la clave en Node, sin entregarla al navegador. No simula respuestas de Queen.

La cadena usa `pdf-to-image → image-ocr`, un traspaso de representación ZIP/PNG acotado en el coordinador, y luego las herramientas de texto/datos existentes hasta `json-xlsx`. No se modifican los motores, el registro ni los campos de las herramientas. El adaptador acepta únicamente el ZIP PNG del productor esperado: CRC, tamaño expandido, nombres, número de páginas y píxeles están limitados. El OCR no reconstruye tablas arbitrarias. La prueba usa un escaneo sencillo de una página con texto CSV; comprueba las celdas concretas del Excel, además de firmas, estructura y hashes. Las limitaciones de verificación genérica siguen visibles.

La prueba PDF/Word comprueba que el DOCX contenga la página solicitada y excluya las demás. La recuperación daña intencionadamente un parámetro después de un plan real, provoca un fallo real del motor y solicita una corrección a Queen dentro de dos inferencias. Ese daño es una inyección de fallo identificada, no una respuesta simulada. La prueba de archivos nuevos comprueba el rechazo de una reutilización con contenido distinto y la ejecución de una tarea nueva. La identidad incluye SHA-256 de los archivos, no solo nombre y tamaño.

## Medición directa en GenixNode

No hay una identidad SSH disponible en este workspace. No se presentan las métricas de Cloudflare, Chromium o la máquina de desarrollo como RAM/CPU del VPS. `/props`, `/slots`, los tokens y los timings son observaciones reales del servidor llama.cpp, pero no miden su RAM física.

Desde una máquina que tenga acceso SSH al VPS, sustituir `USUARIO@HOST_GENIXNODE` por la conexión existente:

```sh
scp prisma/neural-pilot/staging/monitor-vps.py \
    prisma/neural-pilot/staging/analyze-vps.py \
    USUARIO@HOST_GENIXNODE:/tmp/
ssh USUARIO@HOST_GENIXNODE
# Estos comandos siguientes se ejecutan DENTRO del VPS:
docker ps --format '{{.Names}}'
python3 /tmp/monitor-vps.py --container prisma-neural-qwen \
  --samples 120 --interval 5 --output /tmp/queen-vps-validation.jsonl
python3 /tmp/analyze-vps.py /tmp/queen-vps-validation.jsonl
```

Si Docker requiere privilegios en esa instalación, ejecutar el monitor con `sudo python3`. Confirmar el nombre mostrado por `docker ps`; sustituir `prisma-neural-qwen` si es diferente. Iniciar el monitor antes del benchmark real y mantener una solicitud neuronal a la vez. Elegir otro nombre de salida en repeticiones para conservar las muestras.

Los scripts leen `/proc` y estadísticas/estado de Docker; no leen variables de entorno, claves ni prompts. No reinician servicios ni alteran límites. No se justifica cambiar RAM, CPU, contexto, hilos o concurrencia sin esas mediciones y una comparación posterior. Se mantienen 2048 tokens de contexto, una inferencia concurrente y 256 tokens máximos de salida.

## Estado de cierre

Leer [QUEEN-CONTINUITY.md](../../docs/QUEEN-CONTINUITY.md) antes de continuar. Se preservaron 210 pruebas aprobadas, siete rondas reales y los fallos operativos. El 8/8 de decisiones no acredita la cadena neuronal completa. La generación posterior se bloqueó incluso con ocho tokens tras una pausa; faltan mediciones directas del VPS. La gramática compacta y las correcciones posteriores requieren repetir validación neuronal cuando se recupere generación.

La clave local del operador no se publica. Para otra cuenta están `create-operator-key.py` y `request.mjs`; su rotación e incorporación a un nuevo snapshot aislado se explican en continuidad. El endpoint de perfil histórico pesado se retiró. Los timeouts de inferencia incierta conservan cinco minutos de pausa y staging observa el slot antes de volver a inferir.
