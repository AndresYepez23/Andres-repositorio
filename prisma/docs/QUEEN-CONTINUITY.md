# QUEEN — continuidad técnica y cierre de sesión

Estado conservado el **13/11/2026, UTC**, por solicitud de migración a otra cuenta de ChatGPT. **No reiniciar la misión ni repetir una auditoría general.** El objetivo inmediato del cierre es preservar código, evidencia y pendientes; Queen todavía no está terminada.

## 1. Identidad, ramas y despliegue

- Repositorio: `AndresYepez23/PRISMA`.
- Rama remota: **`feature/prisma-neural-genixnode-qwen35-pilot`**.
- PR existente: **https://github.com/AndresYepez23/PRISMA/pull/125**, mantener **draft**, sin fusionar.
- Base publicada al retomar: `a9c6fc9ebb7e69fb7196cc6f954622c4f43e8aef`. El commit de implementación de este cierre se registra al final de este documento después del primer push.
- Historial que debe conservarse: `3d3da5e19ec40f32d3b4f96f0aff51380dc3e634` (integración central), `bb38210d4fd687894dcef05ae0730001455d5b22` (staging aislado), `a9c6fc9...` (evidencia previa).
- Último despliegue **verificado** del proyecto aislado: **`2368e044-b65a-446e-87e5-b0a910cac9f2`**, https://2368e044.prisma-queen-staging.pages.dev, entorno Pages **Production**, lógico `staging`.
- Ese despliegue se construyó desde el árbol de trabajo que se conserva en este cierre: sus metadatos todavía dicen `a9c6fc9...`, **`commit_dirty=true`**. No fingir que ya corresponde a un nuevo commit limpio. Hash y tamaño exactos del paquete: [deployment-manifest.json](queen-live-2026-11-13/deployment-manifest.json).
- Al solicitar el cierre, no se generó otro despliegue: la prioridad pasó a guardar y publicar en GitHub.

**Trabajo concurrente en main:** el remoto era `42dade166714c6eaaff210fe0377cfba68da8d9c` al inicio y se observó `4b24fe6d6f74375a337936aafe1199df9b1e9072` antes del push de cierre. Pages principal ya apuntaba a ese último SHA, despliegue `67b3e7e7-16b2-43ec-9fc0-cb85a8adbc08`. Es trabajo externo a esta sesión: aquí no se escribió main, no se rebasó la rama ni se desplegó el proyecto principal. No resolver ni mezclar ese trabajo automáticamente.

## 2. Restricciones que siguen vigentes

1. No fusionar el PR ni publicar Queen para usuarios de producción.
2. No modificar ni desplegar en el proyecto principal **`prismaspace`**; no escribir en su D1.
3. No modificar main. No eliminar proveedores ni herramientas. Los motores, registro y campos de herramientas no se cambiaron respecto a `a9c6fc9` en esta fase.
4. Usar exclusivamente **Production de `prisma-queen-staging`**, autorizado por el usuario. No volver a pedir duplicar los secretos en Preview.
5. No reinstalar Qwen, recrear el túnel o cambiar contexto/concurrencia por intuición.
6. **No trabajar en Prisma Developer ni en el plugin de ChatGPT.** Esas integraciones se desarrollan por separado. La referencia existente a `developer-api.js` se reutiliza como fuente del planificador local; no es una nueva misión sobre Developer.
7. No declarar éxito operativo porque los ocho casos mínimos de intención hayan pasado.

El proyecto principal tiene previews automáticos para todas las ramas. **Todo commit que se suba durante esta misión debe empezar por `[CF-Pages-Skip]`**, para que Cloudflare omita ese despliegue sin cambiar la configuración del proyecto principal. GitHub Actions sí debe seguir ejecutando sus checks. Referencia oficial: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message.

## 3. Recursos y secretos

Cuenta Cloudflare: `26c2a31382f903f4ce4f5f7bafbd6820`.

