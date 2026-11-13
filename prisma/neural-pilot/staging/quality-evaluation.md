# Evaluación de decisiones y pertinencia

`evaluate-quality.mjs` conserva los ocho casos originales y añade once casos separados, inéditos al introducirse: otras formulaciones, negación, cancelación con historial, parámetros faltantes, composición, instrucciones incrustadas como datos, referencia sin artefacto disponible, archivo nuevo, cambio de objetivo, proveedor observado como indisponible y objetivo fuera del catálogo. Las expectativas viven exclusivamente en el evaluador; no se envían a `/__queen/plan`. Si se usan estos casos para ajustar Queen, dejan de ser una muestra independiente y deberá añadirse otra muestra.

Preparación sin red ni credenciales:

```sh
node prisma/neural-pilot/staging/evaluate-quality.mjs --suite=all \
  --output=work/queen-quality-prepared.json
node --test prisma/tests/queen-evaluation.test.mjs
```

Solo cuando se haya comprobado recuperación de generación y respetado el cooldown, usar una URL inmutable del proyecto aislado. Empezar con un caso y ampliar después; el runner no hace un smoke ni reintenta errores de disponibilidad por su cuenta:

```sh
QUEEN_STAGING_OPERATOR_KEY_FILE=/RUTA_PRIVADA/operator-key \
node prisma/neural-pilot/staging/evaluate-quality.mjs --live \
  --suite=heldout --case=heldout-word-capability \
  --base=https://VERSION.prisma-queen-staging.pages.dev \
  --output=work/queen-quality-word.json
```

`VERSION` representa el prefijo hexadecimal de ocho caracteres del despliegue. Para una ronda posterior, omitir `--case`; `--suite=original` conserva las solicitudes originales, `--suite=all` evalúa ambas muestras. Cada solicitud es una tarea independiente con el presupuesto vigente del backend; no se divide una solicitud compuesta entre checkpoints. Los archivos de informe no se sobrescriben. Cada fila se guarda antes de continuar y el runner se detiene ante timeout, cooldown, indisponibilidad o resultado incierto. El caso de proveedor se bloquea si el catálogo actual no muestra un proveedor de chat indisponible con un modelo existente; no inventa IDs ni estados. El snapshot se conserva para interpretar cambios de disponibilidad.

La opción `--include-local-control` consulta primero `/api/core/plan` con una operación JSON sencilla y registra `source`. Las otras solicitudes usan `/__queen/plan`, que fuerza Queen pero conserva los controles locales de intención, catálogo y validación. La evidencia separa la fuente de decisión, llamadas de Queen, llamadas a especialistas (cero en este runner), tokens observados y resultados de transporte desconocidos.

Los checks comprueban requisitos concretos: tema de la respuesta, ausencia de preguntas ajenas o de otra confirmación de cancelación, parámetros solicitados, cadena completa, consumo de `step:s1`, uso del archivo actual y conservación literal del JSON. Son condiciones necesarias y no acreditan por sí solas comprensión completa. `semanticReview` permanece `pending` para revisar manualmente pertinencia, veracidad y límites sobre el texto exacto registrado. No hay una tasa automática de «éxito semántico».

Estos casos usan **metadatos sintéticos de archivos**: Queen no recibe su contenido. El runner no ejecuta motores ni especialistas y no verifica DOCX, XLSX u otros artefactos. Las pruebas operativas con archivos de contenido conocido siguen en `browser-operations.cjs`; deben conservar su evaluación de contenido y sus límites independientes. Las pruebas unitarias del evaluador usan respuestas fixture identificadas, sin contarlas como inferencias reales.
