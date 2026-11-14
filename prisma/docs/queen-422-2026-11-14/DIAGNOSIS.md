# Queen: HTTP 422 resuelto para la cadena PDF → Word

**Estado final por pausa:** código `5ae1bbb` publicado y compilado, no desplegado. 327 Node / 139 build aprobados. Nuevo verificador probado sobre el DOCX/PDF reales: correspondencia correcta verificada; PDF original incorrecto rechazado. Alcance texto seleccionable y saltos, no maquetación/gráficos. El ledger antiguo permanece intacto y la evaluación neuronal sigue en13/19; ninguna mejora de puntuación se presume. Leer el bloque vigente de [continuidad](../QUEEN-HANDOFF.md) antes de reanudar.

Estado: 14/11/2026 UTC. **Una planificación neuronal real y su ejecución PDF → extracción de página → Word ya funcionan en staging. Queen todavía no supera su aceptación completa.** Los fallos anteriores se conservan y la evaluación real de 19 casos está en ejecución, pendiente de consolidar.

## Cuatro rondas reales

Cada ronda realizó una inferencia, con maxInferences: 1 numérico. Son solicitudes del backend de Prisma hacia Qwen autenticadas mediante Cloudflare Access y llama.cpp; no son respuestas simuladas. Pertenecen a prisma-queen-staging, D1 980bad8f-0356-48b9-87bc-56bcf363f69a.

| Ronda y evidencia | Resultado | Entrada / salida, tokens | Backend / cliente, ms | Generación, tokens/s informados |
| --- | --- | --- | --- | --- |
| [Diagnóstico inicial](diagnostic-one-response.json) | Fallida: HTTP 422 QUEEN_TRUNCATED_PLAN, length | 468 / 256 | 55 276 / 55 440 | 6.545694026846278 |
| [Mensaje/búsqueda acotados](post-fix-validation-response.json) | Fallida: mismo 422 y length; ajuste insuficiente | 482 / 256 | 56 436 / 56 710 | 6.481922059183101 |
| [Parámetros ligados al contrato](contracts-validation-response.json) | Fallida en semántica: JSON completo, stop; DEPENDENCY_INPUT_REQUIRED:s2:s1 | 482 / 86 | 29 078 / 29 407 | 6.370877564400017 |
| [Flujo secuencial corregido](sequential-validation-response.json) | Aprobada para este caso: HTTP 200, source: queen, DAG válido | 482 / 87 | 29 556 / 31 059 | 6.1084191844422255 |