| Recurso | Identidad | Estado |
| --- | --- | --- |
| Pages principal | `prismaspace`, ID `c89b887d-199c-4a60-b9b5-58f743cc69dd` | Fuera de las mutaciones de esta sesión |
| D1 principal | `e02104b5-0861-475a-a60f-7658439d4fe0` | No aplicar migraciones ni escribir datos |
| Pages aislado | `prisma-queen-staging`, ID `4d1eca8d-7adb-4b5e-aa46-d39165633679` | Production para validación privada |
| D1 aislada | `980bad8f-0356-48b9-87bc-56bcf363f69a` | Binding `PRISMA_RATE_DB`; marcador comprobado por el backend |
| Configuración local aislada | `prisma/wrangler.staging.toml` | Queen activa en ámbito raíz, Preview desactivado; UUID aislado en ambos |

El esquema previo vacío y las migraciones 0002, 0003 y 0004 ya se aplicaron **solamente en la D1 nueva**. No repetirlas. El marcador `queen_staging_identity` impide confiar únicamente en nombres de bindings. `prisma/wrangler.toml` y las migraciones existentes no se modificaron en esta fase.

Los tres secretos de Queen están **presentes como `secret_text` en Production del proyecto aislado**, confirmados en Cloudflare y por inferencias auténticas:

- `QUEEN_ACCESS_CLIENT_ID`
- `QUEEN_ACCESS_CLIENT_SECRET`
- `QUEEN_API_KEY`

**No falta ninguno de esos tres secretos.** La generación bloqueada al final no debe diagnosticarse como otra falta de credenciales. Si en el futuro realmente falta uno, introducirlo únicamente en **Cloudflare → Workers & Pages → prisma-queen-staging → Settings → Variables and Secrets → Production → Secret/Encrypt** y crear otro snapshot aislado. No compartir valores en el chat, GitHub, `.env` versionados, argumentos de comandos o logs.

Variables no secretas conservadas: `QUEEN_ENABLED=1`, `QUEEN_STAGE=staging`, `QUEEN_BASE_URL=https://queen.prismaspace.space/v1`, `QUEEN_MODEL=unsloth/Qwen3.5-2B-GGUF:Q4_K_M`, `QUEEN_STAGING_DATABASE_ID` igual al UUID aislado. `QUEEN_SOURCE_COMMIT` del despliegue actual todavía es `a9c6fc9...`; es metadata, no evidencia de un commit limpio.

### Acceso del operador al migrar de cuenta

Todas las rutas aisladas exigen `X-Queen-Staging-Key`. El backend compara su SHA-256 con el secreto `QUEEN_STAGING_KEY_SHA256`; sin clave devuelve 404 antes de consultar D1.

La clave actual vive **solo** en un archivo privado del workspace de esta sesión: `/workspace/work/queen-staging/operator-key`, modo 0600. **No se publica ni se incorpora a esta documentación.** No presumir que ese archivo será accesible desde la otra cuenta. La ausencia de esa clave local no significa que falten los tres secretos de Queen.

Si el workspace se conserva, usar ese archivo sin imprimirlo. Si no se conserva, crear una clave nueva:

```sh
python3 prisma/neural-pilot/staging/create-operator-key.py \
  --directory /RUTA_PRIVADA/queen-operator
```

El helper genera `operator-key` y `operator-key.sha256`, ambos privados, sin imprimir valores. Guardar **solo el digest** como `QUEEN_STAGING_KEY_SHA256` en Production del proyecto aislado mediante el conector Cloudflare o su dashboard. No reemplazar los otros secretos con valores redacted de un GET. Se necesita otro despliegue aislado para activar el nuevo hash. Mantener `operator-key` local; no enviarlo al modelo, al navegador ni al repositorio. No se rotó esta clave durante el cierre.

La otra cuenta necesita conectar sus herramientas GitHub/Cloudflare con permiso sobre este mismo repositorio y cuenta. Clonar el código no transfiere permisos, claves de operador ni una identidad SSH.

## 4. Arquitectura real

### Qwen, GenixNode, Tunnel y Access

