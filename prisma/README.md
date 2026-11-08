# Prisma Space

Prisma Space es una suite web de herramientas digitales, con prioridad en el procesamiento local, motores IA intercambiables y transparencia sobre límites, costes y licencias.

## Catálogo

- **110 herramientas registradas** organizadas en 13 categorías: 73 listas, 34 beta y 3 en preparación. Estos estados describen el registro del catálogo; no equivalen a 104 pruebas funcionales independientes.
- Categorías: PDF y documentos (14), imágenes (18), audio y vídeo (13), texto y datos (23), utilidades (14), IA y creación (4), desarrollo (7), hojas de cálculo (1), diseño y desarrollo web (6), datos y análisis (3), privacidad y archivos (4), creación de contenido (1), estudio e investigación (2).
- Generación de imágenes y laboratorio IA con proveedores seleccionables.
- Herramientas que procesan archivos localmente siempre que el navegador lo permite.
- Se añadieron seis utilidades locales sin API ni clave: quitar tildes, invertir texto, extraer correos, extraer enlaces, minificar JSON y extraer texto de HTML.

## Estructura

- `index.html`: aplicación.
- `styles.css`: identidad visual y diseño adaptable.
- `src/registry.js`: catálogo de herramientas.
- `src/providers.js`: proveedores IA.
- `src/main.js`: navegación y experiencia.
- `src/engines.js`: motores de ejecución.
- `src/workflows.js`: orquestación de cuatro flujos de varios pasos (imágenes, PDF, creación con IA y tareas de texto).
- La capa de agente general de Prisma Core, con planificación dinámica y llamadas a herramientas por el modelo, todavía está pendiente; los flujos actuales son secuencias predefinidas.
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
