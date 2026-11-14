# Queen — transferencia maestra de PRISMA

**Estado vigente: 14/11/2026 UTC. Prioridad actual del usuario: preservar y sincronizar; desarrollo, despliegues e inferencias detenidos.** Este archivo sustituye las instrucciones de recuperación anteriores. Queen está implementada y activada en producción, pero **su planificación pública todavía falla y no está terminada**. No repetir capturas del VPS ni reinstalar el modelo.

## 1. Recuperación exacta y orden de lectura

- Repositorio: https://github.com/AndresYepez23/PRISMA
- Rama: `feature/prisma-neural-genixnode-qwen35-pilot`.
- Último código de aplicación publicado/desplegado: **`24dd33d612c1e56876b703de6f7dcbb2084947e6`**. El commit posterior de esta transferencia preserva documentación, evidencia y auxiliares; no representa otro despliegue.
- Commit de transferencia: obtenerlo con `git log -1 --format='%H %s' -- prisma/docs/QUEEN-HANDOFF.md`; el SHA completo verificado se entrega también al usuario y en el PR. Un documento no puede contener el hash de su propio commit.
- [PR #125](https://github.com/AndresYepez23/PRISMA/pull/125): **open, draft=true, merged=false**. Mantener borrador y no fusionar.
- Git `main` sigue en **`4b24fe6d6f74375a337936aafe1199df9b1e9072`**. Pages Production recibió un upload directo de la rama Queen; no se fusionó Git main. Un futuro despliegue de main puede reemplazar esa versión: no confundir ambas identidades.
- Leer este archivo, el bloque vigente de [continuidad](QUEEN-CONTINUITY.md), el [índice](QUEEN-INDEX.md) y el [prompt maestro](QUEEN-RESUME-PROMPT.md). La [verificación y evidencia](queen-handoff-2026-11-13/verification.json) conserva procedencia, hashes y el handoff anterior íntegro dentro de `history`.
- Arquitectura general: [CORE_AGENT_ARCHITECTURE.md](../CORE_AGENT_ARCHITECTURE.md), [README](../README.md). Arquitectura inicial Queen: [queen-architecture.md](queen-architecture.md), histórica. No hay AGENTS.md de proyecto encontrado en el checkout examinado.

Si no existe checkout:

```sh
git clone --single-branch --branch feature/prisma-neural-genixnode-qwen35-pilot https://github.com/AndresYepez23/PRISMA.git PRISMA
cd PRISMA
git status --short
git log -1 --format='%H %s'
git log -1 --format='%H %s' -- prisma/docs/QUEEN-HANDOFF.md
git merge-base --is-ancestor 24dd33d612c1e56876b703de6f7dcbb2084947e6 HEAD
```

En un checkout existente, inspeccionar cambios antes de actualizar. No reset, rebase destructivo, force push ni sobrescritura ajena. Confirmar SHA remoto y PR. Si la rama avanzó, conservar esos commits.

## 2. Arquitectura y lo que funciona

PRISMA/Prisma Space aloja Prisma Core, herramientas de documentos/datos/imagen/audio/video y especialistas con sus mecanismos existentes de selección, cuotas y respaldo. Se conservan PWA/conversaciones locales/IndexedDB, Auth Supabase/Google y sincronización optativa sin binarios, SEO bilingüe y ads.txt; ver [AUTH_SETUP](../AUTH_SETUP.md), [PRISMA_AUTH_SETUP](../PRISMA_AUTH_SETUP.md) y README. Son áreas previas, no verificadas de nuevo en esta transferencia. No se reescribieron sus motores para pasar pruebas. No se trabajó en Prisma Developer ni en el plugin de ChatGPT.

Queen coordina: navegador → `/api/core/plan` → catálogo/contratos reales → Qwen por Cloudflare Access/Tunnel → validación JSON/DAG → motores existentes en navegador → verificación de resultados. Las operaciones mecánicas conservan ruta local. El modelo recibe objetivo, metadatos y contexto procedimental acotado; **no recibe los bytes de archivos ni una conversación privada completa**. Una propuesta no demuestra ejecución; una firma Office no demuestra contenido correcto.

| Componente, rutas relativas a prisma/ | Estado |
| --- | --- |
| `src/registry.js`, `tool-fields.js`, `queen-contracts.js` | Catálogo y parámetros autoritativos; recuperación por operaciones flexionadas, sin IDs inventados |
| `functions/api/core/plan.js` | Ruta local/Queen, gramática, conservación de operaciones y JSON literal, negaciones/cancelación, parámetros, hasta una reparación |
| `src/queen-schema.js`, `queen-plan.js` | Intenciones, estructura, contratos, referencias y DAG; gramática compacta genérica, variantes por ID solo para flujos locales completos de dos/tres pasos |
| `functions/_lib/queen.js`, `queen-control.js` | Access + Bearer solo en backend, tokenización real, plazo absoluto, slot libre y lease común; ControlDB separada |
| `queen-providers.js`, `queen-observations.js` | Registro existente y observaciones por proveedor/modelo/modalidad; disponible no significa inferencia/delegación probada |
| `src/queen-client.js`, `core.js` | UI real, metadatos/contexto, ruta local de respaldo; **respuesta HTTP de error sin consumir/cancelar pendiente de corregir** |
| `queen-execution.js`, `queen-handoff.js`, `queen-verifier.js` | DAG, SHA de entradas, presupuesto/idempotencia/parciales, ZIP PNG→OCR, verificación independiente y límites semánticos explícitos |
| `neural-pilot/staging/worker.js`, `build.cjs`, `request.mjs` | Wrapper privado de diagnóstico, marcador real D1 y clave del operador; **nunca desplegar este wrapper como web pública** |
| `evaluate-quality.mjs`, `quality-evaluation.mjs` | Ocho casos originales + once adicionales; expectativas cliente, una inferencia por caso en ese runner, no ejecuta motores |
| `browser-operations.cjs`, `operation-budget.mjs` | Motor real + pruebas seleccionables; separa planes neuronales, controles deterministas y especialistas |
| `browser-production.cjs` | Nuevo auxiliar preservado de UI pública real, máximo dos inferencias, plazos Node y descarga/inspección DOCX; no mocks ni reroute a staging |
| `monitor-vps.py`, `analyze-vps.py`, inspectores y `probe-qwen.py` | Scripts publicados y métricas ya recibidas. Los llamados “monitor/análisis BPS” eran estos lectores VPS; no están perdidos |
| `queen-cache-trial.py` | Copia exacta del helper público v3 exitoso, SHA256 `ec69c89a352dca04bfb0a34175855da672f469335a28f9df7326320adfeb57ee`; **no volver a ejecutarlo por rutina** |
| `prepare-pages-assets.mjs` | Preparación local de manifest/MIME/BLAKE3/gzip para Pages, no despliega ni usa tokens |

Memoria procedimental limitada en `core-task-memory.js` y tareas existentes; no se añadió entrenamiento externo, almacenamiento indiscriminado, shell/MCP dentro de llama.cpp ni Qwen en navegador.

## 3. Estado real de infraestructura

Metadatos comprobados el 14/11/2026, sin nuevas inferencias durante la transferencia:

| Recurso | Estado exacto |
| --- | --- |
| Cuenta Cloudflare | `26c2a31382f903f4ce4f5f7bafbd6820` |
| Producción Pages | `prismaspace`, ID `c89b887d-199c-4a60-b9b5-58f743cc69dd`; https://prismaspace.space |
| **Canonical público actual** | **`6a41daae-1c35-4123-9761-cb99de2ca969`**, deploy success; fuente **24dd33d…**, https://6a41daae.prismaspace.pages.dev |
| D1 principal conservada | `PRISMA_RATE_DB=e02104b5-0861-475a-a60f-7658439d4fe0`; no migraciones Queen allí |
| Control Queen en producción | `QUEEN_CONTROL_DB=980bad8f-0356-48b9-87bc-56bcf363f69a`, compartida con staging para un único lease |
| Staging Pages | `prisma-queen-staging`, ID `4d1eca8d-7adb-4b5e-aa46-d39165633679`; Direct Upload, Production branch = rama Queen |
| **Canonical staging actual** | **`46506668-10ee-4ff7-998c-c64ef469f4ee`**, deploy success; fuente **`1a7c97c954bf8b951059843c102b69a706b18526`** |
| Base staging | `PRISMA_RATE_DB=980bad8f-0356-48b9-87bc-56bcf363f69a`, marcador `queen_staging_identity`; esquema ya aplicado, no recrear |
| Flags/fecha | `nodejs_compat`, compatibility date `2026-11-08`, ambos proyectos |
| Producción Queen | `QUEEN_ENABLED=1`, `QUEEN_STAGE=production`, modelo Qwen actual, base `https://queen.prismaspace.space/v1` |
| Preview principal | Configuración fuente `QUEEN_ENABLED=0`; no duplicar secretos para Preview |

Los tres secretos `QUEEN_ACCESS_CLIENT_ID`, `QUEEN_ACCESS_CLIENT_SECRET`, `QUEEN_API_KEY` están como secret_text **en ambos Production**. El operador staging usa otro secreto/digest `QUEEN_STAGING_KEY_SHA256`. No volver a copiar los tres secretos: la promoción cifrada **ya terminó** y fue verificada. Se preservaron las otras variables/secretos y D1 principal. `wrangler.toml` sí cambió respecto del handoff anterior; conserva configuración pública Supabase/AI y declara ControlDB y Preview deshabilitado.

La promoción híbrida RSA-OAEP/AES-GCM nunca devolvió credenciales sin cifrar. Puente temporal, sobre cifrado D1 y archivos privados de transferencia fueron eliminados; mismo nonce contra build limpio dio404. Fallaron auxiliares previos sin modificar producción: preservación de metadata tras PATCH redundante, coordinación de herramientas en una misma celda, y uso de URL inexistente en V8. Se resolvió con sello ya correcto, productor/driver en celdas separadas y validación literal del host. **No reactivar ni reutilizar el puente.**

Pages usa manifest de444 assets y worker público normal, SHA256 de worker24d `cc7d93d2b6e9309b48b742ce9c22e6eb67e3f034aecadc1d09142c388c334952`. Ads/layout de main se conservaron; build servido24d y ads.txt comprobados con HTTPS estricto. Assets:441 hashes reutilizados, tres nuevos ya en caché, cero subida de contenido.

## 4. VPS recuperado: configuración y evidencia recibida

No hay identidad SSH disponible en este entorno; el usuario opera SSH manualmente. No se pidió ninguna contraseña por chat. Ubuntu24.04, dos vCPU, RAM física4,106,285,056B. Contenedor `prisma-neural-qwen`, llama.cpp0.9.0-dev, build12352, commit **`5676dfbe01e7ebe0387913680eee0ed39bf4a363`**. Modelo **`unsloth/Qwen3.5-2B-GGUF:Q4_K_M`**, imagen ID **`sha256:998e17af1ae710081e5a6e6db962f29dd81db31b33eccf281f1767ff0f7729c7`**. Mantener contexto2048, salida256, concurrencia1, CPU/hilos2, batch256/ubatch128.

La captura inicial `TIMEOUT_HELPER_UNTRUSTED` no probaba fallo de Qwen: timeout era symlink; su destino `/usr/lib/cargo/bin/coreutils/timeout` era archivo root0755 y uid_map identidad. Se obtuvo la versión real. Pegar YAML `environment:` en SSH tampoco era un comando; no reinstalar por esos errores.

Se autorizó una recreación dirigida, conservando imagen/modelo, con **`LLAMA_ARG_CACHE_RAM=0` y `LLAMA_ARG_CTX_CHECKPOINTS=0`**. Helperv1 se detuvo antes de recrear por healthcheck; v2 preservó healthcheck/configuración/env con dólares/IPAM y recreó una vez; v3 reanudó sin recreación y completó una sola sonda. Contenedor resultante: **`51b5710534195359bd095e40acadfd6a981d43acb34bed91dd1e9e83c3f58b1f`**.

| Sonda local recibida, 13/11 22:27:50 UTC | Medición, tres muestras |
| --- | --- |
| Generación |16entrada/8salida, 1961ms, finishReason=length, generación reportada6.512tokens/s |
| Cgroup memoria/anon máx muestreados |1,839,640,576B /662,810,624B, ≈1.713/0.617GiB |
| Host disponible mínimo |2,896,269,312B, ≈2.697GiB |
| CPU |Hostmáx98.684% ocupado; Qwenmáx160.299% de un núcleo; iowaitmáx0 |
| Swap/OOM/reinicios |0 observados en esa cobertura; host/cgroup oom_kill delta0 |
| E/S |Lectura131,072B, escritura0; seis fallos mayores host |
| Cola/TTFT |/metrics501 antes/después, contadores desconocidos; TTFT no medido |

Estas métricas son de la sonda anterior, **no de la carga pública actual**. No aíslan reinicio frente a flags ni prueban estabilidad/calidad sostenida. Los antecedentes de iowait56–81%, relectura~5.792GiB y presión/refaults permanecen en [diagnóstico](queen-genix-diagnosis-2026-11-13.md) y [residencia](queen-genix-residency-2026-11-13.md); no atribuir acumulados retrospectivamente.

Estado privado del VPS: `/root/queen-cache-trial-20261113/`, con snapshot y overrides privados, `state.json`, `report.json`, `trial.py`, `resume-v3.py`. **`baseline.private.json` contiene credenciales: nunca publicarlo.** `completionReserved=true`: no resetear ni repetir --resume. Rollback conservado `sudo python3 /root/queen-cache-trial-20261113/resume-v3.py --rollback`, **no ejecutarlo durante transferencia**. El Compose original por sí solo puede perder los dos overrides: conservar el filelist efectivo, sin otra recreación ahora.

## 5. Implementación y pruebas desde el handoff anterior

| Commit | Cambio principal |
| --- | --- |
|5ccacf9|Plazo de inferencia incluye metadatos/tokenización y prepara recuperación acotada |
|849f353|Una inferencia por caso en evaluador, incluido rechazo de payload nulo |
|17a4f4a|ControlDB aislada, guardias en producción, semántica y promoción cifrada; preserva ads/layout main |
|172117b|Operaciones mínimas, aridad de archivos, negaciones y capacidad no disponible |
|c280fda|Exige salida intermedia real en flujos secuenciales, no el original |
|f258fd0|Restricciones por IDs para evitar auto/futuras referencias; expansión de gramática y timeout real conservados |
|1a7c97c|Gramática genérica compacta; ramas por ID solo para flujo local completo de2/3pasos |
|24dd33d|Solo contratos necesarios/proveedores relevantes, elimina contexto vacío; conserva preferencias/procedimiento significativo |

Gramática PDF comparada: c2801798B → f2588480B →1a flujo cerrado1524B →24d1492B. Prompt público capturado3107→2201B, −29%. Expansión era un riesgo, **no una causa física demostrada** de todos los fallos.

**Verificado:** 293/293 pruebas Node y131 comprobaciones del build en24d. Logs/resúmenes/hashes en la carpeta de evidencia existente. El helperVPS tuvo51 checks offline históricos; se preservaron cuatro archivos y solo se adaptaron loaders al monolito, comprobando sintaxis, **sin reejecutarlos tras copiarlos**. Fixtures no son inferencias. No afirmar todos los checks remotos verdes; Netlify ajeno fallaba históricamente y no se modificó.

Evaluaciones reales tras caché: ed94 ocho solicitudes/3606entrada310salida, 3/8 criterios automáticos;17a ocho/4156entrada674salida,6/8; c280 ocho/4044entrada429salida,6/8. Sin timeouts en esos lotes; aceptación de esquema y pertinencia semántica son distintas. Las expectativas permanecieron fuera del prompt. Los fallos se conservan, no equivalen al8/8 mínimo histórico ni a los19 casos actuales aprobados.

**Éxito neuronal acotado staging1a:** una inferencia,536entrada122salida,6.601tokens/s reportados, backend34.050s, transporte36.382s y caso completo39.581s. Qwen generó `s1 pdf-extract pages2 file:0`, `s2 pdf-to-word step:s1 dependsOn:s1`; motores reales y DOCX inspeccionado: marcador de segunda página presente, primera/tercera ausentes. El ledger general todavía marca verificación pendiente; la inspección específica de contenido pasó. Entradas y artefactos sintéticos están preservados.

## 6. Fallo público actual: punto exacto de interrupción

- Producción1a, deployment93775ca1: UIJSON local pasó; POSTneural terminóHTTP503 y cuerpo no recuperado. Hubo timeout/cooldown, consumo desconocido; no repetirlo como diagnóstico de hardware.
- Producción24d, canonical6a41daae: UIJSON local y dependenciasPDF/DOCX pasaron. POST del14/11 **00:55:32.874UTC** terminó **HTTP422** a00:56:31.874; lectura del cuerpo venció10s después. Reporte `ok=false, PLAN_RESPONSE_UNREADABLE`, una solicitud despachada, cantidad de inferencias/tokens **desconocida**, sin mocks ni reroutes. **Este último fallo no debe etiquetarse como otro timeout55s.**
- La captura muestra “Completé2operaciones” y PDF/DOCX porque la ruta local de respaldo siguió trabajando. No se descargó/inspeccionó ese DOCX público, ni se acreditó éxito de Queen público.
- Hecho de código: `requestQueenPlan` en `src/queen-client.js` retorna null en !response.ok sin consumir/cancelar body. **Arreglo NO implementado**; relación exacta con la lectura CDP es una hipótesis. HTTP415 de control sí permitió leer42bytes en265ms conHTTP/2 y cero inferencias/cuota; no hay prueba para desactivarHTTP/2.
- Auxiliar público ahora limita TODO submit desde Node125s, cuerpo10s, descarga30s, cleanup3s por fase y watchdog300s. Registra status antes del body y payload sintético con whitelist/hash. Excepción TLS solo del contexto por proxy de este workspace, declarada en reporte; curl estricto verificó HTTPS. No se cambió TLS del servidor.
- **No se obtuvo la traza exacta de validación del422.** Duplicados/orden de IDs, entradas y otros motivos son hipótesis; no aflojar el validador ni fabricar un plan.
- Se construyó staging24d desde gitarchive limpio: worker766316B, SHA256 `01cab3aced9993524b3a2801e81f039ebfbfcf9b7df72404f2d795304c44667d`, gzip244708B. **No se desplegó y no se envió la inferencia diagnóstica** al llegar la orden de preservar. Los builds locales se regeneran; canonical staging continúa1a.

## 7. Siguiente paso al recibir una nueva instrucción de reanudación

1. Recuperar este checkpoint, verificar cuentas/recursos por metadatos y disponibilidad privada de la clave de operador. No volver al monitor/sonda/cachés/VPS ni repetir los lotes.
2. Corregir de forma dirigida el consumo/cancelación de respuestas noOK del cliente, con prueba pertinente; preservar null/fallback y presupuestos. No inventar que ya se hizo.
3. Preparar snapshot limpio24d o el nuevo commit concreto de staging **en proyecto aislado**, que hoy sigue1a. Obtener **una sola inferencia, maxInferences=1**, por `/__queen/plan` protegido, con el [payload sintético exacto](queen-handoff-2026-11-13/1a7c97c-production-synthetic-request.json), para leer `trace.validationError`. Guardias de slot/lease/cooldown intactas; si resultado incierto, detenerse, no reintentar automáticamente.
4. Corregir solo el error real encontrado, pruebas dirigidas y regresión pertinente; después probar otra vez la UI pública normal con el auxiliar, verificar DOCX y separar rutaQueen de respaldo local.
5. Más adelante: batería19 completa sobre versión final, OCR→extracción→Excel, reparación/delegación reales, nuevos archivos/cancelación, estabilidad y consumo. No están aprobados por este handoff.

## 8. Acceso, publicación y exclusiones

La cuenta nueva debe reconectar GitHub/Cloudflare con esta cuenta exacta; OAuth/SSH/secretos no viajan por Git. Clave staging local anterior: `/workspace/work/queen-operator/operator-key`,0600; recuperar por canal privado autorizado, nunca por chat. Si no existe, procedimiento `create-operator-key.py` para cambiar **solo digest de operador en staging** y nuevo snapshot aislado; no pedir/recrear los tres secretos Queen ni migraciones. Cambiar ese digest es una acción distinta de leer el repo, no ejecutarla automáticamente durante traslado.

Tooling anterior fueraGit: Node24.22.1, Wrangler4.161.0, esbuild0.28.2, Playwright1.62.1, Chromium, `/workspace/work/queen-tooling`. Reutilizar si existe; en nueva máquina preparar dependencias locales si hace falta, **nunca reinstalar VPS por ello**. Regeneración: `CF_PAGES_COMMIT_SHA=<sha> node prisma/build.mjs`; suite `node --test prisma/tests/*.test.mjs`; build privado con `QUEEN_TEST_TOOLING` y `QUEEN_STAGING_BUILD_OUTPUT` vía staging/build.cjs; build público con Wrangler pages functions build. No ejecutar suites ya registradas solo por transferir.

Para Pages, worker público normal y wrapper staging son diferentes. FormData exige branch=`main` para Production público o branch=ramaQueen para Production aislado; manifest{} sirve al wrapper sin sitio, no a la web. Manifest/MIME/hash deben coincidir con Wrangler (BLAKE3 de base64+extensión,32hex). CFexecute no sirvió para bearerJWT de assets (403); JWT temporal cifrado a archivo curl0600 y llamada local al API fijo funcionó; authfiles eliminados. No copiar tokens al chat. Los helpers y evidencia permiten reconstruir sin conservar caches/bundles.

Tras push, comprobar Preview propio por rama/SHA; skip prefix no garantiza omisión. Nunca eliminar canonical ni deployments ajenos. PreviewQueen deshabilitado no es prueba pública. Reversión conocida al deployment público previo67b3e7e7 requiere operación Pages rollback; **no revierte variables ni bindings**. No ejecutarla durante esta transferencia.

Excluidos deliberadamente: operador, OAuth, SSH, .env, baseline resuelto privado, RSA/JWT/nonce temporales, logs crudos sensibles y caches/node_modules/builds regenerables. Secretos existentes siguen en servicios; snapshots privados siguen en VPS. Se preservan código, decisiones, evidencia relevante y artefactos sintéticos, no una exportación íntegra del chat. La orden actual no autoriza nuevas funcionalidades; al terminar, verificar commit remoto y árbol limpio antes de afirmar conservación.