Qwen vive en GenixNode, no en el navegador. El objetivo documentado es Nova VPS x4, Ubuntu 24.04 x86_64, 2 vCPU/4 GB RAM y CPU sin GPU. `compose.yaml` declara un contenedor `prisma-neural-qwen`, puerto `127.0.0.1:7860`, dos hilos, contexto 2048, un slot y máximo 256 tokens. Esa configuración del host **no se verificó por SSH en esta sesión**; sí se observaron por API un slot y contexto 2048.

El dominio `queen.prismaspace.space` llega por Cloudflare Tunnel al servidor llama.cpp. Access usa token de servicio y llama.cpp su propia API key. Ambas autenticaciones se adjuntan también a `/tokenize`, `/props` y `/slots`, fuera de `/v1`. No se cambió el túnel ni se habilitaron shell, agentes o MCP dentro de llama.cpp.

Metadata útil, sin valores de credenciales: aplicación Access `80da9841-e95e-4c1d-a852-49343363ec94`, política de servicio `8252dee9-8c08-41cc-90f6-13c8a0f9bcf6`, token de servicio `a06aea3f-812e-49e7-8b0d-f33ba5e16564`. No se registró un ID de túnel; no inventarlo.

### Backend y planificador

- `functions/_lib/queen.js`: configuración server-only, Access + Bearer, redirects manuales, JSON acotado, `/tokenize` real antes de inferir, thinking desactivado, límite de respuesta 256, contexto 2048 y reserva de framing 128. Timeout de inferencia 55 s; presupuesto total de tarea 120 s.
- El lease D1 serializa solicitudes entre isolates. El límite público sigue en 5/min y 30/día; el operador privado tiene 12/min y 96/día en un namespace separado, para que las pruebas no agoten el presupuesto público.
- Tras un timeout de inferencia incierta, staging conserva una pausa de cinco minutos. Antes de volver a inferir consulta el slot real. Esto limita acumulaciones; un slot inactivo **no prueba** que el servicio de generación esté sano.
- `functions/api/core/plan.js`: origen/contenido válidos, archivos solo como metadatos (20 y 50 MB agregados), atajo local para operaciones simples y Queen para semántica/composición. No omitir Queen en un compuesto solo porque el planificador antiguo detectó una única conversión final.
- Catálogo proyectado desde `registry.js` y los mismos campos de Explore, con recuperación de herramientas, formas como «minifícalo» y operaciones identificadas por cláusulas. Las etiquetas esperadas del benchmark no entran en el prompt.
- `queen-schema.js` acota estructura, IDs e intención; los parámetros tipados, entradas, dependencias y restricciones se validan en la aplicación. La gramática extensa anterior queda como recurso histórico offline en `staging/profiling-grammar.js`; el endpoint de perfil pesado fue retirado.
- Máximo ocho pasos DAG, dos inferencias por tarea y una reparación. Se puede reducir a una inferencia por checkpoint del harness; no aumentar el techo global.

### Proveedores y coordinación

`queen-providers.js` proyecta los proveedores, catálogos, cuotas, salud, límites y preferencias existentes. `queen-observations.js` distingue capacidades anunciadas de observaciones upstream; no promueve chat a generación de imágenes ni una operación no verificada a resultado verificado. Se conservan los mecanismos de respaldo y la preferencia manual.

En staging se observó Kilo disponible para chat anónimo y ningún proveedor de imagen ejecutable. **No se demostró una delegación externa real en la ronda operativa:** el plan falló antes de invocar al especialista. No copiar credenciales de producción para rellenar esa prueba ni interpretar `available` como inferencia ya realizada.

### Memoria, ejecución y recuperación

- `queen-client.js` envía solo metadatos y un contexto procedimental acotado; no vuelca archivos o conversaciones privadas. `core.js` conserva el runtime, memoria de tareas, almacenamiento, conversaciones y permisos existentes.
- El contexto incluye últimas operaciones y preferencias; los datos anteriores no autorizan repetir una operación sobre un archivo nuevo. La identidad de ejecución incluye SHA-256 de los bytes, además de nombre y tamaño.
- `queen-execution.js` ejecuta mediante `runToolBatch` y los motores existentes; traspasa artefactos y texto entre pasos, conserva resultados parciales y evita repetir resultados completos o llamadas externas de resultado incierto.
- Una corrección local previa a obtener resultado puede consumir la inferencia restante. No repetir pasos anteriores ni reintentar automáticamente operaciones externas o fallos de verificación.
- `queen-handoff.js` adapta únicamente ZIP PNG de `pdf-to-image` para `image-ocr`: CRC, nombres seguros, hasta 10 imágenes, expansión 20 MB y cuatro millones de píxeles por imagen. No se creó una herramienta ficticia de OCR de PDF.

