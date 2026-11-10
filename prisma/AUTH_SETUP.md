# Prisma Space · Acceso, usuarios y proveedores de identidad

Estado revisado: noviembre de 2026.

## Infraestructura ya existente
- Supabase exclusivo de Prisma Space: proyecto `hyoxywiwhnhfekakhivp` (`https://hyoxywiwhnhfekakhivp.supabase.co`).
- Entornos Cloudflare Pages `prismaspace` y `prisma-main`: URL y clave **pública** de Prisma configuradas y comprobadas en producción y preview.
- Tablas `public.prisma_profiles`, `public.prisma_conversations` y `public.core_conversations`; las dos primeras se utilizan para la cuenta y la sincronización.
- Acceso por correo y contraseña y sesión persistente de Supabase (requiere probar el correo de confirmación con una cuenta real).
- Las tablas de perfil y conversaciones protegen sus registros mediante RLS con `auth.uid() = user_id`, verificado.
- Los usuarios registrados viven en `auth.users`, no en una tabla pública con contraseñas.
- **No colocar** clave `service_role` de Supabase en variables expuestas al navegador, en GitHub ni en el JavaScript.
- La sincronización de conversaciones es voluntaria; los mensajes locales siguen en el dispositivo hasta que el usuario la autorice.

## Inicio de sesión y registro
1. Desde el menú de perfil, pulsa «Iniciar sesión o crear cuenta».
2. Google, Apple, teléfono (cuando el proveedor esté realmente configurado), o «Continuar con correo electrónico».
3. Correo: «Iniciar sesión» admite contraseñas creadas en la interfaz previa; «Crear cuenta» exige al menos 8 caracteres y confirmación.
4. Si está activo Confirm Email, el nuevo usuario confirma por correo antes de entrar.
5. Recuperar contraseña envía un enlace y presenta el formulario de actualización cuando Supabase entrega el evento `PASSWORD_RECOVERY`.
6. Una sesión válida crea/recupera la fila `prisma_profiles` bajo RLS y abre «Tu cuenta» para modificar el nombre.
7. La bienvenida no activa la sincronización de mensajes por defecto.

## Importante: proveedores externos pendientes
El código de Prisma ya utiliza `signInWithOAuth` para Google/Apple y `signInWithOtp` + `verifyOtp` para SMS, pero **no** hay credenciales de esos proveedores en Supabase. Los botones se mantienen deshabilitados hasta su configuración real.

### Google
- En Google Cloud Console → Google Auth Platform, crea una aplicación y un cliente OAuth de tipo «Web application». Requiere pantalla de consentimiento y audiencia apropiadas.
- Authorized JavaScript origins: `https://prismaspace.pages.dev` (y cualquier dominio final confirmado).
- Authorized redirect URI para el cliente OAuth: `https://hyoxywiwhnhfekakhivp.supabase.co/auth/v1/callback`.
- En Supabase Prisma → Authentication → Providers → Google, habilita Google con **Client ID** y **Client Secret** en el dashboard. Nunca pegues el secreto en el código de Prisma.
- En Supabase → Authentication → URL Configuration, establece Site URL y Redirect URLs permitidas: `https://prismaspace.pages.dev/**` y, solo si se necesita, `https://prisma-main.pages.dev/**`.
- **Después de probar el OAuth de extremo a extremo**, configura `PRISMA_AUTH_GOOGLE_ENABLED=1` en los entornos correspondientes de Cloudflare Pages y despliega. Antes debe seguir deshabilitado.

### Apple
- Requiere acceso a Apple Developer, App ID, Services ID para la web, Team ID y clave de firma privada `.p8`.
- Configura Sign in with Apple para web con el Services ID y el callback de Supabase `https://hyoxywiwhnhfekakhivp.supabase.co/auth/v1/callback`.
- Registra el proveedor Apple en Authentication → Providers → Apple del proyecto **Prisma**, con credenciales guardadas solo en el dashboard.
- Apple exige rotar el secreto del flujo OAuth aproximadamente cada 6 meses: documentar la fecha y planificar la renovación.
- Cuando la prueba OAuth funcione, configura `PRISMA_AUTH_APPLE_ENABLED=1` en Cloudflare.

### Teléfono (OTP SMS)
- Requiere un proveedor SMS admitido por Supabase (por ejemplo Twilio o Vonage), cuenta activa y capacidad de envío internacional a los países objetivo.
- En Supabase Prisma → Authentication → Providers → Phone habilita Phone y configura el proveedor SMS, sus claves y límites antifraude.
- Comprueba precio y cobertura antes de habilitar registro telefónico: **cada intento puede generar un coste**.
- Cuando el envío y verificación de SMS estén confirmados, configura `PRISMA_AUTH_PHONE_ENABLED=1` en Cloudflare.
- No se habilita SMS con un «simulacro», mensajes de prueba falsos ni códigos generados localmente.

## Correo de confirmación y recuperación
- El proyecto puede enviar emails con la configuración básica de Supabase, pero esa capacidad suele tener cuotas pequeñas y no es apropiada para lanzamiento masivo.
- Para correo real al público, verifica un dominio propio de Prisma y configura SMTP mediante un proveedor como Resend, separado de OdontoUdeC.
- Revisa autenticación SPF/DKIM/DMARC del dominio y las plantillas Confirm Signup y Reset Password; nunca metas las credenciales SMTP en el frontend.
- En Supabase → Authentication → Providers → Email revisa Confirm Email, tasa de envío y reglas de contraseña.
- En los avisos de seguridad se detectó que «Leaked Password Protection» no estaba habilitado. Actívalo cuando esté disponible según el plan del proyecto.

## Validación obligatoria antes de anunciar que todos los métodos funcionan
- Email: crear cuenta, recibir confirmación, abrir enlace, ver bienvenida y perfil real.
- Email: iniciar sesión existente de la versión anterior, cerrar sesión, recuperar contraseña, comprobar persistencia tras cerrar la PWA.
- Google y Apple: autorización real, retorno a Prisma y acceso a perfil sin duplicar cuentas.
- SMS: envío de OTP real, rechazo de código incorrecto, verificación de correcto, limites de reintentos.
- Base: verificar RLS para dos usuarios distintos; sin acceso cruzado a conversaciones/perfiles.
- iPhone PWA y escritorio: comprobar teclado, scroll del formulario, safe areas, redirecciones OAuth y sesión.
- Nunca activar métodos externos en Cloudflare basándose únicamente en que el botón se renderiza.
