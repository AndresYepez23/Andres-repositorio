# Prisma Core — verificación de artefactos y continuidad de Work
Fecha: 2026-11-11

## Propósito
Esta intervención está aislada del trabajo semántico local de Work (rama `core/semantic-contract`, commit local `3b81cad`). Solo añade comprobaciones ligeras de **resultados reales** en el ejecutor de Prisma Core: cabeceras binarias, coherencia entre extensión/MIME y formato exigido por la herramienta, y sintaxis JSON para salidas de tamaño limitado. No modifica reglas de selección semántica ni memoria conversacional.

## Archivos intervenidos
- `src/core-artifact-contracts.js` (nuevo)
- `src/core-execution.js` (integración después de ejecutar una herramienta, antes de aceptar sus resultados)
- `tests/core-artifact-contracts.test.mjs` (nuevo)
- `tests/core-intelligence-benchmark.test.mjs` (únicamente corrige un PNG sintético falso que antes era aceptado)

## Contrato de verificación
- Rechazar PDF que contiene ZIP, un DOCX falso en lugar de PDF y PNG nombrado WEBP o viceversa.
- Comprobar firma de PDF, PNG/JPEG/GIF/WEBP, ZIP/DOCX/XLSX/PPTX y WAV.
- Para JSON de hasta 2 MiB, parsear sintaxis real.
- Mantener las validaciones anteriores, como dimensiones decodificadas.
- Dejar explícito que `signature-validated` **no prueba** estructura interna, páginas, OCR, semántica ni integridad completa del archivo. Para certificar un resultado sigue siendo necesaria inspección más profunda.

## Continuación segura de Work el viernes
1. **NO** reiniciar la auditoría ni volver a hacer las correcciones ya fusionadas en PR #74 y #75.
2. **NO** borrar ni resetear la rama local `core/semantic-contract`. Conservar y respaldar su commit `3b81cad` y cualquier archivo sin guardar antes de integrar novedades de remoto.
3. Revisar `git status` y proteger trabajo local, después hacer `git fetch origin`. Reconciliar cuidadosamente la rama local con la última `origin/main`; resolver conflictos, si existen, sin sobrescribir la capa semántica. No hacer `git reset --hard` ni `push --force`.
4. Continuar las pruebas **con respuestas reales de modelos**, memoria y contexto sobre la arquitectura semántica que Work creó. El módulo nuevo de firmas es ortogonal y debería reutilizarse, no reimplementarse.
5. Conservar la matriz histórica de **388** registros en `docs/core-matrix-388.csv`. Añadir las evidencias de regresión de este cambio mediante los tests en una nueva ronda; no contarlas como E2E hasta verificar archivos reales en navegador/Developer.
6. Prioridad 90 % Prisma Space / 10 % Developer. Sincronizar solo cuando las pruebas del plugin lo necesiten.

## Límites pendientes
Las firmas detectan errores de formato y anuncios falsos de éxito, pero no confirman páginas específicas, estructura DOCX/ZIP, recorte exacto de imágenes o duración multimedia. Son tareas para la verificación profunda posterior.

## Mejora adicional de Prisma Mini, sin tocar Work
La ronda posterior optimiza `src/local-brain.js`: mantiene en memoria los embeddings de descripciones del catálogo y solo calcula el vector del mensaje nuevo, evitando recomputar la misma lista de herramientas en cada turno. Los prompts y adjuntos del usuario no se almacenan en esa caché. Incluye `tests/local-brain-cache.test.mjs`. Es independiente de la rama local `core/semantic-contract` y no cambia los proveedores ni el planificador semántico central.

Esto **no** garantiza comprensión general: Work debe continuar integrando y probando su contrato semántico con modelos reales. No duplicar el optimizador de Prisma Mini.
