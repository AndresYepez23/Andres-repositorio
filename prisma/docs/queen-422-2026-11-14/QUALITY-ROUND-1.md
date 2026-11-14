# Calidad real: primera ronda sobre 62aafd5

19 casos preparados; 13 solicitados, 6 no ejecutados. Detención automática por timeout con una salida/consumo desconocidos. No reenviar ese caso.

Originales: **6/8 (75%) planes aceptados con rúbrica aprobada**. Selección visible de intención/herramientas: **8/8**, incluyendo dos salidas rechazadas por calidad del mensaje; no confundir esa cifra con éxito operativo.

| Caso | Calidad / aceptación | Latencia cliente ms | Entrada / salida | Error |
| --- | --- | ---: | --- | --- |
| question-not-permission | fallida | 21764 | 544 / 22 | QUESTION_ECHO |
| negation | aprobada | 24535 | 623 / 31 | — |
| missing-parameter | aprobada | 25407 | 539 / 52 | — |
| multi-step-pdf | aprobada | 29114 | 479 / 87 | — |
| json-payload | aprobada | 23278 | 473 / 55 | — |
| cancel | aprobada | 15195 | 370 / 22 | — |
| specialist-image | fallida | 25282 | 504 / 51 | INCOMPLETE_MESSAGE |
| unsupported-pdf-ocr-chain | aprobada | 24848 | 556 / 43 | — |
| heldout-word-capability | fallida | 35904 | 537 / 122 | rúbrica no aprobada |
| heldout-negated-image | fallida | 25733 | 551 / 46 | INCOMPLETE_MESSAGE |
| heldout-cancel-with-history | aprobada | 18188 | 409 / 30 | — |
| heldout-size-missing | fallida | 40867 | 553 / 150 | PARAMETER_RANGE:size |
| heldout-third-page-word | fallida | 56079 | desconocido | QUEEN_TIMEOUT |

Las respuestas son auténticas de Queen; los adjuntos de esta evaluación son metadatos sintéticos. No se ejecutan herramientas ni especialistas. Totales medidos: 6138 tokens de entrada y711 de salida, **incompletos** por una solicitud incierta. Los ocho originales no equivalen a la autonomía con archivos. Los seis casos restantes siguen no ejecutados; no se rellenan con expectativas.

Revisar también la cadena PDF real y su artefacto en `real-pdf-word/`, una prueba operativa separada con contenido inspeccionado.
