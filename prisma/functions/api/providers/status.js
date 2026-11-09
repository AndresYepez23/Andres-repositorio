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
  const poolProviders = Object.keys(CREDENTIAL_ROOTS);
  const holds = {};
  if (limited) {
    const entries = await Promise.all(poolProviders.map(async provider =>
      [provider, await getProviderHold(env, provider)]
    ));
    for (const [provider, hold] of entries) holds[provider] = hold;
  }

  const configured = Object.fromEntries(poolProviders.map(provider =>
    [provider, getCredentialSlots(env, provider).length]
  ));
  const available = Object.fromEntries(poolProviders.map(provider =>
    [provider, limited && configured[provider] > 0 && !holds[provider]]
  ));
  const blockedSpeech = limited ? await getProviderHold(env, "pollinations-audio") : null;
  const blockedGroqAudio = limited ? await getProviderHold(env, "groq-audio") : null;
  const pollinationsReady = Boolean(available.pollinations);
  const groqReady = Boolean(available.groq);
  const huggingfaceReady = Boolean(available.huggingface);
  const geminiReady = Boolean(available.gemini);
  const openrouterReady = Boolean(available.openrouter);
  const speechReady = pollinationsReady && !blockedSpeech;
  const groqAudioReady = groqReady && !blockedGroqAudio;

  const credentialSlots = Object.fromEntries(poolProviders.map(provider => {
    const hold = holds[provider];
    const info = getCredentialStatus(env, provider);
    return [provider, {
      ...info,
      providerPaused: Boolean(hold),
      pauseState: hold?.state || null,
      pauseReason: hold?.reason || null,
      retryAt: hold?.valid_until || null,
    }];
  }));

  const warnings = {};
  for (const provider of poolProviders) {
    if (holds[provider]) warnings[provider] = holds[provider].reason;
    else if (!configured[provider]) warnings[provider] = "No hay credenciales configuradas.";
    else if (!limited) warnings[provider] = "El control de cuotas D1 no está disponible.";
  }
  if (blockedSpeech) warnings.pollinationsAudio = blockedSpeech.reason;
  if (blockedGroqAudio) warnings.groqAudio = blockedGroqAudio.reason;

  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    protection: { d1RateLimiting: limited },
    // Only variable names, slot positions and aggregate health are public.
    // Secret values are never returned to the browser.
    credentialSlots,
    providerHealth: Object.fromEntries(poolProviders.map(provider => [provider, {
      configured: configured[provider],
      max: credentialSlots[provider].max,
      available: available[provider],
      paused: Boolean(holds[provider]),
      state: holds[provider]?.state || (configured[provider] ? "configured" : "missing"),
      reason: holds[provider]?.reason || null,
      retryAt: holds[provider]?.valid_until || null,
    }])),
    providers: {
      pollinations: pollinationsReady,
      gemini: geminiReady,
      huggingface: huggingfaceReady,
      groq: groqReady,
      cloudflare: limited && Boolean(env.AI?.run),
      openrouter: openrouterReady,
    },
    configured: {
      pollinations: configured.pollinations > 0,
      gemini: configured.gemini > 0,
      huggingface: configured.huggingface > 0,
      groq: configured.groq > 0,
      cloudflare: Boolean(env.AI?.run),
      openrouter: configured.openrouter > 0,
    },
    warnings,
    modelCatalog: modelsForUI(),
    features: {
      pollinationsAudio: speechReady,
      pollinationsImages: pollinationsReady,
      cloudflareImages: limited && Boolean(env.AI?.run),
      huggingfaceImages: huggingfaceReady && env.HF_MEDIA_ENABLED === "1",
      geminiImages: limited && env.GEMINI_IMAGE_ENABLED === "1" && geminiReady,
      huggingfaceAudio: huggingfaceReady && env.HF_MEDIA_ENABLED === "1",
      groqAudio: groqAudioReady,
      openrouterChat: openrouterReady,
    },
    models: {
      pollinations: "openai/gpt-5.4-nano",
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      huggingface: "openai/gpt-oss-20b:cheapest",
      cloudflare: "@cf/google/gemma-4-26b-a4b-it",
      groq: "openai/gpt-oss-20b",
      openrouter: "openrouter/free",
    },
  }), { status: 200, headers });
}
