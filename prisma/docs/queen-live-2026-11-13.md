# Queen: validación real, 13 de noviembre de 2026

La autenticación y la primera inferencia real están demostradas. Queen produjo un plan JSON, Prisma ejecutó `json-format` y el verificador comprobó los datos y el artefacto. **Todavía no está aprobada la coordinación neuronal completa de PDF escaneado a Excel.** Las pruebas operativas detectaron errores y, posteriormente, varias solicitudes de generación dejaron de responder dentro de 55 segundos. No se presenta ese bloqueo como falta de credenciales ni se le atribuye una causa física sin medirla.

## Entorno y alcance

- Repositorio `AndresYepez23/PRISMA`, PR #125, rama `feature/prisma-neural-genixnode-qwen35-pilot`; conservar como borrador, sin fusionar.
- Se usa **Production de `prisma-queen-staging`**, según la autorización más reciente. El proyecto principal `prismaspace` y su producción quedan fuera de los despliegues.
- D1 aislada: `980bad8f-0356-48b9-87bc-56bcf363f69a`. El wrapper comprueba su marcador mediante el binding real. No se aplicaron migraciones a la D1 principal.
- `QUEEN_ENABLED=1` en el Production aislado, `0` en su Preview. Los tres secretos permanecen en Cloudflare y no se registran sus valores. No se duplicaron manualmente en Preview.
- Modelo y endpoint conservados: `unsloth/Qwen3.5-2B-GGUF:Q4_K_M`, `https://queen.prismaspace.space/v1`. Sin cambios de contexto, concurrencia, hilos, modelo, túnel o hardware.
- El proyecto aislado es Direct Upload: rama de producción etiquetada con la del PR y paquetes construidos desde ella. No existe integración Git automática; no se recreó el proyecto para habilitarla.

## Inferencia auténtica y controles

El primer smoke devolvió 76 tokens de entrada y 91 de salida. La latencia del backend fue 17.495 s y la del cliente 17.687 s; llama.cpp informó 6.716 tokens/s de generación. `json-format` produjo un JSON de 20 bytes con SHA-256 `61a7b00c2d484940ed1fe38e9337a8434dc3fc393cc0c794b362f364b5bf984b`. El plan solo proponía; la ejecución y la comprobación ocurrieron después.

- `/v1/models` y `/tokenize` respondieron realmente desde el backend, con ambas capas de autenticación.
- Los controles negativos reales rechazaron con HTTP 401 tanto el secreto incorrecto de Access como la API key incorrecta de llama.cpp: [auth-controls.json](queen-live-2026-11-13/auth-controls.json).
- Ambos formatos de esquema (`json_object.schema` y `json_schema`) impusieron una constante que contradecía la instrucción del prompt: [schema-controls.json](queen-live-2026-11-13/schema-controls.json). No se confirmó la hipótesis de que llama.cpp ignoraba los esquemas.
- En la ronda completa, la salida truncada a ocho tokens se rechazó con `QUEEN_TRUNCATED_PLAN`. No se ejecutó como plan.
- No apareció contenido `reasoning_content` ni `<think>` en las respuestas medidas de los ocho casos. Se envió `enable_thinking:false`.
- Las pruebas posteriores de rendimiento, de ocho tokens y de SSE sin esquema agotaron el plazo. No hay TTFT ni tokens de esos intentos que puedan medirse a partir de una respuesta ausente.

## Ocho casos neuronales

Última ronda completa: [round-7.json](queen-live-2026-11-13/round-7.json), versión aislada `a27c015c-7004-4c36-bca6-04cc2bad6700`. Las respuestas son de Qwen, no de fixtures de respuesta. Los casos utilizan entradas de evaluación fijas; los casos con archivos prueban planificación con metadatos, no ejecución de esos archivos de 100 bytes.

| Caso | Intención | Herramientas | Latencia cliente (s) | Tokens entrada / salida |
| --- | --- | --- | ---: | ---: |
| Pregunta sobre PDF→Word | question | sin acciones | 25.567 | 604 / 36 |
| Negación | clarify | sin acciones | 23.580 | 636 / 31 |
| Dimensiones faltantes | clarify | sin acciones | 29.060 | 631 / 51 |
| DAG PDF→Word | execute | pdf-extract, pdf-to-word | 43.204 | 625 / 148 |
| JSON con instrucción incrustada | execute | json-format | 34.700 | 565 / 94 |
| Cancelación | question | sin acciones | 17.958 | 438 / 20 |
| Especialista de imagen | delegate | sin acciones | 17.626 | 595 / 34 |
| Escaneo sin estructura definida | delegate | sin acciones | 15.461 | 617 / 28 |

