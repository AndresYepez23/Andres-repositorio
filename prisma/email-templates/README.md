# Correos de Prisma Space · Aurora adaptable

Las plantillas de Prisma Space usan fondo claro predeterminado y una variante oscura declarada mediante CSS. **No declarar `color-scheme: dark` como único tema**: Gmail para iOS invierte los colores de los mensajes originales oscuros y los muestra claros cuando el teléfono está en modo oscuro.

- **Claro:** superficie `#f3f6fb`, tarjeta `#ffffff`, títulos `#1a2d46`, acento `#287f9c`.
- **Oscuro:** superficie `#0e121d`, tarjeta `#161d2b`, títulos `#f4f7fc`, acento `#91dbd5`.
- En Apple Mail y otros clientes compatibles se usa `@media (prefers-color-scheme: dark)`.
- En Gmail para iOS, el cliente controla la conversión y puede invertir el diseño base claro; hay que comprobarlo con un envío real. **No utilizar `color-scheme: light only`** aquí, porque desactivaría la adaptación oscura de Gmail para las cuentas Google.
- Botones, textos y fondos tienen contraste propio en el tema claro, sin necesitar CSS externo.

## Plantillas Supabase Auth

Supabase Auth crea el enlace seguro; Resend SMTP entrega el correo. El conector Supabase conectado no permite escribir las plantillas alojadas, así que hay que actualizar el HTML desde **Supabase → Authentication → Email Templates**.

| Tipo | Asunto | Archivo |
|---|---|---|
| Confirm signup | Confirma tu correo para activar Prisma Space | `confirmation.html` |
| Reset password | Restablece tu contraseña de Prisma Space | `recovery.html` |
| Invite user | Has recibido una invitación para unirte a Prisma Space | `invite-user.html` |

El enlace de cuenta **debe conservar** `{{ .ConfirmationURL }}` en los tres HTML. No permitir que el proveedor modifique enlaces con click tracking.

## Bienvenida automática

La bienvenida se genera por `functions/_lib/welcome-email.js`, se envía después de confirmar una cuenta y se evita duplicar a través de D1. La nueva presentación adaptable sustituye solo el HTML; las validaciones y la lógica de envío permanecen intactas. Resend usa `no-reply@prismaspace.space`.

## Invitaciones directas

`invite-user.html` es la plantilla de **Supabase Auth** con enlace único. No enviar por Resend de forma aislada sin generar antes un enlace real de Supabase. Las invitaciones simples por Resend apuntan al registro normal en Prisma Space.
