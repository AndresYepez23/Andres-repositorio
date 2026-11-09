# Prisma Core — agente centralizado y arquitectura de herramientas

**Objetivo permanente:** Prisma Core es el agente conversacional central de Prisma Space. Debe reconocer, comparar, combinar y ejecutar las capacidades registradas sin obligar al usuario a memorizar nombres de herramientas ni gastar inferencia para tareas mecánicas.

## Principios

1. **Catálogo vivo:** consultar el registro real de herramientas, no una lista manual limitada. En noviembre de 2026 contiene **140 entradas**, de las cuales **138 tienen estado ready/beta**. Las otras dos están previstas, no son ejecutables. Si el catálogo cambia, no fijar esos números.
2. **Comprender el resultado final:** entender primero qué quiere obtener el usuario (archivo, transformación, resumen, respuesta, exportación). Puede elegir una herramienta o varias; descubrir sus alternativas, relaciones, requisitos y formatos.
3. **Coste mínimo razonable:** resolver sin inferencia tareas deterministas (texto, datos, documentos, imagen, audio, video, QR, metadatos) cuando la intención y los parámetros son inequívocos. Usar el planificador multimodelo solo cuando aporte comprensión o planificación; preferir modelos rápidos para planes simples.
4. **Flujos seguros:** verificar compatibilidad de archivos y tipos de resultado entre pasos. No pasar ZIP como PDF ni asumir que OCR/transcripción produce automáticamente audio, imagen o un documento. No inventar datos faltantes ni anunciar éxito sin resultado material.
5. **Autonomía proporcionada:** realizar pasos implícitos compatibles cuando sean necesarios para lograr el objetivo. Pedir aclaración únicamente si falta un parámetro esencial, existen interpretaciones peligrosamente distintas o una operación sensible requiere consentimiento.
6. **Proveedores opcionales:** Groq, Gemini, OpenRouter, Cloudflare, Hugging Face y Pollinations complementan la ejecución; sus cuotas y los cinco espacios de claves externas no crean capacidad infinita. Respetar permisos, presupuestos y límites de la organización.
7. **Privacidad y rendimiento:** preferir trabajo local cuando corresponda; advertir si el plan usa API. No descargar modelos grandes sin una acción deliberada del visitante. No enviar archivos a modelos salvo cuando se requiera y se autorice.
8. **Claridad:** mostrar qué se hizo, con qué herramienta, qué resultado se creó, y entregar el archivo cuando exista. Explicar límites reales sin culpar al usuario.

## Implementación actual

- `src/registry.js`: fuente de verdad de herramientas, categorías, estados y modos.
- `src/core-tool-intelligence.js`: indexación global, sinónimos españoles, alternativas relacionadas y tareas locales conservadoras.
- `src/smart-flows.js`: combinaciones deterministas para imagen, documentos, audio, video y CSV.
- `src/file-conversions.js`: conversiones explícitas con formatos comprobados.
- `src/core.js`: historial, orquestación de herramientas, planificador económico, compatibilidad de pasos, transferencias de texto y archivos y interfaz del chat.
- `src/engines.js`: implementación real de cada herramienta y proveedores de IA.
- `tests/core-agent-routing.test.mjs`: pruebas de índice, reconocimiento de intenciones y tipos de archivos; deben ejecutarse en cada compilación.

## Lo que todavía requiere mejoras y pruebas reales

- No equivale a ejecutar **las 138 herramientas automáticamente y sin IA**: algunas requieren API, otras necesitan parámetros, otras descargan bibliotecas o modelos al solicitarse.
- Ampliar gradualmente los contratos de entrada/salida de las herramientas, no solo sus nombres y etiquetas, para que las rutas complejas se planifiquen sin incompatibilidades.
- Permitir flujos ramificados para aplicar la misma transformación a múltiples adjuntos y combinar resultados, sin destruir originales.
- Añadir telemetría de aciertos, errores y coste por clase de herramienta sin registrar contenido de los usuarios.
- Comprobar ejecución con archivos reales y en PWA iOS, Android y navegadores de escritorio, no únicamente pruebas sintácticas.
- Mantener disponible el planificador multimodelo y el ranking semántico local opcional, pero no convertir una operación gratuita en una llamada obligatoria a un modelo.

**Meta de producto:** Prisma Core debe actuar como un agente que entiende el trabajo completo y usa el mejor conjunto de herramientas, con el menor consumo que mantenga resultados correctos, verificables y seguros.
