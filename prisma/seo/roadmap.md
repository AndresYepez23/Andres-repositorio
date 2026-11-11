# Prisma Space — checklist maestro SEO

Última actualización: 2026-11-10  
Dominio canónico: https://prismaspace.space/

## Reglas para no repetir páginas

- [x] Cada landing tiene un slug único.
- [x] Cada landing enlaza con una herramienta existente en `src/registry.js`.
- [x] La segunda tanda no reutiliza los IDs de herramienta de la primera.
- [x] Las herramientas `soon` / en preparación quedan excluidas.
- [x] Las funciones beta se identifican como beta y explican sus límites.
- [ ] Antes de cada tanda nueva, comparar slugs e IDs contra las 40 páginas existentes.

## Tanda 1 — primeras 20 páginas

- [x] PDF a Word — `pdf-to-word` — `/herramientas/pdf-a-word/`
- [x] Word a PDF — `docx-pdf` — `/herramientas/word-a-pdf/`
- [x] Unir PDF — `pdf-merge` — `/herramientas/unir-pdf/`
- [x] Dividir PDF — `pdf-split` — `/herramientas/dividir-pdf/`
- [x] Comprimir PDF — `pdf-compress` — `/herramientas/comprimir-pdf/`
- [x] JPG a PDF — `image-pdf` — `/herramientas/jpg-a-pdf/`
- [x] PNG a PDF — `image-pdf` — `/herramientas/png-a-pdf/`
- [x] PDF a JPG — `pdf-to-image` — `/herramientas/pdf-a-jpg/`
- [x] Extraer texto de PDF — `pdf-text` — `/herramientas/extraer-texto-pdf/`
- [x] Extraer páginas PDF — `pdf-extract` — `/herramientas/extraer-paginas-pdf/`
- [x] Eliminar páginas PDF — `pdf-remove-pages` — `/herramientas/eliminar-paginas-pdf/`
- [x] Rotar PDF — `pdf-rotate` — `/herramientas/rotar-pdf/`
- [x] Numerar páginas PDF — `pdf-page-numbers` — `/herramientas/numerar-paginas-pdf/`
- [x] Comprimir imagen — `image-compress` — `/herramientas/comprimir-imagen/`
- [x] Redimensionar imagen — `image-resize` — `/herramientas/redimensionar-imagen/`
- [x] PNG a JPG — `image-convert` — `/herramientas/png-a-jpg/`
- [x] Quitar fondo de imagen — `image-bg` — `/herramientas/quitar-fondo-imagen/`
- [x] Contador de palabras — `word-count` — `/herramientas/contador-de-palabras/`
- [x] Generador de contraseñas — `password` — `/herramientas/generador-de-contrasenas/`
- [x] Generador de códigos QR — `qr` — `/herramientas/generador-de-codigos-qr/`

## Tanda 2 — nuevas 20 páginas

- [x] Imagen a texto (OCR) — `image-ocr` — `/herramientas/imagen-a-texto/`
- [x] Marca de agua en PDF — `pdf-watermark` — `/herramientas/marca-de-agua-pdf/`
- [x] Generador de citas APA 7 / Vancouver / MLA — `citation-generator` — `/herramientas/generador-citas-apa-vancouver/`
- [x] Recortar imagen — `image-crop` — `/herramientas/recortar-imagen/`
- [x] Marca de agua en imagen — `image-watermark` — `/herramientas/marca-de-agua-imagen/`
- [x] Collage de fotos — `image-collage` — `/herramientas/collage-de-fotos/`
- [x] Comprimir vídeo — `video-compress` — `/herramientas/comprimir-video/`
- [x] Vídeo a GIF — `video-gif` — `/herramientas/video-a-gif/`
- [x] Extraer audio de vídeo — `video-audio` — `/herramientas/extraer-audio-de-video/`
- [x] Recortar vídeo — `video-trim` — `/herramientas/recortar-video/`
- [x] Quitar audio de vídeo — `video-mute` — `/herramientas/quitar-audio-video/`
- [x] Cambiar velocidad de vídeo — `video-speed` — `/herramientas/cambiar-velocidad-video/`
- [x] Cambiar resolución de vídeo — `video-resize` — `/herramientas/cambiar-resolucion-video/`
- [x] Girar vídeo — `video-rotate` — `/herramientas/girar-video/`
- [x] Extraer fotograma / miniatura — `video-thumbnail` — `/herramientas/extraer-miniatura-video/`
- [x] Convertir audio a MP3 / WAV / OGG — `audio-convert` — `/herramientas/convertir-audio-mp3-wav-ogg/`
- [x] Normalizar volumen de audio — `audio-normalize` — `/herramientas/normalizar-volumen-audio/`
- [x] Texto a voz con IA — `ai-voice` — `/herramientas/texto-a-voz-ia/`
- [x] Transcribir audio con IA — `ai-transcribe` — `/herramientas/transcribir-audio-ia/`
- [x] Crear subtítulos SRT desde texto — `subtitle-srt-local` — `/herramientas/crear-subtitulos-srt/`

## Control de calidad por landing

