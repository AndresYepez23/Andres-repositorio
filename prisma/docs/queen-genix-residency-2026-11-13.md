# Queen: comparación de residencia pasiva y generación bloqueada

**Actualización del 13/11/2026:** la nueva evidencia refuerza la hipótesis de presión de memoria y relecturas de páginas. Ahora hay un historial de reclaim/refault **del cgroup de Qwen**, no solo espera de disco del host. No permite atribuir esos incrementos al intento anterior ni confirmar cuánto de la memoria anónima es necesario. Tampoco convierte la ausencia de actividad pasiva en una prueba de salud durante generación.

No se ejecutó código adjunto, SSH, inferencias, reinicios, cambios de parámetros o despliegues aislados. La evidencia anterior se conserva íntegra.

## Integridad y alcance de la captura

- Archivo recibido: `queen-residency-evidence.tar.gz`, SHA-256 `5775c5762f45d5e6ed8a30e4433a4e77a3aeefe99e0a493492a60a5d9ea28590`.
- Lector adjunto idéntico byte a byte al de `2fd9008fc21f6716ef49b85e70b6dd4ee7ae2824`, hash `d5fca69ce2b5059cb006625757520304b0024cbc23411eaa795ed41824b96c33`; checksum declarado coincidente y exit code **0**. Se leyó como texto para verificarlo; no se ejecutó.
- Captura pasiva del **13:38:17.301 al 13:38:22.459, America/Bogota (UTC−05:00)**; originales 18:38 UTC. Separación entre inicios: **5.157847642 s**. Lecturas de subsistemas secuenciales, no atómicas.
- PID real 10211, init 10161, identidad estable. Contenedor conserva el `StartedAt` observado en el registro anterior y restartCount 0. Imagen registrada: `sha256:998e17af1ae710081e5a6e6db962f29dd81db31b33eccf281f1767ff0f7729c7`.
- [Datos originales y procedencia](queen-residency-evidence-2026-11-13/), [análisis numérico](queen-residency-evidence-2026-11-13/analysis.json). El lector público ya está conservado en su commit; no se duplica su fuente en esta carpeta.

Reproducción **solo sobre archivos locales**:

```sh
python3 prisma/docs/queen-residency-evidence-2026-11-13/reproduce.py
```

No es una prueba offline de capacidad de Queen ni solicita una inferencia. Recalcula las métricas reales y verifica los hashes de los resultados preservados.

## Qué aporta la memoria observada

| Medida | Resultado |
| --- | --- |
| RAM física | 4,106,285,056 B = 3.82428 GiB |
| RSS del proceso | 3,373,445,120 B = 3.14177 GiB |
| RSS anónimo del proceso | 3,130,015,744 B = 2.91505 GiB; aproximadamente 95% del anónimo del host |
| RSS de archivos del proceso | 243,429,376 B = 232.15 MiB |
| Memoria actual del cgroup Qwen | 3,401,248,768 B = 3.16766 GiB |
| Anónimo / archivos / kernel, contabilidad cgroup | 3,130,195,968 / 259,551,232 / 11,501,568 B |
| RAM disponible mínima de esta ventana | 457,752,576 B = 436.546875 MiB |
| Swap del host / proceso | 0 / 0 |
| Candidato de caché del modelo, tamaño virtual | 1,269,878,784 B = 1.18267 GiB |
| RSS/PSS de ese candidato | 240,099,328 B = 228.98 MiB, **18.9073%** del tamaño mapeado |

Hay un solo gran mapeo candidato de caché, permisos `r--s`, dispositivo `fd:01` (253:1, partición vda1), inode 281476. Su tamaño es compatible con el modelo documentado, pero no se verificó su identidad como GGUF. No aparece ningún nombre `.gguf`: un nombre de caché opaco es una explicación compatible, no ausencia de pesos. El lector no abrió ni tocó el archivo del modelo.

**RSS mapeado no equivale a toda la caché de páginas del archivo.** Los 1,029,779,456 B no representados por ese RSS no se declaran automáticamente expulsados del almacenamiento en caché. Tampoco se equipara el tamaño virtual a un conjunto de trabajo completamente necesario.

