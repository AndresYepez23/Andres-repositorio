# Auditoría de expansión SEO de Prisma Space

Fecha: 10 de noviembre de 2026. Base auditada: 4aa7261.

40 páginas anteriores + 100 nuevas = 140 páginas individuales. 132 de 150 entradas del catálogo tienen cobertura. El directorio es adicional y agrupa automáticamente las categorías, sin crear páginas de categoría vacías.

## Alcance y criterio editorial

Se revisaron registry.js, buildFields y el manejador de enlaces de main.js, runTool y motores de engines.js, file-conversions.js, advanced-text-tools.js, local-creator-tools.js, las 40 fichas anteriores, generador, CSS, checklist, build y pruebas. La existencia de un nombre en el catálogo no se consideró suficiente para publicar.

No se inventaron volúmenes ni previsiones de tráfico. La priorización responde a una hipótesis cualitativa de utilidad: conversiones, tareas con un resultado concreto y utilidades con intención identificable. No se dispone de Search Console ni de una base de volumen de palabras clave en esta auditoría.

Referencias metodológicas consultadas: [contenido útil](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [políticas de contenido escalado](https://developers.google.com/search/docs/essentials/spam-policies), [URLs canónicas](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) y [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). Publicar una URL no garantiza indexación ni posicionamiento.

## Operaciones múltiples y formatos

- Imágenes: JPG → PNG/WebP, PNG → WebP, WebP → JPG/PNG se abren con formato preseleccionado mediante el parámetro format que main.js admite. PNG → JPG ya existía y se conserva. No se promete conversión de animaciones ni HEIC universal.
- PDF: se añade PDF → PNG con preset real y WebP → PDF con entrada admitida. JPG/PNG → PDF y PDF → JPG ya existían. Se agregan inspección de campos, aplanado, páginas en blanco y metadatos.
- Documentos: Word → HTML tiene motor dedicado. TXT/Markdown/HTML/DOCX → PDF/DOCX/TXT/HTML se agrupan en una guía de conversión; el usuario elige el destino en el formulario. No se fabrican parámetros output ni landings por cada combinación sin apertura preconfigurada. Markdown se exporta como texto literal y los PDF usan fuentes básicas.
- Tablas: se cubren CSV → JSON, JSON → CSV, Excel → JSON y JSON → XLSX con sus herramientas dedicadas. La conversión por archivo incluye CSV → XLSX y Excel → CSV. Todas las hojas solo se anuncian para JSON. Se excluye XLS → XLSX porque el motor lo rechaza como mismo tipo.
- Vídeo: las nueve operaciones accesibles ya tenían página. No se multiplican URLs por contenedor; no existe conversor general de vídeo dedicado. MP4 → MP3 requiere encadenar extracción y conversión, sin CTA dedicado con preset.
- Audio: conversión MP3/WAV/OGG y normalización ya están cubiertas. Se añaden recorte corto a WAV y onda estática PNG. No se promete edición multipista, reducción de ruido ni música renderizada.
- Texto y desarrollo: encode/decode, mayúsculas/minúsculas, porcentajes y familias de unidades se documentan dentro de la misma intención, con selección manual real. No se crean variaciones por cada valor, ciudad, tono o proveedor.
- IA: las páginas explican uso conectado, cuotas y revisión humana. Kit YouTube, tutor y composición de letras entregan texto; no prometen publicar, verificar fuentes ni generar audio o vídeo.

## Funciones descartadas o consolidadas

| Entrada | Decisión |
|---|---|
| pdf-protect | En preparación: no se ofrece cifrado PDF implementado. |
| video-transcribe | En preparación; la intención de transcripción ya está cubierta por ai-transcribe. |
| json-format | El motor pasa la indentación como segundo argumento de JSON.stringify en lugar del tercero. Valida, pero no realiza el formateado anunciado; no se cambia el motor en esta misión. |
| text-diff | La expresión de separación de líneas está sobreescapada: una entrada multilínea normal se trata como un bloque. No se promociona comparación por líneas hasta corregirla. |
| ai-webpage | Existe el generador HTML, pero buildFields no ofrece el campo prompt para su apertura directa. No se modifica la interfaz para habilitarlo. |
| json-schema | Intención duplicada de json-schema-validate; se utiliza esa ruta con campos y ejemplos válidos. |
| image-social-kit | runTool despacha image-* a imageTool antes de llegar a socialImageKit. La apertura directa no ejecuta el ZIP de cuatro formatos anunciado. |
| flashcards-export | Separación de líneas sobreescapada en el motor: varias tarjetas pegadas pueden convertirse en una sola. Se difiere la landing hasta reparar el flujo. |
| text-summary-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| reading-time-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| text-analyzer-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| csv-to-tsv-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| tsv-to-csv-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| json-to-xml-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| xml-to-json-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| html-to-markdown-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |
| contrast-check-local | Duplicado de contraste; además no tiene campos en buildFields. Se cubre con contrast. |
| text-dedupe-words-local | Motor presente, pero apertura directa sin campos en buildFields para introducir el texto requerido. No se anuncia una operación que el CTA no permite completar. |

## Nuevas páginas y funciones cubiertas

| Página / URL | Herramienta |
|---|---|
| [Inspeccionar campos de un formulario PDF](https://prismaspace.pages.dev/herramientas/inspeccionar-campos-pdf/) | pdf-form-fields |
| [Aplanar un formulario PDF](https://prismaspace.pages.dev/herramientas/aplanar-formulario-pdf/) | pdf-form-flatten |
| [Insertar páginas en blanco en PDF](https://prismaspace.pages.dev/herramientas/insertar-paginas-blanco-pdf/) | pdf-add-blank |
| [Convertir Word a HTML](https://prismaspace.pages.dev/herramientas/word-a-html/) | docx-html |
| [Codificar y decodificar Base64](https://prismaspace.pages.dev/herramientas/codificar-decodificar-base64/) | base64 |
| [Conversor de monedas de referencia](https://prismaspace.pages.dev/herramientas/conversor-monedas/) | currency |
| [Conversor de unidades de medida](https://prismaspace.pages.dev/herramientas/conversor-unidades/) | units |
| [Convertir timestamp Unix a fecha](https://prismaspace.pages.dev/herramientas/convertir-timestamp-unix/) | timestamp |
| [Codificar y decodificar componentes URL](https://prismaspace.pages.dev/herramientas/codificar-decodificar-url/) | url-code |
| [Quitar tildes y diacríticos de un texto](https://prismaspace.pages.dev/herramientas/quitar-tildes-texto/) | text-remove-accents |
| [Invertir texto o el orden de sus líneas](https://prismaspace.pages.dev/herramientas/invertir-texto/) | text-reverse |
| [Extraer correos electrónicos de un texto](https://prismaspace.pages.dev/herramientas/extraer-correos-texto/) | text-extract-emails |
| [Extraer enlaces de un texto](https://prismaspace.pages.dev/herramientas/extraer-enlaces-texto/) | text-extract-urls |
| [Minificar JSON](https://prismaspace.pages.dev/herramientas/minificar-json/) | json-minify |
| [Convertir HTML a texto](https://prismaspace.pages.dev/herramientas/html-a-texto/) | html-to-text |
| [Eliminar líneas vacías de un texto](https://prismaspace.pages.dev/herramientas/eliminar-lineas-vacias/) | text-remove-empty-lines |
| [Añadir prefijo y sufijo a cada línea](https://prismaspace.pages.dev/herramientas/anadir-prefijo-sufijo-lineas/) | text-prefix-lines |
| [Buscar y reemplazar texto online](https://prismaspace.pages.dev/herramientas/buscar-reemplazar-texto/) | text-replace |
| [Extraer hashtags de un texto](https://prismaspace.pages.dev/herramientas/extraer-hashtags/) | text-extract-hashtags |
| [Extraer posibles teléfonos de un texto](https://prismaspace.pages.dev/herramientas/extraer-telefonos-texto/) | text-extract-phones |
| [Aplanar JSON en rutas y valores](https://prismaspace.pages.dev/herramientas/aplanar-json/) | json-flatten |
| [Convertir mayúsculas y minúsculas](https://prismaspace.pages.dev/herramientas/convertir-mayusculas-minusculas/) | text-case |
| [Convertir Markdown básico a HTML](https://prismaspace.pages.dev/herramientas/markdown-a-html/) | markdown |
| [Generador de paletas de colores](https://prismaspace.pages.dev/herramientas/generador-paletas-colores/) | color-palette |
| [Generar imágenes con inteligencia artificial](https://prismaspace.pages.dev/herramientas/generador-imagenes-ia/) | image-gen |
| [Reconocer objetos en una imagen](https://prismaspace.pages.dev/herramientas/reconocer-objetos-imagen/) | image-identify-local |
| [Extraer la paleta de colores de una imagen](https://prismaspace.pages.dev/herramientas/extraer-paleta-imagen/) | image-palette |
| [Voltear una imagen horizontal o verticalmente](https://prismaspace.pages.dev/herramientas/voltear-imagen/) | image-flip |
| [Generar iconos PNG para web y PWA](https://prismaspace.pages.dev/herramientas/generador-iconos-web/) | image-favicon |
| [Recortar audio y descargar WAV](https://prismaspace.pages.dev/herramientas/recortar-audio/) | audio-trim |
| [Convertir TXT, Markdown y HTML a PDF o Word](https://prismaspace.pages.dev/herramientas/convertir-documentos-texto/) | text-file-convert |
| [Convertir archivos CSV, Excel y JSON](https://prismaspace.pages.dev/herramientas/convertir-archivos-csv-excel-json/) | table-file-convert |
| [Auditar columnas y duplicados de un CSV](https://prismaspace.pages.dev/herramientas/auditar-archivo-csv/) | csv-profile-local |
| [Validar JSON con JSON Schema](https://prismaspace.pages.dev/herramientas/validar-json-schema/) | json-schema-validate |
| [Convertir CSV a JSON](https://prismaspace.pages.dev/herramientas/csv-a-json/) | csv-json |
| [Convertir JSON a CSV](https://prismaspace.pages.dev/herramientas/json-a-csv/) | json-csv |
| [Generador de slugs para URL](https://prismaspace.pages.dev/herramientas/generador-slugs/) | slug |
| [Eliminar líneas duplicadas](https://prismaspace.pages.dev/herramientas/eliminar-lineas-duplicadas/) | dedupe-lines |
| [Limpiar espacios y saltos de línea](https://prismaspace.pages.dev/herramientas/limpiar-espacios-texto/) | clean-text |
| [Codificar y decodificar entidades HTML](https://prismaspace.pages.dev/herramientas/codificar-entidades-html/) | html-entities |
| [Generador de UUID v4](https://prismaspace.pages.dev/herramientas/generador-uuid/) | uuid |
| [Generador de Lorem Ipsum](https://prismaspace.pages.dev/herramientas/generador-lorem-ipsum/) | lorem |
| [Generador de números aleatorios](https://prismaspace.pages.dev/herramientas/generador-numeros-aleatorios/) | random |
| [Calculadora de expresiones matemáticas](https://prismaspace.pages.dev/herramientas/calculadora-expresiones/) | calculator |
| [Calculadora de porcentajes y variación](https://prismaspace.pages.dev/herramientas/calculadora-porcentajes/) | percentage |
| [Calcular días entre dos fechas](https://prismaspace.pages.dev/herramientas/dias-entre-fechas/) | date-diff |
| [Convertir una hora a otra zona horaria](https://prismaspace.pages.dev/herramientas/conversor-zonas-horarias/) | timezone |
| [Comprobar contraste de colores WCAG](https://prismaspace.pages.dev/herramientas/comprobar-contraste-colores/) | contrast |
| [Ordenar una lista alfabéticamente](https://prismaspace.pages.dev/herramientas/ordenar-lista-alfabeticamente/) | text-sort |
| [Analizar la frecuencia de palabras](https://prismaspace.pages.dev/herramientas/frecuencia-palabras-texto/) | word-frequency |
| [Leer un código QR desde una imagen](https://prismaspace.pages.dev/herramientas/leer-codigo-qr-imagen/) | qr-scan |
| [Generador de códigos de barras](https://prismaspace.pages.dev/herramientas/generador-codigos-barras/) | barcode |
| [Convertir una imagen a blanco y negro](https://prismaspace.pages.dev/herramientas/imagen-blanco-negro/) | image-grayscale |
| [Desenfocar una imagen](https://prismaspace.pages.dev/herramientas/desenfocar-imagen/) | image-blur |
| [Ajustar brillo y contraste de una imagen](https://prismaspace.pages.dev/herramientas/ajustar-brillo-contraste/) | image-adjust |
| [Redondear las esquinas de una imagen](https://prismaspace.pages.dev/herramientas/redondear-esquinas-imagen/) | image-rounded |
| [Ver metadatos EXIF de una imagen](https://prismaspace.pages.dev/herramientas/ver-metadatos-exif/) | image-metadata |
| [Crear una imagen de la forma de onda de audio](https://prismaspace.pages.dev/herramientas/audio-a-imagen-onda/) | audio-waveform |
| [Calcular el hash SHA-256 de un archivo](https://prismaspace.pages.dev/herramientas/generar-hash-sha256/) | hash-file |
| [Buscar proyectos open source en GitHub](https://prismaspace.pages.dev/herramientas/buscar-proyectos-open-source/) | github-discover |
| [Probar una API pública desde el navegador](https://prismaspace.pages.dev/herramientas/probar-api-publica/) | api-explorer |
| [Decodificar un token JWT](https://prismaspace.pages.dev/herramientas/decodificar-jwt/) | jwt-decode |
| [Probar expresiones regulares](https://prismaspace.pages.dev/herramientas/probador-expresiones-regulares/) | regex-test |
| [Convertir JSON a YAML y YAML a JSON](https://prismaspace.pages.dev/herramientas/convertir-json-yaml/) | json-yaml |
| [Convertir Excel a JSON](https://prismaspace.pages.dev/herramientas/excel-a-json/) | excel-json |
| [Generador de degradados CSS](https://prismaspace.pages.dev/herramientas/generador-degradados-css/) | css-gradient |
| [Redactar textos con inteligencia artificial](https://prismaspace.pages.dev/herramientas/redactar-textos-ia/) | ai-assistant |
| [Generar títulos, guion y descripción para YouTube](https://prismaspace.pages.dev/herramientas/generador-contenido-youtube/) | ai-youtube-kit |
| [Mejorar prompts para inteligencia artificial](https://prismaspace.pages.dev/herramientas/mejorar-prompts-ia/) | ai-prompt-lab |
| [Crear una guía de estudio con IA](https://prismaspace.pages.dev/herramientas/generador-guia-estudio-ia/) | ai-study-notes |
| [Analizar y explicar código con IA](https://prismaspace.pages.dev/herramientas/asistente-programacion-ia/) | ai-code-helper |
| [Crear letras de canciones originales con IA](https://prismaspace.pages.dev/herramientas/generador-letras-canciones/) | music-lyrics |
| [Formatear código HTML](https://prismaspace.pages.dev/herramientas/formatear-html/) | html-format |
| [Formatear código CSS](https://prismaspace.pages.dev/herramientas/formatear-css/) | css-format |
| [Formatear JavaScript](https://prismaspace.pages.dev/herramientas/formatear-javascript/) | js-format |
| [Formatear consultas SQL](https://prismaspace.pages.dev/herramientas/formatear-sql/) | sql-format |
| [Validar y formatear XML](https://prismaspace.pages.dev/herramientas/formatear-xml/) | xml-format |
| [Calcular estadísticas de un CSV](https://prismaspace.pages.dev/herramientas/estadisticas-csv/) | csv-stats |
| [Convertir JSON a Excel XLSX](https://prismaspace.pages.dev/herramientas/json-a-excel/) | json-xlsx |
| [Inspeccionar el tipo y firma de un archivo](https://prismaspace.pages.dev/herramientas/inspeccionar-tipo-archivo/) | file-inspector |
| [Eliminar metadatos EXIF de una imagen](https://prismaspace.pages.dev/herramientas/eliminar-metadatos-imagen/) | image-strip-metadata |
| [Consultar metadatos de un PDF](https://prismaspace.pages.dev/herramientas/ver-metadatos-pdf/) | pdf-metadata |
| [Limpiar metadatos de un PDF](https://prismaspace.pages.dev/herramientas/eliminar-metadatos-pdf/) | pdf-metadata-clean |
| [Pixelar una imagen completa](https://prismaspace.pages.dev/herramientas/pixelar-imagen/) | image-pixelate |
| [Aplicar efecto sepia a una imagen](https://prismaspace.pages.dev/herramientas/efecto-sepia-imagen/) | image-sepia |
| [Crear un código QR de contacto vCard](https://prismaspace.pages.dev/herramientas/generador-qr-contacto/) | qr-vcard |
| [Ocultar datos sensibles de un texto](https://prismaspace.pages.dev/herramientas/ocultar-datos-sensibles-texto/) | text-redact-sensitive |
| [Generador de enlaces UTM](https://prismaspace.pages.dev/herramientas/generador-enlaces-utm/) | utm-builder |
| [Comparar dos documentos JSON](https://prismaspace.pages.dev/herramientas/comparar-json/) | json-compare-local |
| [Extraer DOI, PMID y arXiv de un texto](https://prismaspace.pages.dev/herramientas/extraer-doi-pmid-arxiv/) | citation-ids-local |
| [Comparar opciones con inteligencia artificial](https://prismaspace.pages.dev/herramientas/comparar-opciones-ia/) | ai-compare-options |
| [Crear un plan de acción con IA](https://prismaspace.pages.dev/herramientas/crear-plan-accion-ia/) | ai-action-plan |
| [Revisar estructura y coherencia de textos con IA](https://prismaspace.pages.dev/herramientas/revisar-textos-ia/) | ai-text-review |
| [Convertir JPG a PNG](https://prismaspace.pages.dev/herramientas/jpg-a-png/) | image-convert |
| [Convertir JPG a WebP](https://prismaspace.pages.dev/herramientas/jpg-a-webp/) | image-convert |
| [Convertir PNG a WebP](https://prismaspace.pages.dev/herramientas/png-a-webp/) | image-convert |
| [Convertir WebP a JPG](https://prismaspace.pages.dev/herramientas/webp-a-jpg/) | image-convert |
| [Convertir WebP a PNG](https://prismaspace.pages.dev/herramientas/webp-a-png/) | image-convert |
| [Convertir PDF a PNG](https://prismaspace.pages.dev/herramientas/pdf-a-png/) | pdf-to-image |
| [Convertir WebP a PDF](https://prismaspace.pages.dev/herramientas/webp-a-pdf/) | image-pdf |

## Dominio definitivo

1. Confirmar activación, DNS, HTTPS y respuesta del dominio en Cloudflare Pages.
2. Cambiar SEO_BASE en seo/config.mjs, conservando slugs. Actualizar también los metadatos canónicos de la portada cuando corresponda; esta misión no modifica la portada.
3. Configurar redirecciones permanentes por ruta desde el dominio anterior, evitando redirigir todo a la portada. No activar antes de verificar el destino.
4. Reconstruir y comprobar canónicas, Open Graph, JSON-LD, sitemap y robots. Las pruebas toman el origen de config.mjs.
5. Verificar propiedad en Search Console y enviar el sitemap del dominio final; vigilar indexación y errores.
6. Revisar aparte orígenes de autenticación, OAuth y PWA cuando se migre el dominio; no se cambian ahora.

## Evidencia de validación previa a publicación

- `node prisma/build.mjs`: correcto, incluidas comprobaciones de Core y Whisper ya existentes.
- `node --test prisma/tests/*.test.mjs`: 23 pruebas, 23 aprobadas, cero fallos (incluye dos suites con aserciones existentes a nivel de módulo).
- 29 casos locales ejecutados por `runTool`, con valores de salida esperados; no se consumieron cuotas de IA.
- 141 documentos (140 landings + directorio) analizados con html5lib: cero errores después de escapar correctamente los parámetros de la URL de fuentes.
- Sitemap analizado como XML; 143 URLs únicas (portada, directorio, 140 landings y privacidad).
- 564 comprobaciones de layout: 141 páginas × 320, 390, 768 y 1440 px. Cero desbordamientos tras retirar el ancho mínimo fijo de 320 px del body SEO, que no tenía en cuenta el espacio ocupado por la barra de desplazamiento.
- Inspección visual de la plantilla Aurora en escritorio, móvil y tablet; enlaces WebP → PNG y PDF → PNG abiertos en el navegador con formato PNG preseleccionado.
- La revisión completa combina análisis de código, formularios y pruebas locales. No supone haber ejecutado cada conversión de archivos ni cada proveedor remoto en todos los navegadores o dispositivos físicos.

Se incorporó main `3192732` antes de publicar, preservando Prisma Developer y su suite. La diferencia frente a main se limita a SEO, su build y pruebas.


## Expansión editorial y de enlaces internos — 11 de noviembre de 2026

Se añadieron 38 URLs nuevas: 10 categorías, 11 soluciones, 14 guías y tres índices. El sitemap esperado pasa de 143 a 181 URLs únicas. Las categorías muestran exclusivamente fichas de herramientas ya cubiertas por `audit.json`; las soluciones y guías enlazan a herramientas existentes y declaran límites de beta, BYOK y servicios conectados. Las 140 landings existentes reciben enlaces contextuales hacia categoría, solución y guía cuando existe relación real; el directorio y el pie de página de la aplicación enlazan a los nuevos índices.

La nueva prueba de build comprueba canónicas, metadatos únicos, JSON-LD (`CollectionPage`, `WebPage`, `HowTo`), rutas, herramientas aprobadas, pasos y sitemap. El preview de Cloudflare Pages para `seo/organic-growth-expansion` finalizó con estado `success` y sirvió un sitemap con 181 entradas. La publicación de producción queda pendiente de fusionar a `main`.

No se atribuyen volúmenes de búsqueda ni promesas de posicionamiento. `seo/keyword-map.md` registra consultas objetivo cualitativas y el plan para priorizar con Search Console cuando acumule datos.