- [x] Título SEO propio y alineado con la búsqueda.
- [x] Descripción meta única.
- [x] Un H1 y contenido explicativo original.
- [x] Tres pasos de uso y dos preguntas frecuentes.
- [x] URL canónica, Open Graph y datos estructurados.
- [x] CTA abre la herramienta real de Prisma.
- [x] Enlace interno desde el directorio y páginas relacionadas.
- [x] Inclusión en sitemap.xml y robots.txt.
- [x] Diseño responsive con identidad Aurora.
- [x] Pruebas automáticas de slug, herramienta, HTML y sitemap.
- [ ] Revisar visualmente móvil y escritorio antes de fusionar.
- [ ] Fusionar la segunda tanda y confirmar despliegue de producción.
- [ ] Enviar sitemap actualizado a Google Search Console.
- [ ] Medir indexación, impresiones y clics por URL.

## Nota de precisión

La primera tanda contiene dos páginas (JPG a PDF y PNG a PDF) que usan el mismo motor `image-pdf`, pero responden a búsquedas distintas. La segunda tanda no repite ningún ID de herramienta de la primera. Los contenidos indican expresamente los límites de las funciones beta, de OCR, de subtítulos estimados y de los servicios de IA sujetos a cuotas.

## Expansión por capacidades — 10 de noviembre de 2026

Este apartado sustituye la antigua restricción de comparar IDs como si cada herramienta solo pudiera tener una página. Se comparan intenciones, slugs, títulos, H1 y descripciones; se permiten varias operaciones de un motor cuando el enlace admite su formato y la intención es distinta.

- [x] Auditoría de las 150 entradas: `audit.json` contiene cada decisión, incluso las exclusiones.
- [x] Conservar las 40 páginas anteriores: snapshot inmutable en `baseline.json`.
- [x] Crear 100 páginas justificadas: 140 páginas individuales, 132 herramientas cubiertas.
- [x] Eliminar límites rígidos; pruebas de catálogos de 1, 50, 70, 100 y 200 páginas.
- [x] Directorio y categorías derivados del catálogo publicado.
- [x] Canónicas, sitemap y robots derivados de `SEO_BASE` en `config.mjs`, ya en prismaspace.space.
- [x] Enlaces relacionados circulares por familia; todas las landings reciben enlaces contextuales.
- [x] Admitir únicamente presets `format` ya soportados por main.js; no modificar la aplicación.
- [x] Verificar estructura HTML con analizador HTML5 y sitemap con analizador XML.
- [x] Validar campos de apertura para todas las nuevas herramientas, y 29 operaciones locales mediante su ejecutor real.
- [x] Ejecutar pruebas existentes de Core, Whisper y diseño junto a las nuevas de SEO.
- [x] Revisión visual local y 564 comprobaciones adaptables sin desbordamientos.
- [ ] Confirmar preview Cloudflare antes de fusionar.
- [ ] Confirmar despliegue de producción del commit fusionado.

El [informe completo](expansion-report.md) incluye las 100 nuevas URLs, operaciones múltiples, 18 entradas descartadas/consolidadas y checklist del dominio definitivo. No se promocionan como nuevas páginas los fallos detectados; su reparación queda fuera de esta misión SEO.

### Validación y mantenimiento

Desde la raíz: `node prisma/build.mjs` y `node --test prisma/tests/*.test.mjs`.
El build de Pages ejecuta las validaciones SEO y de capacidades, además de las comprobaciones existentes. La comparación de formatos de URL detecta si cambia la lista admitida por main.js. `baseline.json` no se amplía al añadir páginas: protege las 40 originales, no impone el tamaño futuro del catálogo.

Las comprobaciones no consumen cuotas de IA ni certifican disponibilidad permanente de proveedores externos. Las funciones conectadas se publican con sus condiciones y límites; no se promete funcionamiento ilimitado ni garantía de indexación.


## Expansión de intención de búsqueda — 11 de noviembre de 2026

- [x] Crear 10 páginas de categoría con listados derivados del catálogo SEO aprobado.
- [x] Crear 11 recorridos de solución basados en herramientas existentes.
- [x] Crear 14 guías prácticas con pasos, advertencias, FAQ y CTA hacia operaciones reales.
- [x] Crear índices `/categorias/`, `/soluciones/` y `/guias/`.
- [x] Añadir enlaces contextuales desde las 140 landings de herramientas y desde el directorio.
- [x] Añadir enlaces de descubrimiento en el pie de página de la aplicación principal.
- [x] Mantener excluidas funciones `soon` y herramientas no aprobadas en `audit.json`.
- [x] Generar sitemap con 181 URLs únicas sobre `https://prismaspace.space/`.
- [x] Documentar hipótesis de consultas e intención en `keyword-map.md`, sin inventar volúmenes.
- [x] Añadir pruebas para canónicas, metadatos, JSON-LD, enlaces internos y cobertura del sitemap.
- [x] Build y pruebas SEO aprobadas en Cloudflare Pages Preview (`seo-organic-growth-expansion`).
- [ ] Fusionar a `main` y verificar producción.
- [ ] Volver a enviar `https://prismaspace.space/sitemap.xml` en Search Console después del despliegue.
- [ ] Revisar consultas, impresiones, CTR e indexación tras 28–45 días de datos.

### Criterio de medición

Las consultas del mapa son hipótesis cualitativas, no estimaciones de volumen. Search Console será la fuente para decidir qué páginas ampliar, reescribir o consolidar. No se crearán páginas por ciudad, sinónimos o formatos si no existe una intención diferenciada y una herramienta real que la resuelva.
