import { getStore } from "@netlify/blobs";

export default async () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("Falta configurar YOUTUBE_API_KEY en Netlify. Se conserva la selección de respaldo del HTML.");
    return;
  }
  const base = "https://www.googleapis.com/youtube/v3/";
  const api = async (resource, params) => {
    const url = new URL(base + resource);
    for (const [key, value] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(key, value);
    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `YouTube API error ${response.status}`);
    return body;
  };
  // Resolve the public channel handle and its uploads playlist.
  const channelData = await api("channels", { part: "contentDetails,snippet", forHandle: "@HerenciaDivina333" });
  const channel = channelData.items?.[0];
  if (!channel) throw new Error("No se encontró el canal @HerenciaDivina333 con la API.");
  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error("YouTube no devolvió la lista de subidas del canal.");

  // Inspect up to 10 pages (500 recent uploads) to keep the scheduled task within limits.
  const ids = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const params = { part: "contentDetails", playlistId: uploadsId, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const data = await api("playlistItems", params);
    ids.push(...(data.items || []).map(item => item.contentDetails?.videoId).filter(Boolean));
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await api("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") });
    videos.push(...(data.items || []));
  }
  const parseDuration = iso => {
    const m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
  };
  // YouTube's public API does not expose a definitive Shorts flag. Exclude videos up to 180 seconds as a practical approximation.
  const ranked = videos
    .filter(v => v.id && parseDuration(v.contentDetails?.duration) > 180 && v.snippet?.channelId === channel.id)
    .sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0))
    .slice(0, 6)
    .map(v => ({
      id: v.id,
      title: v.snippet?.title || "Video de Herencia Divina",
      thumbnail: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      viewCount: Number(v.statistics?.viewCount || 0),
      publishedAt: v.snippet?.publishedAt || null,
      durationSeconds: parseDuration(v.contentDetails?.duration)
    }));
  if (!ranked.length) throw new Error("No se encontraron videos largos públicos en las últimas subidas consultadas; se mantiene la selección de respaldo.");
  const payload = { updatedAt: new Date().toISOString(), channelTitle: channel.snippet?.title || "Herencia Divina", videos: ranked };
  const store = getStore("herencia-divina-youtube");
  await store.set("popular-videos.json", JSON.stringify(payload), { metadata: { updatedAt: payload.updatedAt } });
  console.log(`Actualizados ${ranked.length} videos populares de ${payload.channelTitle}.`);
};

export const config = { schedule: "0 9 * * *" };
