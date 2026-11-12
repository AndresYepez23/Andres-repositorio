const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("Origin") !== requestUrl.origin) {
    return json({ error: "Solicitud no autorizada para este origen." }, 403);
  }

  // Use one account key only. Additional keys are not rotated to bypass
  // account quotas or provider rate limits.
  const apiKey = String(env.TAVILY_API_KEY || "").trim();
  if (!apiKey) {
    return json({ error: "La investigación web todavía no está configurada en Prisma." }, 503);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 12000) return json({ error: "La consulta supera el tamaño permitido." }, 413);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: "La consulta supera el tamaño permitido." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "La solicitud no contiene JSON válido." }, 400);
  }

  const query = String(payload.query || "").trim();
  if (query.length < 4 || query.length > 1000) {
    return json({ error: "La consulta debe contener entre 4 y 1.000 caracteres." }, 400);
  }

  let response;
  try {
    response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false
      }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    console.error("Tavily search network error", String(error?.message || error).slice(0, 180));
    return json({ error: "Tavily no respondió. Prisma puede continuar con sus motores habituales." }, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await refundFailedProviderUsage(env, "tavily");
    const status = response.status;
    const detail = String(data.detail || data.message || data.error || "").slice(0, 180);
    const message = status === 401 || status === 403
      ? "Tavily rechazó la clave configurada. Comprueba TAVILY_API_KEY en Cloudflare."
      : status === 429
        ? "Tavily alcanzó un límite temporal. Prisma puede responder con sus motores habituales."
        : status === 432 || status === 433
          ? "Tavily agotó los créditos disponibles de esta clave."
          : "Tavily no pudo completar la búsqueda (" + status + ").";
    return json({ error: message, status, detail }, status === 429 ? 429 : 502);
  }

  const results = Array.isArray(data.results) ? data.results.slice(0, 5).map(item => ({
    title: String(item.title || "").slice(0, 300),
    url: String(item.url || "").slice(0, 1500),
    content: String(item.content || "").slice(0, 2200),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
    published_date: String(item.published_date || "").slice(0, 50)
  })).filter(item => /^https?:\/\//i.test(item.url) && item.content) : [];

  if (!results.length) {
    return json({ ok: true, provider: "tavily", query, results: [], usage: data.usage || null });
  }

  return json({
    ok: true,
    provider: "tavily",
    query,
    results,
    usage: data.usage || null
  });
}
