# Credenciales de proveedores de Prisma Core

El backend de Prisma Space admite hasta cinco **espacios protegidos** para cada proveedor externo que utiliza API keys. No expongas las claves en GitHub, HTML, JavaScript público ni en el panel de conexiones.

## Variables (producción de Cloudflare Pages, proyecto `prismaspace`)

| Proveedor | Espacio 1 | Espacio 2 | Espacio 3 | Espacio 4 | Espacio 5 |
| --- | --- | --- | --- | --- | --- |
| Gemini | `GEMINI_API_KEY` | `GEMINI_API_KEY_2` | `GEMINI_API_KEY_3` | `GEMINI_API_KEY_4` | `GEMINI_API_KEY_5` |
| Groq | `GROQ_API_KEY` | `GROQ_API_KEY_2` | `GROQ_API_KEY_3` | `GROQ_API_KEY_4` | `GROQ_API_KEY_5` |
| Hugging Face | `HF_TOKEN` | `HF_TOKEN_2` | `HF_TOKEN_3` | `HF_TOKEN_4` | `HF_TOKEN_5` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY_2` | `OPENROUTER_API_KEY_3` | `OPENROUTER_API_KEY_4` | `OPENROUTER_API_KEY_5` |
| Pollinations central | `POLLINATIONS_API_KEY` | `POLLINATIONS_API_KEY_2` | `POLLINATIONS_API_KEY_3` | `POLLINATIONS_API_KEY_4` | `POLLINATIONS_API_KEY_5` |

Las variables `GEMINI_API_KEY_BACKUP` y `GROQ_API_KEY_BACKUP` se siguen reconociendo como alias antiguo del espacio 2 cuando falta la variable `_2`.

**Cloudflare Workers AI:** utiliza el binding `AI`; no se pueden sumar cinco claves como si fuera un proveedor externo. **Pollinations Connect:** es una sesión autorizada por el visitante, independiente de los cinco secretos del motor central.

## Reglas de disponibilidad y ahorro

1. Una petición satisfactoria utiliza una sola credencial. Si falla por autenticación, saturación o error del proveedor, puede probarse **una alternativa como máximo** en esa petición.
2. Una credencial con fallo transitorio recibe una pausa temporal; futuras peticiones podrán utilizar otros espacios disponibles.
3. Ante HTTP 402 (sin saldo o créditos), no se prueban otras credenciales en esa misma petición para evitar consumir accidentalmente otro saldo.
4. Las cuotas diarias, los límites por visitante y los controles D1 **siguen siendo compartidos por proveedor** dentro de Prisma, independientemente de cuántas claves haya.
5. Varias claves de una misma cuenta, organización o proyecto suelen compartir el mismo límite externo. No utilizarlas para eludir cuotas o condiciones contractuales del proveedor.
6. OpenRouter conserva el enrutamiento `openrouter/free` con su control interno y una verificación conservadora de la cuenta; no interpreta cinco claves como cinco cuotas acumulables.
7. Las herramientas locales se ejecutan sin inferencia cuando los parámetros son claros. Prisma Core usa un planificador ligero cuando necesita decidir entre herramientas; reserva la inferencia más elaborada para peticiones complejas.

## Añadir claves posteriormente

Crea o autoriza cada clave desde el proveedor correspondiente y guárdala como **secreto de producción** en Cloudflare Pages > `prismaspace` > Settings > Variables and Secrets. Deja sin definir los espacios que aún no tengan clave; **nunca guardes valores vacíos, inventados ni duplicados**. Comprueba después el panel Conexiones. La presencia de una variable no garantiza que su clave sea válida: valida cada nueva conexión antes de depender de ella.

No se han creado cinco cuentas nuevas ni nuevos saldos con este cambio: se ha preparado la infraestructura para hasta cinco credenciales por proveedor.
