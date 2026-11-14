# Queen: matriz de aceptación vigente

Fecha: 14/11/2026 UTC. Código de la cadena real validada: 62aafd539c36e722e7f5de1191fa8d29ad2dee7c; despliegue aislado c7918ef7-d9bb-4fee-bf82-4a846e420a46. **Queen no está terminada.** El PR #125 sigue en borrador y esta corrección no se ha promovido a producción principal.

Estados: **Aprobada** exige evidencia dentro del alcance indicado; **Fallida** conserva un resultado negativo observado; **Pendiente** señala validación o trabajo incompletos; **No ejecutada** indica que esta fase no realizó esa prueba. Una aprobación limitada no se extiende a las demás operaciones.

| Dimensión | Estado | Evidencia y condición pendiente |
| --- | --- | --- |
| Estabilidad del modelo | Pendiente | Cuatro respuestas reales; las dos últimas terminaron el JSON. Falta estabilidad sostenida y concurrencia medida. No se reinició el VPS. |
| Rendimiento y recursos | Pendiente | Última inferencia: 29 556 ms en backend, 482/87 tokens, 6.1084191844422255 tokens/s informados; tarea completa 33 142 ms. Sin nuevas mediciones de RAM/CPU/TTFT o consumo bajo carga. |
| Calidad de planificación | Pendiente | La cadena página 2 → Word pasó después de dos truncaciones y un error de referencia preservados. Los 19 casos reales están en ejecución, sin porcentaje consolidado. |
| Ejecución real de herramientas | Aprobada | Alcance exclusivo: motores existentes pdf-extract y pdf-to-word sobre un PDF real de tres páginas mediante el plan recién generado por Queen. Las demás cadenas siguen pendientes. |
| Verificación de artefactos | Pendiente | La comprobación independiente confirmó página 2 y ausencia de las otras páginas. El ledger genérico de Word sigue verification-pending, genericExecutionVerified: false; falta cerrar esa verificación autónoma. |
| Recuperación de errores | No ejecutada | El tercer plan erróneo se rechazó correctamente; no se probó recuperación neuronal completa de una herramienta fallida en estas rondas. Las regresiones offline son evidencia distinta. |
| Seguridad y aislamiento | Aprobada | Alcance: staging/D1 aislados; operador renovado con autorización; tres secretos Queen sin cambios y excluidos; sin cambios de GenixNode, producción principal, main o D1 principal. Sin atribuir a esta fase pruebas negativas de autenticación no realizadas. |
| Compatibilidad con Prisma Core | Pendiente | Backend Queen y motores del navegador completaron el caso real. Falta cerrar verificación genérica, otras operaciones y comprobar integración pública limpia antes de promover cambios. |

## Operaciones necesarias para el cierre

| Prueba | Estado actual | Criterio de aprobación |
| --- | --- | --- |
| PDF → extracción de página → Word | Aprobada en contenido; pendiente en ledger | [Resultados y artefactos](real-pdf-word/results.json) conservados. Resolver verification-pending con prueba del contenido; existencia o firma no bastan. |
| Escaneado → imágenes → OCR → normalización → Excel | No ejecutada en esta fase | Plan neuronal real, motores reales y verificación de valores/celdas contra el escaneo; no basta crear un XLSX. |
| JSON → formato → minificación | No ejecutada en esta fase | Plan y ejecución reales; igualdad de datos antes/después, sin alteraciones del literal. Conservar evidencias históricas aparte. |
| Archivos nuevos sin reutilizar salidas previas | No ejecutada en esta fase | Tareas reales consecutivas con entradas diferentes y comprobación de correspondencia; los controles offline de identidad son evidencia distinta. |
| Reparación de operación/parámetros erróneos | No ejecutada en esta fase | Detectar, corregir sin repetir pasos verificados y comprobar el resultado con presupuesto acotado. |
| Delegación a un especialista | No ejecutada en esta fase | Invocar un proveedor compatible existente y verificar su respuesta; catálogo disponible o propuesta de delegación no bastan. |
| Ocho escenarios originales + once adicionales | Pendiente: ejecución en curso | Conservar los 19 resultados individuales, tokens, latencia y errores; calcular el porcentaje al consolidar el informe real. |

## Historial y siguientes pasos

Las primeras rondas permanecen **Fallidas**: dos QUEEN_TRUNCATED_PLAN a 256 tokens y un DEPENDENCY_INPUT_REQUIRED:s2:s1 tras JSON completo. La última pasó con 87 tokens y flujo correcto. [Diagnóstico comparado](DIAGNOSIS.md), respuestas y presupuestos mantienen la procedencia individual.

Las **308 pruebas Node y 132 controles estáticos del build** son verificaciones offline aprobadas. No representan generaciones neuronales ni validación de las operaciones no ejecutadas. El informe de calidad real en curso debe consolidarse antes de actualizar su estado; no se presume que los 19 casos hayan pasado.

Se conserva la autorización vigente del usuario, con llamadas y presupuestos explícitos y sin repetir automáticamente resultados inciertos. No se cambia modelo, contexto, concurrencia o GenixNode para ocultar fallos. La aceptación completa requiere cerrar pendientes, conservar proveedores y herramientas existentes y verificar la integración antes de su promoción pública.
