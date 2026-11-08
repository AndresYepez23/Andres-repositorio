# Prisma Space

Prisma Space es una suite web de herramientas digitales, con prioridad en el procesamiento local, motores IA intercambiables y transparencia sobre límites, costes y licencias.

## Catálogo

- **79 herramientas** organizadas en nueve categorías.
- PDF y documentos, imágenes, audio y vídeo, texto, productividad, utilidades y desarrollo.
- Generación de imágenes y laboratorio IA con proveedores seleccionables.
- Herramientas que procesan archivos localmente siempre que el navegador lo permite.

## Estructura

- `index.html`: aplicación.
- `styles.css`: identidad visual y diseño adaptable.
- `src/registry.js`: catálogo de herramientas.
- `src/providers.js`: proveedores IA.
- `src/main.js`: navegación y experiencia.
- `src/engines.js`: motores de ejecución.
- `src/workflows.js`: orquestación de flujos de varios pasos (imágenes, PDF y creación con IA).
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
- **Crear contenido con IA:** generación de imagen, edición posterior y paquete de publicación.
- Los flujos reutilizan los motores existentes y reportan el avance por etapas; las tareas locales permanecen en el navegador.

## Inteligencia artificial

- Pollinations Connect usa OAuth 2.0 Authorization Code + PKCE. Cada visitante autoriza su propio presupuesto.
- La App Key pública de Pollinations se configura desde la interfaz. La Redirect URI debe coincidir exactamente con el dominio público de producción.
- Hugging Face es una alternativa BYOK. Los límites gratuitos dependen del proveedor y del modelo.
- Nunca incrustar claves secretas de proveedor en el frontend.

## Privacidad y límites

- PDF, imagen, texto y documentos se procesan en el navegador cuando el módulo lo permite.
- OCR y FFmpeg descargan bibliotecas/modelos bajo demanda.
- Las funciones beta y los módulos marcados como próximamente no deben presentarse como funciones garantizadas.
- No hay analítica, cuenta de usuario ni almacenamiento de archivos en servidor en esta primera versión.
- No introducir claves API privadas en el frontend.