### Verificación

`queen-verifier.js` comprueba contenido/estructura independientemente de que el modelo diga «éxito»: JSON, firmas, hashes, PDF, páginas/rotación, imágenes, ZIP/Office y presupuestos. El backend compara también los datos JSON literales originales con los propuestos por el modelo.

Un DOCX o XLSX estructuralmente válido puede conservar verificación parcial de contenido. El harness añade comprobaciones contra el contenido conocido de los archivos de prueba. No convertir estados parciales en éxito global ni aceptar un paso que declara dependencia pero consume el PDF original cuando debe consumir el resultado intermedio.

## 5. Resultados reales y límites

Leer primero [el informe completo](queen-live-2026-11-13.md) y [summary.json](queen-live-2026-11-13/summary.json).

- Primera inferencia auténtica: plan `json-format`, ejecución real y JSON verificado. 76 tokens de entrada, 91 de salida, 17.495 s backend y 6.716 tokens/s de generación.
- Access y API key comprobados con solicitudes positivas y controles negativos reales HTTP 401 por capa. `/models` y `/tokenize` respondieron desde Prisma.
- Ambos formatos de schema impusieron una constante contraria al prompt en el control real. La hipótesis de schemas ignorados no se confirmó.
- Última ronda completa de ocho casos: **8/8 bajo las aserciones mínimas de intención/herramientas**, 4711 tokens entrada y 442 salida. Mediana 24.574 s; rango 15.461–43.204 s; generación observada 5.942–6.748 tokens/s. No es precisión universal.
- Hubo respuestas poco pertinentes: consulta Word→pregunta sobre columnas, y cancelación→solicitud de confirmación. **La calidad no está aprobada** por ese 8/8.
- Se conservan las siete rondas: 0/8, 3/8, 3/8, 6/8, 5/8, 6/8, 8/8. No borrar las regresiones intermedias.
- Operación neuronal PDF→Word: el DOCX falló la prueba de contenido porque `s2` consumió `file:0` en vez de `step:s1`. Se corrigió la validación; falta repetirla con el código final.
- Operación neuronal escaneo→OCR: timeout. Excel quedó bloqueado. La reparación neuronal no se llegó a probar porque falló la inferencia inicial. La composición JSON omitió minificación; ahora se corrige su recuperación verbal y su operación requerida.
- Cadena **con plan determinista de control** sí ejecutó los motores reales hasta Excel y comprobó todas las celdas. Sus artefactos están conservados. **No contar ese resultado como planificación neuronal completa.**
- Control real de archivos nuevos: aprobado; rechaza otro contenido para el mismo taskId y ejecuta una tarea nueva sin reutilizar el resultado anterior.
- Después cayó la generación observada a ~1.3 tokens/s en dos respuestas y comenzaron timeouts. El perfil A/B quedó inconcluso: ambas variantes agotaron 55 s. También falló SSE sin schema; no hay TTFT medido.
- Tras cinco minutos de pausa, incluso el control de **ocho tokens** volvió a agotar 55 s. Última evidencia: [final-truncation.json](queen-live-2026-11-13/final-truncation.json). Su pausa registrada expiraba el 13/11/2026 a las 14:03:13 UTC; consultar D1/estado actual, no asumir que sigue vigente.
- Control de contexto real: `/tokenize` devolvió 2503 tokens y se rechazó la inferencia antes de completions por superar contexto 2048. Error de conexión inducido devolvió HTTP upstream 530 y el timeout inducido de metadata fue reconocido. No se confunden con una caída demostrada de Qwen.

**No se midieron RAM, CPU física, swap, OOM ni reinicios del VPS; no hubo SSH disponible.** No atribuir a GenixNode las métricas de Chromium, Cloudflare o el workspace. No se efectuaron ajustes de hardware. La causa de la generación detenida sigue abierta.

