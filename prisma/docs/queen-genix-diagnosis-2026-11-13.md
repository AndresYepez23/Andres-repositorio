# Queen: diagnóstico real de GenixNode, 13/11/2026

**La generación está limitada por esperas de E/S durante este intento. La causa más probable es lectura repetida de los pesos del modelo por falta de residencia en RAM, compatible con presión de memoria y reclaim/refault de páginas de archivo.** La espera de E/S está demostrada; el mecanismo exacto de memoria aún no. No hay evidencia para culpar a Cloudflare ni para afirmar que basta aumentar el timeout.

Este informe analiza exclusivamente `queen-evidence.tar.gz`, entregado por el usuario. No se ejecutaron sus scripts, ninguna inferencia nueva, solicitudes al VPS, lotes, reinicios ni cambios de parámetros. Los tres scripts adjuntos coinciden byte a byte con el checkpoint publicado `66731248dcefd464aa7bb5817f366c452fc61449`. Se conservan las correcciones locales posteriores de lectores en `2b8fc198dd0ef3287c4ef2d995d4577decca0ae3`.

## Evidencia y reproducción

Archivo recibido, SHA-256: `b0ccf105ebe8e5bb7384e0b9d19b6c3f62ab233095712e2d2d5d204d60e0cc3d`.

Los [ocho archivos originales de resultados](queen-genix-evidence-2026-11-13/) se preservan sin modificaciones; el [manifiesto](queen-genix-evidence-2026-11-13/provenance.json) incluye hashes, tamaños y mtimes del archivo comprimido. Esos mtimes aportan contexto, no son una certificación independiente del instante de captura. Los scripts adjuntos son código de referencia, no instrucciones autorizadas adicionales.

```sh
python3 prisma/docs/queen-genix-evidence-2026-11-13/reproduce.py
python3 prisma/neural-pilot/staging/analyze-vps.py \
  prisma/docs/queen-genix-evidence-2026-11-13/host.jsonl --expected-samples 120
```

Ambos comandos son offline. [Análisis derivado](queen-genix-evidence-2026-11-13/analysis.json), [resumen recalculado](queen-genix-evidence-2026-11-13/recomputed-summary.json). Se reprodujeron **todos** los valores del `summary.json` original y se verificaron los hashes de los ocho resultados. No se inventó el estado de salida del monitor: falta ese archivo; por eso `capture.complete=false` en el lector nuevo, aunque haya 120 filas válidas y cobertura completa de las señales esperadas. La CPU del host tiene 119 mediciones porque la primera requiere una muestra anterior.

## Qué ocurrió

Horas de esta tabla en **America/Bogota (UTC−05:00)**; los JSON originales permanecen en UTC.

| Momento | Evidencia |
| --- | --- |
| 11:58:58–12:11:28 | 120 muestras de host, 750.123 s de duración; 2 vCPU y 4,106,285,056 bytes de RAM física. No exactamente diez minutos. |
| 11:59:16 | Qwen prácticamente inactivo, BlockIO acumulado `103GB / 4.1kB`. |
| 11:59:17 | Empieza la sonda local. Se obtiene un único slot inactivo y el ID de modelo mediante lecturas autenticadas antes de intentar el POST. |
| 11:59:26–12:00:09 | Muestras fechadas del contenedor: BlockIO `104→108GB`; CPU Docker `17.51–32.09%` de un núcleo. El contenedor está leyendo durante la espera. |
| Alrededor de 12:00:12 | La generación vence a los **55,060 ms**, `GENERATION_DEADLINE`; no llega una completion. `usage`, `timings` y TTFT siguen desconocidos. La hora de finalización también consta, con resolución de segundos, en el mtime del informe. |
| 12:00:17 | BlockIO `109GB`; la CPU vuelve a `0.01%`. Ese contador de E/S permanece en 109GB durante el resto del registro. |

