const RESEARCH_INTENT = /\b(?:investiga(?:r|cion|ción)?|busca\s+(?:en\s+)?(?:internet|la\s+web)|consulta\s+(?:en\s+)?internet|fuentes\s+(?:actuales|recientes)|noticias\s+(?:actuales|recientes)|ultimas\s+noticias|últimas\s+noticias|informacion\s+actualizada|información\s+actualizada|investigacion\s+profunda|investigación\s+profunda)\b/i;

export function isExplicitResearchRequest(value) {
  const text = String(value || "").trim();
  return text.length >= 12 && RESEARCH_INTENT.test(text);
}

export async function searchPrismaWeb(query) {
  const response = await fetch("/api/research/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ query: String(query || "").trim() })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "No fue posible consultar la investigación web.");
    error.status = response.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
}

export function formatResearchSources(results) {
  return (Array.isArray(results) ? results : []).map((item, index) => ({
    number: index + 1,
    title: String(item.title || "Fuente web").slice(0, 240),
    url: String(item.url || ""),
    content: String(item.content || "").slice(0, 2200),
    publishedDate: String(item.published_date || "")
  })).filter(item => /^https?:\/\//i.test(item.url));
}
