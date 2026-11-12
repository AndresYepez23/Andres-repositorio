import { getCredentialSlots, requestWithCredentialPool } from "../../_lib/credential-pool.js";
import { setProviderHold } from "../../_lib/provider-health.js";
import { cleanResearchQuery, inferResearchSearchOptions, normalizeResearchResults, mergeResearchResults } from "../../_lib/research-search.js";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function readPayload(response) {
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("json")) return response.json().catch(() => ({}));
  const raw = await response.text().catch(() => "");
  try { return JSON.parse(raw); } catch { return { text: raw }; }
}

function providerMessage(provider, status, error) {
  const label = provider === "tavily" ? "Tavily" : "Jina";
  if (error?.code === "CREDENTIALS_PAUSED") return "Las claves de " + label + " están temporalmente pausadas tras fallos de autenticación.";
  if (status === 401) return label + " rechazó las claves configuradas. Prisma probó las credenciales disponibles; revisa las que estén rechazadas.";
  if (status === 402 || status === 432 || status === 433) return label + " agotó el saldo o los créditos disponibles.";
  if (status === 429) return label + " alcanzó un límite temporal; Prisma intentará el otro buscador.";
  if (status === 403) return label + " rechazó el acceso de esta cuenta.";
  return label + " no pudo completar la búsqueda (" + (status || 502) + ").";
}

async function searchTavily(env, query, options) {
  const slots = getCredentialSlots(env, "tavily");
  if (!slots.length) return { configured: 0, attempted: false, ok: false, results: [], error: "Tavily no tiene credenciales configuradas." };
  let response;
  try {
    response = await requestWithCredentialPool(env, "tavily", key => fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        query,
        topic: options.topic,
        search_depth: options.searchDepth,
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
        ...(options.topic === "news" && options.timeRange ? { time_range: options.timeRange } : {})
      }),
      signal: AbortSignal.timeout(18000)
    }), { sweepAuthSlots: true });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return { configured: slots.length, attempted: true, ok: false, results: [], status, error: providerMessage("tavily", status, error) };
  }
  const data = await readPayload(response);
  if (!response.ok) {
    const status = response.status;
    if (status === 403) await setProviderHold(env, "tavily", "provider_unavailable", "Tavily rechazó el acceso de la cuenta; se comprobará de nuevo más tarde.", 900);
    if (status === 432 || status === 433) await setProviderHold(env, "tavily", "quota_exhausted", "Tavily agotó los créditos disponibles de la cuenta.", 21600);
    return { configured: slots.length, attempted: true, ok: false, results: [], status, error: providerMessage("tavily", status) };
  }
  return {
    configured: slots.length,
    attempted: true,
    ok: true,
    results: normalizeResearchResults(data.results, "tavily", 8),
    usage: data.usage || null,
    status: response.status
  };
}

async function searchJina(env, query, options) {
  const slots = getCredentialSlots(env, "jina");
  if (!slots.length) return { configured: 0, attempted: false, ok: false, results: [], error: "Jina no tiene credenciales configuradas." };
  const url = new URL("https://s.jina.ai/" + encodeURIComponent(query));
  url.searchParams.set("type", options.jinaType);
  url.searchParams.set("num", "8");
  url.searchParams.set("hl", "es");
  let response;
  try {
    response = await requestWithCredentialPool(env, "jina", key => fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(22000)
    }), { sweepAuthSlots: true });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return { configured: slots.length, attempted: true, ok: false, results: [], status, error: providerMessage("jina", status, error) };
  }
  const data = await readPayload(response);
  if (!response.ok) {
    const status = response.status;
    if (status === 403) await setProviderHold(env, "jina", "provider_unavailable", "Jina rechazó el acceso de la cuenta; se comprobará de nuevo más tarde.", 900);
    return { configured: slots.length, attempted: true, ok: false, results: [], status, error: providerMessage("jina", status) };
  }
  const rawResults = Array.isArray(data.data) ? data.data : Array.isArray(data.results) ? data.results : [];
  return {
    configured: slots.length,
    attempted: true,
    ok: true,
    results: normalizeResearchResults(rawResults, "jina", 8),
    status: response.status
  };
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

  const query = cleanResearchQuery(payload.query);
  if (query.length < 4 || query.length > 1000) {
    return json({ error: "La consulta debe contener entre 4 y 1.000 caracteres." }, 400);
  }

  const options = inferResearchSearchOptions(query);
  const tavily = await searchTavily(env, query, options);
  const jinaConfigured = getCredentialSlots(env, "jina").length;
  const jina = tavily.results.length < 4 && jinaConfigured
    ? await searchJina(env, query, options)
    : { configured: jinaConfigured, attempted: false, ok: false, results: [], error: null };
  const results = mergeResearchResults([tavily.results, jina.results], 10);
  const providers = [];
  if (tavily.results.length) providers.push("tavily");
  if (jina.results.length) providers.push("jina");
  const warnings = [tavily.error, jina.error].filter(Boolean);
  const diagnostics = {
    tavily: { configuredSlots: tavily.configured, attempted: tavily.attempted, status: tavily.status || null, results: tavily.results.length },
    jina: { configuredSlots: jina.configured, attempted: jina.attempted, status: jina.status || null, results: jina.results.length }
  };

  console.info("Prisma web research", JSON.stringify({ providers, resultCount: results.length, tavilyStatus: diagnostics.tavily.status, jinaStatus: diagnostics.jina.status }));
  if (!results.length) {
    return json({
      ok: false,
      error: warnings.join(" ") || "Tavily y Jina no devolvieron fuentes web verificables.",
      providers,
      warnings,
      diagnostics
    }, 503);
  }

  return json({
    ok: true,
    provider: providers.join("+"),
    providers,
    query,
    results,
    warnings,
    diagnostics,
    usage: tavily.usage || null
  });
}
