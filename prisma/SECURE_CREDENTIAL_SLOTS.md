# Pools seguros de credenciales de Prisma Core

Prisma admite **hasta seis API keys o tokens por cada proveedor externo compatible**. Las claves se guardan como secretos de Cloudflare Pages y nunca se exponen al navegador, a GitHub ni a los registros.

## Formato recomendado: un secreto JSON por proveedor

En Cloudflare Pages > `prismaspace` > Settings > Variables and Secrets, crea el secreto indicado en la columna JSON. Su valor debe ser un arreglo JSON de cadenas de texto, con entre una y seis claves:

```json
["CLAVE_1","CLAVE_2","CLAVE_3","CLAVE_4","CLAVE_5","CLAVE_6"]
```

| Proveedor | Secreto JSON recomendado | Variable individual compatible |
| --- | --- | --- |
| Gemini | `GEMINI_API_KEYS_JSON` | `GEMINI_API_KEY`, `GEMINI_API_KEY_2` … `GEMINI_API_KEY_6` |
| Groq | `GROQ_API_KEYS_JSON` | `GROQ_API_KEY`, `GROQ_API_KEY_2` … `GROQ_API_KEY_6` |
| Hugging Face | `HF_API_KEYS_JSON` | `HF_TOKEN`, `HF_TOKEN_2` … `HF_TOKEN_6` |
| OpenRouter | `OPENROUTER_API_KEYS_JSON` | `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2` … `OPENROUTER_API_KEY_6` |
| Pollinations central | `POLLINATIONS_API_KEYS_JSON` | `POLLINATIONS_API_KEY`, `POLLINATIONS_API_KEY_2` … `POLLINATIONS_API_KEY_6` |
| Kilo AI Gateway (opcional) | `KILO_API_KEYS_JSON` | `KILO_API_KEY`, `KILO_API_KEY_2` … `KILO_API_KEY_6` |
| Requesty | `REQUESTY_API_KEYS_JSON` | `REQUESTY_API_KEY`, `REQUESTY_API_KEY_2` … `REQUESTY_API_KEY_6` |
| SenseNova | `SENSENOVA_API_KEYS_JSON` | `SENSENOVA_API_KEY`, `SENSENOVA_API_KEY_2` … `SENSENOVA_API_KEY_6` |
| Z.AI / Zhipu | `ZAI_API_KEYS_JSON` | `ZAI_API_KEY`, `ZAI_API_KEY_2` … `ZAI_API_KEY_6` |
| Baidu Qianfan | `QIANFAN_API_KEYS_JSON` | `QIANFAN_API_KEY`, `QIANFAN_API_KEY_2` … `QIANFAN_API_KEY_6` |
| AIHubMix | `AIHUBMIX_API_KEYS_JSON` | `AIHUBMIX_API_KEY`, `AIHUBMIX_API_KEY_2` … `AIHUBMIX_API_KEY_6` |
| AMD Radeon Token Factory | `RADEON_API_KEYS_JSON` | `RADEON_API_KEY`, `RADEON_API_KEY_2` … `RADEON_API_KEY_6` |

El JSON es el método recomendado porque Cloudflare Workers tiene un límite de variables y secretos por Worker (64 en Free y 128 en Paid, según sus límites publicados). Doce secretos JSON compactos permiten alojar los seis espacios de cada proveedor sin necesitar 72 variables separadas. Cada secreto individual también tiene un límite de tamaño; seis claves normales caben holgadamente en un arreglo JSON. Consulta [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) y [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/).

## Compatibilidad y prioridad

- Las variables individuales antiguas siguen funcionando; no es necesario migrarlas para conservar la conexión actual.
- Si se define el secreto JSON y también una variable individual para el mismo número, **la variable individual tiene prioridad en ese espacio**.
- Para consolidar una instalación que ya usa muchas variables individuales, copia las seis claves en el arreglo JSON, valida que Conexiones muestre el número correcto y solo entonces elimina las variables individuales antiguas. Así evitas contar dos veces las mismas claves y ahorras bindings de Cloudflare.
- Los valores repetidos se deduplican; no cuentan como claves independientes.
- El alias histórico `GEMINI_API_KEY_BACKUP` y `GROQ_API_KEY_BACKUP` se reconoce como espacio 2 cuando falta la variable `_2`.
- El JSON debe ser un arreglo de hasta seis cadenas. Si el formato es inválido, Prisma lo informa en Conexiones y no interpreta el contenido como una clave.
- Nunca pongas valores reales en `wrangler.toml`, archivos públicos, HTML, JavaScript del navegador ni commits. En Cloudflare elige el tipo **Secret / Encrypt**.

