import { getProviderHold } from "../../_lib/provider-health.js";
import { modelsForUI } from "../../_lib/model-catalog.js";
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  const limited = Boolean(env.PRISMA_RATE_DB?.prepare);
  const blockedHF=limited ? await getProviderHold(env,"huggingface") : null;
  const blockedPollinations=limited ? await getProviderHold(env,"pollinations") : null;
  const blockedSpeech=limited ? await getProviderHold(env,"pollinations-audio") : null;
  const blockedGroq=limited ? await getProviderHold(env,"groq") : null;
  const blockedGroqAudio=limited ? await getProviderHold(env,"groq-audio") : null;
  const huggingfaceReady=limited && Boolean(env.HF_TOKEN) && !blockedHF;
  const pollinationsReady=limited && Boolean(env.POLLINATIONS_API_KEY) && !blockedPollinations;
  const speechReady=limited && Boolean(env.POLLINATIONS_API_KEY) && !blockedSpeech;
  const groqReady=limited && Boolean(env.GROQ_API_KEY) && !blockedGroq;
  const groqAudioReady=limited && Boolean(env.GROQ_API_KEY) && !blockedGroqAudio;
  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    protection: { d1RateLimiting: limited },
    providers: {
      pollinations: pollinationsReady,
      gemini: limited && Boolean(env.GEMINI_API_KEY),
      huggingface: huggingfaceReady,
      groq: groqReady,
      cloudflare: limited && Boolean(env.AI?.run),
    },
    configured: {pollinations:Boolean(env.POLLINATIONS_API_KEY),gemini:Boolean(env.GEMINI_API_KEY),huggingface:Boolean(env.HF_TOKEN),groq:Boolean(env.GROQ_API_KEY),cloudflare:Boolean(env.AI?.run)},
    warnings: {...(blockedPollinations?{pollinations:blockedPollinations.reason}:{}),...(blockedSpeech?{pollinationsAudio:blockedSpeech.reason}:{}),...(blockedHF?{huggingface:blockedHF.reason}:{}),...(blockedGroq?{groq:blockedGroq.reason}:{}),...(blockedGroqAudio?{groqAudio:blockedGroqAudio.reason}:{})},
    modelCatalog: modelsForUI(),
    features: {pollinationsAudio:speechReady,pollinationsImages:pollinationsReady,cloudflareImages: limited && Boolean(env.AI?.run), huggingfaceImages: huggingfaceReady && env.HF_MEDIA_ENABLED==="1", huggingfaceAudio: huggingfaceReady && env.HF_MEDIA_ENABLED==="1", groqAudio: groqAudioReady},
    models: {
      pollinations:"openai/gpt-5.4-nano",
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      huggingface: "openai/gpt-oss-20b:cheapest",
      cloudflare: "@cf/google/gemma-4-26b-a4b-it",
      groq: "openai/gpt-oss-20b",
    },
  }), { status: 200, headers });
}
