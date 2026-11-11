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
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>'+
 '<body style="margin:0;padding:0;background:#0e121d;font-family:Arial,Helvetica,sans-serif;color:#f0f4fb;">'+
 '<div style="display:none;font-size:1px;color:#0e121d;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Tu cuenta de Prisma Space ya está activa. Tu espacio te espera.</div>'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0e121d;"><tr><td align="center" style="padding:32px 12px;">'+
 '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #2b3a50;border-radius:20px;border-collapse:separate;border-spacing:0;background:#161d2b;overflow:hidden;">'+
 '<tr><td height="4" bgcolor="#91dbd5" style="height:4px;background:#91dbd5;background-image:linear-gradient(90deg,#91dbd5 0%,#84bce9 56%,#b9a3f1 100%);font-size:0;line-height:0;">&nbsp;</td></tr>'+
 '<tr><td style="padding:30px 34px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
 '<td valign="middle" style="padding-right:12px;"><img src="https://prismaspace.space/assets/prisma-192.png" width="42" height="42" alt="Prisma Space" style="display:block;width:42px;height:42px;border:0;outline:none;"></td>'+
 '<td valign="middle"><div style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:2px;color:#f0f4fb;">PRISMA SPACE</div><div style="font-size:10px;line-height:15px;letter-spacing:1.2px;color:#91dbd5;">TU ESPACIO DIGITAL</div></td>'+
 '</tr></table></td></tr>'+
 '<tr><td style="padding:26px 34px 10px;">'+
 '<div style="display:inline-block;padding:7px 11px;border:1px solid #385365;border-radius:999px;background:#1e303b;color:#91dbd5;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.2px;">CUENTA ACTIVADA</div>'+
 '<h1 style="margin:20px 0 14px;font-size:30px;line-height:1.18;letter-spacing:-.7px;font-weight:700;color:#f4f7fc;">Tu espacio ya está listo.</h1>'+
 '<p style="margin:0 0 14px;font-size:16px;line-height:25px;color:#d9e2ef;">'+greeting+'</p>'+
 '<p style="margin:0 0 14px;font-size:15px;line-height:25px;color:#b8c5d7;">Tu cuenta de Prisma Space está activa. Ya puedes entrar, guardar tus preferencias y decidir cuándo quieres sincronizar tus conversaciones entre dispositivos.</p>'+
 '</td></tr>'+
 '<tr><td style="padding:14px 34px 28px;">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#91dbd5" style="border-radius:11px;background:#91dbd5;background-image:linear-gradient(105deg,#91dbd5 0%,#84bce9 56%,#b9a3f1 100%);">'+
 '<a href="https://prismaspace.space/" style="display:inline-block;padding:14px 23px;border-radius:11px;color:#11202e;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">Entrar a Prisma Space</a>'+
 '</td></tr></table>'+
 '<p style="margin:20px 0 0;font-size:13px;line-height:21px;color:#a4b1c4;">La sincronización es opcional: tus conversaciones no se comparten hasta que tú la actives.</p>'+
 '</td></tr>'+
 '<tr><td style="padding:20px 34px 25px;border-top:1px solid #2b3a50;">'+
 '<p style="margin:0;font-size:11px;line-height:18px;color:#8291a8;">Este mensaje confirma la activación de tu cuenta. Si no reconoces este registro, puedes ignorar este correo.</p>'+
 '</td></tr></table>'+
 '<p style="margin:18px 0 0;font-size:10px;line-height:16px;color:#6f7f96;">PRISMA SPACE · CUENTA Y SEGURIDAD</p>'+
 '</td></tr></table></body></html>';
 return {html,text};
}
