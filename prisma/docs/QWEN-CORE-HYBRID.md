# Qwen Core — adaptación híbrida (PR #132)

El nombre público es **Qwen**; **Qwen Core** identifica solo el componente técnico. Los módulos y secretos internos `QUEEN_*` continúan por compatibilidad: **no** representan otra IA.

1. **Proteger el Core existente:** detectar operaciones y requisitos explícitos omitidos; no autorizar ejecuciones incompletas. El verificador es conservador y no sustituye la validación de artefactos.
2. **Interpretación mínima:** `POST /api/core/qwen-interpret` recibe texto y metadatos, propone hasta 3 herramientas reales y **nunca** ejecuta. Una inferencia como máximo, sin reintentos; lease, origen, cuota, límites, validación de IDs y timeout. Desactivado de forma predeterminada con `QWEN_CORE_INTERPRETER_ENABLED` distinto de `1`.
3. **Integración:** las operaciones locales completas mantienen su ejecución normal; las ambiguas o compuestas usan opcionalmente Qwen para ordenar la lista antes del planificador multimodelo. Si el plan final está incompleto no se ejecuta. Solo entonces se presenta una tarjeta compacta con enlaces al buscador de herramientas, nunca un formulario obligatorio.
4. **Validación:** batería offline de 20 solicitudes y tests separados de cliente/backend; CI Node y build SEO. **Esto no demuestra aún calidad neuronal en vivo**: para activar el nuevo intérprete hace falta una prueba aislada con inferencia real y latencia aceptable.

No modificar ni desplegar automáticamente `main`, `prismaspace`, la D1 principal ni GenixNode. Conservar PR #125 y el historial/validadores del anterior proyecto. El PR #132 permanece en borrador hasta pruebas reales.


## Staging isolation addendum (2026-11-14)

- Dedicated D1 database `prisma-queen-core-staging-isolated` was created and initialized from migration `0004_queen_control.sql`.
- The staging Pages project binds `QUEEN_CONTROL_DB` to this dedicated database; the main `prismaspace` project remains bound to its original database.
- The staging project uses `QUEEN_STAGE=staging` and an explicit `QWEN_CORE_STAGING_ENABLED=1` gate. The public production project does not receive this flag.
- A live inference smoke must wait until the newest staging Pages deployment is active; an older deployment returning `available:false` is not a model failure.
