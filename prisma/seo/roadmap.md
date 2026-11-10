# Prisma Space — checklist maestro SEO

Última actualización: 2026-11-10  
Dominio canónico: https://prismaspace.pages.dev/

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