La última ronda corresponde a código **62aafd539c36e722e7f5de1191fa8d29ad2dee7c**, despliegue **c7918ef7-d9bb-4fee-bf82-4a846e420a46**, [URL aislada](https://c7918ef7.prisma-queen-staging.pages.dev). Presupuesto, petición y respuesta se conservan en sequential-validation-*.json. El modelo eligió pdf-extract con pages: "2", seguido de pdf-to-word consumiendo step:s1 y declarando dependencia s1. No hubo reparación ni recuperación de catálogo en esa ronda.

## Causa y correcciones

Las dos primeras rondas agotaron los **256 tokens de salida antes del parseo del plan**. La traza vacía era consecuencia del rechazo previo, no evidencia de un error del validador de DAG. Se mantuvo el contexto de 2048 tokens. El servidor recibió 468/482 tokens de entrada y respondió: esos 422 no fueron rechazos de autenticación, disponibilidad o presupuesto de contexto. Tampoco fueron errores de transporte por timeout; el servidor devolvió length, aunque el tiempo total seguía siendo alto.

No se capturó el contenido truncado de las primeras rondas. La segunda informó 900 caracteres, de ellos 92 espacios: no permite atribuir el agotamiento a un campo concreto ni a una salida compuesta únicamente de espacios. La gramática admitía mensajes sustituibles, búsqueda inaplicable y parámetros abiertos. Son libertades demostradas por el código; no conocemos el contenido exacto que agotó la salida.

Las correcciones conservadas, sin relajar la validación independiente, fueron:

- Mensaje de ejecución fijo “Plan preparado.” y búsqueda solo en ramas que permiten retrieve. El primer ajuste, por sí solo, no resolvió el fallo real.
- Contratos de parámetros pequeños ligados a cada herramienta solo en flujos probados de dos/tres pasos. Word admite un objeto vacío; extracción admite pages de texto. Una herramienta de archivo único admite una referencia. Planes genéricos y contratos complejos conservan la gramática compacta anterior.
- Restricción generativa de la referencia y dependencia anteriores cuando la petición expresa claramente una cadena de transformaciones de archivo único. No se prefijan herramientas ni valores: el modelo sigue seleccionando el plan y el validador comprueba su resultado.
- Protección de objetivos sobre el original o PDF/documento/archivo completo. Se examinan las cláusulas consumidoras: “todo el PDF” en una primera operación no desactiva el control posterior sobre “ese resultado”. Observadores, archivos múltiples y solicitudes ambiguas no reciben esa restricción generativa.
- Diagnósticos numéricos de longitud y espacios. La captura parcial excepcional se limita al diagnóstico privado autorizado; su contenido y las claves quedan excluidos de estas evidencias públicas.

Tras ligar los contratos, la tercera ronda terminó en 86 tokens y expuso el fallo semántico real: Word declaraba depender de la extracción, pero consumía el PDF original. El validador lo rechazó correctamente. La última ronda consumió la salida extraída y superó el control. Esto demuestra resolución para el caso medido, no para todos los objetivos.

## Ejecución y contenido reales

La última respuesta neuronal se entregó inmediatamente a los motores existentes del navegador, sin otra inferencia. Se usó un PDF real de tres páginas con texto sintético de control, de 1302 bytes; no una respuesta o artefacto simulado. [Resultado reproducible](real-pdf-word/results.json):

- Tiempo total de tarea, incluida inferencia y ejecución: **33 142 ms**.
- PDF extraído: 869 bytes; DOCX: 7649 bytes. Sus SHA-256 constan en el resultado.
- Comprobación independiente: contenido de página 2 presente y de las otras páginas ausente.
- Artefactos: [PDF extraído](real-pdf-word/queen-three-pages-paginas-seleccionadas.pdf) y [Word](real-pdf-word/queen-three-pages-paginas-seleccionadas.docx).

El ledger genérico conserva **executionStatus: verification-pending** y **genericExecutionVerified: false** para Word. La comprobación independiente de este caso sí pasó, pero no sustituye ese pendiente del verificador autónomo.

## Límites y continuidad

Se mantienen contexto 2048, salida máxima 256, concurrencia y plazos existentes. No se reinició ni modificó GenixNode; no se alteraron producción principal, main o D1 principal. La clave del operador de staging se renovó con autorización explícita; los tres secretos Queen permanecieron sin cambios y no se publican.

La línea local actual conserva **308 pruebas Node y 132 controles estáticos del build aprobados**. Son pruebas offline, algunas con dobles de inferencia; no equivalen a ese número de inferencias reales. No se midieron de nuevo RAM, CPU, TTFT, concurrencia o estabilidad sostenida del VPS. Las tasas de tokens de la tabla proceden del servidor.

Los ocho escenarios originales y once adicionales están ejecutándose como una evaluación real de 19 casos. Su informe activo es /workspace/work/queen-422-quality-all.json; **aún no se declara completado ni se calcula una tasa final**. Deben consolidarse resultados individuales y conservar los fallos al terminar. Escaneo → OCR → normalización → Excel, reparación operativa y delegación real siguen pendientes.

La autorización vigente permite continuar la misión y preparar su objetivo público. Se continúa con presupuestos explícitos y llamadas acotadas, sin repetir solicitudes cuyo resultado sea incierto. El éxito de esta cadena no sustituye la [matriz de aceptación](ACCEPTANCE.md). PR #125 permanece como borrador.
