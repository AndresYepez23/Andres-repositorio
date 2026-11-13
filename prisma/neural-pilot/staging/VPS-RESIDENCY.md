# Captura única de residencia y límites de Queen

Continuación de `25a9c9e`, sin nuevas sondas ni lotes. El entorno Codex no tiene identidad SSH configurada: la única intervención manual pendiente es ejecutar **este bloque completo dentro de la SSH de GenixNode** y adjuntar el `.tar.gz` indicado al final. No hace falta seleccionar PID ni ejecutar bloques adicionales.

El lector usa solo Python estándar y el Docker ya instalado. Realiza dos snapshots pasivos, separados por cinco segundos, con plazo total de 45 segundos. No envía solicitudes a Qwen ni activa carga; puede observar actividad de fondo ya existente. No instala paquetes, reinicia, vacía cachés, toca páginas del modelo o cambia ningún ajuste del servidor. Solo crea scripts/resultados privados en `/tmp`; la configuración temporal vacía pertenece al cliente Docker de lectura, no modifica el daemon ni su configuración existente.

Lee: PID real de llama-server (evita tini), anon/file y smaps/rollup, RSS/PSS de mapas GGUF, grandes mapas de archivo sin mostrar rutas (incluye candidatos con nombres opacos de caché), campos Docker numéricos/ID de imagen, cgroup v1/v2 y sus ancestros visibles, límites memory.max/high, CPU, io.max/throttle, memoria y presión, contadores de refault/fallos/E/S y estadísticas de dispositivos. Resuelve metadatos de montaje cgroup, sin volcar mountinfo. El Docker cliente usa socket local explícito, configuración nueva vacía y entorno fijo sin heredar credenciales.

No lee `.env`, claves, entorno o cmdline de procesos, archivos de credenciales, logs o contenidos de pesos. Un archivo inaccesible queda como error/desconocido. La raíz v2 sin archivos max/high es un caso del ABI del kernel; una ausencia en otro nivel no se interpreta como ilimitado. Una jerarquía delegada no se presenta como completa. Si hay timeout conserva los campos ya obtenidos cuando sea posible; un informe parcial no acredita captura completa.

**Límite inevitable del dato:** smaps no atribuye memoria anónima a KV, compute o caché de peticiones. Esos valores quedan `null`, nunca cero ni etiquetados por conjetura. Si no hay mapas llamados `.gguf`, puede haber nombres opacos o no-mmap: no significa que los pesos estén ausentes. Un RSS bajo o refault cero durante estas observaciones pasivas no demuestra lo ocurrido durante la generación anterior. Los contadores del host/dispositivo y los ancestros compartidos tampoco son exclusivos de Qwen.

El bloque de esta guía descarga desde la rama y exige el hash inmutable que acompaña esta versión: si el lector cambia en el futuro, falla antes de ejecutarlo. El PR #125 también conserva la versión del bloque fijada al commit publicado. Si falla, conservar el error sin volver a ejecutar sondas.

```bash
(
  set -eu
  umask 077
  QUEEN_CHECK=$(mktemp -d /tmp/queen-residency.XXXXXX) || exit 1
  curl --disable --fail --silent --show-error --location --proxy '' \
    --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 30 \
    'https://raw.githubusercontent.com/AndresYepez23/PRISMA/feature/prisma-neural-genixnode-qwen35-pilot/prisma/neural-pilot/staging/inspect-vps-residency.py' \
    -o "$QUEEN_CHECK/reader.py" || exit 1
  printf '%s  %s\n' 'd5fca69ce2b5059cb006625757520304b0024cbc23411eaa795ed41824b96c33' "$QUEEN_CHECK/reader.py" \
    | sha256sum --check --status || exit 1
  QUEEN_READ_EXIT=0
  if [ "$(id -u)" -eq 0 ]; then
    python3 -I "$QUEEN_CHECK/reader.py" > "$QUEEN_CHECK/residency.json" || QUEEN_READ_EXIT=$?
  else
    sudo -- python3 -I "$QUEEN_CHECK/reader.py" > "$QUEEN_CHECK/residency.json" || QUEEN_READ_EXIT=$?
  fi
  python3 -I -m json.tool "$QUEEN_CHECK/residency.json" > /dev/null || exit 1
  printf '%s\n' "$QUEEN_READ_EXIT" > "$QUEEN_CHECK/reader-exit-code.txt" || exit 1
  printf '%s\n' 'd5fca69ce2b5059cb006625757520304b0024cbc23411eaa795ed41824b96c33' > "$QUEEN_CHECK/reader-sha256.txt" || exit 1
  tar -czf "$QUEEN_CHECK/queen-residency-evidence.tar.gz" -C "$QUEEN_CHECK" \
    residency.json reader-exit-code.txt reader-sha256.txt reader.py || exit 1
  printf 'Adjunta este archivo: %s\n' "$QUEEN_CHECK/queen-residency-evidence.tar.gz"
)
```

## Decisión e intervención posterior

Con el archivo resultante, comparar RAM física y anon/file con tamaño/residencia de mapas de modelo; comprobar memory.high/max y uso de todos los ancestros, eventos high/max/oom, quotas/IOPS/caudal y deltas de fallo/refault/E/S. La comparación distingue un límite de cgroup de falta de capacidad o de E/S bajo demanda. Una ventana pasiva sin actividad no permite concluir ausencia de presión durante la inferencia.

Presentar al usuario **una intervención concreta**, alcance, riesgos y reversión antes de tocar el VPS. Conservar Qwen3.5-2B, cuantización/calidad y contexto actual. No hacer pull/reinstalar ni cambiar modelo o límites por intuición. Si el conjunto base no cabe, valorar RAM antes de degradar el modelo; si un componente de memoria o límite es prescindible, modificar solo ese componente tras aprobación. Los tamaños KV/compute/cache exactos pueden seguir sin ser observables bajo la prohibición de logs/argumentos: no prometer una separación que estas lecturas no dan.

La aprobación de la corrección será requisito para aplicarla. Después, realizar una sola generación controlada distinta de la sonda anterior, con streaming/TTFT y recursos sincronizados; ante resultado incierto no repetir ni lanzar lote. Solo tras respuesta estable y verificada, continuar con los ocho casos y once de calidad, PDF→Word con contenido, objetivo neuronal completo escaneo→OCR→extracción→Excel, reparación y delegación. Preparar snapshot limpio exclusivamente en staging y actualización del PR, conservando proveedores/motores/herramientas. La incorporación a producción se prepara para revisión, sin merge ni despliegue principal en esta fase.

Se añadieron solo seis controles offline dirigidos al lector, para evitar perder esta única ejecución por selección de tini, raíz v2, límite padre, montaje delegado, rutas/atribución de memoria y lecturas Docker sensibles. No son mediciones ni inferencias. La evidencia física previa y todos los tests históricos siguen intactos.
