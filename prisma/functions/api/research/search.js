const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function tavilyKeys(env) {
  const keys = [];
  for (let index = 1; index <= 7; index++) {
    const key = String(env?.["TAVILY_API_KEY" + (index === 1 ? "" : "_" + index)] || "").trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function normalizeTavilyResults(data) {
  return (Array.isArray(data?.results) ? data.results : []).slice(0, 8).map(item => ({
    title: String(item.title || "Fuente web").slice(0, 300),
    url: String(item.url || "").slice(0, 1500),
    content: String(item.content || item.raw_content || "").slice(0, 3000),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
    published_date: String(item.published_date || item.publishedDate || "").slice(0, 50)
  })).filter(item => /^https?:\/\//i.test(item.url) && item.content);
}

function normalizeJinaResults(data) {
  const raw = data?.data;
  const entries = Array.isArray(raw) ? raw : Array.isArray(data?.results) ? data.results : [];
  const normalized = entries.map(item => ({
    title: String(item.title || item.metadata?.title || "Fuente web").slice(0, 300),
    url: String(item.url || item.link || item.metadata?.url || "").slice(0, 1500),
    content: String(item.content || item.description || item.snippet || item.text || "").slice(0, 3000),
    score: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
    published_date: String(item.published_date || item.publishedDate || item.metadata?.publishedTime || "").slice(0, 50)
  })).filter(item => /^https?:\/\//i.test(item.url) && item.content);
  if (normalized.length) return normalized.slice(0, 8);

  // Jina Search may return a Markdown SERP in data rather than structured JSON.
  const markdown = typeof raw === "string" ? raw : typeof data?.content === "string" ? data.content : "";
  const matches = [...markdown.matchAll(/(?:^|\\n)#+\\s*(.+?)\\n+\\s*(https?:\\/\\/[^\\s)]+)[\\s\\S]*?(?=(?:\\n#+\\s)|$)/g)];
  return matches.slice(0, 8).map(match => ({
    title: String(match[1] || "Fuente web").trim().slice(0, 300),
    url: String(match[2] || "").trim().replace(/[.,;]+$/, "").slice(0, 1500),
    content: String(match[0] || "").slice(0, 3000),
    score: null,
    published_date: ""
  })).filter(item => /^https?:\/\//i.test(item.url) && item.content);
}

async function searchTavily(env, query) {
  const keys = tavilyKeys(env);
  if (!keys.length) return { results: [], error: "TAVILY_NOT_CONFIGURED" };
  let lastError = null;
  for (let index = 0; index < keys.length; index++) {
    let response;
    try {
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + keys[index] },
        body: JSON.stringify({
          query, topic: "general", search_depth: "advanced", max_results: 8,
          include_answer: false, include_raw_content: true
        }),
        signal: AbortSignal.timeout(18000)
      });
    } catch (error) {
      lastError = { status: 502, detail: String(error?.message || error).slice(0, 180) };
      break;
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { results: normalizeTavilyResults(data), usage: data.usage || null, provider: "tavily" };
    const status = response.status;
    lastError = { status, detail: String(data.detail || data.message || data.error || "").slice(0, 180) };
    // A rejected key is key-specific: try the next configured credential.
    // Quota/rate-limit responses are account/provider-wide and are never evaded by key rotation.
    if (status !== 401 && status !== 403) break;
  }
  return { results: [], error: lastError?.status === 429 || lastError?.status === 432 || lastError?.status === 433 ? "TAVILY_LIMIT" : "TAVILY_UNAVAILABLE", detail: lastError?.detail, status: lastError?.status };
}

async function searchJina(env, query) {
  const key = String(env?.JINA_API_KEY || "").trim();
  if (!key) return { results: [], error: "JINA_NOT_CONFIGURED" };
  try {
    const response = await fetch("https://s.jina.ai/", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Return-Format": "json",
        "X-No-Cache": "true"
      },
      body: JSON.stringify({ q: query, count: 8, gl: "co", hl: "es", type: "web" }),
      signal: AbortSignal.timeout(22000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { results: [], error: "JINA_HTTP_" + response.status, status: response.status,
        detail: String(data.detail || data.message || data.error || "").slice(0, 180) };
    }
    return { results: normalizeJinaResults(data), provider: "jina" };
  } catch (error) {
    return { results: [], error: "JINA_NETWORK", detail: String(error?.message || error).slice(0, 180) };
  }
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("Origin") !== requestUrl.origin) {
    return json({ error: "Solicitud no autorizada para este origen." }, 403);
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

  const tavily = await searchTavily(env, query);
  if (tavily.results.length) {
    return json({ ok: true, provider: "tavily", query, results: tavily.results, usage: tavily.usage || null,
      fallbackUsed: false });
  }

  console.warn("Prisma research: Tavily unavailable; trying Jina", {
    code: tavily.error, status: tavily.status || null
  });
  const jina = await searchJina(env, query);
  if (jina.results.length) {
    return json({ ok: true, provider: "jina", query, results: jina.results, fallbackUsed: true,
      fallbackReason: tavily.error || "TAVILY_EMPTY" });
  }

  const message = !tavilyKeys(env).length && jina.error === "JINA_NOT_CONFIGURED"
    ? "La investigación web no tiene proveedores configurados. Revisa TAVILY_API_KEY y JINA_API_KEY."
    : "Tavily y Jina no pudieron recuperar fuentes para esta consulta.";
  return json({
    ok: false, error: message, code: "RESEARCH_PROVIDERS_UNAVAILABLE",
    diagnostics: {
      tavily: { code: tavily.error || "NO_RESULTS", status: tavily.status || null, detail: tavily.detail || null },
      jina: { code: jina.error || "NO_RESULTS", status: jina.status || null, detail: jina.detail || null }
    }
  }, 502);
}
