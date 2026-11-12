function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString().slice(0, 1500);
  } catch {
    return "";
  }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.protocol + "//" + url.host.toLowerCase() + url.pathname + url.search;
  } catch {
    return String(value || "").toLowerCase();
  }
}

export function cleanResearchQuery(value) {
  const original = String(value || "").trim();
  const cleaned = original
    .replace(/^(?:por favor\s+)?(?:investiga(?:r)?|busca|consulta|revisa)\s+(?:en\s+(?:internet|la\s+web|la\s+red)\s+)?/i, "")
    .replace(/^[\s:,-]+/, "")
    .replace(/[.!?¿¡]+$/, "")
    .trim();
  return (cleaned || original).slice(0, 1000);
}

export function inferResearchSearchOptions(query) {
  const normalized = String(query || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const news = /\b(?:news|noticias?|novedades?|ultimas?|actualidad|hoy|recientes?|recientemente)\b/.test(normalized);
  const timeRange = /\b(?:hoy|today|ahora|ultimas horas)\b/.test(normalized)
    ? "day"
    : news || /\b(?:esta semana|ultimos dias)\b/.test(normalized)
      ? "week"
      : /\b(?:este mes|ultimos meses|mensual)\b/.test(normalized) ? "month" : null;
  const deep = /\b(?:investigacion profunda|exhaustiv[oa]|a fondo|analisis detallado|compara fuentes)\b/.test(normalized);
  return {
    topic: news ? "news" : "general",
    timeRange,
    jinaType: news ? "news" : "web",
    searchDepth: deep ? "advanced" : "basic"
  };
}

export function normalizeResearchResults(items, provider, limit = 8) {
  const list = Array.isArray(items) ? items : [];
  return list.map(item => {
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const rawUrl = item?.url || item?.finalUrl || metadata.url || "";
    const url = safeHttpUrl(rawUrl);
    let fallbackTitle = "";
    try { fallbackTitle = new URL(url).hostname; } catch {}
    const contentValue = item?.content || item?.text || item?.description || item?.snippet ||
      (Array.isArray(item?.chunks) ? item.chunks.join("\n\n") : "") || metadata.description || "";
    const published = item?.published_date || item?.publishedTime || item?.published ||
      item?.date || metadata.publishedTime || metadata.published_date || "";
    return {
      title: String(item?.title || metadata.title || fallbackTitle || "").trim().slice(0, 300),
      url,
      content: String(contentValue || "").trim().slice(0, 2200),
      score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
      published_date: String(published || "").slice(0, 80),
      provider: String(provider || item?.provider || "web").slice(0, 32)
    };
  }).filter(item => item.url && item.title && item.content.length >= 30).slice(0, limit);
}

export function mergeResearchResults(groups, limit = 10) {
  const merged = [];
  const byUrl = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const source of Array.isArray(group) ? group : []) {
      const url = safeHttpUrl(source?.url);
      if (!url) continue;
      const key = canonicalUrl(url);
      const existing = byUrl.get(key);
      if (existing) {
        if (String(source.content || "").length > existing.content.length) existing.content = String(source.content).slice(0, 2200);
        if (!existing.published_date && source.published_date) existing.published_date = String(source.published_date).slice(0, 80);
        const providers = new Set([...(existing.provider || "").split("+"), ...(source.provider || "").split("+")].filter(Boolean));
        existing.provider = [...providers].join("+");
        if (!existing.title && source.title) existing.title = String(source.title).slice(0, 300);
        continue;
      }
      const item = {
        title: String(source.title || "Fuente web").slice(0, 300),
        url,
        content: String(source.content || "").slice(0, 2200),
        score: Number.isFinite(Number(source.score)) ? Number(source.score) : null,
        published_date: String(source.published_date || "").slice(0, 80),
        provider: String(source.provider || "web").slice(0, 32)
      };
      byUrl.set(key, item);
      merged.push(item);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}
