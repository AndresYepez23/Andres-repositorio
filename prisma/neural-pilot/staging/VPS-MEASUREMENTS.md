# Obtener mediciones reales desde GenixNode

`monitor-vps.py` y `analyze-vps.py` están en esta carpeta y publicados en la rama `feature/prisma-neural-genixnode-qwen35-pilot`. Estaban presentes antes de esta guía, incluido el commit `686d6d4034ad03e2332bd9349a30891ac6fa2f4c`. Un push a GitHub no los instala automáticamente en el VPS. Se llaman **vps**, no **bps**.

Este procedimiento se ejecuta manualmente en el VPS al que ya tienes acceso SSH. Solo crea scripts y resultados en una carpeta temporal. No instala paquetes, reinicia servicios ni cambia Docker, Qwen, contextos, puertos o firewall. La sonda hace una petición de inferencia, separada de los lectores de métricas físicas. No ejecutar `benchmark.py`: ese runner histórico envía varios casos con otro timeout.

## 1. Descargar desde la sesión SSH del VPS

Fija `QUEEN_REF` al SHA completo del checkpoint verificado que acompaña esta guía en el PR #125. Usa ese mismo SHA para los tres archivos. El repositorio es público y estas descargas no necesitan credenciales.

```bash
# Usa el SHA completo que acompaña esta versión de la guía en el PR.
# Todo se valida antes de ejecutar un lector o una sonda.
if QUEEN_RUN=$(
  set -eu
  : "${QUEEN_REF:?Establece el SHA completo del checkpoint verificado}"
  [[ "$QUEEN_REF" =~ ^[a-f0-9]{40}$ ]] || exit 1
  QUEEN_CAPTURE=$(mktemp -d /tmp/queen-measurements.XXXXXX) || exit 1
  QUEEN_SOURCE="https://raw.githubusercontent.com/AndresYepez23/PRISMA/${QUEEN_REF}/prisma/neural-pilot/staging"
  for archivo in monitor-vps.py analyze-vps.py probe-qwen.py VPS-SCRIPTS.sha256; do
    curl --fail --silent --show-error --location --max-time 30 \
      --proto '=https' --proto-redir '=https' \
      "$QUEEN_SOURCE/$archivo" -o "$QUEEN_CAPTURE/$archivo.part" || exit 1
  done
  for archivo in monitor-vps.py analyze-vps.py probe-qwen.py VPS-SCRIPTS.sha256; do
    mv "$QUEEN_CAPTURE/$archivo.part" "$QUEEN_CAPTURE/$archivo" || exit 1
  done
  (cd "$QUEEN_CAPTURE" && sha256sum --check --strict VPS-SCRIPTS.sha256 >/dev/null) || exit 1
  python3 -m py_compile "$QUEEN_CAPTURE/monitor-vps.py" \
    "$QUEEN_CAPTURE/analyze-vps.py" "$QUEEN_CAPTURE/probe-qwen.py" || exit 1
  touch "$QUEEN_CAPTURE/scripts.verified" || exit 1
  printf '%s\n' "$QUEEN_CAPTURE"
); then
  printf 'Carpeta validada: %s\n' "$QUEEN_RUN"
else
  unset QUEEN_RUN
  printf 'Descarga o verificación fallida. No ejecutar los scripts.\n' >&2
fi
```

El manifiesto `VPS-SCRIPTS.sha256` verifica los **tres** scripts contra el mismo commit inmutable. Una descarga o checksum fallido deja `QUEEN_RUN` sin definir y no crea `scripts.verified`. No reutilizar el manifiesto antiguo para un script corregido. `py_compile` verifica sintaxis; no ejecuta el monitor ni hace inferencias.

Si el VPS no puede descargar de GitHub, descarga los archivos en tu ordenador y usa `scp` desde ese ordenador, con el destino SSH que ya utilizas. La ruta `/workspace/work/PRISMA` de Codex no existe automáticamente en tu ordenador o en el VPS. No clones ni cambies de rama en la instalación activa para conseguir estos archivos.

```sh
# En TU ORDENADOR, usa la ruta temporal que ya creó/imprimió el VPS:
scp monitor-vps.py analyze-vps.py probe-qwen.py VPS-SCRIPTS.sha256 \
  USUARIO@HOST:/tmp/queen-measurements.RUTA_REAL/
# Dentro del VPS, antes de ejecutar:
(cd "$QUEEN_RUN" && sha256sum --check --strict VPS-SCRIPTS.sha256) && \
  python3 -m py_compile "$QUEEN_RUN/monitor-vps.py" "$QUEEN_RUN/analyze-vps.py" "$QUEEN_RUN/probe-qwen.py" && \
  touch "$QUEEN_RUN/scripts.verified"
```

