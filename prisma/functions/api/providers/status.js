import { getProviderHold } from "../../_lib/provider-health.js";
import { modelsForUI } from "../../_lib/model-catalog.js";
import { getCredentialSlots, getCredentialStatus, CREDENTIAL_ROOTS } from "../../_lib/credential-pool.js";
import { getAmdFreeModels } from "../../_lib/amd-models.js";
import { getKiloFreeModels } from "../../_lib/kilo-models.js";
import { getAihubmixFreeModels } from "../../_lib/aihubmix-models.js";
import { getProviderUsage, getProviderLifetimeUsage, getProviderDailyLimit, getProviderMinuteLimit, getSharedDailyBudget, getVisitorDailyLimit } from "../../_lib/limits.js";

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
  const usageEntries = await Promise.all(poolProviders
    .filter(provider => provider !== "openrouter" && (configured[provider] > 0 || provider === "kilo"))
    .map(async provider => [provider, await getProviderUsage(env, provider, getProviderDailyLimit(env, provider), getProviderMinuteLimit(provider))]));
  const usage = Object.fromEntries(usageEntries);
  if (limited && env.AI?.run) {
    usage.cloudflare = await getProviderUsage(env, "cloudflare", getProviderDailyLimit(env, "cloudflare"));
  }
  const dailyAvailable = provider => {
    const daily = usage[provider]?.daily;
    const minute = usage[provider]?.minute;
    return (!daily || daily.remaining > 0) && (!minute || minute.remaining > 0);
  };
  const aihubmixLifetime = limited && env.AIHUBMIX_DAILY_QUOTA_ACTIVE !== "1" ? await getProviderLifetimeUsage(env,"aihubmix",10) : null;
  const amdModels = configured.amd > 0 ? await getAmdFreeModels(env) : [];
  const kiloModels = await getKiloFreeModels(env);
  const aihubmixModels = configured.aihubmix > 0 ? await getAihubmixFreeModels(env) : [];
  const available = Object.fromEntries(poolProviders.map(provider =>
    [provider, limited && (configured[provider] > 0 || provider === "kilo") && !holds[provider] &&
      dailyAvailable(provider) && !(provider === "aihubmix" && aihubmixLifetime?.remaining === 0) &&
      !(provider === "amd" && amdModels.length === 0) && !(provider === "kilo" && kiloModels.length === 0) &&
      !(provider === "aihubmix" && aihubmixModels.length === 0) &&
      !(provider === "baidu" && env.BAIDU_FREE_QUOTA_CONFIRMED !== "1")]
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
  const cloudflareReady = limited && Boolean(env.AI?.run) && dailyAvailable("cloudflare");

  const credentialSlots = Object.fromEntries(poolProviders.map(provider => {
    const hold = holds[provider];
    const info = getCredentialStatus(env, provider);
    return [provider, {
      ...info,
      dailyUsage: usage[provider]?.daily || null,
      minuteUsage: usage[provider]?.minute || null,
      providerPaused: Boolean(hold),
      pauseState: hold?.state || null,
      pauseReason: hold?.reason || null,
      retryAt: hold?.valid_until || null,
    }];
  }));

  const warnings = {};
  for (const provider of poolProviders) {
    if (holds[provider]) warnings[provider] = holds[provider].reason;
    else if (credentialSlots[provider].poolConfigured && !credentialSlots[provider].poolValid) warnings[provider] = "El secreto " + credentialSlots[provider].poolVariable + " debe contener un arreglo JSON válido de hasta seis claves de texto.";
    else if (provider === "kilo" && !configured[provider] && kiloModels.length) warnings[provider] = "Acceso gratuito anónimo activo; KILO_API_KEY es opcional. Modelos gratuitos verificados en vivo.";
    else if (provider === "kilo" && !kiloModels.length) warnings[provider] = "No hay modelos de chat con precio cero disponibles en el catálogo Kilo en este momento.";
    else if (provider === "aihubmix" && configured[provider] > 0 && aihubmixLifetime?.remaining === 0 && env.AIHUBMIX_DAILY_QUOTA_ACTIVE !== "1") warnings[provider] = "Se agotaron las 10 llamadas totales de prueba. Una recarga única mínima de USD 1 activa cuotas diarias.";
    else if (provider === "amd" && configured[provider] > 0 && amdModels.length === 0) warnings[provider] = "No se pudo validar un modelo gratuito de texto en el catálogo actual de AMD; permanece desactivado.";
    else if (provider === "aihubmix" && configured[provider] > 0 && aihubmixModels.length === 0) warnings[provider] = "No se pudo validar el catálogo gratuito de AIHubMix o no hay modelos de texto con peso de cuota 1.";
    else if (provider === "baidu" && configured[provider] > 0 && env.BAIDU_FREE_QUOTA_CONFIRMED !== "1") warnings[provider] = "Baidu está bloqueado para evitar consumo facturable. Confirma en Qianfan que ERNIE-Speed/Lite/Tiny tienen cuota gratuita en tu cuenta y define BAIDU_FREE_QUOTA_CONFIRMED=1.";
    else if (!configured[provider]) warnings[provider] = "No hay credenciales configuradas.";
    else if (!limited) warnings[provider] = "El control de cuotas D1 no está disponible.";
    else if (usage[provider]?.daily?.remaining === 0) warnings[provider] = "Prisma alcanzó su presupuesto interno diario para este motor. Se renovará en el siguiente día UTC.";
    else if (usage[provider]?.minute?.remaining === 0) warnings[provider] = "Prisma alcanzó el límite interno por minuto para este motor. Se renovará en el siguiente minuto.";
  }
  if (env.AI?.run && usage.cloudflare?.daily?.remaining === 0) warnings.cloudflare = "Prisma alcanzó su presupuesto interno diario para Cloudflare Workers AI. Se renovará en el siguiente día UTC.";
  if (blockedSpeech) warnings.pollinationsAudio = blockedSpeech.reason;
  if (blockedGroqAudio) warnings.groqAudio = blockedGroqAudio.reason;

  const modelCatalog = modelsForUI();
  modelCatalog.chat.amd = amdModels;
  modelCatalog.chat.kilo = kiloModels;
  modelCatalog.chat.aihubmix = aihubmixModels;

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
      state: holds[provider]?.state || (usage[provider]?.daily?.remaining === 0 ? "daily_limit" : usage[provider]?.minute?.remaining === 0 ? "minute_limit" : provider === "kilo" && available.kilo && !configured[provider] ? "anonymous" : configured[provider] ? "configured" : "missing"),
      reason: holds[provider]?.reason || (usage[provider]?.daily?.remaining === 0 || usage[provider]?.minute?.remaining === 0 ? warnings[provider] : null),
      retryAt: holds[provider]?.valid_until || null,
      dailyUsage: usage[provider]?.daily || null,
      minuteUsage: usage[provider]?.minute || null,
      lifetimeUsage: provider === "aihubmix" && env.AIHUBMIX_DAILY_QUOTA_ACTIVE !== "1" ? aihubmixLifetime : null,
    }])),
    providers: {
      pollinations: pollinationsReady,
      gemini: geminiReady,
      huggingface: huggingfaceReady,
      groq: groqReady,
      cloudflare: cloudflareReady,
      openrouter: openrouterReady,
      kilo: Boolean(available.kilo),
      requesty: Boolean(available.requesty),
      sensenova: Boolean(available.sensenova),
      zai: Boolean(available.zai),
      baidu: Boolean(available.baidu),
      aihubmix: Boolean(available.aihubmix),
      amd: Boolean(available.amd),
    },
    configured: {
      pollinations: configured.pollinations > 0,
      gemini: configured.gemini > 0,
      huggingface: configured.huggingface > 0,
      groq: configured.groq > 0,
      cloudflare: Boolean(env.AI?.run),
      openrouter: configured.openrouter > 0,
      kilo: configured.kilo > 0,
      requesty: configured.requesty > 0,
      sensenova: configured.sensenova > 0,
      zai: configured.zai > 0,
      baidu: configured.baidu > 0,
      aihubmix: configured.aihubmix > 0,
      amd: configured.amd > 0,
    },
    warnings,
    capacity: {
      dailyBudget: getSharedDailyBudget(env),
      visitorDailyLimit: getVisitorDailyLimit(env),
      perMinutePerVisitor: 20,
      configuredProviders: poolProviders.filter(provider => configured[provider] > 0 || (provider === "kilo" && available.kilo)).concat(env.AI?.run ? ["cloudflare"] : []),
      configuredCredentials: Object.values(configured).reduce((sum,count) => sum + count, 0) + (env.AI?.run ? 1 : 0),
    },
    usage,
    modelCatalog,
    features: {
      pollinationsAudio: speechReady,
      pollinationsImages: pollinationsReady,
      cloudflareImages: cloudflareReady,
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
      kilo: "z-ai/glm-5:free",
      requesty: "novita/ling-3.1-flash",
      sensenova: "sensenova-6.8-flash-lite",
      zai: "glm-4.7-flash",
      baidu: "ernie-speed-128k",
      aihubmix: "coding-glm-5.3-free",
      amd: "DeepSeek-V4-Flash",
    },
  }), { status: 200, headers });
}
