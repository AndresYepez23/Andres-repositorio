# Queen: índice de continuidad, pruebas y evidencias

**Estado vigente14/11/2026UTC: [HANDOFF MAESTRO](QUEEN-HANDOFF.md) y [PROMPT](QUEEN-RESUME-PROMPT.md). Producción24dd33d está desplegada pero Queen pública fallaHTTP422. No repetir recuperación VPS.**

Evidencia nueva en la carpeta existente [queen-handoff-2026-11-13/](queen-handoff-2026-11-13/), con [hashes/procedencia](queen-handoff-2026-11-13/verification.json): [éxito neuronal específico staging](queen-handoff-2026-11-13/1a7c97c-staging-neural-pdf-word.json), [DOCX](queen-handoff-2026-11-13/1a7c97c-staging-selected-page.docx), [fallo público24d](queen-handoff-2026-11-13/24dd33d-production-ui-failure.json), [payload exacto](queen-handoff-2026-11-13/1a7c97c-production-synthetic-request.json), [recuperación VPS](queen-handoff-2026-11-13/vps-cache-trial-observed-success.json), [recursos actuales](queen-handoff-2026-11-13/resources-current.json), [293Node](queen-handoff-2026-11-13/24dd33d-node-tests-summary.txt) y [131build](queen-handoff-2026-11-13/24dd33d-static-build-summary.txt).

**El inventario restante es HISTÓRICO desde732bce6; afirmaciones como sin intervención/cero evaluaciones/generación bloqueada describen esa fase, no el estado actual.**

