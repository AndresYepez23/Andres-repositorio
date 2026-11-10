# Prisma Space

Prisma Space es una suite web de herramientas digitales, con prioridad en el procesamiento local, motores IA intercambiables y transparencia sobre límites, costes y licencias.

## Catálogo

- **143 herramientas registradas** en 13 categorías: 93 listas, 48 beta y 2 en preparación. Los estados del catálogo indican disponibilidad prevista, no sustituyen las pruebas funcionales de cada herramienta.
- Categorías: PDF, imágenes, audio y vídeo, texto, utilidades, IA y creación, desarrollo, hojas de cálculo, diseño web, datos, privacidad, creadores y estudio. Los totales de cada área se calculan dinámicamente en la aplicación.
- Generación de imágenes y laboratorio IA con proveedores seleccionables.
- Herramientas que procesan archivos localmente siempre que el navegador lo permite.
- Se añadieron doce utilidades locales sin API ni clave: quitar tildes, invertir texto, extraer correos, extraer enlaces, minificar JSON, extraer texto de HTML, eliminar líneas vacías, añadir prefijos y sufijos, buscar y reemplazar, extraer hashtags, extraer teléfonos y aplanar JSON.

## Estructura

- `index.html`: aplicación.
- `styles.css`: identidad visual y diseño adaptable.
- `src/registry.js`: catálogo de herramientas.
- `src/providers.js`: proveedores IA.
- `src/main.js`: navegación y experiencia.
- `src/engines.js`: motores de ejecución.
- `src/workflows.js`: orquestación de cuatro flujos de varios pasos (imágenes, PDF, creación con IA y tareas de texto).
- `src/core.js`: agente conversacional en el navegador, catálogo dinámico de herramientas disponibles, planificación JSON, aprobación explícita, ejecución secuencial, validación de archivos y conservación de resultados parciales.
- Prisma Core ya dispone de una primera capa de agente en cliente: un modelo conectado planifica operaciones a partir del catálogo disponible y el ejecutor invoca las herramientas locales o los proveedores personales después de la aprobación del usuario.
- La siguiente etapa pendiente es trasladar capacidades seleccionadas a un backend Cloudflare Worker protegido, con cuotas, autenticación, observabilidad y límites por usuario. La memoria de conversaciones se conserva localmente con respaldo IndexedDB y puede sincronizarse entre dispositivos mediante Supabase Auth y la tabla protegida `prisma_conversations`. La sincronización es una preferencia global de la cuenta y requiere consentimiento explícito.
- `build.mjs`: prepara el directorio de publicación `dist/`.
- `_headers`: cabeceras HTTP de seguridad para Cloudflare Pages.
- `worker.js`: prototipo independiente para futuras rutas dinámicas; no forma parte del sitio estático publicado.

## Producción

La producción se publica en **Cloudflare Pages**, conectado al repositorio GitHub `AndresYepez23/PRISMA`.

- Rama de producción: `main`.
- Directorio raíz de Pages: `prisma`.
- Comando de compilación: `node build.mjs`.
- Directorio publicado: `dist`.

Cada actualización integrada en `main` se puede desplegar en Cloudflare Pages. Prisma Space ya no depende de Wix ni Netlify para su alojamiento.

## SEO: 20 páginas iniciales

- `seo/pages.json` contiene contenido original para 20 páginas, vinculado a herramientas reales en `src/registry.js`.
- `seo/generate.mjs` produce HTML indexable en `dist/herramientas/<slug>/index.html`, un índice `dist/herramientas/index.html`, `dist/sitemap.xml` y `dist/robots.txt`.
- `seo/landing.css` conserva Aurora y no modifica la estética de Prisma Core; la publicación requiere `node build.mjs`.
- Cada página utiliza título y descripción propios, canonical, enlaces internos, Open Graph, datos estructurados, instrucciones, advertencias y preguntas frecuentes.
- Los botones abren la herramienta real con `/?tool=<id>`; PDF a JPG y PNG a JPG preseleccionan el formato de salida correcto. El visitante debe elegir los archivos y confirmar la operación.
- Dominio SEO canónico inicial: `https://prismaspace.pages.dev/`; debe actualizarse si se adopta un dominio propio.
- En Google Search Console registrar la propiedad y enviar `https://prismaspace.pages.dev/sitemap.xml`. Publicar un sitemap no garantiza indexación ni tráfico.
- Comprobación automatizada: `node prisma/build.mjs` seguida de `node --test prisma/tests/seo-build.test.mjs`.

## Prisma Core

- Una conversación central para describir objetivos en lenguaje natural.
- El planificador recibe únicamente las herramientas con estado `ready`; no puede invocar herramientas beta o en preparación.
- Cada plan está limitado a diez pasos y debe ser autorizado antes de ejecutarse.
- Los planes externos advierten que los datos pueden salir del navegador y que pueden existir costes del proveedor.
- El enrutador incorpora metadatos por modalidad sobre motor, privacidad, coste orientativo y estrategia de respaldo. Cuando no se ha verificado una tarifa o licencia específica, no la presenta como garantizada.
- Las operaciones se ejecutan secuencialmente; los archivos resultantes pueden alimentar el siguiente paso. El usuario puede detener la secuencia al terminar la operación activa y conservar los resultados parciales.
- La conversación se guarda localmente (IndexedDB con caché en localStorage) y, si el usuario autoriza la sincronización, en su cuenta Prisma para continuar en otros dispositivos. Los archivos adjuntos binarios no se sincronizan; se conserva el texto y los metadatos disponibles.
- Las credenciales personales se leen desde la sesión del navegador y no se incorporan al historial.
- El agente no puede publicar, enviar, comprar ni borrar recursos externos.