**Selección según las aserciones originales: 8/8, 100 %.** Todos necesitaron una inferencia en esa ronda. Tokens de los ocho casos: **4711 de entrada y 442 de salida**. La mediana de latencia fue **24.574 s**, con intervalo **15.461–43.204 s**. Los timings de generación informados fueron **5.942–6.748 tokens/s**. No son mediciones de RAM/CPU.

Este porcentaje mide intención y herramientas permitidas bajo restricciones del catálogo y los controles de Prisma. **No equivale a comprensión general ni a éxito operativo.** La respuesta sobre PDF→Word preguntó por columnas, y la cancelación pidió confirmación: son deficiencias de calidad visibles aunque esas respuestas cumplieran las aserciones mínimas. La selección de imagen acabó en delegación; staging no tenía un proveedor de imagen ejecutable. No se cuenta como una imagen generada ni como un especialista externo ya ejecutado.

Se conservan las regresiones intermedias, sin sustituirlas por la mejor ronda:

| Ronda | Decisiones correctas / 8 | Observación |
| --- | ---: | --- |
| 1 | 0 | Búsquedas repetidas y tres timeouts; parte del consumo no fue observable |
| 2 | 3 | Apareció una propuesta con dimensiones inventadas |
| 3 | 3 | Se bloqueó la ejecución sin datos; aún fallaban intención y referencias |
| 4 | 6 | DAG PDF correcto; JSON necesitó una reparación |
| 5 | 5 | Regresión PDF conservada; recuperación de un fallo parcial de readiness |
| 6 | 6 | PDF recuperado; especialista y objetivo Excel seguían fallando |
| 7 | 8 | Aserciones mínimas aprobadas; composición y calidad aún con límites |

Los contadores históricos de las primeras versiones del runner tienen cobertura incompleta en errores. Se conserva su JSON original. El runner corregido mantiene las inferencias ya completadas, registra consumo observable en rechazos y deja desconocido el resultado de solicitudes sin respuesta. No se estiman tokens perdidos.

## Pruebas operativas y artefactos

### Ejecución neuronal real

[operations-real-1.json](queen-live-2026-11-13/operations-real-1.json) contiene los fallos, no resultados de motores simulados:

- **PDF→extraer página 2→Word: falló la comprobación de contenido.** Queen seleccionó ambos motores, pero el segundo paso consumió `file:0` aunque declaraba dependencia de `s1`. El DOCX incluyó contenido que debía quedar fuera. El verificador del escenario lo detectó; no se declaró éxito.
- **PDF escaneado→imágenes→OCR: timeout de 55 s.** No hubo un plan aceptado ni OCR dirigido por Queen en ese intento. Excel quedó bloqueado por el fallo anterior.
- **Delegación a un proveedor: plan rechazado.** Hubo propuestas `execute` sin pasos; no se ejecutó el especialista. Kilo estaba anunciado como disponible para chat, pero eso no se convierte en una inferencia externa demostrada.
- **Recuperación de parámetros: bloqueada antes de la inyección de fallo**, porque el plan inicial agotó el plazo. La ruta de reparación está implementada y probada con fixtures, pero esta ejecución no demuestra una reparación neuronal real.
- **Archivos nuevos: comprobación real aprobada.** El mismo taskId con otro contenido fue rechazado y una tarea nueva ejecutó la herramienta otra vez. Los hashes de las imágenes resultantes fueron distintos.
- **Composición JSON neuronal de la ronda 7: incompleta.** Omitió la minificación. El harness no ejecutó ni aprobó esa cadena como si estuviera completa.

### Herramientas reales con planes deterministas de control

[operations-deterministic.json](queen-live-2026-11-13/operations-deterministic.json) ejecutó los motores existentes en Chromium y dependencias oficiales, sin respuestas simuladas de los motores:

- PDF digital de tres páginas → extraer la segunda → DOCX: el XML contiene `QUEEN SECOND PAGE 2026` y excluye las otras páginas.
- PDF de una página con una imagen escaneada → `pdf-to-image` → expansión local del ZIP PNG → `image-ocr` → normalización explícita de espacios tras comas → `csv-json` → `json-xlsx`.
- Se abrieron las celdas del Excel y coincidieron exactamente con `producto,cantidad,precio`, `Prisma,2,15`, `Queen,3,20`. El OCR había introducido un espacio; el primer control de contenido lo rechazó y el paso explícito de normalización lo corrigió.
- El verificador general conserva estados parciales para correspondencia arbitraria de OCR/Office; la comprobación de contenido de estos archivos de prueba es evidencia adicional, específica del escenario.

Los [artefactos](queen-live-2026-11-13/artifacts/) y sus hashes están conservados. **Esta cadena determinista valida motores y traspasos, no acredita planificación neuronal de extremo a extremo.** El escaneo sintético tiene texto CSV sencillo; no acredita reconstrucción de tablas complejas, documentos reales heterogéneos ni extracción clínica.

