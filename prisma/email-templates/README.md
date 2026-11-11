# Correos de Prisma Space · Aurora

Los correos de cuenta usan la identidad Prisma Space Aurora: azul noche `#0e121d`, superficies `#161d2b`, turquesa `#91dbd5`, azul `#84bce9` y violeta `#b9a3f1`. El diseño usa tablas e CSS en línea para clientes de correo, sin fuentes externas ni scripts.

## Plantillas de Supabase Auth

El proyecto alojado debe recibir estas plantillas desde **Supabase → Authentication → Email Templates**. El conector de Supabase disponible permite consultar el proyecto y la base de datos, pero no expone el endpoint de configuración de Auth; por eso estos dos HTML se conservan aquí como fuente de verdad para pegarlos en el panel.

### Confirm signup
- Subject: `Confirma tu correo para activar Prisma Space`
- HTML: copiar el contenido completo de `confirmation.html`.

### Reset password
- Subject: `Restablece tu contraseña de Prisma Space`
- HTML: copiar el contenido completo de `recovery.html`.

No reemplazar `{{ .ConfirmationURL }}`: Supabase la genera para cada solicitud. No activar el tracking de enlaces/clics en el proveedor porque puede modificar enlaces de un solo uso.

## Welcome email independiente

El correo de bienvenida se envía automáticamente cuando una cuenta nueva queda verificada (o al crearla si la confirmación está deshabilitada). El endpoint valida el token de Supabase, toma el correo del usuario autenticado —nunca del cuerpo de la petición— y usa una clave de idempotencia más D1 para evitar duplicados.

- From: `Prisma Space <no-reply@prismaspace.space>`
- Subject: `Tu espacio en Prisma Space ya está listo`
- Servicio: Resend, dominio `prismaspace.space` verificado.
- Credencial: secreto `RESEND_API_KEY` en Cloudflare Pages, limitado al envío desde el dominio verificado; nunca se guarda en Git.
- Se envía una sola vez por usuario.
- La sincronización se describe como opcional; no se afirma que esté activada automáticamente.