## 2. Medir CPU, RAM, swap y estabilidad

Confirma el nombre real del contenedor mediante `docker ps`. El nombre documentado es `prisma-neural-qwen`; si difiere, establece `QUEEN_CONTAINER` al que realmente ejecuta llama.cpp. Si Docker necesita privilegios, usa `sudo docker` y `sudo python3` para estos lectores. Un archivo con errores Docker no demuestra ausencia de OOM ni de reinicios.

```bash
QUEEN_CONTAINER=prisma-neural-qwen
queen_monitor_capture() {
  : "${QUEEN_RUN:?Primero descarga y valida los scripts}"
  test -f "$QUEEN_RUN/scripts.verified" || { printf 'Falta validación de scripts.\n' >&2; return 1; }
  (cd "$QUEEN_RUN" && sha256sum --check --strict VPS-SCRIPTS.sha256 >/dev/null) || return 1
  docker ps --format '{{.Names}} {{.Ports}}' || return 1
  date -u +%Y-%m-%dT%H:%M:%SZ > "$QUEEN_RUN/start-utc.txt"
  if command -v vmstat >/dev/null 2>&1; then
    vmstat 5 120 > "$QUEEN_RUN/vmstat.txt" &
  fi
  QUEEN_MONITOR_EXIT=0
  python3 "$QUEEN_RUN/monitor-vps.py" --container "$QUEEN_CONTAINER" \
    --samples 120 --interval 5 --output "$QUEEN_RUN/host.jsonl" > /dev/null || QUEEN_MONITOR_EXIT=$?
  printf '%s\n' "$QUEEN_MONITOR_EXIT" > "$QUEEN_RUN/monitor-exit-code.txt"
  python3 "$QUEEN_RUN/analyze-vps.py" "$QUEEN_RUN/host.jsonl" \
    --expected-samples 120 --monitor-exit-code "$QUEEN_MONITOR_EXIT" > "$QUEEN_RUN/summary.json" || return 1
  cat "$QUEEN_RUN/summary.json"
}
queen_monitor_capture
```

No reiniciar ni sobrescribir `host.jsonl` después de una interrupción. El resumen conserva las filas válidas y marca `capture.complete=false` si faltan muestras, hay una fila truncada, el monitor salió con error o falta cobertura de señales. Si se analiza un archivo antiguo sin `--monitor-exit-code`, ese estado queda desconocido; no se inventa un éxito. `capture.complete` se refiere a la captura, **no a la salud de generación**. La primera medida de CPU del host sigue siendo `null`.

Las 120 muestras llevan pausas de cinco segundos más la duración de las consultas Docker; no son exactamente diez minutos. Deja el monitor ejecutándose en la primera sesión SSH. En una segunda sesión fija `QUEEN_RUN` a la ruta que imprimió la primera y usa el mismo nombre real de contenedor.

Para el historial de OOM del kernel y presión del host, ejecutar en el VPS (con `sudo` si tu usuario lo necesita):

```sh
journalctl -k --since '-2 hours' --no-pager \
  --grep='oom-kill|Out of memory|Killed process|Memory cgroup out of memory' \
  > "$QUEEN_RUN/kernel-oom.txt" 2> "$QUEEN_RUN/kernel-oom-errors.txt"
cat /proc/uptime > "$QUEEN_RUN/uptime.txt"
cat /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io \
  > "$QUEEN_RUN/pressure.txt" 2> "$QUEEN_RUN/pressure-errors.txt"
```

No instalar herramientas si un comando falta: conservar ese hecho. `vmstat` registra `r/b` (procesos ejecutables/bloqueados del host), `si/so` (actividad de swap) y `wa/st`; su primera fila es acumulada desde el arranque y se interpreta por separado. Esa cola de CPU no es la cola de peticiones de Qwen.

## 3. Una sonda pequeña de Qwen durante el monitor

No lanzar otras inferencias simultáneas. Respeta cualquier cooldown pendiente de la prueba anterior y toma primero al menos unas muestras de reposo. En la segunda sesión SSH:

```bash
# Sustituye la ruta por la que imprimió la primera sesión:
QUEEN_RUN=/tmp/queen-measurements.RUTA_REAL
QUEEN_CONTAINER=prisma-neural-qwen
if test -f "$QUEEN_RUN/scripts.verified" &&
   (cd "$QUEEN_RUN" && sha256sum --check --strict VPS-SCRIPTS.sha256 >/dev/null); then
  (set -C; python3 "$QUEEN_RUN/probe-qwen.py" --container "$QUEEN_CONTAINER" \
    > "$QUEEN_RUN/qwen-probe.json")
  cat "$QUEEN_RUN/qwen-probe.json"
else
  printf 'Scripts sin verificar; no se ejecutó la sonda.\n' >&2
fi
```