## Flujos inteligentes

- **Optimizar una imagen:** eliminación de fondo, redimensionado, marca de agua y compresión.
- **Preparar documentos:** combinación de PDF, numeración y extracción de texto cuando el documento lo permite.
- **Crear contenido con IA:** generación de imagen con Pollinations, Hugging Face o Gemini, edición posterior y paquete de publicación.
- **Descubrir proyectos open source:** búsqueda pública en GitHub por tema, lenguaje, estrellas y actividad.
- **Explorar APIs públicas:** consulta GET con acceso directo y fallback seguro a cors.dev cuando el navegador bloquea CORS; sin enviar claves ni cookies.
- **Laboratorio IA unificado:** conexión personal de Pollinations (OAuth/PKCE), Hugging Face, Google Gemini y Groq; claves temporales en `sessionStorage`.
- **Transparencia de uso:** consulta de tarifas en vivo de Pollinations para mostrar Pollen por imagen, además de avisos de facturación por proveedor.
- **Selección simplificada:** perfiles de rapidez, equilibrio y detalle, sin obligar al usuario a elegir IDs técnicos de modelos.
- **Cambio de motor:** fallback opcional entre cuentas conectadas, desactivado por defecto para evitar consumo inesperado.
- **Ideas iniciales:** ejemplos de prompts para comenzar la creación visual.
- Los flujos reutilizan los motores existentes y reportan el avance por etapas; las tareas locales permanecen en el navegador.
- Las herramientas registradas deben validarse individualmente por motor, entradas, salidas, errores, límites y privacidad antes de considerarse certificadas.

## Inteligencia artificial

- Pollinations Connect usa OAuth 2.0 Authorization Code + PKCE. Cada visitante autoriza su propio presupuesto.
- La App Key pública de Pollinations se configura desde la interfaz. La Redirect URI debe coincidir exactamente con el dominio público de producción.
- Hugging Face es una alternativa BYOK y puede enrutar modelos de distintos proveedores, incluidos Groq, Fal AI y Together según disponibilidad.
- Google Gemini y Groq se conectan con claves personales validadas; las claves se conservan solo en la sesión actual del navegador.
- Cloudflare Workers AI se mantiene pendiente de activar en backend protegido, para no exponer una cuota compartida a abuso público.
- cors.dev se utiliza únicamente como proxy de lectura pública GET/HEAD; nunca enviar credenciales, cookies o información privada.
- Nunca incrustar claves secretas de proveedor en el frontend.

## Privacidad y límites

- PDF, imagen, texto y documentos se procesan en el navegador cuando el módulo lo permite.
- OCR y FFmpeg descargan bibliotecas/modelos bajo demanda.
- Las funciones beta y los módulos marcados como próximamente no deben presentarse como funciones garantizadas.
- No hay analítica, cuenta de usuario ni almacenamiento de archivos en servidor en esta primera versión.
- No introducir claves API privadas en el frontend.


## Prisma Core 3 · navegación y generación visual

- En la vista **Prisma Core**, el menú principal de Prisma Space presenta **Nuevo chat**, búsqueda y las conversaciones locales (renombrar, anclar y eliminar). En otras vistas mantiene **Explorar por categoría**.
- En móvil, pulsar fuera del menú principal cierra el panel. La conversación ya no tiene una segunda cabecera ni menú redundante y utiliza el ancho disponible.
- El enrutador visual entiende imágenes de propósito general, miniaturas, portadas, logos, ilustraciones, flyers y publicaciones. Una petición suficientemente contextualizada se ejecuta; una petición vaga solicita una sola aclaración útil.
- Cuando se solicita texto en el resultado, Prisma puede componerlo sobre el fondo generado usando Canvas local y el editor permite ajustar texto sin gastar otra generación IA.
- La secuencia automática de generación visual intenta Cloudflare FLUX, Pollinations FLUX.1 Schnell, Pollinations Z-Image Turbo y, **solo si están autorizados**, Hugging Face y Gemini Image. Las cuotas globales de Prisma prevalecen sobre los respaldos.
- **Hugging Face Image** requiere `HF_MEDIA_ENABLED=1` y `HF_TOKEN` para evitar gastos no consentidos.
- **Gemini Image** requiere `GEMINI_IMAGE_ENABLED=1` y `GEMINI_API_KEY`. Es un motor de pago; no se activa en esta actualización ni consume créditos sin esa habilitación explícita.
- El generador conserva los límites de uso diario y nunca garantiza que una API de terceros siempre esté disponible.


## Inteligencia contextual y nuevas herramientas

- Prisma Core prioriza los turnos recientes y recupera mensajes anteriores relevantes dentro de la conversación actual, con un límite de caracteres para ahorrar tokens y proteger la latencia.
- El enrutamiento automático selecciona motores por tipo de trabajo y salud reciente. Kilo participa únicamente con modelos de precio cero que no sean endpoints de prueba NVIDIA. AIHubMix permanece manual hasta confirmar la recarga requerida en `AIHUBMIX_DAILY_QUOTA_ACTIVE=1`.
- Tres herramientas sin API: ocultar claves, correos y teléfonos potencialmente sensibles; construir enlaces UTM sin perder parámetros; generar subtítulos SRT con tiempos aproximados y archivo descargable.
- El detector de datos sensibles no sustituye una revisión humana ni garantiza anonimización. Los subtítulos SRT generados desde texto requieren ajuste temporal según el audio.
