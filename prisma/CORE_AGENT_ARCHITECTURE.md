# Prisma Core — agente centralizado y arquitectura de herramientas

> Los principios permanecen; cifras de herramientas/proveedores son snapshots históricos. Consultar registry/estado real sin certificar todo el catálogo. [Continuidad vigente](docs/QUEEN-HANDOFF.md).

**Objetivo permanente:** Prisma Core es el agente conversacional central de Prisma Space. Debe reconocer, comparar, combinar y ejecutar las capacidades registradas sin obligar al usuario a memorizar nombres de herramientas ni gastar inferencia para tareas mecánicas.

## Principios

1. **Catálogo vivo:** consultar el registro real de herramientas, no una lista manual limitada. En noviembre de 2026 contiene **140 entradas**, de las cuales **138 tienen estado ready/beta**. Las otras dos están previstas, no son ejecutables. Si el catálogo cambia, no fijar esos números.
2. **Comprender el resultado final:** entender primero qué quiere obtener el usuario (archivo, transformación, resumen, respuesta, exportación). Puede elegir una herramienta o varias; descubrir sus alternativas, relaciones, requisitos y formatos.
3. **Coste mínimo razonable:** resolver sin inferencia tareas deterministas (texto, datos, documentos, imagen, audio, video, QR, metadatos) cuando la intención y los parámetros son inequívocos. Usar el planificador multimodelo solo cuando aporte comprensión o planificación; preferir modelos rápidos para planes simples.
4. **Flujos seguros:** verificar compatibilidad de archivos y tipos de resultado entre pasos. No pasar ZIP como PDF ni asumir que OCR/transcripción produce automáticamente audio, imagen o un documento. No inventar datos faltantes ni anunciar éxito sin resultado material.
5. **Autonomía proporcionada:** realizar pasos implícitos compatibles cuando sean necesarios para lograr el objetivo. Pedir aclaración únicamente si falta un parámetro esencial, existen interpretaciones peligrosamente distintas o una operación sensible requiere consentimiento.
6. **Proveedores coordinados:** Gemini (6 credenciales), Groq (5), OpenRouter (6), Hugging Face (6) y Pollinations (6) están configurados como 29 secretos de producción; Cloudflare Workers AI usa su binding nativo y no consume un slot de API key. Las credenciales son respaldos del mismo proveedor, no modelos ni cuotas adicionales. Respetar permisos, presupuestos y límites del proveedor.
7. **Privacidad y rendimiento:** preferir trabajo local cuando corresponda; advertir si el plan usa API. No descargar modelos grandes sin una acción deliberada del visitante. No enviar archivos a modelos salvo cuando se requiera y se autorice.
8. **Claridad:** mostrar qué se hizo, con qué herramienta, qué resultado se creó, y entregar el archivo cuando exista. Explicar límites reales sin culpar al usuario.

## Enrutamiento multimodelo y credenciales

- **Primero local:** las herramientas deterministas y los flujos compatibles se resuelven en el navegador antes de invocar un modelo.
- **Una inferencia en el camino normal:** Core elige un proveedor/modelo por tarea; no lanza los seis proveedores en paralelo. Solo cambia a otro motor después de un fallo real.
- **Especialización:** planificación y tareas rápidas priorizan modelos compactos; programación prioriza Qwen/Coder cuando está disponible; razonamiento usa modelos de mayor capacidad; resúmenes prefieren motores rápidos.
- **Memoria de ruta:** la sesión conserva resultados agregados por proveedor y tarea (éxito, latencia y enfriamiento), nunca prompts ni archivos. Los proveedores temporalmente lentos o fallidos bajan de prioridad.
- **OpenRouter:** permanece como reserva independiente al final de la ruta automática.
- **Pool de claves:** se prueba como máximo una clave alternativa por solicitud ante errores específicos de autenticación o fallos transitorios de red/servidor. Un HTTP 402 o 429 pausa el proveedor completo; no se cambia de cuenta para eludir cuotas o saldo.
- **Límites:** los contadores D1 siguen siendo por proveedor y visitante. Añadir credenciales no multiplica los límites de uso.
- **Estado visible:** el endpoint de conexiones devuelve cantidades de slots y pausas temporales, nunca valores secretos.

