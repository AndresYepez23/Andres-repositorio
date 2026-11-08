import { modelsForUI } from "../../_lib/model-catalog.js";
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  const limited = Boolean(env.PRISMA_RATE_DB?.prepare);
  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    protection: { d1RateLimiting: limited },
    providers: {
      gemini: limited && Boolean(env.GEMINI_API_KEY),
      huggingface: limited && Boolean(env.HF_TOKEN),
      groq: limited && Boolean(env.GROQ_API_KEY),
      cloudflare: limited && Boolean(env.AI?.run),
    },
    modelCatalog: modelsForUI(),
    features: {cloudflareImages: limited && Boolean(env.AI?.run), huggingfaceImages: limited && Boolean(env.HF_TOKEN) && env.HF_MEDIA_ENABLED==="1", groqAudio: limited && Boolean(env.GROQ_API_KEY)},
    models: {
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      huggingface: "openai/gpt-oss-20b:cheapest",
      cloudflare: "@cf/google/gemma-4-26b-a4b-it",
      groq: "openai/gpt-oss-20b",
    },
  }), { status: 200, headers });
}