La desigualdad de capacidad sí es relevante, con supuestos explícitos:

`anónimo actual + candidato completo = 4,399,894,528 B > RAM física 4,106,285,056 B`.

La diferencia es **293,609,472 B, 280.01 MiB**, incluso antes de contar kernel, otros procesos y demás archivos. Por tanto, **conservar simultáneamente todo ese anónimo y todo ese mapeo residente no cabe en este host**. No es una medida del tamaño de ampliación necesario: parte del anónimo podría ser prescindible y parte del mapeo podría no ser necesaria en cada pasada. El pico bajo generación no está medido.

KV, estado recurrente, buffers compute, caché de peticiones y heap retenido siguen sin desglose. Smaps no separa esas asignaciones. La memoria anónima estable durante cinco segundos sin trabajo nuevo tampoco demuestra o descarta una fuga o retención anterior.

## Restricciones locales: hipótesis que pierde respaldo

En ambas capturas, `memory.max=max` y `memory.high=max` tanto en el contenedor como en su padre; se recorrieron todos los ancestros visibles hasta la raíz. Eventos high/max/oom/oom_kill en cero en los niveles aplicables. Docker `Memory=0` y `MemoryReservation=0`. **No aparece un límite local de memoria que tenga sentido levantar.** La RAM física sigue siendo finita aunque el cgroup no la limite.

`io.max` está vacío en contenedor y padre; los límites Bps/IOPS filtrados de Docker son nulos. No se encontró un techo explícito de esos campos. Esto no demuestra que el almacenamiento carezca de QoS: faltan políticas como io.weight/io.latency/io.cost y límites/contención del hipervisor o proveedor.

`cpu.max=200000 100000` y cpuset `0-1` permiten dos CPU, coherentes con el VPS. No aumentan `nr_throttled` ni `throttled_usec` en estos cinco segundos. Los acumulados 1,031 períodos/1,070,368 µs no se atribuyen al timeout anterior. Esta captura pasiva tampoco calibra el comportamiento de CPU bajo carga.

Los archivos de control ausentes en la raíz cgroup v2 son casos esperados del ABI del kernel, no errores del contenedor. Se mantienen sus lecturas crudas; una ausencia en otro nivel no se interpreta como ilimitada.

## Reclaim/refault histórico: evidencia nueva importante

| Contador acumulado del cgroup Qwen | Valor |
| --- | --- |
| workingset_refault_file | **26,241,301** |
| pgscan | **54,820,431** |
| pgsteal | **26,556,371** |
| pgmajfault | **83,210** |
| io.stat rbytes | **109,034,700,800 B** |
| Fallos mayores del proceso, ámbito distinto | **80,166** |

Estos contadores demuestran historial de recuperación y reutilización de páginas en el cgroup. **No son deltas del episodio de 60 s, bytes únicos de pesos, solicitudes ni tokens.** Sin muestras anteriores sincronizadas no se conoce en qué tareas o momentos aumentaron. El total de lectura es consistente con el contador Docker redondeado a 109GB de la evidencia anterior; no es una nueva lectura de 109GB en esta ventana.

En los dos snapshots, **todos esos contadores de Qwen se mantienen iguales**, al igual que los fallos menores/mayores del proceso y sus PSI de memoria/E/S. No hubo nuevas lecturas del cgroup ni del disco.

El host no estuvo matemáticamente inmóvil: aparecen **25 refaults de archivo** en sus lecturas VM, sin nuevos major faults/scan/steal; PSI de E/S aumenta solo 631 µs some/568 µs full, con promedios redondeados a 0.00. No se atribuyen esos cambios a Qwen. Vda registra dos escrituras, 49,152 B, y cero lecturas; vda1 refleja el mismo trabajo y **no se suma como otro disco**. `readAwaitMs=null` significa ausencia de operaciones de lectura con las que calcularlo, no latencia cero.

## Comparación con el intento anterior