Inventario preparado desde el estado conservado en `732bce6`, sin ejecutar pruebas, inferencias ni nuevas lecturas del VPS. Queen sigue pendiente de recuperación de generación y demostración operativa. Rama `feature/prisma-neural-genixnode-qwen35-pilot`, [PR #125](https://github.com/AndresYepez23/PRISMA/pull/125), que permanece como borrador.

## Orden de lectura para retomar

1. [QUEEN-HANDOFF.md](QUEEN-HANDOFF.md): documento maestro de transferencia, arquitectura vigente, accesos, restricciones y misión de finalización. Incluye el estado de cada módulo y qué debe hacerse primero.
2. [QUEEN-CONTINUITY.md](QUEEN-CONTINUITY.md): estado vigente y registro cronológico; sus bloques antiguos no son instrucciones activas.
3. [Residencia pasiva y comparación con generación](queen-genix-residency-2026-11-13.md): última evidencia física recibida y límites de sus conclusiones.
4. [Diagnóstico del intento local de generación](queen-genix-diagnosis-2026-11-13.md): espera de E/S observada y comparación de hipótesis.
5. [Continuación del runtime y pruebas](queen-resume-2026-11-13.md): correcciones de presupuestos, resultados parciales y evaluación preparada.
6. Consultar después únicamente el archivo necesario para el siguiente problema concreto. El [prompt portátil](QUEEN-RESUME-PROMPT.md) permite iniciar otra cuenta sin depender del chat.

[queen-architecture.md](queen-architecture.md) describe el diseño y la integración inicial. Sus cifras de **181 pruebas y cero inferencias reales** corresponden a esa fase histórica; tampoco su listado inicial de pendientes sustituye las pruebas autenticadas y mediciones recibidas después. El [README de Prisma](../README.md) es el punto general del proyecto; este índice reúne la documentación específica de Queen.

## Evidencia recuperable y alcance

| Bloque | Archivos | Clasificación y resultado |
| --- | --- | --- |
| Inferencias históricas auténticas | [Informe](queen-live-2026-11-13.md), [resumen](queen-live-2026-11-13/summary.json), [ronda 7](queen-live-2026-11-13/round-7.json), [directorio con las siete rondas](queen-live-2026-11-13/) | Respuestas reales de Qwen. Última ronda completa: 8/8 bajo criterios mínimos de intención/herramientas; 4,711 tokens de entrada y 442 de salida. No acredita calidad general ni coordinación operativa completa. Las regresiones anteriores permanecen conservadas. |
| Autenticación y formato históricos | [auth-controls.json](queen-live-2026-11-13/auth-controls.json), [schema-controls.json](queen-live-2026-11-13/schema-controls.json) | Solicitudes reales al backend y controles negativos por capa. No son nuevas comprobaciones ejecutadas durante este inventario. |
| Fallos operativos neuronales históricos | [operations-real-1.json](queen-live-2026-11-13/operations-real-1.json) | DOCX con contenido incorrecto por consumir el original; OCR agotó el plazo; reparación y delegación no demostradas. Se conservan los fallos y las métricas disponibles. |
| Motores históricos con planes deterministas | [operations-deterministic.json](queen-live-2026-11-13/operations-deterministic.json), [artefactos](queen-live-2026-11-13/artifacts/) | PDF→Word y escaneo→OCR→normalización explícita→JSON→Excel, con contenido conocido comprobado. Los motores y traspasos son reales; el plan de control no es coordinación neuronal. |
| Snapshot aislado recuperado | [restored-deployment.json](queen-resume-2026-11-13/restored-deployment.json), [health.json](queen-resume-2026-11-13/health.json) | Despliegue real `16436df0-3d50-4e89-9165-b875be731d3f`, [URL inmutable](https://16436df0.prisma-queen-staging.pages.dev), origen `ed94e25b9f38645a484c740f9f2e3ac3063f3a4f`, `commit_dirty=false`. Es anterior a las correcciones nuevas; no representa el HEAD actual. |
| Último intento remoto de la continuación | [short-generation.json](queen-resume-2026-11-13/short-generation.json), [summary.json](queen-resume-2026-11-13/summary.json) | Una completion solicitada, máximo ocho tokens, `QUEEN_TIMEOUT` a 55,000 ms; HTTP 503, cliente 57,614 ms. Cero completions recibidas, consumo real y TTFT desconocidos. No se repitió ese fallo en esa continuación. |
| Decisión local del producto | [local-routing.json](queen-resume-2026-11-13/local-routing.json) | HTTP 200, `source=prisma-core-local`. Ese endpoint solo decidió la ruta; no ejecutó una herramienta ni hizo una inferencia. |
| Motores reales de la continuación | [local-tools.json](queen-resume-2026-11-13/local-tools.json), [browser-controls.json](queen-resume-2026-11-13/browser-controls.json), [artefactos y entradas](queen-resume-2026-11-13/artifacts/) | Controles deterministas: JSON format→minify; PDF página 2→DOCX, comprobando inclusión/exclusión en su XML; archivo nuevo sin reutilización de resultados. El verificador general del DOCX mantiene correspondencia de contenido parcial, aunque la comprobación específica del escenario pasó. Sin Qwen. |
| Catálogo de especialistas observado | [providers.json](queen-resume-2026-11-13/providers.json) | Metadatos de disponibilidad: Kilo para chat; no equivale a una llamada a especialista. Esa continuación registró cero inferencias de especialistas y ninguna delegación demostrada. |
| Evaluación nueva preparada | [quality-prepared.json](queen-resume-2026-11-13/quality-prepared.json), [guía](../neural-pilot/staging/quality-evaluation.md) | 19 casos preparados offline: ocho originales más once nuevos; cero solicitudes live de esta nueva evaluación. No se ejecutan motores ni se verifican artefactos en este runner. |

Los informes anteriores que decían «RAM/CPU del VPS sin medir» describen su momento. Los dos paquetes de datos recibidos después aportan mediciones reales del VPS; no deben confundirse con fixtures de los lectores ni con métricas del workspace.

## Mediciones reales de GenixNode recibidas

| Captura | Archivos recuperables | Hallazgos y límites |
| --- | --- | --- |
| Host y sonda local durante generación bloqueada | [Procedencia](queen-genix-evidence-2026-11-13/provenance.json), [host.jsonl](queen-genix-evidence-2026-11-13/host.jsonl), [qwen-probe.json](queen-genix-evidence-2026-11-13/qwen-probe.json), [vmstat.txt](queen-genix-evidence-2026-11-13/vmstat.txt), [análisis](queen-genix-evidence-2026-11-13/analysis.json), [resumen recalculado](queen-genix-evidence-2026-11-13/recomputed-summary.json), [reproductor offline](queen-genix-evidence-2026-11-13/reproduce.py) | 120 muestras de host en 750.123 s; sonda local con timeout a 55,060 ms. Durante 12 intervalos de vmstat: iowait 56–81%, media 72.667%; aproximadamente 5.792 GiB leídos por el host. BlockIO Qwen redondeado 103→109 GB. Swap cero; no se observaron OOM ni reinicios en la cobertura disponible. Falta el estado de salida del monitor: `capture.complete=false` en el lector nuevo, aunque haya 120 filas válidas. No atribuir todos los bytes del host a Qwen. |
| Dos snapshots pasivos de residencia/cgroup | [Procedencia](queen-residency-evidence-2026-11-13/provenance.json), [residency.json](queen-residency-evidence-2026-11-13/residency.json), [análisis](queen-residency-evidence-2026-11-13/analysis.json), [estado de salida](queen-residency-evidence-2026-11-13/reader-exit-code.txt), [reproductor offline](queen-residency-evidence-2026-11-13/reproduce.py) | Separación entre inicios: 5.157847642 s; lector con salida 0. RAM física 4,106,285,056 B; anónimo de Qwen 3,130,015,744 B; candidato mapeado de 1,269,878,784 B con RSS/PSS 240,099,328 B. Historial del cgroup: 26,241,301 refaults de archivo y 83,210 fallos mayores; delta pasivo cero. No se generó una inferencia para esta captura. |

La evidencia respalda espera de E/S durante el intento y fortalece memoria/residencia como primera línea de investigación. No demuestra aún qué parte del anónimo es prescindible, la identidad exacta del mapa candidato, el conjunto de trabajo necesario ni la ampliación de RAM requerida. Los contadores acumulados de reclaim/refault no son deltas del timeout anterior. No hay un límite local `memory.max/high` observado que tenga sentido levantar; la comparación completa y las incertidumbres están en el informe de residencia. No se ha aplicado ni verificado una intervención.

## Pruebas y builds conservados

Estas baterías se ejecutaron en checkpoints distintos. Este inventario solo leyó sus resultados; no las reejecutó ni sumó pruebas de tipos diferentes como una batería nueva.

| Batería | Resultado conservado | Fuente |
| --- | --- | --- |
| Suite Node de integración | **236/236**, cero fallos; incluye las 210 del checkpoint anterior y las 192 históricas | [checks.json](queen-resume-2026-11-13/checks.json), [node-tests.txt](queen-resume-2026-11-13/node-tests.txt) |
| Build estático | Aprobado, **130 pruebas embebidas**, separadas de las 236 Node | [static-build.txt](queen-resume-2026-11-13/static-build.txt), [checks.json](queen-resume-2026-11-13/checks.json) |
| Build aislado del código corregido | Aprobado; worker 748,477 B, SHA-256 `8fbda6d059c7000a9057d8ed18819bd957e7fed68b5d87b659c881904712d7be`; **no desplegado** | [staging-build.txt](queen-resume-2026-11-13/staging-build.txt), [checks.json](queen-resume-2026-11-13/checks.json) |
| Lectores/sonda Python, primera batería offline | **19 aprobadas**, cero fallos; usan fixtures; cero lecturas reales del VPS y cero solicitudes reales de inferencia en esa batería | [checks.json](queen-vps-readers-2026-11-13/checks.json), [python-tests.txt](queen-vps-readers-2026-11-13/python-tests.txt) |
| Lector de residencia Python, batería dirigida posterior | **6 aprobadas**; usan fixtures; cero lecturas reales del VPS y cero solicitudes de generación en esa batería. Las 19 Python y las 236 Node previas no se reejecutaron en este checkpoint | [checks.json](queen-residency-reader-2026-11-13/checks.json), [python-tests.txt](queen-residency-reader-2026-11-13/python-tests.txt) |

Los tests de transporte, planes, plazos, presupuesto, cancelación, resultados parciales y rúbricas emplean fixtures identificados. No son completions de Qwen ni delegaciones externas. Los scripts de reproducción de los paquetes físicos recalculan observaciones recibidas; tampoco representan nuevas capturas del VPS.

## Evaluación y operación aún pendientes

La [guía de evaluación](../neural-pilot/staging/quality-evaluation.md) describe los 19 casos, sus criterios, la separación de expectativas del prompt y la revisión semántica humana pendiente. Los [ocho casos originales](../neural-pilot/queen-cases.json) y los [once nuevos](../neural-pilot/queen-heldout-cases.json) usan metadatos sintéticos de archivos para planificación. Los once fueron independientes al introducirse; si guían correcciones, dejan de ser una muestra no vista.

La [guía del staging](../neural-pilot/staging/README.md) documenta el entorno aislado y los runners. Las pruebas operativas con contenido conocido siguen en [browser-operations.cjs](../neural-pilot/staging/browser-operations.cjs); el control determinista no sustituye los planes auténticos de Queen. Siguen pendientes la nueva regresión neuronal, PDF→página solicitada→Word, escaneo→OCR→extracción→Excel, composición, reparación neuronal y delegación ejecutada, con comprobación semántica de sus resultados.

Retomar desde la decisión técnica y los permisos vigentes de continuidad. No repetir capturas pasivas, timeouts, aprovisionamiento o auditorías generales como sustituto de una intervención justificada y autorizada.

La [verificación de esta transferencia](queen-handoff-2026-11-13/verification.json) registra el checkpoint, accesos por metadatos, PR/CI y exclusiones privadas. No es una nueva prueba neuronal ni una nueva captura del VPS.
