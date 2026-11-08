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

  const openaiMessages = [
    ...system.map((content) => ({ role: "system", content })),
    ...contents.map((item) => ({
      role: item.role === "model" ? "assistant" : "user",
      content: item.parts.map((part) => part.text || "").join("\n"),
    })),
  ];

  return { system, contents, openaiMessages };
}

// Cloudflare Pages supports D1 bindings, unlike Workers-only rate-limit bindings.
// Each UPSERT is atomic in SQLite. Rate limits fail closed if D1 is unavailable.
async function enforcePrismaRateLimits(env, request, provider) {
  const db = env.PRISMA_RATE_DB;
  if (!db?.prepare) return {status:503, error:"El limitador de Prisma aún no está enlazado con Cloudflare D1."};

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const minute = Math.floor(Date.now() / 60000);
  const dayStart = Math.floor(minute / 1440) * 1440;
  const scopes = [
    ["ip-minute:" + key, minute, 6],
    ["ip-day:" + key, dayStart, 15],
    ["provider-day:" + provider, dayStart, provider === "huggingface" ? 10 : 50],
    ["total-day", dayStart, 60],
  ];
  const sql = `INSERT INTO ai_rate_limits(scope, window_start, request_count)
VALUES (?, ?, 1)
ON CONFLICT(scope, window_start) DO UPDATE
SET request_count = request_count + 1
WHERE request_count < ?
RETURNING request_count`;
  try {
    for (const [scope, windowStart, max] of scopes) {
      const row = await db.prepare(sql).bind(scope, windowStart, max).first();
      if (!row) return {status:429, error:"Has alcanzado el límite gratuito temporal de Prisma. Vuelve a intentarlo más tarde."};
    }
    // Keep only the last three days; cleanup is occasional to save writes.
    if (Math.random() < 0.02) {
      await db.prepare("DELETE FROM ai_rate_limits WHERE window_start < ?").bind(minute - 4320).run().catch(() => {});
    }
  } catch (error) {
    console.error("Prisma rate limit D1 error", error?.message || error);
    return {status:503, error:"No se pudo comprobar el límite de solicitudes. Inténtalo de nuevo más tarde."};
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin !== requestUrl.origin) {
    return json({ error: "Solicitud no autorizada para este origen." }, 403);
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

  const provider = String(payload.provider || "gemini");
  if (!["gemini", "huggingface"].includes(provider)) {
    return json({ error: "Este proveedor todavía no está habilitado en el backend central." }, 501);
  }

  let normalized;
  try {
    normalized = normalizeMessages(payload.messages);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const limitError = await enforcePrismaRateLimits(env, request, provider);
  if (limitError) return json({error:limitError.error}, limitError.status);

  if (provider === "huggingface") {
    if (!env.HF_TOKEN) {
      return json({ error: "Hugging Face todavía no está configurado en los secretos de Cloudflare." }, 503);
    }

    const model = "openai/gpt-oss-20b:cheapest";
    const body = {
      model,
      messages: normalized.openaiMessages,
      temperature: Math.max(0, Math.min(1.2, Number(payload.temperature ?? 0.7))),
      max_tokens: clamp(payload.maxOutputTokens, 128, 1200, 900),
      stream: false,
    };

    let response;
    try {
      response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + env.HF_TOKEN,
        },
        body: JSON.stringify(body),
      });
    } catch {
      return json({ error: "No fue posible conectar con Hugging Face. Inténtalo nuevamente." }, 502);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(data.error?.message || data.error || "").slice(0, 240);
      let message = "Hugging Face respondió con un error (" + response.status + ").";
      if (response.status === 401 || response.status === 403) {
        message = "El token de Hugging Face no tiene permiso para llamar a Inference Providers. Revisa sus permisos.";
      } else if (response.status === 402) {
        message = "Hugging Face no tiene créditos disponibles para esta solicitud. El plan gratuito incluye un crédito mensual limitado; no se activará una recarga automática.";
      } else if (response.status === 429) {
        message = "Hugging Face o el proveedor seleccionado alcanzó su límite temporal. Prisma podrá intentar otro motor disponible.";
      }
      return json({ error: message, provider: "huggingface", status: response.status, detail: providerMessage }, response.status === 402 || response.status === 429 ? response.status : 502);
    }

    const text = String(data.choices?.[0]?.message?.content || "").trim();
    if (!text) return json({ error: "Hugging Face no devolvió texto. Comprueba la disponibilidad del modelo." }, 502);

    return json({
      ok: true,
      provider: "huggingface",
      model,
      text,
      usage: data.usage || null,
    });
  }

  if (!env.GEMINI_API_KEY) {
    return json({ error: "Gemini todavía no está configurado en los secretos de Cloudflare." }, 503);
  }

  const model = String(payload.model || env.GEMINI_TEXT_MODEL || "gemini-3.8-flash");
  const allowedModels = new Set(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  if (!allowedModels.has(model)) {
    return json({ error: "El modelo solicitado no está habilitado para el uso compartido de Prisma." }, 400);
  }

  // Gemini 3.8 Flash rejects legacy sampling fields such as temperature.
  const generationConfig = {
    maxOutputTokens: clamp(payload.maxOutputTokens, 128, 4096, 2048),
  };
  const body = {
    contents: normalized.contents,
    generationConfig,
  };
  if (normalized.system.length) {
    body.systemInstruction = { parts: [{ text: normalized.system.join("\n\n").slice(0, 12000) }] };
  }

  const askGemini = targetModel => fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(targetModel) + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  let response, data, activeModel = model;
  try {
    response = await askGemini(activeModel);
    data = await response.json().catch(() => ({}));
    if (model === "gemini-3.8-flash" && [502, 503].includes(response.status)) {
      // The higher-capability model can be temporarily overloaded; use a lower-cost model.
      activeModel = "gemini-3.5-flash-lite";
      response = await askGemini(activeModel);
      data = await response.json().catch(() => ({}));
    }
  } catch {
    return json({ error: "No fue posible conectar con Google Gemini. Inténtalo nuevamente." }, 502);
  }
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
    model: activeModel,
    text,
    usage: data.usageMetadata || null,
  });
}
