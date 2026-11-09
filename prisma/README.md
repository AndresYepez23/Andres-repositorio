# Prisma Space

Prisma Space es una suite web de herramientas digitales, con prioridad en el procesamiento local, motores IA intercambiables y transparencia sobre límites, costes y licencias.

## Catálogo

- **116 herramientas registradas** organizadas en 13 categorías: 79 listas, 34 beta y 3 en preparación. Estos estados describen el registro del catálogo; no equivalen a 110 pruebas funcionales independientes.
- Categorías: PDF y documentos (14), imágenes (18), audio y vídeo (13), texto y datos (29), utilidades (14), IA y creación (4), desarrollo (7), hojas de cálculo (1), diseño y desarrollo web (6), datos y análisis (3), privacidad y archivos (4), creación de contenido (1), estudio e investigación (2).
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
- La siguiente etapa pendiente es trasladar capacidades seleccionadas a un backend Cloudflare Worker protegido, con cuotas, autenticación, observabilidad y límites por usuario. La memoria actual es local al navegador; no hay sincronización entre dispositivos.
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

## Prisma Core

- Una conversación central para describir objetivos en lenguaje natural.
- El planificador recibe únicamente las herramientas con estado `ready`; no puede invocar herramientas beta o en preparación.
- Cada plan está limitado a diez pasos y debe ser autorizado antes de ejecutarse.
- Los planes externos advierten que los datos pueden salir del navegador y que pueden existir costes del proveedor.
- El enrutador incorpora metadatos por modalidad sobre motor, privacidad, coste orientativo y estrategia de respaldo. Cuando no se ha verificado una tarifa o licencia específica, no la presenta como garantizada.
- Las operaciones se ejecutan secuencialmente; los archivos resultantes pueden alimentar el siguiente paso. El usuario puede detener la secuencia al terminar la operación activa y conservar los resultados parciales.
- La conversación se guarda en el almacenamiento local del navegador. Los archivos adjuntos no se guardan en el historial.
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