`qwen-probe.at` precede al preflight; `elapsedMs` mide la fase de generación. No se presentan como una medición exacta de admisión del POST ni de TTFT. Los contadores Docker están redondeados: `103→109GB` son aproximadamente 6 GB leídos, no un volumen exacto por solicitud.

### La media de CPU ocultaba el bloqueo de E/S

`vmstat.txt` contiene 120 filas numéricas. La primera es acumulada desde el arranque y **se excluye** de los cálculos de intervalos. Hay 119 intervalos de cinco segundos, nominalmente 595 s, que cubren menos tiempo que `host.jsonl`.

En las filas de datos con índice 5–16, contando la fila inicial como índice 0, aparecen **12 intervalos consecutivos, aproximadamente 60 s**, con:

| Señal real | Valor |
| --- | --- |
| CPU en espera de E/S, `wa` | 56–81%; media 72.667% |
| Lectura del host, `bi` | 89,323–103,143 KiB/s; media 101,216.167 KiB/s, aproximadamente 98.84 MiB/s |
| Procesos bloqueados, `b` | 0–3; media 2.25 |
| CPU inactiva, `id` | 0–15%; media 2% |
| CPU de usuario / sistema | Medias 10.333% / 14.833% |
| Tiempo robado por hipervisor, `st` | Máximo 1%; media 0.083% en este episodio |
| Volumen integrado de lectura del host | Aproximadamente 5.792 GiB durante esos 60 s |

El volumen integra informes redondeados de `vmstat`, no un contador exacto del proceso. `vmstat` no lleva timestamps; no se le asignan segundos UTC inventados. Su episodio temprano concuerda con las muestras **sí fechadas** de BlockIO de Qwen durante la sonda. La carga de otros procesos no está separada por dispositivo o PID, por lo que no todo byte del host se atribuye automáticamente a Qwen.

La fórmula de `hostCpuPercent` del monitor descuenta tanto `idle` como `iowait`. Por eso su media de **2.886%**, calculada además sobre muchos minutos de reposo, **no significa que el servidor tuviera capacidad libre durante la inferencia**. Docker también muestra CPU ejecutando, no el tiempo de los hilos esperando páginas/disco. Sus muestras cortas y los intervalos del host no son ventanas idénticas.

### Memoria, swap, presión y estabilidad

- Qwen: media 3,277,068,995 bytes y máximo 3,426,310,160 bytes según Docker, aproximadamente 3.28/3.43 GB decimales. Esa medida no equivale al RSS completo de los pesos ni identifica memoria anónima, buffers y caché por separado.
- RAM disponible mínima: **438,898,688 bytes**, aproximadamente 439 MB decimales/418.57 MiB, solo **10.688%** del host. `MemAvailable` incluye páginas recuperables; no garantiza que los pesos estén residentes.
- **Swap configurado: cero** en las 120 muestras; `si=so=swpd=0` en `vmstat`. Se descarta intercambio hacia swap como causa. Aun sin swap, Linux puede expulsar y releer páginas de archivos mapeados.
- No se observaron OOMKilled, reinicios ni errores del monitor. El contenedor conserva `StartedAt=2026-11-13T09:39:40.870000354Z`, restartCount 0 y estado running. Eso no descarta reclaim/refault sin OOM.
- `kernel-oom.txt`: `-- No entries --`, stderr vacío. No aparecen eventos en la consulta retenida; no se convierte en garantía histórica absoluta.
- `pressure.txt` es **un snapshot**, no una serie durante la generación. Su mtime exportado es 17:20:18 UTC, unos veinte minutos después de la sonda. Con el orden cpu/memory/io del comando documentado, memoria tiene `avg10/60/300=0`, e IO `avg300=0.22%` some y `0.21%` full. No contradice un episodio anterior ya terminado. Sus `total` son acumulados desde el arranque, sin deltas del intento.
- `uptime.txt`: 30,963.58 s de uptime y 55,348.08 s de idle agregado de dos CPU. Son acumulados del host, no medidas de latencia de Qwen.

## Hipótesis, por orden de respaldo

