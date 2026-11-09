# Prisma Space — identidad independiente y acceso opcional

## Principio
**Sin inicio de sesión**: Prisma Core, herramientas, generación dentro de cuotas y almacenamiento local siguen funcionando sin cuenta.
**Con cuenta**: sincronizar conversaciones y preferencias (después de habilitar el proyecto de Supabase separado). No se obtienen créditos extra ni se saltan cuotas.

## Separación obligatoria
Usar un proyecto **Prisma Space** en Supabase, nunca la base de OdontoUdeC ni las credenciales compartidas de su autenticación.

Prisma Space dispone de un proyecto separado de Supabase (`hyoxywiwhnhfekakhivp`), creado en la organización autorizada con plan gratuito cotizado a **US$0/mes**. En noviembre de 2026 se aplicó el esquema de perfiles y conversaciones con RLS y no se modificó OdontoUdeC. Prisma publica la URL y la **clave publicable** de Supabase mediante `[vars]` en `wrangler.toml`: Cloudflare Pages usa este archivo como fuente de configuración y elimina las variables de texto que solo se agregan desde el panel en el siguiente despliegue. Las claves privadas y tokens de IA siguen exclusivamente como secretos de Cloudflare; nunca se incluyen en GitHub. Queda pendiente verificar las redirecciones de Auth, SMTP y proveedores OAuth antes de considerar el registro comprobado de extremo a extremo.

### Pasos para habilitarlo (una vez confirmado el proyecto)
1. Crear Prisma Space en la organización autorizada de Supabase. Registrar URL y publishable key (NO service_role).
2. Ejecutar `prisma/sql/001_prisma_profiles_chats.sql` SOLO en el nuevo proyecto.
3. En **Cloudflare Pages / prisma**, configurar `PRISMA_SUPABASE_URL` y `PRISMA_SUPABASE_PUBLISHABLE_KEY`. El endpoint público `/api/auth/config` revela solamente la clave publicable.
4. En Supabase Authentication → URL Configuration: Site URL `https://prismaspace.pages.dev`; redirect permitido `https://prismaspace.pages.dev/**`. Añadir dominios propios al cambiar.
5. Email: habilitar verificación y configurar SMTP dedicado para Prisma; Resend es opcional y requiere dominio/remitente verificado. No copiar sin autorización configuración específica de OdontoUdeC.
6. Google: crear OAuth web en Google Cloud, dar de alta Supabase callback, habilitar proveedor y luego `PRISMA_AUTH_GOOGLE_ENABLED=1`.
7. Apple: configurar Services ID y firma con Apple Developer; habilitar proveedor y luego `PRISMA_AUTH_APPLE_ENABLED=1`. El secreto para OAuth web debe rotarse según Apple.
8. Teléfono: contratar/autorizar SMS (p. ej. Twilio) y limitar abusos y coste; habilitar proveedor y luego `PRISMA_AUTH_PHONE_ENABLED=1`.
9. Activar CAPTCHA y límites de Auth antes de publicar el registro, y comprobar RLS con dos usuarios independientes.

No se debe marcar un proveedor como disponible ni mostrar su botón como funcional antes de que sus credenciales de servidor y su flujo real hayan sido verificados.

## Almacenamiento
Los chats anónimos siguen en `localStorage`. La nube se usa solo después de que el usuario inicie sesión y consienta la sincronización. Los archivos generados no se suben automáticamente a la base de datos.

## Voz
La transcripción primero intenta Web Speech cuando es compatible; como respaldo puede grabar y transcribir con `/api/ai/transcribe` y Groq (limitado por cuota). El modo conversación es **por turnos**, no un streaming full duplex continuo.

## Respaldo de claves propias y cuotas

El backend admite opcionalmente los secretos `GROQ_API_KEY_BACKUP` y `GEMINI_API_KEY_BACKUP` en Cloudflare Pages. Solo se usan frente a fallos de servicio (5xx), problemas de red o credenciales rechazadas (401/403), y deben pertenecer a cuentas para las que exista autorización válida. **No** se usan para saltar 429, crédito agotado (402), topes del proveedor ni el límite compartido de Prisma. Los cuatro límites D1 de Prisma siguen aplicando a toda operación.

Para configurar otras claves, usar **Cloudflare Pages → prismaspace → Settings → Variables and Secrets**, tipo **Secret**. Nunca incluir claves privadas en `index.html`, el repositorio, parámetros de URL ni el navegador.

El modo local de Prisma puede responder a preguntas básicas sobre identidad y límites sin consumir inferencia, pero no equivale a un LLM generativo disponible las 24 horas. Un respaldo de nube «siempre disponible» no se puede garantizar mientras se usen cuotas gratuitas y servicios externos.

## Terminación del registro

Antes de invitar usuarios, confirmar en Supabase:
- Authentication → URL Configuration → Site URL: `https://prismaspace.pages.dev`.
- Redirect URLs → añadir `https://prismaspace.pages.dev/**` y otros dominios propios que se vayan a usar.
- Correo de confirmación, límites antiabuso y SMTP remitente verificado. La cuenta de Resend de otra aplicación **no** se copia automáticamente.
- Google, Apple y SMS solo se activan al instalar proveedores con sus credenciales y flags correspondientes.

La aplicación debe seguir permitiendo el uso anónimo en navegador y PWA.

**Nota de despliegue:** las variables `PRISMA_SUPABASE_URL` y `PRISMA_SUPABASE_PUBLISHABLE_KEY` son públicas por diseño, no equivalen a `service_role`. No reemplazar esa clave con una clave secreta. Después de publicar, comprobar `/api/auth/config` y el estado de la autenticación; Supabase Site URL, redirecciones y SMTP requieren verificación independiente.