## Correcciones implementadas tras la evidencia

- Clasificar por separado consulta informativa, cancelación y parámetros faltantes; bloquear dimensiones inventadas antes de ejecutar.
- Gramática acotada de estructura, intenciones e IDs del catálogo, con validación estricta posterior de parámetros, compatibilidad y DAG. La reducción de complejidad está preparada; **el perfil A/B de velocidad fue inconcluso**, por lo que no se atribuye una mejora medida a esa variante.
- Rechazar un paso dependiente que consume el PDF original en vez de la salida intermedia; conservar las operaciones conocidas de las cláusulas del pedido.
- Reconocer verbos como «minifícalo» a partir de nombres existentes del catálogo, sin convertir el payload citado en instrucciones.
- Mantener los pedidos compuestos en la ruta neuronal cuando el planificador antiguo solo encontró una conversión final.
- Comparar JSON literal del usuario con los datos propuestos por Queen antes de ejecutar; no verificar únicamente contra un parámetro ya alterado por el modelo.
- Adaptador ZIP→PNG del coordinador con CRC, presupuesto de expansión, nombres y píxeles acotados. No modifica ni inventa herramientas.
- SHA-256 de los archivos de entrada para impedir reutilizar una tarea sobre otros bytes con el mismo nombre/tamaño.
- Separar el presupuesto del operador de staging del límite público del producto. Conservar una sola inferencia simultánea.
- Consultar el slot de llama.cpp antes de inferir en staging y conservar cinco minutos de pausa tras un timeout de inferencia con resultado incierto. No seguir encolando solicitudes por liberar una promesa HTTP.
- Conservar evidencia parcial y los fallos del runner. El perfil pesado no queda expuesto como endpoint de la versión final.

**Las correcciones posteriores a la ronda 7 tienen pruebas locales; su regresión neuronal completa queda condicionada a la recuperación de la generación. No se relabelan los resultados de una versión anterior como si probaran el código posterior.**

## Validación local y límites del VPS

Se conservan las **192 pruebas históricas**, con **210 pruebas Node aprobadas** en total. Build estático y paquete aislado compilados. Los fixtures de tests, los controles deterministas y los mocks del transporte no se incluyen en la cifra de inferencias reales.

No hay acceso SSH a GenixNode en este workspace. RAM, CPU física, swap, OOM, reinicios y causas de la degradación siguen **sin medir**. `/props` y `/slots` respondieron y mostraron un slot y contexto 2048; que un slot aparezca inactivo no demuestra que el servicio de generación esté sano. No se modificó el VPS basándose en esa señal.

Para medir directamente allí, seguir los comandos exactos de [staging/README.md](../neural-pilot/staging/README.md#medición-directa-en-genixnode). El monitor lee `/proc`, estadísticas y estado de Docker, sin claves ni prompts. Iniciarlo antes de la siguiente ronda real. Se necesita acceso operativo al VPS o las muestras de ese monitor para diagnosticar la generación detenida; **no faltan nuevamente los secretos de Queen**.

## Pendientes reales

1. Comprobar/recuperar la generación de llama.cpp desde GenixNode con mediciones de host y contenedor; la causa sigue abierta.
2. Repetir los ocho casos con el código final, además de la comprobación de calidad de las respuestas, sin confundir la tasa de aserciones mínimas con precisión universal.
3. Repetir PDF→Word y verificar el contenido después de la corrección de entradas intermedias.
4. Completar con planes auténticos la cadena escaneo→OCR→Excel, la composición JSON, la reparación de parámetros y una delegación externa.
5. Medir TTFT de SSE, concurrencia y estabilidad física cuando la generación esté operativa. No aumentar contexto ni concurrencia mientras falten esas mediciones.

El PR permanece como borrador. Ninguno de estos resultados autoriza fusionar, publicar en el proyecto principal o cambiar su enrutamiento.

## Cierre y continuidad

El usuario pidió guardar y continuar desde otra cuenta. La última prueba tras la pausa volvió a agotar 55 s con ocho tokens: [final-truncation.json](queen-live-2026-11-13/final-truncation.json). El control real de contexto rechazó 2503 tokens antes de completions; los controles finales de conexión y timeout de metadata pasaron. No se iniciaron más inferencias tras la solicitud de cierre.

Estado técnico completo, recursos, permisos, secreto local de operador, commits y siguiente paso: [QUEEN-CONTINUITY.md](QUEEN-CONTINUITY.md). El remoto main avanzó por trabajo externo de `42dade...` a `4b24fe6...`; esta sesión no escribió main ni desplegó el proyecto principal.