1. **Demostrada: generación asociada a espera intensa de E/S.** Lecturas de varios GB en el contenedor, `bi` alto, `wa` sostenido y procesos bloqueados. La petición no estaba simplemente esperando en una ruta externa sin actividad del servidor.
2. **Más probable: conjunto de trabajo que no permanece residente**, con relectura de pesos/páginas de archivo por RAM ajustada. El volumen leído supera varias veces el tamaño de GGUF documentado, mientras el host dispone de unos 0.44–0.51 GB. Faltan residencia del GGUF, desglose anon/file y contadores de fallos/refault para confirmarlo. No se afirma una fuga de memoria ni que todo el uso Docker sea peso del modelo.
3. **Posibles contribuyentes: límite de rendimiento del volumen, carga competidora o límites efectivos de cgroup.** La lectura cercana a 100 MiB/s es compatible con un techo de almacenamiento, pero sin `io.stat` por dispositivo, latencia/cola de disco, configuración efectiva y desglose de procesos no se puede distinguir throttling del proveedor de relecturas por memoria. Ambos mecanismos pueden coexistir.
4. **Menos respaldadas: fallo interno/versión de llama.cpp o ruta de plantilla/backend.** No hay logs de admisión/errores ni build efectivo en el paquete. No quedan totalmente descartadas; la actividad de disco hace innecesario asumir primero un bloqueo lógico sin trabajo.

Lo que esta captura permite apartar como explicación principal:

- **Cloudflare Access/Tunnel/DNS** para *esta* sonda: llama a `127.0.0.1:7860`, sin proxy ni redirecciones. El fallo local existe sin esas capas. Esto no prueba toda la ruta remota actual.
- **Falta de clave local o modelo no anunciado:** se superan las lecturas autenticadas de slots y modelos. No llega un 401/403 del POST; su admisión exacta no está registrada.
- **Cola ya ocupada antes del intento:** la sonda exige un solo slot inactivo. Una carrera posterior no está medida. `/metrics` devuelve **501**; significa métricas no disponibles, no cola cero ni fallo de generación por ese endpoint.
- **Saturación de cálculo/steal sostenida** y **OOM/reinicios durante la captura**: no son lo observado. La CPU espera E/S; no está calculando al 200% de Docker, y no hay reinicios.
- **Truncación o exceso de contexto demostrado:** no se recibió respuesta ni finish_reason. La salida solicitada es de ocho tokens y thinking va desactivado. No se transforma ausencia de respuesta en prueba de truncación ni se inventan tokens ejecutados.

## Corrección mínima recomendada

**Recuperar residencia de los pesos en RAM, conservando el Qwen y su calidad, es el primer objetivo de corrección.** Antes de elegir una opción concreta hay que localizar qué ocupa la RAM y verificar el límite efectivo: los archivos actuales no permiten atribuirla a KV, buffers de cómputo, cachés de solicitudes, otro proceso o un límite de cgroup. No hay un flag exacto cuya mejora esté medida todavía.

La intervención mínima se elige con ese desglose:

1. Si el exceso es un buffer/caché prescindible de **Qwen**, reducir exclusivamente ese componente compatible con el build efectivo, manteniendo modelo, 2048 tokens de contexto y un slot. Conservar el estado anterior y medir el ahorro. No tocar procesos de proyectos ajenos.
2. Si incluso el conjunto base de ese mismo modelo y runtime no cabe residente, **más RAM es preferible a degradar el modelo** para preservar capacidad. Los datos justifican estudiar capacidad de memoria, pero no permiten prometer una cantidad exacta ni una ganancia de velocidad.
3. Si las páginas ya están residentes y faltan refaults, investigar el volumen/cgroup antes de cambiar memoria. No confundir el caudal observado con un disco averiado.

No se ha aplicado ninguna de estas intervenciones. Alargar 55 s ocultaría el síntoma; bloquear pesos con mlock o forzar no-mmap sin presupuesto medido puede agotar la RAM; añadir swap no elimina las relecturas de páginas de archivo. Un reinicio sin recoger el desglose perdería evidencia y no demostraría una corrección permanente. No se proponen como solución confirmada.