Usar `sudo python3` si hace falta permiso Docker. La sonda lee la clave **existente** `LLAMA_API_KEY` del entorno del contenedor solo en memoria local; no imprime claves, prompts, respuesta generada, variables de entorno o logs crudos. No envíes esa clave a ChatGPT ni la copies a otra cuenta. Si la clave no está disponible por ese mecanismo, devuelve `LOCAL_API_KEY_UNAVAILABLE` y no genera; no presupone que falten los secretos configurados en Cloudflare.

Verifica que el puerto publicado corresponda al `127.0.0.1:7860` documentado; la sonda solo usa esa dirección local, sin proxy y bloqueando redirecciones. Consulta el modelo real y exige un único slot observable e inactivo antes del POST. Hace **como máximo una** completion de ocho tokens, thinking desactivado, con límite absoluto de generación de **55 segundos**. Las lecturas de metadatos y métricas tienen plazos de pared de cinco segundos, además del timeout del socket; la sonda completa está acotada a 100 segundos. Esos 100 segundos incluyen preflight y no amplían el plazo de generación. Los plazos anidados conservan el tiempo restante del presupuesto exterior. No reintenta. `set -C` impide sobrescribir el informe y ejecutar inadvertidamente otra prueba sobre ese mismo archivo. Lee `/metrics` solo si ya está disponible y conserva los contadores de cola que el servidor realmente exponga; un 404 no autoriza activarlo ni reiniciar. No mide TTFT porque esta sonda no usa streaming. Las capturas de cola son puntuales, no una prueba de carga ni el máximo de la cola durante toda la generación.

Si la petición vence, el resultado upstream y su consumo quedan desconocidos. Esperar al menos cinco minutos y comprobar estado antes de cualquier siguiente intento; no repetir automáticamente sin información nueva. Un slot inactivo, `/models` correcto o `/health` correcto no demuestran salud de generación.

## 4. Qué permiten afirmar los resultados

El monitor captura CPU agregada del VPS, CPU y memoria de Docker, RAM disponible, swap total/libre, carga y estado del contenedor, `OOMKilled`, `restartCount` y tiempos de arranque/parada. Docker CPU 100 % equivale a un núcleo; el porcentaje de CPU del host se normaliza sobre todos sus vCPU. La primera muestra de CPU del host es `null`. La memoria mostrada por Docker no equivale exactamente al RSS del modelo.

El analizador resume CPU, RAM, swap y estabilidad, e informa cobertura por señal, filas inválidas, muestras esperadas y estado de salida del monitor. Swap utilizado no equivale a actividad de swap: conservar `host.jsonl` y `vmstat.txt` para interpretar `si/so`. `OOMKilled=false` solo describe el estado observado; no excluye OOM histórico o del host. Un journal vacío sin permisos o sin retención suficiente no prueba ausencia de OOM. `monitorErrors>0` señala cobertura incompleta. Reinicios entre muestras o recreación del contenedor pueden no verse completamente.

Solo una completion recibida permite usar los `usage` y `timings` realmente devueltos para latencia y tokens/s. Campos ausentes permanecen `null`; no se convierten en cero. La sonda no acredita la planificación de Queen ni sus cadenas operativas.

Conservar/compartir los resultados: `summary.json`, `host.jsonl`, `qwen-probe.json`, `vmstat.txt` si existe, `kernel-oom.txt`, su archivo de errores, `pressure.txt`, `uptime.txt` y `monitor-exit-code.txt`. Incluir también el manifiesto de versión si hay dudas sobre qué scripts se ejecutaron. No compartir `.env`, claves ni `docker inspect` sin filtrar. Para copiarlos al ordenador, ejecutar allí `scp USUARIO@HOST:/tmp/queen-measurements.RUTA_REAL/*.json* .` y copiar los `.txt` de esa misma carpeta si son necesarios.

## Si ya ejecutaste la versión anterior

Los archivos capturados con `6673124` siguen siendo útiles. No repitas la sonda porque cambió la guía. Conserva e indica la versión de origen; el analizador nuevo puede resumir el JSONL anterior sin generar otra completion. Si no se registró la salida del monitor, omite `--monitor-exit-code` y conserva ese dato como desconocido. Hasta publicar el checkpoint nuevo, sus opciones y manifiesto solo existen en el árbol local: no mezclar scripts de commits diferentes.
