# PRISMA

Plataforma web de herramientas digitales con prioridad en procesamiento local, motores intercambiables y transparencia sobre cuotas y licencias.

## Estructura

- `index.html`: aplicación estática.
- `styles.css`: identidad visual y diseño adaptable.
- `src/registry.js`: catálogo de **79 herramientas** en nueve categorías.
- `src/providers.js`: inventario de proveedores IA.
- `src/main.js`: navegación, filtros y experiencia de usuario.
- `src/engines.js`: ejecución de herramientas.
- `worker.js`: Worker de Cloudflare para servir los recursos estáticos y la ruta de salud.

## Publicación

PRISMA se publica en **Cloudflare Workers Static Assets**. El repositorio de GitHub es la fuente de verdad y `main` es la rama de producción.

Desde la carpeta `prisma`, se puede publicar con Wrangler:

```bash
npx wrangler deploy
```

El archivo `wrangler.toml` contiene la configuración de Worker y de recursos estáticos. El endpoint `/api/health` permite comprobar qué versión está desplegada.

## Ejecutar localmente

No requiere instalación ni build:

1. Abrir la carpeta `prisma` con un servidor estático local.
2. Usar un navegador moderno con módulos ES y conexión para cargar las bibliotecas bajo demanda.
3. Abrir `index.html`.

## Inteligencia artificial

- Pollinations Connect usa OAuth 2.0 Authorization Code + PKCE. Cada visitante autoriza su propio presupuesto; el token temporal permanece en `sessionStorage` y no se guarda en `localStorage`.
- La App Key pública de Pollinations se configura desde la interfaz. El administrador debe registrar como Redirect URI exacta la URL pública del sitio.
- Hugging Face es una alternativa BYOK. Las cuentas Free no incluyen créditos mensuales para Inference Providers; PRO incluye USD 2 mensuales, sujeto a las condiciones vigentes.
- Nunca incrustar claves secretas de proveedor en el frontend.

## Privacidad

- PDF, imagen, texto y documentos se procesan en el navegador cuando el módulo lo permite.
- El eliminador de fondo descarga modelos de IA al dispositivo; la imagen de entrada no se envía al servidor de inferencia.
- OCR y FFmpeg descargan sus bibliotecas/modelos bajo demanda.
- La consulta de divisas utiliza Frankfurter y envía únicamente la moneda base y la moneda destino.
- No hay analítica, cuenta de usuario ni almacenamiento de archivos en servidor en esta primera versión.
- No introducir claves API privadas en el frontend.

## Estado técnico

Las funciones marcadas como beta utilizan modelos o WebAssembly pesados y deben probarse en distintos navegadores y dispositivos antes de considerarse estables. Los módulos marcados como próximamente no están habilitados.