## Cómo se utilizan las seis claves

1. En el tráfico normal, Prisma selecciona una credencial sana del conjunto para distribuir solicitudes entre los espacios configurados.
2. Si una clave concreta falla por autenticación o por un error transitorio, Prisma puede probar **una sola clave alternativa** en esa petición. Máximo dos intentos de red por solicitud.
3. Si el proveedor responde HTTP 402 (crédito/saldo agotado) o HTTP 429 (límite del proveedor), Prisma pausa **todo el proveedor** y cambia al siguiente motor compatible. No prueba las otras cinco claves para saltarse el límite.
4. Una credencial que falle por autenticación o conectividad recibe una pausa individual temporal; las demás pueden seguir utilizándose.
5. El panel Conexiones muestra el número de espacios configurados, el máximo de seis y el consumo agregado. Nunca devuelve los valores secretos.
6. Los presupuestos D1 de Prisma siguen siendo **compartidos por proveedor**, no se multiplican por el número de claves. Seis claves no significan seis veces más cuota.
7. Si varias claves pertenecen a la misma cuenta, organización o proyecto, normalmente comparten límites upstream. No uses claves adicionales para eludir cuotas, facturación, verificaciones o condiciones de servicio. Solo añade cuentas/proyectos independientes cuando el proveedor lo permita.

## Proveedores que no son pools de API keys

- **Cloudflare Workers AI:** utiliza el binding `AI`, no una API key externa. Cloudflare gestiona sus credenciales y cuota.
- **Pollinations Connect:** es una autorización individual del visitante y utiliza el saldo del propio usuario; es independiente del pool central de Pollinations.
- **Kilo AI Gateway:** permite acceso anónimo sin clave; si Prisma configura claves, admite hasta seis.
- **AMD Radeon Cloud Token Factory:** admite hasta seis claves, pero permanece limitado a evaluación y no participa en el fallback automático.
- **Baidu Qianfan:** admite seis claves, pero las llamadas siguen bloqueadas hasta verificar la gratuidad de la cuenta y activar `BAIDU_FREE_QUOTA_CONFIRMED=1`.

## Límites y condiciones particulares que no se multiplican

- AIHubMix: la prueba sin recarga tiene 10 llamadas totales. Tras una recarga mínima de USD 1, activa `AIHUBMIX_DAILY_QUOTA_ACTIVE=1`; Prisma consulta el catálogo y pesos en vivo, filtra modelos de texto con peso 1 y conserva un límite interno compartido de 15 solicitudes/día y 10/minuto.
- AMD: solo modelos de texto identificados como gratuitos en el catálogo; sigue siendo una integración de evaluación, no de producción.
- Kilo: solo modelos con precio cero; algunos endpoints de prueba pueden registrar prompts. No se enruta automáticamente.
- Requesty: Prisma limita el conjunto de claves a 25 solicitudes/día y 10/minuto.
- SenseNova: Prisma limita el conjunto a 25 solicitudes/día y 5/minuto.
- Z.AI: Prisma limita el conjunto a 25 solicitudes/día y 3/minuto.
- Baidu: permanece bloqueado hasta confirmar en Qianfan que los modelos seleccionados aparecen a precio cero para esa cuenta.

Los topes son por proveedor y no por clave. No se aumenta automáticamente el presupuesto interno al añadir credenciales.

## Verificación después de configurarlas

1. Guarda los secretos JSON en **Preview** primero, para validar el formato sin tocar producción.
2. Abre Conexiones en el preview y comprueba que cada proveedor muestra `0/6` a `6/6` según los valores configurados.
3. Prueba una petición sencilla por proveedor y revisa el proveedor/modelo de respuesta.
4. Comprueba que un error de autenticación de una clave permite un único respaldo, pero que un 402/429 pausa el conjunto completo.
5. Solo después de esas pruebas, replica los secretos necesarios en el entorno **Production** de Cloudflare Pages.

No se crean cuentas, claves ni saldos automáticamente. Cada clave debe ser generada y autorizada por el usuario en el proveedor correspondiente.
