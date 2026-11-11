function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[char]);
}
function safeDisplayName(user){
 return String(user?.user_metadata?.full_name||user?.user_metadata?.name||'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ').trim().slice(0,60);
}
export function renderWelcomeEmail(user){
 const name=safeDisplayName(user);
 const greeting=name?'Hola '+escapeHtml(name)+',':'Hola,';
 const plainGreeting=name?'Hola '+name+',\n\n':'';
 const text=plainGreeting+
  'Tu cuenta de Prisma Space ya está activa.\n\n'+
  'Puedes entrar a tu espacio, guardar tus preferencias y elegir si quieres sincronizar tus conversaciones entre dispositivos.\n\n'+
  'La sincronización es opcional: tus conversaciones no se comparten hasta que tú la actives.\n\n'+
  'Entrar a Prisma Space: https://prismaspace.space/\n\n'+
  'Prisma Space · Cuenta y seguridad';
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style type="text/css">:root{color-scheme:light dark;supported-color-schemes:light dark}@media (prefers-color-scheme:dark){.aurora-outer{background-color:#0e121d!important;background:#0e121d!important}.aurora-card{background-color:#161d2b!important;background:#161d2b!important;border-color:#2b3a50!important}.aurora-heading{color:#f0f4fb!important}.aurora-title{color:#f4f7fc!important}.aurora-copy{color:#b8c5d7!important}.aurora-secondary{color:#a4b1c4!important}.aurora-muted{color:#8291a8!important}.aurora-caption{color:#708198!important}.aurora-accent{color:#91dbd5!important}.aurora-badge{background:#1e303b!important;border-color:#385365!important}.aurora-line{border-color:#2b3a50!important}.aurora-stripe{background:#91dbd5!important;background-image:linear-gradient(90deg,#91dbd5,#84bce9,#b9a3f1)!important}.aurora-button{background:#91dbd5!important;background-image:linear-gradient(105deg,#91dbd5,#84bce9,#b9a3f1)!important}.aurora-button-label{color:#11202e!important}.aurora-preheader{color:#0e121d!important}}@media only screen and (max-width:600px){.aurora-content{padding-left:22px!important;padding-right:22px!important}}</style></head>'+
 '<body class="aurora-outer aurora-heading" style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#21364e;">'+
 '<div class="aurora-preheader" style="display:none;font-size:1px;color:#f3f6fb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Tu cuenta de Prisma Space ya está activa. Tu espacio te espera.</div>'+
 '<table class="aurora-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f6fb;"><tr><td align="center" style="padding:32px 12px;">'+
 '<table class="aurora-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #dbe4ef;border-radius:20px;border-collapse:separate;border-spacing:0;background:#ffffff;overflow:hidden;">'+
 '<tr><td class="aurora-stripe" height="4" bgcolor="#287f9c" style="height:4px;background:#287f9c;background-image:linear-gradient(90deg,#287f9c 0%,#507ac5 56%,#746ac4 100%);font-size:0;line-height:0;">&nbsp;</td></tr>'+
 '<tr><td class="aurora-content" style="padding:30px 34px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
 '<td valign="middle" style="padding-right:12px;"><img src="https://prismaspace.space/assets/prisma-192.png" width="42" height="42" alt="Prisma Space" style="display:block;width:42px;height:42px;border:0;outline:none;"></td>'+
 '<td valign="middle"><div class="aurora-heading" style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:2px;color:#21364e;">PRISMA SPACE</div><div class="aurora-accent" style="font-size:10px;line-height:15px;letter-spacing:1.2px;color:#287f9c;">TU ESPACIO DIGITAL</div></td>'+
 '</tr></table></td></tr>'+
 '<tr><td class="aurora-content" style="padding:26px 34px 10px;">'+
 '<div class="aurora-accent aurora-badge" style="display:inline-block;padding:7px 11px;border:1px solid #bedfdf;border-radius:999px;background:#e8f6f5;color:#287f9c;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.2px;">CUENTA ACTIVADA</div>'+
 '<h class="aurora-title"1 style="margin:20px 0 14px;font-size:30px;line-height:1.18;letter-spacing:-.7px;font-weight:700;color:#1a2d46;">Tu espacio ya está listo.</h1>'+
 '<p style="margin:0 0 14px;font-size:16px;line-height:25px;color:#d9e2ef;">'+greeting+'</p>'+
 '<p class="aurora-copy" style="margin:0 0 14px;font-size:15px;line-height:25px;color:#53677c;">Tu cuenta de Prisma Space está activa. Ya puedes entrar, guardar tus preferencias y decidir cuándo quieres sincronizar tus conversaciones entre dispositivos.</p>'+
 '</td></tr>'+
 '<tr><td class="aurora-content" style="padding:14px 34px 28px;">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="aurora-button" align="center" bgcolor="#287f9c" style="border-radius:11px;background:#287f9c;background-image:linear-gradient(105deg,#287f9c 0%,#507ac5 56%,#746ac4 100%);">'+
 '<a class="aurora-button-label" href="https://prismaspace.space/" style="display:inline-block;padding:14px 23px;border-radius:11px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">Entrar a Prisma Space</a>'+
 '</td></tr></table>'+
 '<p class="aurora-secondary" style="margin:20px 0 0;font-size:13px;line-height:21px;color:#63748a;">La sincronización es opcional: tus conversaciones no se comparten hasta que tú la actives.</p>'+
 '</td></tr>'+
 '<tr><td class="aurora-line" style="padding:20px 34px 25px;border-top:1px solid #dbe4ef;">'+
 '<p class="aurora-muted" style="margin:0;font-size:11px;line-height:18px;color:#6e8098;">Este mensaje confirma la activación de tu cuenta. Si no reconoces este registro, puedes ignorar este correo.</p>'+
 '</td></tr></table>'+
 '<p class="aurora-caption" style="margin:18px 0 0;font-size:10px;line-height:16px;color:#76869c;">PRISMA SPACE · CUENTA Y SEGURIDAD</p>'+
 '</td></tr></table></body></html>';
 return {html,text};
}