### Siguiente captura precisa, solo lectura, sin generación

Ejecutar en la SSH ya disponible del usuario; Codex no dispone aquí de identidad SSH. Estos comandos no leen claves, `.env`, argumentos del proceso ni logs con prompts:

```bash
sudo docker inspect --format \
  '{"imageId":{{json .Image}},"memoryLimitBytes":{{json .HostConfig.Memory}},"memorySwapBytes":{{json .HostConfig.MemorySwap}},"nanoCpus":{{json .HostConfig.NanoCpus}}}' \
  prisma-neural-qwen
sudo docker top prisma-neural-qwen -eo pid,comm
```

Con el PID **host de llama-server**, no el PID de init/tini, sustituir `12345`:

```bash
QUEEN_PID=12345
sudo awk '/^(Name|VmRSS|RssAnon|RssFile|RssShmem|VmSwap|VmLck|Threads):/' \
  "/proc/$QUEEN_PID/status"
sudo cat "/proc/$QUEEN_PID/smaps_rollup"
sudo cat "/proc/$QUEEN_PID/cgroup"
sudo awk '
  /^[0-9a-f]+-[0-9a-f]+ / {gguf=index($0,".gguf")>0}
  gguf && /^(Size|Rss|Pss|Anonymous|Swap|Locked):/ {total[$1]+=$2}
  END {for (key in total) print key,total[key],"kB"}
' "/proc/$QUEEN_PID/smaps"
```

Para cgroup v2, usar **solo la ruta de ese proceso** indicada después de `0::`, bajo `/sys/fs/cgroup`, y leer `memory.current`, `memory.max`, `memory.stat`, `memory.events`, `memory.pressure`, `io.stat` y `cpu.stat`. Conservar especialmente anon/file, `workingset_refault_file`, `pgmajfault`, `pgscan`, `pgsteal` y eventos high/max/oom. Son contadores acumulados: una sola lectura no acredita su incremento durante la petición anterior. Los logs de carga necesarios son únicamente tamaños de pesos/KV/compute y build, previamente filtrados localmente; no compartir logs crudos con prompts o credenciales.

Estos comandos están preparados, **no ejecutados en GenixNode**. No autorizan una nueva sonda. Si más tarde se autoriza un ensayo, recoger deltas sincronizados de esos contadores y del dispositivo durante **un** intento controlado, antes de cualquier lote.

## Continuación de Queen y alcance

Se preservaron las siete rondas históricas, el 8/8 bajo rúbrica mínima y sus límites. No se atribuye ese resultado a este diagnóstico. Los 19 casos preparados, el objetivo neuronal completo escaneo→OCR→extracción→Excel, la reparación, delegación y calidad operativa permanecen pendientes de recuperar generación y autorización para nuevos ensayos. Los artefactos deterministas históricos no se cuentan como cadenas neuronales verificadas.

La línea base publicada sigue siendo 236 pruebas Node y el checkpoint de lectores conserva 19 pruebas Python offline aprobadas. No se repitieron porque este cambio agrega análisis/documentación y evidencia, no modifica runtime, herramientas, proveedores ni Docker. La verificación nueva fue reproducción offline de los datos y hashes, sin fixtures de inferencia.

El conector Cloudflare volvió a responder a una lectura dirigida del canonical principal: `67b3e7e7-16b2-43ec-9fc0-cb85a8adbc08`, main `4b24fe6d6f74375a337936aafe1199df9b1e9072`. Esto desbloquea la publicación controlada del trabajo local; no se cambió configuración principal. El registro final del PR indica el SHA publicado y cualquier Preview automático retirado. Último despliegue aislado conocido: `16436df0`, snapshot `ed94e25`; no se generó otro despliegue aislado durante el diagnóstico. PR #125 sigue draft, sin merge ni cambios en main/D1 principal.
