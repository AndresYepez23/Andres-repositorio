const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 24) {
    throw new Error("La conversación debe incluir entre 1 y 24 mensajes.");
  }

  const system = [];
  const contents = [];
  let totalChars = 0;

  for (const item of input) {
    const role = String(item?.role || "");
    const content = String(item?.content || "");
    if (!["system", "user", "assistant", "model"].includes(role)) continue;
    if (!content.trim()) continue;

    totalChars += content.length;
    if (totalChars > 30000) throw new Error("El contexto supera el límite permitido de 30.000 caracteres.");

    if (role === "system") {
      system.push(content.slice(0, 12000));
      continue;
    }

    const mappedRole = role === "assistant" || role === "model" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === mappedRole) last.parts[0].text += "\n\n" + content;
    else contents.push({ role: mappedRole, parts: [{ text: content }] });
  }

  if (!contents.length || contents[0].role !== "user") {
    throw new Error("La solicitud debe comenzar con un mensaje del usuario.");
  }

  return { system, contents };
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin !== requestUrl.origin) {
    return json({ error: "Solicitud no autorizada para este origen." }, 403);
  }

  if (!env.PRISMA_AI_LIMITER?.limit) {
    return json({ error: "La protección de uso de Prisma todavía no está configurada." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = await env.PRISMA_AI_LIMITER.limit({ key: ip + ":ai-chat" });
  if (!limit.success) {
    return json({ error: "Has alcanzado el límite temporal de solicitudes. Espera un minuto e inténtalo de nuevo." }, 429);
  }

  if (!env.GEMINI_API_KEY) {
    return json({ error: "Gemini todavía no está configurado en los secretos de Cloudflare." }, 503);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 50000) return json({ error: "La solicitud supera el tamaño permitido." }, 413);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 50000) return json({ error: "La solicitud supera el tamaño permitido." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "El cuerpo de la solicitud no es JSON válido." }, 400);
  }

  if (payload.provider && payload.provider !== "gemini") {
    return json({ error: "Este proveedor todavía no está habilitado en el backend central." }, 501);
  }

  let normalized;
  try {
    normalized = normalizeMessages(payload.messages);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const model = String(payload.model || env.GEMINI_TEXT_MODEL || "gemini-3.8-flash");
  const allowedModels = new Set(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  if (!allowedModels.has(model)) {
    return json({ error: "El modelo solicitado no está habilitado para el uso compartido de Prisma." }, 400);
  }

  const generationConfig = {
    temperature: Math.max(0, Math.min(1.2, Number(payload.temperature ?? 0.7))),
    maxOutputTokens: clamp(payload.maxOutputTokens, 128, 4096, 2048),
  };
  const body = {
    contents: normalized.contents,
    generationConfig,
  };
  if (normalized.system.length) {
    body.systemInstruction = { parts: [{ text: normalized.system.join("\n\n").slice(0, 12000) }] };
  }

  let response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ error: "No fue posible conectar con Google Gemini. Inténtalo nuevamente." }, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = String(data.error?.message || "").slice(0, 300);
    const message = response.status === 429
      ? "Gemini alcanzó su cuota o límite temporal. Prisma podrá probar otro motor cuando esté conectado."
      : "Gemini respondió con un error (" + response.status + ")." + (providerMessage ? " " + providerMessage : "");
    return json({ error: message, provider: "gemini", status: response.status }, response.status === 429 ? 429 : 502);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("").trim();
  if (!text) return json({ error: "Gemini no devolvió texto. Comprueba el modelo y sus límites." }, 502);

  return json({
    ok: true,
    provider: "gemini",
    model,
    text,
    usage: data.usageMetadata || null,
  });
}
