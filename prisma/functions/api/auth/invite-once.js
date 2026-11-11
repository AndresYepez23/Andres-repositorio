const RECIPIENTS = Object.freeze([
  "pachecoaura75@gmail.com",
  "ayepeza@unicartagena.edu.co"
]);

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }
});

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderInvite(actionLink) {
  const safeLink = escapeHtml(actionLink);
  const html = [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="dark"><title>Tu invitación · Prisma Space</title></head>',
    '<body style="margin:0;padding:0;background:#0e121d;font-family:Arial,Helvetica,sans-serif;color:#f0f4fb;">',
    '<div style="display:none;font-size:1px;color:#0e121d;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Has sido invitado a formar parte de Prisma Space. Acepta tu invitación y comienza.</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#0e121d;"><tr><td align="center" style="padding:32px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #2b3a50;border-radius:20px;border-collapse:separate;border-spacing:0;background:#161d2b;overflow:hidden;">',
    '<tr><td height="4" bgcolor="#91dbd5" style="height:4px;background:#91dbd5;background-image:linear-gradient(90deg,#91dbd5 0%,#84bce9 56%,#b9a3f1 100%);font-size:0;line-height:0;">&nbsp;</td></tr>',
    '<tr><td style="padding:30px 34px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    '<td valign="middle" style="padding-right:12px;"><img src="https://prismaspace.space/assets/prisma-192.png" width="42" height="42" alt="Prisma Space" style="display:block;width:42px;height:42px;border:0;"></td>',
    '<td valign="middle"><div style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:2px;color:#f0f4fb;">PRISMA SPACE</div><div style="font-size:10px;line-height:15px;letter-spacing:1.2px;color:#91dbd5;">TU ESPACIO DIGITAL</div></td>',
    '</tr></table></td></tr>',
    '<tr><td style="padding:26px 34px 10px;">',
    '<div style="display:inline-block;padding:7px 11px;border:1px solid #385365;border-radius:999px;background:#1e303b;color:#91dbd5;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.2px;">INVITACIÓN ESPECIAL</div>',
    '<h1 style="margin:20px 0 14px;font-size:30px;line-height:1.18;letter-spacing:-.7px;font-weight:700;color:#f4f7fc;">Hay un espacio esperándote.</h1>',
    '<p style="margin:0 0 14px;font-size:15px;line-height:25px;color:#b8c5d7;">Has recibido una invitación para formar parte de <strong style="color:#91dbd5;">Prisma Space</strong>, un espacio digital diseñado para explorar, crear y trabajar con inteligencia artificial.</p>',
    '<p style="margin:0;font-size:15px;line-height:25px;color:#b8c5d7;">Acepta la invitación para activar tu acceso y comenzar a descubrir todo lo que Prisma tiene preparado.</p>',
    '</td></tr>',
    '<tr><td style="padding:14px 34px 28px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#91dbd5" style="border-radius:11px;background:#91dbd5;background-image:linear-gradient(105deg,#91dbd5 0%,#84bce9 56%,#b9a3f1 100%);">',
    '<a href="' + safeLink + '" style="display:inline-block;padding:14px 23px;border-radius:11px;color:#11202e;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">Aceptar mi invitación</a>',
    '</td></tr></table>',
    '<p style="margin:20px 0 8px;font-size:12px;line-height:20px;color:#a4b1c4;">Si el botón no funciona, abre este enlace desde tu navegador:</p>',
    '<p style="margin:0;word-break:break-all;font-size:11px;line-height:19px;"><a href="' + safeLink + '" style="color:#91dbd5;text-decoration:underline;">' + safeLink + '</a></p>',
    '<p style="margin:18px 0 0;font-size:12px;line-height:20px;color:#8291a8;">Si no esperabas esta invitación, puedes ignorar este mensaje.</p>',
    '</td></tr>',
    '<tr><td style="padding:20px 34px 25px;border-top:1px solid #2b3a50;"><p style="margin:0;font-size:11px;line-height:18px;color:#8291a8;">PRISMA SPACE · CUENTA Y SEGURIDAD</p></td></tr>',
    '</table><p style="margin:18px 0 0;font-size:10px;line-height:16px;color:#6f7f96;">Un correo automático de Prisma Space.</p>',
    '</td></tr></table></body></html>'
  ].join("");
  const text = [
    "Has recibido una invitación para unirte a Prisma Space.",
    "",
    "Acepta tu invitación y activa tu acceso:",
    actionLink,
    "",
    "Si no esperabas esta invitación, puedes ignorar este mensaje."
  ].join("\n");
  return { html, text };
}

export async function handleInviteOnce({ request, env }, fetcher = fetch) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const expected = String(env.PRISMA_INVITE_ONCE_TOKEN || "");
  const provided = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!safeEqual(provided, expected)) return json({ ok: false, error: "unauthorized" }, 401);

  const supabaseUrl = String(env.PRISMA_SUPABASE_URL || "").replace(/\/+$/, "");
  const adminKey = String(env.SUPABASE_SERVICE_ROLE_KEY_2 || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const resendKey = String(env.RESEND_API_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || !adminKey || !resendKey) {
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  const adminHeaders = { apikey: adminKey, "Content-Type": "application/json" };
  if (!adminKey.startsWith("sb_secret_")) adminHeaders.Authorization = "Bearer " + adminKey;

  const requestId = crypto.randomUUID();
  const results = [];

  for (let index = 0; index < RECIPIENTS.length; index++) {
    const email = RECIPIENTS[index];
    let generated;
    try {
      const response = await fetcher(supabaseUrl + "/auth/v1/admin/generate_link", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          type: "invite",
          email,
          options: { redirectTo: "https://prismaspace.space/" }
        })
      });
      generated = await response.json().catch(() => ({}));
      if (!response.ok) {
        results.push({ email, status: "link_error", httpStatus: response.status, message: String(generated.msg || generated.message || generated.error || "Supabase could not generate the invitation").slice(0, 180) });
        continue;
      }
    } catch {
      results.push({ email, status: "link_error", message: "Supabase Auth is temporarily unavailable" });
      continue;
    }

    const actionLink = generated?.properties?.action_link || generated?.action_link;
    if (typeof actionLink !== "string" || !actionLink.startsWith(supabaseUrl + "/auth/v1/verify")) {
      results.push({ email, status: "link_error", message: "Supabase returned an invalid invitation link" });
      continue;
    }

    const { html, text } = renderInvite(actionLink);
    try {
      const delivery = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "prisma-invite-" + requestId + "-" + index
        },
        body: JSON.stringify({
          from: "Prisma Space <no-reply@prismaspace.space>",
          to: [email],
          subject: "Has recibido una invitación para unirte a Prisma Space",
          html,
          text,
          tags: [{ name: "category", value: "invitation" }]
        })
      });
      const sent = await delivery.json().catch(() => ({}));
      if (!delivery.ok) {
        results.push({ email, status: "send_error", httpStatus: delivery.status, message: String(sent.message || sent.error || "Resend rejected the email").slice(0, 180) });
      } else {
        results.push({ email, status: "sent", resendId: sent.id || null });
      }
    } catch {
      results.push({ email, status: "send_error", message: "Resend is temporarily unavailable" });
    }
  }

  return json({ ok: results.every(item => item.status === "sent"), results });
}

export function onRequestPost(context) {
  return handleInviteOnce(context, fetch);
}