## 6. Pruebas y reproducción

Se conservaron 192 pruebas históricas; ahora **210 Node pasan**, build estático aprobado (130 pruebas embebidas) y paquete aislado compilado. [checks.json](queen-live-2026-11-13/checks.json) y [log local](queen-live-2026-11-13/local-tests.txt). Los mocks de transporte y planes deterministas de tests no cuentan como inferencias reales.

Desde la raíz del repositorio:

```sh
node --test prisma/tests/*.test.mjs
node prisma/build.mjs
```

Tooling usado fuera del repositorio: Node 24.22.1 local, Node 22 en CI, Wrangler 4.161.0, esbuild 0.28.2, Playwright 1.62.1 y Chromium del sistema. No requiere reinstalar nada en el VPS.

```sh
QUEEN_TEST_TOOLING=/RUTA/tooling \
QUEEN_STAGING_BUILD_OUTPUT=work/queen-staging-build \
node prisma/neural-pilot/staging/build.cjs
```

El builder **no despliega ni ejecuta SQL**. El proyecto es Direct Upload; no se puede convertir in situ a integración Git. Subir el paquete como `_worker.js` únicamente al proyecto aislado, rama del PR, SHA real y `commit_dirty` honesto. Verificar bindings antes/después. Un nuevo despliegue también es necesario si se rota el hash del operador; no cambiar los tres secretos de Queen por ello.

Consultas privadas reproducibles sin imprimir credenciales:

```sh
export QUEEN_STAGING_URL=https://prisma-queen-staging.pages.dev
export QUEEN_STAGING_OPERATOR_KEY_FILE=/RUTA_PRIVADA/queen-operator/operator-key
node prisma/neural-pilot/staging/request.mjs --route=health --output=work/health.json
node prisma/neural-pilot/staging/request.mjs --route=server --output=work/server.json
```

**No lanzar otro lote neuronal mientras la generación esté detenida.** Tras recuperar/medir el servidor:

```sh
node prisma/neural-pilot/staging/evaluate.mjs --live \
  --base=https://VERSION.prisma-queen-staging.pages.dev \
  --output=work/queen-live-nueva-ronda.json
```

El runner no sobrescribe archivos. `--resume-from=...` solo recupera un informe reciente de la **misma versión inmutable**; no mezclar resultados de otro código como si fueran una nueva ronda. Los tokens perdidos permanecen desconocidos.

Operaciones reales con archivos generados de contenido conocido:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory prisma
# Otra terminal, con las dos variables anteriores:
QUEEN_TEST_BASE_URL=http://127.0.0.1:4173 \
QUEEN_OPERATIONS_OUTPUT=work/queen-operaciones-nueva-ronda \
node prisma/neural-pilot/staging/browser-operations.cjs
```

Con `QUEEN_STAGING_URL`, el puente remite solicitudes reales al backend; no simula respuestas. PDF→Word usa además el endpoint normal `/api/core/plan`. Sin esa variable, son controles deterministas identificados. Se guardan entradas, progreso, artefactos y fallos. La limpieza de espacios del OCR es una regla local explícita del escenario; no una reconstrucción general de tablas. No contar las tres fases como una tarea de dos inferencias si los contadores reales superan ese presupuesto.

## 7. Siguiente paso técnico exacto

**Primero medir/recuperar el servicio de generación en GenixNode.** Los secretos ya están disponibles; no repetir el aprovisionamiento de Pages, D1, Access o Qwen. No seguir disparando solicitudes de 55 s ni repetir el perfil histórico pesado. El endpoint de ese perfil fue retirado de la versión final.

Desde una máquina que tenga la identidad SSH existente, sustituir `USUARIO@HOST_GENIXNODE`:

```sh
scp prisma/neural-pilot/staging/monitor-vps.py \
    prisma/neural-pilot/staging/analyze-vps.py \
    USUARIO@HOST_GENIXNODE:/tmp/