| Aspecto | Episodio de generación anterior | Nueva ventana pasiva |
| --- | --- | --- |
| Trabajo | POST local, máximo ocho tokens; timeout 55,060 ms | Ninguna solicitud creada por el lector |
| Ventana relevante | 12 intervalos de vmstat, unos 60 s | 5.15785 s entre inicios |
| E/S | Iowait 56–81%, media 72.667%; aproximadamente 5.792 GiB leídos en host; BlockIO Qwen 103→109GB | Cero lecturas Qwen/disco; pequeños writes del host |
| Residencia/anon | No capturados durante el episodio | Anónimo 2.915 GiB; RSS candidato 228.98 MiB |
| Refault/reclaim de Qwen | Sin deltas temporales disponibles | Historial acumulado elevado, delta pasivo cero |
| Latencia de disco bajo lectura | Sin medición de await/cola por dispositivo | No calculable porque no hay lecturas |

**Las capturas son compatibles.** Presión de memoria, recuperación de páginas y límite del almacenamiento no son alternativas excluyentes: la presión puede provocar reclaim; reutilizar páginas puede producir refault y E/S; un volumen lento o limitado puede alargar esas lecturas. La primera captura demuestra la espera de E/S durante el intento; la segunda documenta el presupuesto de memoria y el historial de reclaim, sin observar esa cadena en el mismo instante.

## Información que falta y decisión posible

1. **Origen del anónimo:** contabilidad numérica de KV/estado recurrente, compute, cachés y heap del build efectivo. El ID de imagen ya está disponible; falta el desglose, no otra foto de RSS. Puede contrastarse con procedencia/contabilidad existente y filtrada; no leer entorno, argumentos, credenciales, contenido de memoria o logs crudos. Sin ese dato no se elige una bandera para reducir un componente concreto.
2. **Identidad y conjunto de trabajo del mapa opaco:** confirmar que corresponde a los pesos realmente usados y cuánto requiere cada pasada. Usar metadatos ya disponibles; no leer/hashar todo el archivo ni precargarlo, lo que alteraría el estado y produciría E/S.
3. **Cadena temporal bajo trabajo autorizado:** residencia/anon/file, deltas refault/scan/steal/major-fault y PSI de Qwen, rbytes/rios del mismo cgroup, y await/cola/tiempo de E/S del dispositivo físico, recogidos en la misma ventana. La evidencia anterior no permite reconstruir estos deltas retrospectivamente. Otra captura en reposo no resuelve esta falta. **No se ejecuta ahora una inferencia para obtenerlos.**
4. **QoS de almacenamiento:** condiciones del volumen y límites del proveedor, además de las políticas locales no recogidas. Un caudal de unos 100 MiB/s observado durante demanda no demuestra por sí solo throttling del proveedor o avería.

Si durante trabajo autorizado crecen refault/reclaim y lecturas mientras la residencia de los pesos fluctúa y anon ocupa la RAM, la cadena de presión/relectura gana confirmación temporal. Si el conjunto necesario permanece residente y no crecen esos contadores, pero lecturas identificadas muestran await/cola altos o un techo confirmado, cobra prioridad el almacenamiento. Ambos patrones pueden coexistir.

No hace falta recrear el timeout solo para confirmar la hipótesis. Una futura intervención aprobada puede verificarse con una única prueba posterior instrumentada, comparada con la evidencia histórica disponible. Esa prueba evaluaría la recuperación y su mecanismo observado después de la corrección; no reconstruiría retrospectivamente los contadores ausentes del intento original.

**Recomendación actual:** mantener memoria/residencia como primera línea de corrección; no modificar un cgroup de memoria que ya está sin límite explícito. Reducir un componente anónimo solo si se identifica como prescindible y compatible con conservar Qwen3.5-2B, su calidad y contexto. Si ese anónimo es necesario, ampliar RAM es una candidata fundada en el presupuesto, aunque todavía no están medidos el pico, la capacidad exacta ni la mejora posterior. No se presenta ninguna intervención como aplicada o verificada.

Se conserva la puerta de aprobación: no inferencias, reinicios ni cambios de VPS sin autorización. No se pide otro bloque pasivo al usuario. Queen y sus pruebas operativas siguen pendientes; no se ejecutaron los 8+11 casos ni nuevas pruebas offline, ni se tocaron runtime, herramientas, motores, proveedores, staging, main o D1 principal. El PR #125 permanece draft; su registro de publicación contiene el nuevo SHA y el control de Preview automático.