## Implementación actual

- `src/registry.js`: fuente de verdad de herramientas, categorías, estados y modos.
- `src/core-tool-intelligence.js`: indexación global, sinónimos españoles, alternativas relacionadas y tareas locales conservadoras.
- `src/smart-flows.js`: combinaciones deterministas para imagen, documentos, audio, video y CSV.
- `src/file-conversions.js`: conversiones explícitas con formatos comprobados.
- `src/core.js`: historial, orquestación de herramientas, planificador económico, compatibilidad de pasos, transferencias de texto y archivos y interfaz del chat.
- `src/engines.js`: implementación real de cada herramienta y proveedores de IA.
- `src/provider-routing.js`: política de selección por tarea y nivel de razonamiento, especialización de modelos y ranking adaptativo según disponibilidad, fallos recientes y latencia.
- `tests/core-agent-routing.test.mjs`: pruebas de índice, reconocimiento de intenciones, compatibilidad de archivos, selección de modelos y failover seguro de credenciales; deben ejecutarse en cada compilación.

## Lo que todavía requiere mejoras y pruebas reales

- No equivale a ejecutar **las 138 herramientas automáticamente y sin IA**: algunas requieren API, otras necesitan parámetros, otras descargan bibliotecas o modelos al solicitarse.
- Ampliar gradualmente los contratos de entrada/salida de las herramientas, no solo sus nombres y etiquetas, para que las rutas complejas se planifiquen sin incompatibilidades.
- Permitir flujos ramificados para aplicar la misma transformación a múltiples adjuntos y combinar resultados, sin destruir originales.
- Añadir telemetría de aciertos, errores y coste por clase de herramienta sin registrar contenido de los usuarios.
- Comprobar ejecución con archivos reales y en PWA iOS, Android y navegadores de escritorio, no únicamente pruebas sintácticas.
- Mantener disponible el planificador multimodelo y el ranking semántico local opcional, pero no convertir una operación gratuita en una llamada obligatoria a un modelo.

**Meta de producto:** Prisma Core debe actuar como un agente que entiende el trabajo completo y usa el mejor conjunto de herramientas, con el menor consumo que mantenga resultados correctos, verificables y seguros.


## Core 4: contexto adaptativo, respaldos y uso verificable (noviembre de 2026)

- Para preguntas breves e independientes, Core envía un historial acotado; para correcciones de letras, código y borradores previos, conserva un tramo más largo del resultado anterior. El historial sigue aislado por conversación y navegador.
- La lista de los 11 proveedores y el catálogo de herramientas no se reenvían en cada conversación normal: solo se incluyen al preguntar específicamente por capacidades de Prisma.
- El modo automático prueba **un solo modelo en condiciones normales**. Tras fallos auténticos, utiliza un máximo de cinco proveedores primarios por defecto, o seis en razonamiento y código, y conserva OpenRouter al final cuando esté disponible. Los cupos de cada proveedor, los límites globales y la duración máxima siguen aplicándose.
- La selección manual respeta el proveedor elegido. Solo se habilitan respaldos de otros proveedores cuando el usuario permite explícitamente `allowFallback`.
- No se retransmiten solicitudes claramente inválidas a múltiples proveedores. Los fallos de cuota de un proveedor sí pueden ir a otro autorizado dentro del presupuesto general.
- Las claves personales de Pollinations Connect **no se consumen en el chat automático de Core**. Su uso permanece deliberado en los flujos que permitan elegir Pollinations como motor personal.
- El Laboratorio IA presenta, además de los presupuestos globales de Cloudflare, un contador en la sesión actual del navegador. Solo se almacenan cantidades de respuestas y tokens realmente informados por los proveedores. **No se guardan prompts, archivos, respuestas ni credenciales** en esa métrica. Tokens no equivalen a dólares facturados.
- Un balance económico real entre proveedores requerirá tarifas verificadas, coste por modalidad/modelo y datos agregados del backend; esta versión no simula esos precios ni afirma optimización de dinero en todos los proveedores.
- Pruebas automáticas: `node --test prisma/tests/core-agent-routing.test.mjs`. Antes de certificar, comprobar inferencias reales y móvil sin gastar cuotas o saldo no autorizados.
