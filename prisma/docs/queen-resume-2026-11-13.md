# Queen: continuidad retomada, presupuesto real y generación aún bloqueada

Se retomó la rama `feature/prisma-neural-genixnode-qwen35-pilot` exactamente en `ed94e25b9f38645a484c740f9f2e3ac3063f3a4f`, sin cambios locales previos. El PR [#125](https://github.com/AndresYepez23/PRISMA/pull/125) permanece como borrador. **Queen no está terminada.** Las siete rondas y sus fallos históricos permanecen intactos.

## Bloqueo comprobado y acceso recuperado

El workspace nuevo no contenía identidad SSH, socket de agente SSH ni la clave privada del operador. Se confirmó con el conector que los tres secretos de Queen siguen presentes en Production de `prisma-queen-staging`, junto al binding D1 aislado `980bad8f-0356-48b9-87bc-56bcf363f69a`. No se solicitaron ni reemplazaron esas credenciales.

Se ejecutó `create-operator-key.py` y se actualizó exclusivamente el digest `QUEEN_STAGING_KEY_SHA256` del proyecto aislado. La clave nueva queda en `/workspace/work/queen-operator/operator-key`, modo 0600, fuera del repositorio. También se actualizó la metadata `QUEEN_SOURCE_COMMIT`. Para activar el hash se construyó un snapshot con `git archive ed94e25...` y las versiones documentadas de Wrangler/esbuild.

Despliegue de recuperación: **`16436df0-3d50-4e89-9165-b875be731d3f`**, https://16436df0.prisma-queen-staging.pages.dev, Production aislado, commit `ed94e25...`, `commit_dirty=false`. [Procedencia y hash del paquete](queen-resume-2026-11-13/restored-deployment.json). Este snapshot corresponde al código conservado, antes de las correcciones nuevas de presupuesto.

- [Health real](queen-resume-2026-11-13/health.json): HTTP 200, Queen activa, secretos completos y marcador D1 aislado confirmado.
- [Estado API](queen-resume-2026-11-13/server.json): contexto 2048, un slot inactivo. Esa observación **no** acredita salud de generación ni mide RAM/CPU.
- [Única prueba corta de generación de esta continuación](queen-resume-2026-11-13/short-generation.json), iniciada a las `14:47:46.828Z`: preflight real de 64 tokens, máximo 8 tokens de salida, **`QUEEN_TIMEOUT` tras 55 000 ms**, HTTP 503, 57 614 ms en el cliente. Una solicitud de completion intentada, ninguna completion recibida; tokens realmente consumidos y TTFT desconocidos. Se conservó el cooldown del backend. No se inició ningún lote ni se repitió ese fallo.
- Se solicitó acceso operativo seguro o muestras de `monitor-vps.py` y `analyze-vps.py`. Sin SSH ni mediciones nuevas, RAM, CPU física, swap, OOM y reinicios siguen sin medir. No se propone una causa física ni se cambian límites, modelo, túnel o hardware.

## Fallos reproducidos y cambios mínimos

1. **Tiempo de planificación y reanudaciones fuera del presupuesto.** El runtime iniciaba otros 120 segundos al ejecutar y al reanudar. Core ahora registra el inicio antes de planificar; el estado conserva una fecha límite absoluta para la misma tarea. La espera de aprobación también cuenta dentro de ese presupuesto.
2. **Reparación no acotada y llamadas fallidas no contadas.** `repair()` se esperaba fuera del límite y el contador se incrementaba después de recibir respuesta. Ahora se reserva el intento antes de enviarlo, se limita al plazo restante y se propaga cancelación. Una respuesta tardía no puede ejecutar otra herramienta. Las pruebas incluyen una reparación que nunca responde y otra que falla; son fixtures, no reparación neuronal demostrada.
3. **Pertenencia de resultados parciales.** La revisión detectó que conservar indiscriminadamente resultados anteriores podía asociarlos a bytes nuevos bajo el mismo taskId. Se comprueban los bytes y la identidad del plan antes de adjuntarlos; cambios de entrada o parámetros devuelven parciales vacíos. La reanudación legítima conserva sus resultados confirmados aunque el plazo venza. Estas lecturas de identidad pueden ocurrir después del plazo; no se despachan herramientas.
4. **Presupuestos artificiales en el harness OCR.** OCR, normalización y Excel compartían objetivos relacionados, pero reiniciaban límites. Los controles por fases ahora comparten 120 segundos, dos intentos de Queen y ocho pasos, incluyendo planificación. Permanecen identificados como controles por fases, sin crédito de coordinación del objetivo completo. El caso seleccionable `scan-excel-full-objective` parte de un solo objetivo y comprueba celdas; no se ejecutó con Queen mientras la generación está bloqueada.
El ensayo de especialista se fija a un proveedor compatible y desactiva fallback únicamente en esa prueba; propaga cancelación y el ID propietario. El puente rechaza solicitudes vencidas antes de iniciar transporte. Uso pendiente queda como total desconocido, con subtotales completados separados; un resultado incierto bloquea llamadas nuevas en esa tarea. Los proveedores del producto y sus mecanismos de respaldo no se modifican.

5. **Evaluación de calidad insuficiente.** Se añaden 11 casos nuevos y un evaluador separado para los 8 originales. Las expectativas quedan en el evaluador cliente y nunca entran en el prompt. Comprueba pertinencia mínima, cancelación, parámetros, referencias y conservación del JSON. Los casos aún no recibieron inferencias reales; [preparación de los 19 casos](queen-resume-2026-11-13/quality-prepared.json). La revisión semántica humana sigue explícita: pasar sus aserciones tampoco equivale a comprensión general.

No se modificaron motores, registro, campos de herramientas, configuración principal, migraciones, Prisma Developer ni el plugin de ChatGPT. La reutilización existente de su planificador local permanece igual.

## Evidencia independiente y límites

| Tipo | Resultado observado | Alcance |
| --- | --- | --- |
| Inferencia real nueva | 1 solicitud corta, timeout; 0 respuestas recibidas | Generación continúa bloqueada; uso perdido desconocido |
| Ruta local del producto | [HTTP 200, `prisma-core-local`](queen-resume-2026-11-13/local-routing.json) | Decisión local; este endpoint no ejecutó la herramienta |
| Motores reales en backend, plan determinista | [JSON format → minify, datos y artefacto verificados](queen-resume-2026-11-13/local-tools.json) | Control de motores; sin Qwen |
| Motores reales en Chromium, plan determinista | [PDF página 2 → DOCX; archivo nuevo sin reutilización](queen-resume-2026-11-13/browser-controls.json) | XML incluye solo la página solicitada; hashes de entradas nuevas distintos; sin Qwen |
| Fixtures y simulaciones de tests | Plazos, intentos fallidos, datos cambiados, rúbricas | Validación local del código; no inferencias ni delegaciones |
| Metadatos de especialistas | [Kilo disponible para chat; imagen no ejecutable](queen-resume-2026-11-13/providers.json) | Capacidad anunciada; ninguna llamada real a especialista en esta continuación |
| Fallos semánticos históricos | DOCX original incorrecto, respuestas poco pertinentes, JSON incompleto | Conservados en el informe histórico; su nueva regresión neuronal sigue pendiente |
| Métricas físicas del VPS | No disponibles | No se sustituyen por métricas del workspace o Chromium |

Pasaron **236 pruebas Node** (incluyen las 210 del checkpoint previo y las 192 históricas), el build estático con 130 pruebas y la compilación aislada. Las pruebas y builds de integración se registran en `queen-resume-2026-11-13/checks.json`; los logs adjuntos distinguen las pruebas Node del build estático. El nuevo ejecutor limita cuándo inicia pasos y reparaciones; una herramienta opaca ya iniciada puede continuar internamente después de que venza la espera. Su resultado incierto se conserva y no habilita reintento automático. No se afirma cancelación física del VPS ni de proveedores.

Los artefactos deterministas están en [artifacts/](queen-resume-2026-11-13/artifacts/). No basta una firma DOCX/XLSX: aquí la prueba DOCX inspeccionó el XML contra el contenido conocido. La prueba de OCR→Excel neuronal completa, recuperación neuronal, delegación ejecutada y comparación de calidad quedan pendientes de recuperar generación. No se ejecutaron controles históricos de autenticación/schema otra vez porque no había evidencia nueva que lo justificara.

## Reproducción y siguiente paso

La [guía del evaluador](../neural-pilot/staging/quality-evaluation.md) contiene el nuevo runner. Preparación offline, sin secretos:

```sh
node prisma/neural-pilot/staging/evaluate-quality.mjs --suite=all --output=work/quality-prepared.json
node --test prisma/tests/*.test.mjs
node prisma/build.mjs
```

Después de medir y recuperar GenixNode, una sola solicitud pequeña primero. Si responde, probar el caso operativo necesario, antes de lanzar los 19 casos:

```sh
# Servidor local ya iniciado sobre prisma; variables privadas configuradas como en continuidad.
QUEEN_OPERATIONS_CASES=digital-pdf-word \
QUEEN_OPERATIONS_OUTPUT=work/queen-pdf-word-new \
node prisma/neural-pilot/staging/browser-operations.cjs

QUEEN_OPERATIONS_CASES=scan-excel-full-objective \
QUEEN_OPERATIONS_OUTPUT=work/queen-scan-excel-new \
node prisma/neural-pilot/staging/browser-operations.cjs

node prisma/neural-pilot/staging/evaluate-quality.mjs --live --suite=all \
  --base=https://VERSION.prisma-queen-staging.pages.dev --output=work/queen-quality-new.json
```

Usar la versión inmutable que corresponda al código publicado; no mezclar el snapshot de recuperación `ed94e25` con las correcciones posteriores. Los prompts de estos casos no contienen celdas esperadas ni planes de referencia. El harness mantiene una prueba de objetivo completo distinta de los controles por fases; si falta una herramienta o el presupuesto no alcanza, debe conservar el fallo.

Prompt breve de reanudación: «Continúa Queen en la rama del PR #125, que sigue draft. Lee primero `prisma/docs/QUEEN-CONTINUITY.md` y su bloque más reciente; recupera los últimos commits, despliegue y evidencias indicados allí. La generación de ocho tokens volvió a agotar 55 s: primero obtiene mediciones/acceso de GenixNode y recupera completions; después repite los casos operativos pendientes con la versión exacta, sin reiniciar la misión ni repetir aprovisionamiento.»
