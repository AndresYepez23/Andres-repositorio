# Prisma Space — identidad independiente y acceso opcional

## Principio
**Sin inicio de sesión**: Prisma Core, herramientas, generación dentro de cuotas y almacenamiento local siguen funcionando sin cuenta.
**Con cuenta**: sincronizar conversaciones y preferencias (después de habilitar el proyecto de Supabase separado). No se obtienen créditos extra ni se saltan cuotas.

## Separación obligatoria
Usar un proyecto **Prisma Space** en Supabase, nunca la base de OdontoUdeC ni las credenciales compartidas de su autenticación.

El proyecto Supabase gratuito estaba cotizado en US$0/mes, pero el conector solicitó confirmación específica antes de crearlo. Por eso **no se creó ni configuró** y los métodos de acceso permanecen deshabilitados en producción.

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
