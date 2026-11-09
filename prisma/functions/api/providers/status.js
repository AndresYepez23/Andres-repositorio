import { getProviderHold } from "../../_lib/provider-health.js";
import { modelsForUI } from "../../_lib/model-catalog.js";
import { getCredentialSlots, getCredentialStatus, CREDENTIAL_ROOTS } from "../../_lib/credential-pool.js";
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
  const blockedOpenRouter=limited ? await getProviderHold(env,"openrouter") : null;
  const huggingfaceReady=limited && Boolean(getCredentialSlots(env,"huggingface").length) && !blockedHF;
  const pollinationsReady=limited && Boolean(getCredentialSlots(env,"pollinations").length) && !blockedPollinations;
  const speechReady=limited && Boolean(getCredentialSlots(env,"pollinations").length) && !blockedSpeech;
  const groqReady=limited && Boolean(getCredentialSlots(env,"groq").length) && !blockedGroq;
  const groqAudioReady=limited && Boolean(getCredentialSlots(env,"groq").length) && !blockedGroqAudio;
  const openrouterReady=limited && Boolean(getCredentialSlots(env,"openrouter").length) && !blockedOpenRouter;
  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    protection: { d1RateLimiting: limited },
    // Only slot positions and secret variable names are public, never values.
    credentialSlots: Object.fromEntries(Object.keys(CREDENTIAL_ROOTS).map(provider=>[provider,getCredentialStatus(env,provider)])),
    providers: {
      pollinations: pollinationsReady,
      gemini: limited && Boolean(getCredentialSlots(env,"gemini").length),
      huggingface: huggingfaceReady,
      groq: groqReady,
      cloudflare: limited && Boolean(env.AI?.run),
      openrouter: openrouterReady,
    },
    configured: {pollinations:Boolean(getCredentialSlots(env,"pollinations").length),gemini:Boolean(getCredentialSlots(env,"gemini").length),huggingface:Boolean(getCredentialSlots(env,"huggingface").length),groq:Boolean(getCredentialSlots(env,"groq").length),cloudflare:Boolean(env.AI?.run),openrouter:Boolean(getCredentialSlots(env,"openrouter").length)},
    warnings: {...(blockedPollinations?{pollinations:blockedPollinations.reason}:{}),...(blockedSpeech?{pollinationsAudio:blockedSpeech.reason}:{}),...(blockedHF?{huggingface:blockedHF.reason}:{}),...(blockedGroq?{groq:blockedGroq.reason}:{}),...(blockedGroqAudio?{groqAudio:blockedGroqAudio.reason}:{}),...(blockedOpenRouter?{openrouter:blockedOpenRouter.reason}:{}),...(!env.OPENROUTER_API_KEY?{openrouter:"Falta el secreto OPENROUTER_API_KEY en Cloudflare."}:{})},
    modelCatalog: modelsForUI(),
    features: {pollinationsAudio:speechReady,pollinationsImages:pollinationsReady,cloudflareImages: limited && Boolean(env.AI?.run), huggingfaceImages: huggingfaceReady && env.HF_MEDIA_ENABLED==="1", geminiImages: limited && env.GEMINI_IMAGE_ENABLED==="1" && Boolean(getCredentialSlots(env,"gemini").length), huggingfaceAudio: huggingfaceReady && env.HF_MEDIA_ENABLED==="1", groqAudio: groqAudioReady, openrouterChat: openrouterReady},
    models: {
      pollinations:"openai/gpt-5.4-nano",
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      huggingface: "openai/gpt-oss-20b:cheapest",
      cloudflare: "@cf/google/gemma-4-26b-a4b-it",
      groq: "openai/gpt-oss-20b",
      openrouter: "openrouter/free",
    },
  }), { status: 200, headers });
}
