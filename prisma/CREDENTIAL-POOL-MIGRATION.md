# Consolidar credenciales de Prisma para Cloudflare Workers Free

## Por qué hace falta

La configuración de producción de Pages contiene actualmente 68 variables y el despliegue de Functions intenta publicar 71 bindings. Workers Free admite 64 por Worker. La compilación termina, pero Cloudflare rechaza la publicación de Functions por superar ese límite.

El backend admite secretos JSON para agrupar claves sin perder rotación. Este formato permite conservar todas las credenciales en el plan gratuito.

## Secretos JSON que deben crearse

En Cloudflare Pages → proyecto \`prismaspace\` → Settings → Environment variables → Production, crea estos secretos. Cada valor debe ser un arreglo JSON de cadenas, en el mismo orden de las claves individuales actuales:

| Secreto nuevo | Combina estas variables actuales |
|---|---|
| \`GEMINI_API_KEYS_JSON\` | \`GEMINI_API_KEY\`, \`GEMINI_API_KEY_2\` … \`GEMINI_API_KEY_6\` |
| \`GROQ_API_KEYS_JSON\` | \`GROQ_API_KEY\`, \`GROQ_API_KEY_2\` … \`GROQ_API_KEY_5\` |
| \`HF_API_KEYS_JSON\` | \`HF_TOKEN\`, \`HF_TOKEN_2\` … \`HF_TOKEN_6\` |
| \`KILO_API_KEYS_JSON\` | \`KILO_API_KEY\`, \`KILO_API_KEY_2\` … \`KILO_API_KEY_6\` |
| \`OPENROUTER_API_KEYS_JSON\` | \`OPENROUTER_API_KEY\`, \`OPENROUTER_API_KEY_2\` … \`OPENROUTER_API_KEY_6\` |
| \`POLLINATIONS_API_KEYS_JSON\` | \`POLLINATIONS_API_KEY\`, \`POLLINATIONS_API_KEY_2\` … \`POLLINATIONS_API_KEY_6\` |
| \`REQUESTY_API_KEYS_JSON\` | \`REQUESTY_API_KEY\`, \`REQUESTY_API_KEY_2\`, \`REQUESTY_API_KEY_3\` |
| \`SENSENOVA_API_KEYS_JSON\` | \`SENSENOVA_API_KEY\`, \`SENSENOVA_API_KEY_2\` … \`SENSENOVA_API_KEY_6\` |
| \`ZAI_API_KEYS_JSON\` | \`ZAI_API_KEY\`, \`ZAI_API_KEY_2\` … \`ZAI_API_KEY_6\` |
| \`AIHUBMIX_API_KEYS_JSON\` | \`AIHUBMIX_API_KEY\`, \`AIHUBMIX_API_KEY_2\` … \`AIHUBMIX_API_KEY_5\` |
| \`TAVILY_API_KEYS_JSON\` | \`TAVILY_API_KEY\`, \`TAVILY_API_KEY_2\` … \`TAVILY_API_KEY_7\` |
| \`JINA_API_KEYS_JSON\` | \`JINA_API_KEY\` |

Ejemplo de formato, usando valores ficticios únicamente:

\`["clave-1","clave-2","clave-3"]\`

## Orden seguro de migración

1. Copia los valores directamente desde el gestor de secretos de Cloudflare; no los pegues en GitHub, incidencias, capturas ni conversaciones.
2. Crea los 12 secretos JSON en Production.
3. En la misma edición de configuración, elimina las 63 variables individuales de los doce proveedores listados. No dejes ambas versiones activas: las individuales tienen prioridad y no reducen el contador de bindings.
4. Conserva como secretos independientes \`RESEND_API_KEY\` y \`SUPABASE_SERVICE_ROLE_KEY_2\`.
5. Conserva como variables de texto \`PRISMA_AUTH_GOOGLE_ENABLED\`, \`PRISMA_SUPABASE_PUBLISHABLE_KEY\` y \`PRISMA_SUPABASE_URL\`.
6. Guarda los cambios. La configuración esperada queda en 17 variables (12 pools JSON, 2 secretos independientes y 3 variables de texto), muy por debajo del límite de 64.

## AIHubMix

No se debe crear ni activar \`AIHUBMIX_DAILY_QUOTA_ACTIVE=1\) por esta migración. Esa bandera solo debe activarse después de confirmar la recarga requerida por la cuenta. Las cinco claves se agrupan igual que las demás y continúan sujetas a la protección de cuota existente.

## Seguridad

Los endpoints de estado exponen únicamente nombres de variables, cantidad de slots y estado agregado. Nunca devuelven valores de credenciales.
