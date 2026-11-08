# PRISMA

Plataforma web de herramientas digitales con prioridad en procesamiento local, motores intercambiables y transparencia sobre cuotas y licencias.

## Estructura

- `index.html`: aplicación estática.
- `styles.css`: identidad visual y diseño adaptable.
- `src/registry.js`: catálogo y metadatos de herramientas.
- `src/providers.js`: inventario de proveedores IA.
- `src/main.js`: navegación, filtros y experiencia de usuario.
- `src/engines.js`: ejecución de herramientas.

## Ejecutar localmente

No requiere instalación ni build:

1. Abrir la carpeta `prisma` con un servidor estático local.
2. Usar un navegador moderno con módulos ES y conexión para cargar las bibliotecas bajo demanda.
3. Abrir `index.html`.

## Publicación en Netlify

Conectar el repositorio y seleccionar:
- Base directory: `prisma`
- Build command: vacío
- Publish directory: `.`
- Functions directory: no aplica en esta primera versión

La configuración `netlify.toml` está dentro de esta carpeta. Si Netlify no la detecta automáticamente, seleccionar `prisma/netlify.toml` como archivo de configuración.

## Privacidad

- PDF, imagen, texto y documentos se procesan en el navegador cuando el módulo lo permite.
- El eliminador de fondo descarga modelos de IA al dispositivo; la imagen de entrada no se envía al servidor de inferencia.
- OCR y FFmpeg descargan sus bibliotecas/modelos bajo demanda.
- La consulta de divisas utiliza Frankfurter y envía únicamente la moneda base y la moneda destino.
- No hay analítica, cuenta de usuario ni almacenamiento de archivos en servidor en esta primera versión.
- No introducir claves API privadas en el frontend.

## Estado técnico

Las funciones marcadas como beta utilizan modelos o WebAssembly pesados y deben probarse en distintos navegadores y dispositivos antes de considerarse estables. Los módulos marcados como próximamente no están habilitados.