ssh USUARIO@HOST_GENIXNODE
# Dentro del VPS:
docker ps --format '{{.Names}}'
python3 /tmp/monitor-vps.py --container prisma-neural-qwen \
  --samples 120 --interval 5 --output /tmp/queen-vps-continuidad.jsonl
python3 /tmp/analyze-vps.py /tmp/queen-vps-continuidad.jsonl
```

Si Docker exige privilegios, usar `sudo python3` para el monitor. Confirmar el nombre del contenedor mostrado. Elegir otro nombre de salida en cada repetición. Son lecturas de `/proc` y estadísticas/estado de Docker: no leen claves, variables de entorno o prompts ni reinician servicios. Obtener también estado local de generación según la configuración real del administrador; no inferirlo de un `/slots` inactivo.

Sin SSH, solicitar al propietario las muestras de estos scripts o acceso operativo por el canal adecuado, **no claves en el chat**. No inventar la causa ni ajustar hilos, RAM, swap, contexto o concurrencia sin medición. No se autorizó trabajar en otros proyectos para resolverlo.

Después de recuperar inferencia:

1. Crear un snapshot limpio desde el commit remoto de esta rama, solo en staging aislado.
2. Repetir el control corto, ocho casos y revisión cualitativa; conservar cada resultado.
3. Repetir PDF→Word comprobando contenido y traspaso `step:s1`.
4. Completar con Queen escaneo→OCR→extracción→Excel y validar celdas; no sustituirlo por el control determinista.
5. Probar composición JSON, reparación real de parámetros y una delegación ejecutada y verificada.
6. Medir streaming/TTFT, tokens/s, contexto, estabilidad y RAM/CPU en el VPS. Mantener los límites hasta tener evidencia.

## 8. Punto exacto de interrupción y archivos prioritarios

Al pedir el usuario el cierre para migrar de cuenta, se acababa de recibir un nuevo timeout de ocho tokens **después de una pausa de cinco minutos**. Se habían terminado las correcciones de dataflow/JSON y protecciones, 210 pruebas y ambos builds. No se continuaron experimentos neuronales; se pasó a conservar, publicar y verificar GitHub. No se presupone que se hayan agotado créditos: este es el punto efectivo de cierre solicitado.

Leer, en este orden:

1. Este archivo `prisma/docs/QUEEN-CONTINUITY.md`.
2. `prisma/docs/queen-live-2026-11-13.md` y su directorio de evidencia, especialmente `summary.json`, `round-7.json`, `operations-real-1.json`, `operations-deterministic.json`, `final-truncation.json`, `deployment-manifest.json`.
3. `prisma/neural-pilot/staging/README.md` para operación y aislamiento.
4. `prisma/docs/queen-architecture.md` para la arquitectura anterior; sus estados históricos pueden preceder la inferencia real y deben leerse junto al informe nuevo.
5. `prisma/functions/_lib/queen.js`, `prisma/functions/api/core/plan.js` y `prisma/src/queen-{contracts,schema,plan,execution,handoff,verifier,client}.js`.
6. `prisma/tests/queen.test.mjs`, `queen-staging.test.mjs`, `queen-integration.test.mjs` y `prisma/neural-pilot/queen-cases.json`.
7. `prisma/neural-pilot/staging/{evaluate.mjs,browser-operations.cjs,request.mjs,monitor-vps.py,analyze-vps.py}`.

Las evidencias válidas del workspace se trasladaron al repositorio; no depender de `/workspace/work/queen-live` en otra cuenta. El archivo de clave de operador constituye la excepción de seguridad deliberada y se recupera/rota como se explica arriba. Los antiguos scripts `verify-queen-browser.cjs` y `verify-queen-runtime.cjs` incluyen fixtures de respuesta; **no usarlos para inflar resultados neuronales**.

## Registro del cierre remoto

El primer push de este cierre contiene implementación, evidencias y este documento. El siguiente commit de documentación registra su SHA y la comprobación remota. Para el SHA del propio documento, consultar el historial/permalink en GitHub o ejecutar `git log -1`; un archivo no puede incluir el hash de su propio commit sin cambiarlo. El informe final al usuario aporta ese último SHA verificable.
