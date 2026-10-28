import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("herencia-divina-youtube");
    const cached = await store.get("popular-videos.json", { type: "json" });
    if (cached?.videos?.length) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=900" }
      });
    }
  } catch (error) {
    console.error("No se pudo leer la caché de videos:", error);
  }
  return new Response(JSON.stringify({ videos: [], updatedAt: null, fallback: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
};
